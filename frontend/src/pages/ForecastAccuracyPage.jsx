import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuArrowLeft } from 'react-icons/lu';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { ErrorBanner } from '../components/ui';

// Forecast vs actual. Forecasts come from forecast_log (saved daily).
// Actuals come from flood_log rows an official logged or confirmed
// (source = 'official'). Auto-filled "no flood" days are left out.

const THRESHOLDS = [
  { value: 0.25, label: 'Advisory (25%)' },
  { value: 0.5,  label: 'Warning (50%)' },
  { value: 0.75, label: 'Critical (75%)' },
];
const LEADS = [0, 1, 2, 3];

const AMBER = '#f59e0b';
const RESULT = {
  hit:   { label: 'Hit',         color: 'var(--green)' },
  miss:  { label: 'Missed',      color: 'var(--red)' },
  false: { label: 'False alarm', color: AMBER },
  ok:    { label: 'Correct',     color: 'var(--text-secondary)' },
};

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
const ratio = (a, b) => (b === 0 ? null : a / b);

function exportCSV(rows, lead, threshold) {
  const csv = [
    ['Date', 'Forecast', 'Flood', 'Result'].join(','),
    ...rows.map(r => [r.date, r.probability.toFixed(3), r.flooded ? 'Yes' : 'No', RESULT[r.result].label].join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agos_forecast_vs_actual_lead${lead}_${Math.round(threshold * 100)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// PDF is built on click, so the PDF libraries stay out of the main bundle.
async function exportPDF({ rows, metrics, counts, lead, threshold }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const INK = [20, 40, 63];
  const HEAD_BG = [226, 236, 248];
  const LINE = [160, 180, 205];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const common = {
    margin: { left: margin, right: margin, bottom: 54 },
    styles: { font: 'helvetica', fontSize: 10, textColor: INK, lineColor: LINE, lineWidth: 0.5, cellPadding: 6 },
    headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold' },
    theme: 'grid',
  };
  const leadText = lead === 0 ? 'Same day' : `${lead} day${lead > 1 ? 's' : ''} before`;

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK);
  doc.text('AGOS Forecast vs Actual', margin, 54);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90, 110, 135);
  doc.text(
    `Lead time: ${leadText}   |   Flood predicted at: ${Math.round(threshold * 100)}% or higher   |   Generated: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    margin, 70,
  );
  doc.text('Only days confirmed by an official in the Flood Log are included.', margin, 83);

  autoTable(doc, {
    ...common,
    startY: 98,
    head: [['Measure', 'Value']],
    body: metrics.map(([label, value]) => [label, String(value)]),
    columnStyles: { 0: { cellWidth: 200, fontStyle: 'bold' } },
  });

  autoTable(doc, {
    ...common,
    startY: doc.lastAutoTable.finalY + 14,
    head: [['', 'Flood', 'No flood']],
    body: [
      ['Predicted', counts.hit, counts.false],
      ['Not predicted', counts.miss, counts.ok],
    ],
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  autoTable(doc, {
    ...common,
    startY: doc.lastAutoTable.finalY + 14,
    head: [['Date', 'Forecast', 'Actual', 'Result']],
    body: [...rows].reverse().map(r => [
      r.date, `${Math.round(r.probability * 100)}%`, r.flooded ? 'Flood' : 'No flood', RESULT[r.result].label,
    ]),
  });

  const pages = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 110, 135);
    doc.text(`Page ${i} of ${pages}`, w - margin, h - 28, { align: 'right' });
  }
  doc.save(`agos_forecast_vs_actual_lead${lead}_${Math.round(threshold * 100)}.pdf`);
}

const cell = { padding: '8px 12px', borderBottom: '1px solid var(--border, rgba(128,128,128,0.25))' };
const selectStyle = {
  padding: '7px 10px', borderRadius: 8, fontSize: '0.85rem',
  background: 'var(--bg-card, transparent)', color: 'var(--text-primary)',
  border: '1px solid var(--border, rgba(128,128,128,0.4))',
};

export default function ForecastAccuracyPage() {
  const navigate = useNavigate();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/reports'));
  const [lead, setLead] = useState(1);
  const [threshold, setThreshold] = useState(0.5);
  const [forecasts, setForecasts] = useState([]);
  const [actuals, setActuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Actual flood record (once)
  useEffect(() => {
    supabase.from('flood_log').select('log_date, flooded, source').then(({ data, error: err }) => {
      if (err) { logger.error('flood_log fetch error:', err.message); setError('Could not load the flood log.'); return; }
      setActuals(data ?? []);
    });
  }, []);

  // Forecasts for the chosen lead time
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('forecast_log')
      .select('target_date, probability')
      .eq('lead_days', lead)
      .eq('model_key', 'gru')
      .order('target_date', { ascending: true })
      .limit(2000)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { logger.error('forecast_log fetch error:', err.message); setError('Could not load the forecast log.'); }
        else { setError(''); setForecasts(data ?? []); }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lead]);

  const { rows, counts, unconfirmed } = useMemo(() => {
    const official = new Map(actuals.filter(a => a.source === 'official').map(a => [a.log_date, a.flooded]));
    const out = [];
    for (const f of forecasts) {
      if (!official.has(f.target_date)) continue;
      const probability = Number(f.probability);
      const predicted = probability >= threshold;
      const flooded = official.get(f.target_date);
      const result = predicted && flooded ? 'hit' : !predicted && flooded ? 'miss' : predicted ? 'false' : 'ok';
      out.push({ date: f.target_date, probability, predicted, flooded, result });
    }
    const c = { hit: 0, miss: 0, false: 0, ok: 0 };
    out.forEach(r => { c[r.result] += 1; });
    const logged = new Set(official.keys());
    const pending = forecasts.filter(f => !logged.has(f.target_date)).length;
    return { rows: out, counts: c, unconfirmed: pending };
  }, [forecasts, actuals, threshold]);

  const n = rows.length;
  const floodDays = counts.hit + counts.miss;
  const hitRate = ratio(counts.hit, floodDays);
  const precision = ratio(counts.hit, counts.hit + counts.false);
  const falseAlarm = precision == null ? null : 1 - precision;
  const accuracy = ratio(counts.hit + counts.ok, n);
  const f1 = hitRate != null && precision != null && hitRate + precision > 0
    ? (2 * hitRate * precision) / (hitRate + precision) : null;

  const metrics = [
    ['Days compared', n],
    ['Flood days', floodDays],
    ['Hit rate', pct(hitRate)],
    ['False alarm rate', pct(falseAlarm)],
    ['Precision', pct(precision)],
    ['F1', f1 == null ? '—' : f1.toFixed(2)],
    ['Accuracy', pct(accuracy)],
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={goBack}>
          <LuArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <h1 style={{ fontSize: '1.3rem', margin: 0 }}>Forecast vs Actual</h1>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Lead time
          <select style={selectStyle} value={lead} onChange={e => setLead(Number(e.target.value))}>
            {LEADS.map(l => <option key={l} value={l}>{l === 0 ? 'Same day' : `${l} day${l > 1 ? 's' : ''} before`}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Flood predicted at
          <select style={selectStyle} value={threshold} onChange={e => setThreshold(Number(e.target.value))}>
            {THRESHOLDS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="confirm-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={n === 0}
          onClick={() => exportCSV(rows, lead, threshold)}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="confirm-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={n === 0}
          onClick={() => exportPDF({ rows, metrics, counts, lead, threshold })}
        >
          Export PDF
        </button>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
          {metrics.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={cell}></th><th style={cell}>Flood</th><th style={cell}>No flood</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={cell}>Predicted</td><td style={cell}>{counts.hit}</td><td style={cell}>{counts.false}</td></tr>
            <tr><td style={cell}>Not predicted</td><td style={cell}>{counts.miss}</td><td style={cell}>{counts.ok}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={cell}>Date</th><th style={cell}>Forecast</th><th style={cell}>Actual</th><th style={cell}>Result</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td style={cell} colSpan={4}>Loading...</td></tr>}
            {!loading && n === 0 && <tr><td style={cell} colSpan={4}>No matching days yet.</td></tr>}
            {[...rows].reverse().map(r => (
              <tr key={r.date}>
                <td style={cell}>{r.date}</td>
                <td style={cell}>{pct(r.probability)}</td>
                <td style={cell}>{r.flooded ? 'Flood' : 'No flood'}</td>
                <td style={{ ...cell, color: RESULT[r.result].color, fontWeight: 600 }}>{RESULT[r.result].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unconfirmed > 0 && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {unconfirmed} forecast day{unconfirmed > 1 ? 's' : ''} not yet confirmed in the Flood Log.
        </p>
      )}
    </div>
  );
}
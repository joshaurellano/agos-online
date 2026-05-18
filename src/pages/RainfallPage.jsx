import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useModelPrediction } from '../lib/modelApi';
import { supabase } from '../lib/supabaseClient';

export default function RainfallPage() {
  const [view, setView]         = useState('chart');
  const [period, setPeriod]     = useState('hourly');
  const [dailyData, setDailyData]     = useState([]);
  const [hourlyLogs, setHourlyLogs]   = useState([]);

  const { prediction } = useModelPrediction();
  const liveRainfall = prediction?.live_metrics?.rainfall_mm;

  useEffect(() => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('prediction_logs')
      .select('recorded_at, rainfall_mm')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const buckets = {};
        data.forEach(row => {
          const hour = new Date(row.recorded_at)
            .toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
          if (!buckets[hour]) buckets[hour] = { hour, rainfall: 0, count: 0 };
          buckets[hour].rainfall += row.rainfall_mm;
          buckets[hour].count    += 1;
        });
        setHourlyLogs(Object.values(buckets));
      });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('prediction_logs')
      .select('recorded_at, rainfall_mm')
      .gte('recorded_at', sevenDaysAgo)
      .order('recorded_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const buckets = {};
        data.forEach(row => {
          const date = new Date(row.recorded_at)
            .toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
          if (!buckets[date]) buckets[date] = { date, rainfall: 0 };
          buckets[date].rainfall = parseFloat(
            (buckets[date].rainfall + row.rainfall_mm).toFixed(2)
          );
        });
        setDailyData(Object.values(buckets));
      });
  }, []);

  const data    = period === 'hourly' ? hourlyLogs : dailyData;
  const dataKey = period === 'hourly' ? 'hour'     : 'date';
  const total   = data.reduce((s, d) => s + d.rainfall, 0).toFixed(1);
  const peak    = Math.max(0, ...data.map(d => d.rainfall)).toFixed(1);

  return (
    <div className="fade-in">
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Accumulated', value: `${total}mm`,   icon: '☔', color: 'var(--accent)' },
          { label: 'Peak Intensity',    value: `${peak}mm/hr`, icon: '⚡', color: 'var(--orange)' },
          {
            label: '3-Hr Accumulation',
            value: liveRainfall != null ? `${liveRainfall.toFixed(1)}mm` : '—',
            icon: '⏱',
            color: 'var(--yellow)',
          },
          { label: 'PAGASA Threshold', value: '50mm', icon: '⚠️', color: 'var(--text-secondary)' },
        ].map(c => (
          <div key={c.label} className="card">
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          🌧 Rainfall Accumulation
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', fontFamily: 'var(--font-body)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            <button className={`btn ${period === 'hourly' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod('hourly')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Hourly</button>
            <button className={`btn ${period === 'daily'  ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod('daily')}  style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Daily</button>
            <button className={`btn ${view === 'chart' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('chart')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>📈</button>
            <button className={`btn ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>📋</button>
          </div>
        </div>

        {data.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
            No data yet — logs will appear once the backend starts recording.
          </div>
        ) : view === 'chart' ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey={dataKey} tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} interval={period === 'hourly' ? 2 : 0} />
              <YAxis tick={{ fill: '#4a6080', fontSize: 10 }} unit="mm" tickLine={false} />
              <Tooltip contentStyle={{ background: '#112240', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2eaf5', fontSize: 12 }} formatter={v => [`${v}mm`, 'Rainfall']} />
              <ReferenceLine y={50} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: 'Heavy Rain Threshold', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
              <Bar dataKey="rainfall" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
              {period === 'daily' && <ReferenceLine y={18.5} stroke="#eab308" strokeWidth={1} strokeDasharray="3 3" />}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                  {[period === 'hourly' ? 'Hour' : 'Date', 'Rainfall (mm)', 'Intensity'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const intensity = row.rainfall >= 50 ? '🔴 Heavy' : row.rainfall >= 25 ? '🟠 Moderate' : row.rainfall >= 10 ? '🟡 Light' : '🟢 Trace';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{row[dataKey]}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--accent)', fontWeight: 700 }}>{row.rainfall}mm</td>
                      <td style={{ padding: '7px 12px', fontSize: '0.75rem' }}>{intensity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '16px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
          {[
            { label: '🟢 Trace',        range: '< 10mm/hr',  color: '#22c55e' },
            { label: '🟡 Light Rain',    range: '10–25mm/hr', color: '#eab308' },
            { label: '🟠 Moderate Rain', range: '25–50mm/hr', color: '#f97316' },
            { label: '🔴 Heavy Rain',    range: '≥ 50mm/hr',  color: '#ef4444' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', gap: '6px', color: r.color }}>
              <span>{r.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>({r.range})</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
            {prediction ? 'Source: WeatherAPI via LSTM Backend' : 'Source: PAGASA Weather Station · Naga City'}
          </div>
        </div>
      </div>
    </div>
  );
}
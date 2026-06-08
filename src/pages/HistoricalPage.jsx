import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  WARNING:  '#f97316',
  ADVISORY: '#eab308',
  NORMAL:   '#22c55e',
};

const STATUS_COLORS = {
  OPEN:       '#ef4444',
  MONITORING: '#eab308',
  RESOLVED:   '#22c55e',
};

const EMPTY_FORM = {
  date_occurred: '',
  time_occurred: '',
  severity:      'ADVISORY',
  location:      '',
  water_level:   '',
  affected_hh:   '',
  casualties:    '',
  description:   '',
  actions_taken: '',
  status:        'OPEN',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--blue-border)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  );
}

function SeverityBadge({ severity }) {
  const color = SEVERITY_COLORS[severity] || '#8da4be';
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '2px 8px',
    }}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#8da4be';
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '2px 8px',
    }}>
      {status}
    </span>
  );
}

function StatSummary({ reports }) {
  const total      = reports.length;
  const open       = reports.filter(r => r.status === 'OPEN').length;
  const critical   = reports.filter(r => r.severity === 'CRITICAL').length;
  const totalHH    = reports.reduce((sum, r) => sum + (r.affected_hh || 0), 0);
  const casualties = reports.reduce((sum, r) => sum + (r.casualties || 0), 0);

  const items = [
    { label: 'Total Reports',      value: total,                   color: 'var(--accent)', icon: '📋' },
    { label: 'Open Incidents',     value: open,                    color: '#ef4444',        icon: '🔴' },
    { label: 'Critical Events',    value: critical,                color: '#f97316',        icon: '⚠️' },
    { label: 'Households Affected',value: totalHH.toLocaleString(),color: '#eab308',        icon: '🏠' },
    { label: 'Total Casualties',   value: casualties,              color: '#ef4444',        icon: '🏥' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
      {items.map(({ label, value, color, icon }) => (
        <div key={label} className="card" style={{
          borderTop: `3px solid ${color}`,
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '1.1rem' }}>{icon}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({ report, onStatusChange, canEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const sc = SEVERITY_COLORS[report.severity] || '#8da4be';

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    const { error } = await supabase
      .from('flood_reports')
      .update({ status: newStatus })
      .eq('id', report.id);
    if (!error) onStatusChange(report.id, newStatus);
    setUpdatingStatus(false);
  };

  return (
    <div style={{
      background: 'var(--blue-mid)',
      border: `1px solid ${expanded ? sc + '60' : 'var(--blue-border)'}`,
      borderLeft: `4px solid ${sc}`,
      borderRadius: 'var(--radius-sm)',
      transition: 'border-color 0.2s',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {report.location}
          </span>
          <SeverityBadge severity={report.severity} />
          <StatusBadge status={report.status} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {new Date(report.date_occurred).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
            {report.time_occurred ? ` · ${report.time_occurred.slice(0,5)}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Reported by <strong style={{ color: 'var(--text-secondary)' }}>{report.reported_by}</strong>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--blue-border)' }}>

          {/* Metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '14px 0' }}>
            {[
              { label: 'Water Level',         value: report.water_level ? `${report.water_level}m` : '—' },
              { label: 'Households Affected', value: report.affected_hh ? report.affected_hh.toLocaleString() : '—' },
              { label: 'Casualties',          value: report.casualties ?? '0' },
              { label: 'Report Time',         value: report.time_occurred ? report.time_occurred.slice(0,5) : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--blue-card)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--blue-border)' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>Incident Description</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--blue-card)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--blue-border)' }}>
              {report.description}
            </div>
          </div>

          {/* Actions taken */}
          {report.actions_taken && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>Actions Taken</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--blue-card)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--blue-border)' }}>
                {report.actions_taken}
              </div>
            </div>
          )}

          {/* Status changer — admin/staff only */}
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Update Status:</span>
              {['OPEN', 'MONITORING', 'RESOLVED'].map(s => (
                <button
                  key={s}
                  disabled={report.status === s || updatingStatus}
                  onClick={() => handleStatusChange(s)}
                  style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '4px 12px',
                    borderRadius: 4, border: `1px solid ${STATUS_COLORS[s]}50`,
                    background: report.status === s ? `${STATUS_COLORS[s]}20` : 'transparent',
                    color: STATUS_COLORS[s], cursor: report.status === s ? 'default' : 'pointer',
                    opacity: updatingStatus ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {s}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                Logged {new Date(report.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportForm({ user, onSubmitted, onCancel }) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState({});

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.date_occurred) e.date_occurred = 'Required';
    if (!form.location.trim()) e.location = 'Required';
    if (!form.description.trim()) e.description = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      reported_by:   user?.name ?? 'Unknown',
      reporter_role: user?.roles?.role_desc ?? 'Staff',
      date_occurred: form.date_occurred,
      time_occurred: form.time_occurred || null,
      severity:      form.severity,
      location:      form.location.trim(),
      water_level:   form.water_level ? parseFloat(form.water_level) : null,
      affected_hh:   form.affected_hh ? parseInt(form.affected_hh) : null,
      casualties:    form.casualties ? parseInt(form.casualties) : 0,
      description:   form.description.trim(),
      actions_taken: form.actions_taken.trim() || null,
      status:        form.status,
    };
    const { error } = await supabase.from('flood_reports').insert(payload);
    setSaving(false);
    if (error) {
      setErrors({ _global: error.message });
    } else {
      setForm(EMPTY_FORM);
      onSubmitted();
    }
  };

  const inputStyle = (key) => ({
    width: '100%', padding: '9px 12px',
    background: 'var(--blue-mid)', border: `1px solid ${errors[key] ? '#ef4444' : 'var(--blue-border)'}`,
    borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
    outline: 'none', fontFamily: 'var(--font-body)',
    transition: 'border-color 0.15s',
  });

  const fieldLabel = (label, required) => (
    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </div>
  );

  const errMsg = (key) => errors[key]
    ? <div style={{ fontSize: '0.62rem', color: '#ef4444', marginTop: 3 }}>{errors[key]}</div>
    : null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <SectionLabel>📝 File Flood Incident Report</SectionLabel>

      {errors._global && (
        <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#f87171', marginBottom: 14 }}>
          ⚠ {errors._global}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Date */}
        <div>
          {fieldLabel('Date of Incident', true)}
          <input type="date" value={form.date_occurred} onChange={e => set('date_occurred', e.target.value)} style={inputStyle('date_occurred')} />
          {errMsg('date_occurred')}
        </div>

        {/* Time */}
        <div>
          {fieldLabel('Time of Incident')}
          <input type="time" value={form.time_occurred} onChange={e => set('time_occurred', e.target.value)} style={inputStyle('time_occurred')} />
        </div>

        {/* Severity */}
        <div>
          {fieldLabel('Severity Level', true)}
          <select value={form.severity} onChange={e => set('severity', e.target.value)} style={inputStyle('severity')}>
            {['NORMAL','ADVISORY','WARNING','CRITICAL'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Location */}
        <div>
          {fieldLabel('Affected Location / Zone', true)}
          <input type="text" placeholder="e.g. Purok 3, near Naga River" value={form.location} onChange={e => set('location', e.target.value)} style={inputStyle('location')} />
          {errMsg('location')}
        </div>

        {/* Water Level */}
        <div>
          {fieldLabel('Max Water Level (m)')}
          <input type="number" step="0.01" min="0" placeholder="e.g. 3.20" value={form.water_level} onChange={e => set('water_level', e.target.value)} style={inputStyle('water_level')} />
        </div>

        {/* Affected HH */}
        <div>
          {fieldLabel('Households Affected')}
          <input type="number" min="0" placeholder="e.g. 45" value={form.affected_hh} onChange={e => set('affected_hh', e.target.value)} style={inputStyle('affected_hh')} />
        </div>

        {/* Casualties */}
        <div>
          {fieldLabel('Casualties')}
          <input type="number" min="0" placeholder="0" value={form.casualties} onChange={e => set('casualties', e.target.value)} style={inputStyle('casualties')} />
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 14 }}>
        {fieldLabel('Incident Description', true)}
        <textarea
          rows={4}
          placeholder="Describe the flood incident — cause, impact on residents, infrastructure damage, etc."
          value={form.description}
          onChange={e => set('description', e.target.value)}
          style={{ ...inputStyle('description'), resize: 'vertical', lineHeight: 1.6 }}
        />
        {errMsg('description')}
      </div>

      {/* Actions Taken */}
      <div style={{ marginBottom: 16 }}>
        {fieldLabel('Actions Taken / Response')}
        <textarea
          rows={3}
          placeholder="e.g. Barangay officials deployed to evacuation centers. MDRRMO notified."
          value={form.actions_taken}
          onChange={e => set('actions_taken', e.target.value)}
          style={{ ...inputStyle('actions_taken'), resize: 'vertical', lineHeight: 1.6 }}
        />
      </div>

      {/* Status + Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Initial Status:</span>
          {['OPEN','MONITORING'].map(s => (
            <button
              key={s}
              onClick={() => set('status', s)}
              style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '4px 12px',
                borderRadius: 4, border: `1px solid ${STATUS_COLORS[s]}50`,
                background: form.status === s ? `${STATUS_COLORS[s]}20` : 'transparent',
                color: STATUS_COLORS[s], cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ fontSize: '0.82rem', padding: '8px 18px' }}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving}
            style={{ fontSize: '0.82rem', padding: '8px 20px', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '⏳ Saving...' : '✅ Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoricalPage() {
  const { user } = useAuth();
  const isResident = user?.role_id === 7;

  const [reports,        setReports]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus,   setFilterStatus]   = useState('ALL');
  const [searchText,     setSearchText]     = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flood_reports')
      .select('*')
      .order('date_occurred', { ascending: false });
    if (error) console.error('flood_reports fetch error:', error.message);
    else setReports(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleSubmitted = () => {
    setShowForm(false);
    setSuccessMsg('Report submitted successfully.');
    fetchReports();
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleStatusChange = (id, newStatus) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
  };

  const filtered = reports.filter(r => {
    if (filterSeverity !== 'ALL' && r.severity !== filterSeverity) return false;
    if (filterStatus   !== 'ALL' && r.status   !== filterStatus)   return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (!r.location.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="fade-in">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>
            📋 Flood Incident Reports
          </h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Barangay Triangulo · Naga City · All records saved to Supabase
          </div>
        </div>
        {!isResident && !showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ fontSize: '0.85rem' }}>
            + File New Report
          </button>
        )}
      </div>

      {/* ── Success Toast ─────────────────────────────────────────── */}
      {successMsg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 14,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
          borderLeft: '3px solid #22c55e', borderRadius: 'var(--radius-sm)',
          fontSize: '0.82rem', color: '#4ade80',
        }}>
          ✅ {successMsg}
        </div>
      )}

      {/* ── Report Form (admin/staff only) ────────────────────────── */}
      {showForm && (
        <ReportForm
          user={user}
          onSubmitted={handleSubmitted}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Summary Stats ─────────────────────────────────────────── */}
      {!loading && reports.length > 0 && <StatSummary reports={reports} />}

      {/* ── Filters + Search ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Search */}
          <input
            type="text"
            placeholder="Search by location or description..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: '7px 12px',
              background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.82rem',
              outline: 'none', fontFamily: 'var(--font-body)',
            }}
          />

          {/* Severity filter */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Severity:</span>
            {['ALL','CRITICAL','WARNING','ADVISORY','NORMAL'].map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px',
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                  border: filterSeverity === s
                    ? `1px solid ${s === 'ALL' ? 'var(--accent)' : SEVERITY_COLORS[s]}`
                    : '1px solid var(--blue-border)',
                  background: filterSeverity === s
                    ? s === 'ALL' ? 'rgba(56,189,248,0.15)' : `${SEVERITY_COLORS[s]}18`
                    : 'transparent',
                  color: filterSeverity === s
                    ? s === 'ALL' ? 'var(--accent)' : SEVERITY_COLORS[s]
                    : 'var(--text-muted)',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status:</span>
            {['ALL','OPEN','MONITORING','RESOLVED'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px',
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                  border: filterStatus === s
                    ? `1px solid ${s === 'ALL' ? 'var(--accent)' : STATUS_COLORS[s]}`
                    : '1px solid var(--blue-border)',
                  background: filterStatus === s
                    ? s === 'ALL' ? 'rgba(56,189,248,0.15)' : `${STATUS_COLORS[s]}18`
                    : 'transparent',
                  color: filterStatus === s
                    ? s === 'ALL' ? 'var(--accent)' : STATUS_COLORS[s]
                    : 'var(--text-muted)',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} of {reports.length} record{reports.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Report List ───────────────────────────────────────────── */}
      <div className="card">
        <SectionLabel>🌊 Incident Records</SectionLabel>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{
                height: 56, borderRadius: 'var(--radius-sm)',
                background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                opacity: 0.5,
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.3 }}>📭</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {reports.length === 0 ? 'No reports filed yet.' : 'No records match the selected filters.'}
            </div>
            {reports.length === 0 && !isResident && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>
                Use "File New Report" to log the first incident.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => (
              <ReportCard
                key={r.id}
                report={r}
                onStatusChange={handleStatusChange}
                canEdit={!isResident}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
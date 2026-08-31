import { useState, useEffect, useCallback } from 'react';
import { isAdmin, isResident } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { SectionLabel } from '../components/ui';
import { ALERT_LEVELS } from '../data/mockData';
import { logger } from '../lib/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

// Report severity uses the same NORMAL/ADVISORY/WARNING/CRITICAL keys and
// colors as the flood alert level everywhere else in the app. Derived from
// ALERT_LEVELS instead of a hardcoded copy so the palette can't drift --
// this used to be its own independent hex-code table that happened to match
// mockData.js only by coincidence of nobody having edited one without the
// other yet.
const SEVERITY_COLORS = Object.fromEntries(
  Object.entries(ALERT_LEVELS).map(([key, info]) => [key, info.color])
);

const STATUS_COLORS = {
  OPEN:       '#ef4444',
  MONITORING: '#eab308',
  RESOLVED:   '#22c55e',
};

const FLOOD_SOURCES = [
  'River Overflow',
  'Rain Accumulation',
  'Drainage Failure',
  'Storm Surge',
  'Dam/Spillway Release',
  'Combined Factors',
  'Unknown',
];

const EVACUATION_CENTERS = [
  'Jesse M. Robredo Coliseum',
  'Triangulo Elementary School',
  'Jose Rizal Elementary School',
  'None / Not Required',
  'Other',
];

const MODEL_ALERT_LEVELS = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL', 'N/A'];

const EMPTY_FORM = {
  date_occurred:          '',
  time_occurred:          '',
  severity:               'ADVISORY',
  location:               '',
  // Environmental data
  water_level:            '',
  rainfall_mm_at_event:   '',
  duration_hours:         '',
  flood_source:           'River Overflow',
  // Impact data
  affected_hh:            '',
  displaced_persons:      '',
  casualties:             '',
  infrastructure_damage:  '',
  estimated_damage_php:   '',
  // Response data
  evacuation_center_used: 'None / Not Required',
  response_time_minutes:  '',
  actions_taken:          '',
  // System data
  model_alert_level:      'N/A',
  description:            '',
  status:                 'OPEN',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(records) {
  const headers = [
    'ID', 'Date Occurred', 'Time', 'Severity', 'Status', 'Location',
    'Water Level (m)', 'Rainfall at Event (mm)', 'Duration (hrs)',
    'Flood Source', 'Affected Households', 'Displaced Persons',
    'Casualties', 'Infrastructure Damage', 'Est. Damage (PHP)',
    'Evacuation Center Used', 'Response Time (min)', 'Model Alert Level',
    'Description', 'Actions Taken', 'Reported By', 'Reporter Role', 'Created At',
  ];

  const rows = records.map(r => [
    r.id,
    r.date_occurred,
    r.time_occurred ?? '',
    r.severity,
    r.status,
    `"${(r.location ?? '').replace(/"/g, '""')}"`,
    r.water_level ?? '',
    r.rainfall_mm_at_event ?? '',
    r.duration_hours ?? '',
    r.flood_source ?? '',
    r.affected_hh ?? '',
    r.displaced_persons ?? '',
    r.casualties ?? 0,
    `"${(r.infrastructure_damage ?? '').replace(/"/g, '""')}"`,
    r.estimated_damage_php ?? '',
    r.evacuation_center_used ?? '',
    r.response_time_minutes ?? '',
    r.model_alert_level ?? '',
    `"${(r.description ?? '').replace(/"/g, '""')}"`,
    `"${(r.actions_taken ?? '').replace(/"/g, '""')}"`,
    r.reported_by ?? '',
    r.reporter_role ?? '',
    r.created_at ? new Date(r.created_at).toLocaleString('en-PH') : '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `agos_flood_reports_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(records) {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `agos_flood_reports_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  const total          = reports.length;
  const open           = reports.filter(r => r.status === 'OPEN').length;
  const critical       = reports.filter(r => r.severity === 'CRITICAL').length;
  const totalHH        = reports.reduce((s, r) => s + (r.affected_hh || 0), 0);
  const totalDisplaced = reports.reduce((s, r) => s + (r.displaced_persons || 0), 0);
  const totalDamage    = reports.reduce((s, r) => s + (r.estimated_damage_php || 0), 0);
  const avgResponse    = (() => {
    const valid = reports.filter(r => r.response_time_minutes > 0);
    return valid.length ? Math.round(valid.reduce((s, r) => s + r.response_time_minutes, 0) / valid.length) : null;
  })();

  const items = [
    { label: 'Total Reports',       value: total,                                         color: 'var(--accent)', icon: '📋' },
    { label: 'Open Incidents',      value: open,                                          color: '#ef4444',       icon: '🔴' },
    { label: 'Critical Events',     value: critical,                                      color: '#f97316',       icon: '⚠️' },
    { label: 'Households Affected', value: totalHH.toLocaleString(),                      color: '#eab308',       icon: '🏠' },
    { label: 'Displaced Persons',   value: totalDisplaced.toLocaleString(),               color: '#f97316',       icon: '🚶' },
    { label: 'Est. Damage (PHP)',    value: totalDamage > 0 ? `₱${(totalDamage/1000).toFixed(0)}K` : '—', color: '#ef4444', icon: '💸' },
    { label: 'Avg. Response',       value: avgResponse !== null ? `${avgResponse} min` : '—', color: '#22c55e', icon: '⏱' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 18 }}>
      {items.map(({ label, value, color, icon }) => (
        <div key={label} className="card" style={{
          borderTop: `3px solid ${color}`,
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '1rem' }}>{icon}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function MetricCell({ label, value }) {
  return (
    <div style={{ background: 'var(--blue-card)', borderRadius: 6, padding: '9px 12px', border: '1px solid var(--blue-border)' }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{value}</div>
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
        style={{ padding: '13px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
            {report.location}
          </span>
          <SeverityBadge severity={report.severity} />
          <StatusBadge status={report.status} />
          {report.flood_source && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--blue-card)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 7px' }}>
              {report.flood_source}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {new Date(report.date_occurred).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
            {report.time_occurred ? ` · ${report.time_occurred.slice(0,5)}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            by <strong style={{ color: 'var(--text-secondary)' }}>{report.reported_by}</strong>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--blue-border)' }}>

          {/* Environmental metrics */}
          <div style={{ marginTop: 14, marginBottom: 6 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>🌊 Environmental Data</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <MetricCell label="Water Level"           value={report.water_level        ? `${report.water_level}m`             : '—'} />
              <MetricCell label="Rainfall at Event"     value={report.rainfall_mm_at_event ? `${report.rainfall_mm_at_event} mm` : '—'} />
              <MetricCell label="Duration"              value={report.duration_hours      ? `${report.duration_hours} hrs`       : '—'} />
              <MetricCell label="Flood Source"          value={report.flood_source        ?? '—'} />
            </div>
          </div>

          {/* Impact metrics */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>🏠 Impact Data</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              <MetricCell label="Households Affected" value={report.affected_hh         ? report.affected_hh.toLocaleString()     : '—'} />
              <MetricCell label="Displaced Persons"   value={report.displaced_persons   ? report.displaced_persons.toLocaleString() : '—'} />
              <MetricCell label="Casualties"          value={report.casualties          ?? '0'} />
              <MetricCell label="Est. Damage (PHP)"   value={report.estimated_damage_php ? `₱${Number(report.estimated_damage_php).toLocaleString()}` : '—'} />
              <MetricCell label="AGOS Alert Level"    value={report.model_alert_level   ?? '—'} />
            </div>
          </div>

          {/* Response metrics */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>🚑 Response Data</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <MetricCell label="Evacuation Center Used" value={report.evacuation_center_used ?? '—'} />
              <MetricCell label="Response Time"          value={report.response_time_minutes  ? `${report.response_time_minutes} min` : '—'} />
            </div>
          </div>

          {/* Infrastructure damage */}
          {report.infrastructure_damage && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>Infrastructure Damage</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--blue-card)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--blue-border)' }}>
                {report.infrastructure_damage}
              </div>
            </div>
          )}

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

          {/* Status changer + created timestamp */}
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
                    opacity: updatingStatus ? 0.5 : 1, transition: 'all 0.15s',
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
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.date_occurred)      e.date_occurred  = 'Required';
    if (!form.location.trim())    e.location       = 'Required';
    if (!form.description.trim()) e.description    = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      reported_by:            user?.name ?? 'Unknown',
      reporter_role:          user?.roles?.role_desc ?? 'Staff',
      date_occurred:          form.date_occurred,
      time_occurred:          form.time_occurred || null,
      severity:               form.severity,
      location:               form.location.trim(),
      // Environmental
      water_level:            form.water_level            ? parseFloat(form.water_level)            : null,
      rainfall_mm_at_event:   form.rainfall_mm_at_event   ? parseFloat(form.rainfall_mm_at_event)   : null,
      duration_hours:         form.duration_hours         ? parseFloat(form.duration_hours)         : null,
      flood_source:           form.flood_source,
      // Impact
      affected_hh:            form.affected_hh            ? parseInt(form.affected_hh)              : null,
      displaced_persons:      form.displaced_persons      ? parseInt(form.displaced_persons)        : null,
      casualties:             form.casualties             ? parseInt(form.casualties)               : 0,
      infrastructure_damage:  form.infrastructure_damage.trim() || null,
      estimated_damage_php:   form.estimated_damage_php   ? parseFloat(form.estimated_damage_php)   : null,
      // Response
      evacuation_center_used: form.evacuation_center_used,
      response_time_minutes:  form.response_time_minutes  ? parseInt(form.response_time_minutes)    : null,
      actions_taken:          form.actions_taken.trim() || null,
      // System
      model_alert_level:      form.model_alert_level,
      description:            form.description.trim(),
      status:                 form.status,
    };
    const { error } = await supabase.from('flood_reports').insert(payload);
    setSaving(false);
    if (error) setErrors({ _global: error.message });
    else { setForm(EMPTY_FORM); onSubmitted(); }
  };

  const inputStyle = (key) => ({
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    background: 'var(--blue-mid)', border: `1px solid ${errors[key] ? '#ef4444' : 'var(--blue-border)'}`,
    borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
    outline: 'none', fontFamily: 'var(--font-body)', transition: 'border-color 0.15s',
  });

  const fieldLabel = (label, required) => (
    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </div>
  );

  const errMsg = (key) => errors[key]
    ? <div style={{ fontSize: '0.62rem', color: '#ef4444', marginTop: 3 }}>{errors[key]}</div>
    : null;

  const formSection = (title) => (
    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--blue-border)' }} />
      {title}
      <div style={{ flex: 1, height: 1, background: 'var(--blue-border)' }} />
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <SectionLabel>📝 File Flood Incident Report</SectionLabel>

      {errors._global && (
        <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#f87171', marginBottom: 14 }}>
          ⚠ {errors._global}
        </div>
      )}

      {/* ── Basic Info ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          {fieldLabel('Date of Incident', true)}
          <input type="date" value={form.date_occurred} onChange={e => set('date_occurred', e.target.value)} style={inputStyle('date_occurred')} />
          {errMsg('date_occurred')}
        </div>
        <div>
          {fieldLabel('Time of Incident')}
          <input type="time" value={form.time_occurred} onChange={e => set('time_occurred', e.target.value)} style={inputStyle('time_occurred')} />
        </div>
        <div>
          {fieldLabel('Severity Level', true)}
          <select value={form.severity} onChange={e => set('severity', e.target.value)} style={inputStyle('severity')}>
            {['NORMAL','ADVISORY','WARNING','CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          {fieldLabel('AGOS Model Alert at Time')}
          <select value={form.model_alert_level} onChange={e => set('model_alert_level', e.target.value)} style={inputStyle('model_alert_level')}>
            {MODEL_ALERT_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          {fieldLabel('Affected Location / Zone', true)}
          <input type="text" placeholder="e.g. Purok 3, near Naga River" value={form.location} onChange={e => set('location', e.target.value)} style={inputStyle('location')} />
          {errMsg('location')}
        </div>
        <div>
          {fieldLabel('Flood Source / Cause')}
          <select value={form.flood_source} onChange={e => set('flood_source', e.target.value)} style={inputStyle('flood_source')}>
            {FLOOD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Environmental Data ── */}
      {formSection('🌊 Environmental Data')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <div>
          {fieldLabel('Max Water Level (m)')}
          <input type="number" step="0.01" min="0" placeholder="e.g. 3.20" value={form.water_level} onChange={e => set('water_level', e.target.value)} style={inputStyle('water_level')} />
        </div>
        <div>
          {fieldLabel('Rainfall During Event (mm)')}
          <input type="number" step="0.1" min="0" placeholder="e.g. 85.5" value={form.rainfall_mm_at_event} onChange={e => set('rainfall_mm_at_event', e.target.value)} style={inputStyle('rainfall_mm_at_event')} />
        </div>
        <div>
          {fieldLabel('Flood Duration (hours)')}
          <input type="number" step="0.5" min="0" placeholder="e.g. 6" value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} style={inputStyle('duration_hours')} />
        </div>
      </div>

      {/* ── Impact Data ── */}
      {formSection('🏠 Impact Data')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 14 }}>
        <div>
          {fieldLabel('Households Affected')}
          <input type="number" min="0" placeholder="e.g. 45" value={form.affected_hh} onChange={e => set('affected_hh', e.target.value)} style={inputStyle('affected_hh')} />
        </div>
        <div>
          {fieldLabel('Displaced Persons')}
          <input type="number" min="0" placeholder="e.g. 120" value={form.displaced_persons} onChange={e => set('displaced_persons', e.target.value)} style={inputStyle('displaced_persons')} />
        </div>
        <div>
          {fieldLabel('Casualties')}
          <input type="number" min="0" placeholder="0" value={form.casualties} onChange={e => set('casualties', e.target.value)} style={inputStyle('casualties')} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          {fieldLabel('Estimated Damage (PHP)')}
          <input type="number" min="0" step="1000" placeholder="e.g. 250000" value={form.estimated_damage_php} onChange={e => set('estimated_damage_php', e.target.value)} style={inputStyle('estimated_damage_php')} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {fieldLabel('Infrastructure Damage')}
        <input type="text" placeholder="e.g. Damaged road at Purok 4, flooded school grounds" value={form.infrastructure_damage} onChange={e => set('infrastructure_damage', e.target.value)} style={inputStyle('infrastructure_damage')} />
      </div>

      {/* ── Response Data ── */}
      {formSection('🚑 Response Data')}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          {fieldLabel('Evacuation Center Used')}
          <select value={form.evacuation_center_used} onChange={e => set('evacuation_center_used', e.target.value)} style={inputStyle('evacuation_center_used')}>
            {EVACUATION_CENTERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          {fieldLabel('Response Time (minutes)')}
          <input type="number" min="0" placeholder="e.g. 30" value={form.response_time_minutes} onChange={e => set('response_time_minutes', e.target.value)} style={inputStyle('response_time_minutes')} />
        </div>
      </div>

      {/* ── Narrative ── */}
      {formSection('📄 Narrative')}
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

function ModelAccuracyPanel({ reports }) {
  const compared = reports.filter(r =>
    r.model_alert_level && r.model_alert_level !== 'N/A' && r.severity
  );
  if (compared.length === 0) return null;

  const LEVEL_RANK = { NORMAL: 0, ADVISORY: 1, WARNING: 2, CRITICAL: 3 };

  let exact = 0, within1 = 0, over = 0, under = 0;
  compared.forEach(r => {
    const predicted = LEVEL_RANK[r.model_alert_level] ?? -1;
    const actual    = LEVEL_RANK[r.severity]          ?? -1;
    if (predicted === -1 || actual === -1) return;
    const diff = predicted - actual;
    if (diff === 0)       exact++;
    else if (diff === 1)  over++;
    else if (diff === -1) under++;
    else if (Math.abs(diff) <= 1) within1++;
  });

  const accuracy    = compared.length ? ((exact / compared.length) * 100).toFixed(0) : 0;
  const within1Pct  = compared.length ? (((exact + within1) / compared.length) * 100).toFixed(0) : 0;

  const rows = compared.map(r => {
    const predicted = LEVEL_RANK[r.model_alert_level] ?? -1;
    const actual    = LEVEL_RANK[r.severity]          ?? -1;
    const diff      = predicted - actual;
    const match     = diff === 0   ? 'exact'
                    : diff > 0     ? 'over'
                    : diff === -1  ? 'under-1'
                    : 'under-miss';
    return { ...r, diff, match };
  });

  const matchColor = (m) =>
    m === 'exact'      ? '#22c55e' :
    m === 'over'       ? '#eab308' :
    m === 'under-1'    ? '#f97316' : '#ef4444';

  const matchLabel = (m) =>
    m === 'exact'      ? '✅ Exact match' :
    m === 'over'       ? '🟡 Over-predicted' :
    m === 'under-1'    ? '🟠 Under by 1 level' : '🔴 Significant miss';

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
        marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--blue-border)',
      }}>
        🤖 AGOS Model Accuracy — Predicted vs. Actual Alert Level
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Records Compared', value: compared.length,   color: 'var(--accent)' },
          { label: 'Exact Match',       value: `${accuracy}%`,    color: '#22c55e' },
          { label: 'Within 1 Level',    value: `${within1Pct}%`,  color: '#eab308' },
          { label: 'Over-predicted',    value: over,              color: '#f97316' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--blue-card)', borderRadius: 6, padding: '10px 14px',
            border: '1px solid var(--blue-border)', borderTop: `3px solid ${color}`,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Accuracy note */}
      <div style={{
        padding: '8px 12px', marginBottom: 14,
        background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)',
        borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-muted)',
      }}>
        ℹ️ Accuracy is computed by comparing <strong style={{ color: 'var(--text-secondary)' }}>AGOS Model Alert Level</strong> (what the system predicted at time of incident) against the <strong style={{ color: 'var(--text-secondary)' }}>Actual Severity</strong> recorded by the reporting officer. Only reports with both fields filled are included.
      </div>

      {/* Per-record comparison table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
              {['Date', 'Location', 'AGOS Predicted', 'Actual Severity', 'Result'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left',
                  color: 'var(--text-muted)', fontWeight: 700,
                  textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(r.date_occurred).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{r.location}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    background: `${SEVERITY_COLORS[r.model_alert_level]}18`,
                    color: SEVERITY_COLORS[r.model_alert_level] ?? '#8da4be',
                    border: `1px solid ${SEVERITY_COLORS[r.model_alert_level] ?? '#8da4be'}40`,
                    borderRadius: 4, padding: '2px 8px',
                  }}>{r.model_alert_level}</span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    background: `${SEVERITY_COLORS[r.severity]}18`,
                    color: SEVERITY_COLORS[r.severity] ?? '#8da4be',
                    border: `1px solid ${SEVERITY_COLORS[r.severity] ?? '#8da4be'}40`,
                    borderRadius: 4, padding: '2px 8px',
                  }}>{r.severity}</span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: matchColor(r.match) }}>
                    {matchLabel(r.match)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'right' }}>
        Based on {compared.length} of {reports.length} total reports · Only records with both fields populated are compared
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoricalPage() {
  const { user } = useAuth();
  const userIsResident = isResident(user);
  const [reports,        setReports]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus,   setFilterStatus]   = useState('ALL');
  const [filterSource,   setFilterSource]   = useState('ALL');
  const [searchText,     setSearchText]     = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');
  const [exporting,      setExporting]      = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flood_reports')
      .select('*')
      .order('date_occurred', { ascending: false });
    if (error) logger.error('flood_reports fetch error:', error.message);
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
    if (filterSource   !== 'ALL' && r.flood_source !== filterSource) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      const haystack = [r.location, r.description, r.infrastructure_damage, r.actions_taken]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const handleExportCSV = () => {
    setExporting(true);
    exportCSV(filtered);
    setTimeout(() => setExporting(false), 800);
  };

  const handleExportJSON = () => {
    setExporting(true);
    exportJSON(filtered);
    setTimeout(() => setExporting(false), 800);
  };

  // Unique flood sources present in data (for filter)
  const presentSources = ['ALL', ...new Set(reports.map(r => r.flood_source).filter(Boolean))];

  return (
    <div className="fade-in">

      {/* ── Page Actions ────────────────────────────────────────── */}
      {/* Title/subtitle intentionally omitted here -- the Topbar already
          shows "Flood Incident Reports" for this route (see PAGE_TITLES in
          MainLayout.jsx), so repeating it here just duplicated the header. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export buttons — always visible */}
          {reports.length > 0 && (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleExportCSV}
                disabled={exporting || filtered.length === 0}
                style={{ fontSize: '0.78rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                📥 Export CSV
                {filtered.length !== reports.length && (
                  <span style={{ fontSize: '0.65rem', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 2 }}>
                    {filtered.length}
                  </span>
                )}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleExportJSON}
                disabled={exporting || filtered.length === 0}
                style={{ fontSize: '0.78rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                📥 Export JSON
                {filtered.length !== reports.length && (
                  <span style={{ fontSize: '0.65rem', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 2 }}>
                    {filtered.length}
                  </span>
                )}
              </button>
            </>
          )}
          {!userIsResident  && !showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ fontSize: '0.85rem' }}>
              + File New Report
            </button>
          )}
        </div>
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

      {/* ── Report Form ────────────────────────────────────────────── */}
      {showForm && (
        <ReportForm
          user={user}
          onSubmitted={handleSubmitted}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Summary Stats ─────────────────────────────────────────── */}
      {!loading && reports.length > 0 && <StatSummary reports={reports} />}

      {!loading && reports.length > 0 && <ModelAccuracyPanel reports={reports} />}

      {/* ── Filters + Search ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

          <input
            type="text"
            placeholder="Search location, description, damage..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: '7px 12px',
              background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.82rem',
              outline: 'none', fontFamily: 'var(--font-body)',
            }}
          />

          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Severity:</span>
            {['ALL','CRITICAL','WARNING','ADVISORY','NORMAL'].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)} style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                border: filterSeverity === s ? `1px solid ${s === 'ALL' ? 'var(--accent)' : SEVERITY_COLORS[s]}` : '1px solid var(--blue-border)',
                background: filterSeverity === s ? (s === 'ALL' ? 'rgba(56,189,248,0.15)' : `${SEVERITY_COLORS[s]}18`) : 'transparent',
                color: filterSeverity === s ? (s === 'ALL' ? 'var(--accent)' : SEVERITY_COLORS[s]) : 'var(--text-muted)',
              }}>{s}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status:</span>
            {['ALL','OPEN','MONITORING','RESOLVED'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                border: filterStatus === s ? `1px solid ${s === 'ALL' ? 'var(--accent)' : STATUS_COLORS[s]}` : '1px solid var(--blue-border)',
                background: filterStatus === s ? (s === 'ALL' ? 'rgba(56,189,248,0.15)' : `${STATUS_COLORS[s]}18`) : 'transparent',
                color: filterStatus === s ? (s === 'ALL' ? 'var(--accent)' : STATUS_COLORS[s]) : 'var(--text-muted)',
              }}>{s}</button>
            ))}
          </div>

          {presentSources.length > 2 && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Source:</span>
              {presentSources.map(s => (
                <button key={s} onClick={() => setFilterSource(s)} style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px',
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                  border: filterSource === s ? '1px solid var(--accent)' : '1px solid var(--blue-border)',
                  background: filterSource === s ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: filterSource === s ? 'var(--accent)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}>{s === 'ALL' ? 'All Sources' : s}</button>
              ))}
            </div>
          )}

          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
            {filtered.length} of {reports.length} record{reports.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Export note ───────────────────────────────────────────── */}
      {reports.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', marginBottom: 14,
          background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)',
          borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--text-muted)',
        }}>
          <span>📊</span>
          <span>
            Export respects active filters — only {filtered.length === reports.length ? 'all' : `${filtered.length} filtered`} record{filtered.length !== 1 ? 's' : ''} will be included.
            CSV is suitable for Excel / Google Sheets analysis; JSON for programmatic use.
          </span>
        </div>
      )}

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
            {reports.length === 0 && !userIsResident  && (
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
                canEdit={!userIsResident }
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
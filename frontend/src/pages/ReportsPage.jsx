import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { SectionLabel } from '../components/ui';
import { logger } from '../lib/logger';

// Daily flood log. One entry per day: did it flood or not.
// A day with no entry means "not logged", not "no flood".

const NO_FLOOD_COLOR = '#22c55e';
const FLOOD_COLOR    = '#3b82f6';
const HEIGHTS = [
  { key: 'ANKLE', label: 'Ankle' },
  { key: 'KNEE',  label: 'Knee' },
  { key: 'WAIST', label: 'Waist' },
  { key: 'CHEST', label: 'Chest' },
];
const heightLabel = (k) => HEIGHTS.find(h => h.key === k)?.label ?? '';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local-date helpers (avoids UTC shifting the day in the Philippines).
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKey(new Date());

const fmtLong = (k) =>
  fromKey(k).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

function exportCSV(entries) {
  const rows = [...entries].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['Date', 'Flood', 'Height', 'Height (cm)', 'Note', 'Logged By'].join(','),
    ...rows.map(r => [
      r.log_date, r.flooded ? 'Yes' : 'No', heightLabel(r.height_level), r.height_cm ?? '', esc(r.note), esc(r.logged_by),
    ].join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agos_flood_log_${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Entry editor ─────────────────────────────────────────────────────────────

function EntryEditor({ dateKey, entry, user, onDateChange, onSaved }) {
  const [flooded, setFlooded] = useState(null);   // true | false | null
  const [height, setHeight]   = useState('');   // ANKLE | KNEE | WAIST | CHEST | ''
  const [heightCm, setHeightCm] = useState('');
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Reload the form whenever the selected day (or its saved entry) changes.
  useEffect(() => {
    setFlooded(entry ? entry.flooded : null);
    setHeight(entry?.height_level ?? '');
    setHeightCm(entry?.height_cm != null ? String(entry.height_cm) : '');
    setNote(entry?.note ?? '');
    setError('');
  }, [dateKey, entry]);

  const canSave = flooded !== null;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    const payload = {
      log_date:  dateKey,
      flooded,
      height_level: flooded && height ? height : null,
      height_cm:    flooded && heightCm !== '' ? Number(heightCm) : null,
      note:      note.trim() || null,
      logged_by: user?.name ?? 'Unknown',
    };
    const { data, error: err } = await supabase
      .from('flood_log')
      .upsert(payload, { onConflict: 'log_date' })
      .select()
      .single();
    setSaving(false);
    if (err) {
      logger.error('flood_log save error:', err.message);
      setError('Could not save. Please try again.');
      return;
    }
    onSaved(data);
  };

  const bigBtn = (active, color) => ({
    flex: 1, minWidth: 140, padding: '16px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-display)',
    border: `2px solid ${active ? color : 'var(--blue-border)'}`,
    background: active ? `${color}30` : 'var(--blue-mid)',
    color: 'var(--text-primary)', transition: 'all 0.15s',
  });

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <SectionLabel>Log a Day</SectionLabel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <input
          type="date"
          value={dateKey}
          max={todayKey()}
          onChange={e => e.target.value && onDateChange(e.target.value)}
          style={{
            padding: '8px 12px', background: 'var(--blue-mid)', color: 'var(--text-primary)',
            border: '1px solid var(--blue-border)', borderRadius: 6, fontSize: '0.88rem',
            fontFamily: 'var(--font-body)',
          }}
        />
        <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          {fmtLong(dateKey)}
        </span>
        {dateKey !== todayKey() && (
          <button className="btn btn-ghost" onClick={() => onDateChange(todayKey())} style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
            Today
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" onClick={() => { setFlooded(false); setHeight(''); setHeightCm(''); }} style={bigBtn(flooded === false, NO_FLOOD_COLOR)}>
          No flood
        </button>
        <button type="button" onClick={() => setFlooded(true)} style={bigBtn(flooded === true, FLOOD_COLOR)}>
          Flood
        </button>
      </div>

      {flooded === true && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Water height (approx.)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {HEIGHTS.map(({ key, label }) => {
              const active = height === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHeight(active ? '' : key)}
                  style={{
                    padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                    border: `2px solid ${active ? FLOOD_COLOR : 'var(--blue-border)'}`,
                    background: active ? `${FLOOD_COLOR}30` : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              placeholder="cm"
              value={heightCm}
              onChange={e => setHeightCm(e.target.value)}
              aria-label="Water height in centimeters"
              style={{
                width: 90, padding: '8px 10px', background: 'var(--blue-mid)', color: 'var(--text-primary)',
                border: '1px solid var(--blue-border)', borderRadius: 6, fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>
        </div>
      )}

      {flooded !== null && (
        <input
          type="text"
          maxLength={200}
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', marginBottom: 14,
            background: 'var(--blue-mid)', color: 'var(--text-primary)',
            border: '1px solid var(--blue-border)', borderRadius: 6, fontSize: '0.85rem',
            fontFamily: 'var(--font-body)',
          }}
        />
      )}

      {error && (
        <div style={{ fontSize: '0.8rem', color: '#f87171', marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ fontSize: '0.88rem', padding: '9px 24px', opacity: !canSave || saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : entry ? 'Update' : 'Save'}
        </button>
        {entry && (
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Logged by {entry.logged_by}, {new Date(entry.updated_at ?? entry.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Month calendar ───────────────────────────────────────────────────────────

function cellStyle(entry, isSelected, isFuture) {
  let color = null;
  if (entry) color = entry.flooded ? FLOOD_COLOR : NO_FLOOD_COLOR;
  return {
    minHeight: 56, padding: 6, borderRadius: 6, textAlign: 'left',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    cursor: isFuture ? 'not-allowed' : 'pointer',
    opacity: isFuture ? 0.35 : 1,
    border: isSelected
      ? '2px solid var(--accent)'
      : color ? `1px solid ${color}` : '1px dashed var(--blue-border)',
    background: color ? `${color}28` : 'transparent',
    color: 'var(--text-primary)',
  };
}

function MonthCalendar({ month, entries, selected, onSelect, onMonthChange }) {
  const byDate = useMemo(() => new Map(entries.map(e => [e.log_date, e])), [entries]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const today = todayKey();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toKey(new Date(month.getFullYear(), month.getMonth(), d)));

  let flood = 0, noFlood = 0, notLogged = 0;
  for (const k of cells) {
    if (!k || k > today) continue;
    const e = byDate.get(k);
    if (!e) notLogged++;
    else if (e.flooded) flood++;
    else noFlood++;
  }

  const shift = (n) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => shift(-1)} aria-label="Previous month" style={{ padding: '5px 12px' }}>‹</button>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', minWidth: 150, textAlign: 'center', color: 'var(--text-primary)' }}>
            {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </div>
          <button className="btn btn-ghost" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Next month" style={{ padding: '5px 12px', opacity: isCurrentMonth ? 0.4 : 1 }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--text-primary)' }}>{flood}</strong> flood</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{noFlood}</strong> no flood</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{notLogged}</strong> not logged</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map((k, i) => {
          if (!k) return <div key={`b${i}`} />;
          const e = byDate.get(k);
          const future = k > today;
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => onSelect(k)}
              style={cellStyle(e, k === selected, future)}
              aria-label={`${fmtLong(k)}: ${e ? (e.flooded ? 'flood' : 'no flood') : 'not logged'}`}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{Number(k.slice(8))}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {e ? (e.flooded ? (heightLabel(e.height_level) || 'Flood') : 'No flood') : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {[
          ['No flood', NO_FLOOD_COLOR],
          ['Flood', FLOOD_COLOR],
        ].map(([label, c]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: `${c}55`, border: `1px solid ${c}` }} />
            {label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, border: '1px dashed var(--text-muted)' }} />
          Not logged
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FloodLogPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState('');
  const [selected, setSelected] = useState(todayKey());
  const [month,    setMonth]    = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });

  // Arriving from Resident Reports ("Log flood day"): jump to that date.
  useEffect(() => {
    const k = location.state?.logDate;
    if (k && k <= todayKey()) {
      setSelected(k);
      const d = fromKey(k);
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flood_log')
      .select('*')
      .order('log_date', { ascending: false });
    if (error) {
      logger.error('flood_log fetch error:', error.message);
      setLoadErr('Could not load the log.');
    } else {
      setLoadErr('');
      setEntries(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const selectedEntry = entries.find(e => e.log_date === selected) ?? null;

  const handleSaved = (row) => {
    setEntries(prev => [row, ...prev.filter(e => e.log_date !== row.log_date)]);
  };

  const handleSelect = (k) => {
    setSelected(k);
    const d = fromKey(k);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          className="btn btn-ghost"
          onClick={() => exportCSV(entries)}
          disabled={entries.length === 0}
          style={{ fontSize: '0.78rem', padding: '7px 14px' }}
        >
          Export CSV
        </button>
      </div>

      {loadErr && (
        <div style={{ padding: '9px 12px', marginBottom: 14, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, fontSize: '0.82rem', color: '#f87171' }}>
          {loadErr}
        </div>
      )}

      <EntryEditor
        dateKey={selected}
        entry={selectedEntry}
        user={user}
        onDateChange={handleSelect}
        onSaved={handleSaved}
      />

      {loading ? (
        <div className="card" style={{ height: 260, opacity: 0.5 }} />
      ) : (
        <MonthCalendar
          month={month}
          entries={entries}
          selected={selected}
          onSelect={handleSelect}
          onMonthChange={setMonth}
        />
      )}
    </div>
  );
}

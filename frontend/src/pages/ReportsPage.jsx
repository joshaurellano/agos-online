import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LuCheck, LuWaves, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/logger';

// Daily flood log. One entry per day: did it flood or not.
//
// Each row has a source:
//   official  an official logged or confirmed the day (counts as ground truth)
//   auto      the nightly job filled the day as "no flood" because nobody
//             logged it. Not ground truth until an official confirms it.
// A day with no row yet is "not logged" (inside the grace period).

const HEIGHTS = [
  { key: 'ANKLE', label: 'Ankle' },
  { key: 'KNEE',  label: 'Knee' },
  { key: 'WAIST', label: 'Waist' },
  { key: 'CHEST', label: 'Chest' },
];
const heightLabel = (k) => HEIGHTS.find(h => h.key === k)?.label ?? '';

// Zones (puroks) of the barangay. Edit this list to match the real ones.
//   id    the number saved in the database. Never reuse an id for a different
//         area, or old logs will point at the wrong place. Up to 50.
//   name  shown in the picker (rename freely, saved logs are not affected)
//   area  optional streets / landmarks, shown under the name
const ZONES = [
  { id: 1, name: 'Zone 1', area: '' },   // e.g. area: 'Rizal St, Mabini St'
  { id: 2, name: 'Zone 2', area: '' },
  { id: 3, name: 'Zone 3', area: '' },
  { id: 4, name: 'Zone 4', area: '' },
  { id: 5, name: 'Zone 5', area: '' },
  { id: 6, name: 'Zone 6', area: '' },
  { id: 7, name: 'Zone 7', area: '' },
];
const ZONE_IDS = ZONES.map(z => z.id);
const sortZones = (zs) => [...new Set(zs)].sort((a, b) => a - b);
// 'All zones' | 'Z1, Z3' | '' (nothing recorded)
const zonesText = (zs) => {
  if (!zs?.length) return '';
  return ZONE_IDS.every(id => zs.includes(id)) ? 'All zones' : zs.map(id => `Z${id}`).join(', ');
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local-date helpers (avoids UTC shifting the day in the Philippines).
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKey(new Date());

const fmtLong = (k) =>
  fromKey(k).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// open | auto | flood | clear
const dayState = (e) => (!e ? 'open' : e.source === 'auto' ? 'auto' : e.flooded ? 'flood' : 'clear');
const STATE_LABEL = { open: 'Not logged', auto: 'Auto', flood: 'Flood', clear: 'No flood' };

function exportCSV(entries) {
  const rows = [...entries].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['Date', 'Flood', 'Height', 'Height (cm)', 'Zones', 'Note', 'Logged By', 'Source'].join(','),
    ...rows.map(r => [
      r.log_date, r.flooded ? 'Yes' : 'No', heightLabel(r.height_level), r.height_cm ?? '', esc((r.zones ?? []).join(';')), esc(r.note), esc(r.logged_by),
      r.source === 'auto' ? 'Auto' : 'Official',
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

// ─── Day panel ────────────────────────────────────────────────────────────────

function DayPanel({ dateKey, entry, user, onSaved }) {
  const [flooded, setFlooded]   = useState(null);   // true | false | null
  const [height, setHeight]     = useState('');     // ANKLE | KNEE | WAIST | CHEST | ''
  const [heightCm, setHeightCm] = useState('');
  const [zones, setZones]       = useState([]);     // affected zone numbers
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  // Reload the form whenever the selected day (or its saved entry) changes.
  useEffect(() => {
    setFlooded(entry ? entry.flooded : null);
    setHeight(entry?.height_level ?? '');
    setHeightCm(entry?.height_cm != null ? String(entry.height_cm) : '');
    setZones(entry?.zones ?? []);
    setNote(entry?.note ?? '');
    setError('');
  }, [dateKey, entry]);

  useEffect(() => { setSaved(false); }, [dateKey]);
  useEffect(() => {
    if (!saved) return undefined;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const state = dayState(entry);
  const isAuto = state === 'auto';
  const canSave = flooded !== null;
  const allZones = ZONE_IDS.every(id => zones.includes(id));
  const toggleZone = (z) => setZones(prev => (prev.includes(z) ? prev.filter(x => x !== z) : sortZones([...prev, z])));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    const payload = {
      log_date:  dateKey,
      flooded,
      height_level: flooded && height ? height : null,
      height_cm:    flooded && heightCm !== '' ? Number(heightCm) : null,
      zones:     flooded ? sortZones(zones) : [],
      note:      note.trim() || null,
      logged_by: user?.name ?? 'Unknown',
      source:    'official',
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
    setSaved(true);
  };

  const saveLabel = saving ? 'Saving...' : isAuto ? 'Confirm' : entry ? 'Update' : 'Save';

  return (
    <div className="card">
      <div className="fl-panel-date">{fmtLong(dateKey)}</div>
      <span className={`fl-status is-${state}`}>{STATE_LABEL[state]}</span>

      <div className="fl-choices" role="group" aria-label="Flood status">
        <button
          type="button"
          className={`fl-choice clear${flooded === false ? ' is-on' : ''}`}
          aria-pressed={flooded === false}
          onClick={() => { setFlooded(false); setHeight(''); setHeightCm(''); setZones([]); }}
        >
          <LuCheck size={22} aria-hidden="true" />
          No flood
        </button>
        <button
          type="button"
          className={`fl-choice flood${flooded === true ? ' is-on' : ''}`}
          aria-pressed={flooded === true}
          onClick={() => setFlooded(true)}
        >
          <LuWaves size={22} aria-hidden="true" />
          Flood
        </button>
      </div>

      {flooded === true && (
        <div className="fl-block">
          <div className="fl-label">Water height</div>
          <div className="fl-heights">
            {HEIGHTS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`fl-pill${height === key ? ' is-on' : ''}`}
                aria-pressed={height === key}
                onClick={() => setHeight(height === key ? '' : key)}
              >
                {label}
              </button>
            ))}
            <div className="fl-cm">
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                className="fl-input"
                value={heightCm}
                onChange={e => setHeightCm(e.target.value)}
                aria-label="Water height in centimeters"
              />
              <span aria-hidden="true">cm</span>
            </div>
          </div>
        </div>
      )}

      {flooded === true && (
        <div className="fl-block">
          <div className="fl-label-row">
            <div className="fl-label">Affected zones</div>
            <button
              type="button"
              className="fl-link"
              onClick={() => setZones(allZones ? [] : [...ZONE_IDS])}
            >
              {allZones ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="fl-zones" role="group" aria-label="Affected zones">
            {ZONES.map(({ id, name, area }) => (
              <button
                key={id}
                type="button"
                className={`fl-zone${zones.includes(id) ? ' is-on' : ''}`}
                aria-pressed={zones.includes(id)}
                onClick={() => toggleZone(id)}
              >
                <span className="fl-zone-name">{name}</span>
                {area && <span className="fl-zone-area">{area}</span>}
              </button>
            ))}
          </div>
          {zones.length === 0 && (
            <div className="fl-hint">No zone selected. Tap every zone that flooded.</div>
          )}
        </div>
      )}

      {flooded !== null && (
        <div className="fl-block">
          <input
            type="text"
            className="fl-input"
            maxLength={200}
            placeholder="Note (optional)"
            aria-label="Note"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
      )}

      {error && <div className="fl-error" role="alert">{error}</div>}

      <button
        type="button"
        className="btn btn-primary fl-save"
        onClick={handleSave}
        disabled={!canSave || saving}
      >
        {saveLabel}
      </button>

      <div className="fl-meta" aria-live="polite">
        {saved
          ? <span className="fl-saved">Saved</span>
          : isAuto
            ? 'Auto-filled. Confirm or change.'
            : entry
              ? `Logged by ${entry.logged_by}, ${new Date(entry.updated_at ?? entry.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
              : null}
      </div>
    </div>
  );
}

// ─── Month calendar ───────────────────────────────────────────────────────────

function MonthCalendar({ month, entries, selected, onSelect, onMonthChange, onToday, onExport }) {
  const byDate = useMemo(() => new Map(entries.map(e => [e.log_date, e])), [entries]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const today = todayKey();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toKey(new Date(month.getFullYear(), month.getMonth(), d)));

  // Days before the first entry predate logging, so they are not counted as missing.
  const firstLogged = entries.reduce((min, e) => (min === null || e.log_date < min ? e.log_date : min), null);
  const isBefore = (k) => firstLogged !== null && k < firstLogged && !byDate.has(k);

  const counts = { flood: 0, clear: 0, auto: 0, open: 0 };
  for (const k of cells) {
    if (!k || k > today || isBefore(k)) continue;
    counts[dayState(byDate.get(k))]++;
  }

  // Flood days per zone this month (confirmed flood days only).
  const zoneCounts = {};
  for (const k of cells) {
    if (!k || k > today) continue;
    const e = byDate.get(k);
    if (dayState(e) !== 'flood') continue;
    for (const z of e.zones ?? []) zoneCounts[z] = (zoneCounts[z] ?? 0) + 1;
  }
  const hasZoneData = Object.keys(zoneCounts).length > 0;

  const shift = (n) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const now = new Date();
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();

  const CHIPS = [
    ['flood', 'Flood',     '#3b82f6'],
    ['clear', 'No flood',  '#22c55e'],
    ['auto',  'Auto',      '#7c93b8'],
    ['open',  'Not logged', null],
  ];

  return (
    <div className="card">
      <div className="fl-cal-head">
        <div className="fl-month">
          <button type="button" className="fl-icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <LuChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="fl-month-name">
            {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </div>
          <button type="button" className="fl-icon-btn" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Next month">
            <LuChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="fl-tools">
          <button type="button" className="btn btn-ghost fl-tool" onClick={onToday}>Today</button>
          <button type="button" className="btn btn-ghost fl-tool" onClick={onExport} disabled={entries.length === 0}>Export CSV</button>
        </div>
      </div>

      <div className="fl-chips">
        {CHIPS.map(([key, label, c]) => (
          <span key={key} className="fl-chip">
            <span className={`fl-dot${c ? '' : ' open'}`} style={c ? { background: c } : undefined} aria-hidden="true" />
            <b>{counts[key]}</b> {label}
          </span>
        ))}
      </div>

      {hasZoneData && (
        <div className="fl-chips fl-zone-chips" aria-label="Flood days per zone this month">
          <span className="fl-chips-label">Flood days by zone</span>
          {ZONES.filter(z => zoneCounts[z.id]).map(z => (
            <span key={z.id} className="fl-chip"><b>{zoneCounts[z.id]}</b> {z.name}</span>
          ))}
        </div>
      )}

      <div className="fl-week">
        {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
      </div>

      <div className="fl-days">
        {cells.map((k, i) => {
          if (!k) return <div key={`b${i}`} />;
          const e = byDate.get(k);
          const state = dayState(e);
          const future = k > today;
          const tag = state === 'flood' ? (heightLabel(e.height_level) || 'Flood') : state === 'open' ? '' : STATE_LABEL[state];
          const zoneLine = state === 'flood' ? zonesText(e.zones) : '';
          const cls = ['fl-day', `is-${state}`, isBefore(k) && 'is-before', k === today && 'is-today', k === selected && 'is-selected', future && 'is-future']
            .filter(Boolean).join(' ');
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => onSelect(k)}
              className={cls}
              aria-label={`${fmtLong(k)}: ${STATE_LABEL[state].toLowerCase()}${zoneLine ? `, ${zoneLine}` : ''}`}
              aria-pressed={k === selected}
            >
              <span className="fl-day-num">{Number(k.slice(8))}</span>
              <span className="fl-day-info">
                <span className="fl-day-tag">{tag}</span>
                {zoneLine && <span className="fl-day-zones">{zoneLine}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FloodLogPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const panelRef = useRef(null);

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

  // On narrow screens the day panel sits below the calendar, so bring it into view.
  const handlePick = (k) => {
    handleSelect(k);
    if (window.matchMedia('(max-width: 960px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="fade-in">

      {loadErr && <div className="fl-load-error" role="alert">{loadErr}</div>}

      <div className="fl-layout">
        <div>
          {loading ? (
            <div className="card" style={{ height: 420, opacity: 0.5 }} />
          ) : (
            <MonthCalendar
              month={month}
              entries={entries}
              selected={selected}
              onSelect={handlePick}
              onMonthChange={setMonth}
              onToday={() => handleSelect(todayKey())}
              onExport={() => exportCSV(entries)}
            />
          )}
        </div>
        <div ref={panelRef} className="fl-panel">
          <DayPanel dateKey={selected} entry={selectedEntry} user={user} onSaved={handleSaved} />
        </div>
      </div>
    </div>
  );
}
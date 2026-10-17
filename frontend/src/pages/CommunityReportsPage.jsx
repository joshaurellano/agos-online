import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuSearch, LuChevronDown, LuMapPin, LuTriangleAlert, LuInbox } from 'react-icons/lu';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { ErrorBanner, SectionLabel } from '../components/ui';
import { logger } from '../lib/logger';
import {
  REPORT_STATUS_COLORS as STATUS_COLORS,
  reportTimeAgo as timeAgo,
  findNearbyDuplicates,
} from '../lib/incidentReports';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'ALL',      label: 'All' },
];

const REJECTION_REASONS = [
  'Duplicate of another report',
  'Not enough information',
  'Unable to verify / no evidence',
  'False or misleading report',
  'Outside barangay jurisdiction',
  'Other',
];

const PAGE_SIZE = 20;

// Styles live here so the page is one file. Colors come from the theme
// variables, so all themes (dark, light, high contrast) stay readable.
const STYLES = `
.rr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.rr-eyebrow { font-size: 0.9rem; color: var(--text-secondary); }
.rr-title { margin: 2px 0 0; font-family: var(--font-display); font-size: 1.9rem; font-weight: 800; color: var(--text-primary); line-height: 1.2; }

.rr-tabs { display: flex; gap: 28px; margin: 22px 0 18px; border-bottom: 1px solid var(--blue-border); overflow-x: auto; }
.rr-tab {
  display: inline-flex; align-items: center; gap: 8px; margin-bottom: -1px; padding: 10px 2px 12px;
  background: none; border: none; border-bottom: 3px solid transparent; cursor: pointer; white-space: nowrap;
  font: inherit; font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);
}
.rr-tab:hover { color: var(--text-primary); }
.rr-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.rr-tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.rr-tab-count {
  min-width: 24px; padding: 1px 8px; border-radius: 999px; text-align: center; font-size: 0.75rem; font-weight: 700;
  background: var(--blue-mid); color: var(--text-secondary); border: 1px solid var(--blue-border);
}
.rr-tab[aria-selected="true"] .rr-tab-count { color: var(--accent); border-color: var(--accent); }

.rr-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.rr-search { position: relative; flex: 1 1 260px; max-width: 420px; }
.rr-search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none; }
.rr-search input {
  width: 100%; height: 42px; padding: 0 14px 0 40px; font: inherit; font-size: 0.92rem;
  background: var(--blue-card); color: var(--text-primary); border: 1px solid var(--blue-border); border-radius: 10px;
}
.rr-search input::placeholder { color: var(--text-muted); }
.rr-search input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.rr-count { margin-left: auto; font-size: 0.88rem; color: var(--text-secondary); }

.rr-card { background: var(--blue-card); border: 1px solid var(--blue-border); border-radius: var(--radius); overflow: hidden; }
.rr-table { width: 100%; border-collapse: collapse; }
.rr-table th {
  padding: 12px 16px; text-align: left; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);
  background: var(--blue-mid); border-bottom: 1px solid var(--blue-border);
}
.rr-table td { padding: 14px 16px; vertical-align: middle; font-size: 0.92rem; color: var(--text-primary); border-bottom: 1px solid var(--blue-border); }
.rr-table tr:last-child td { border-bottom: none; }
.rr-row { cursor: pointer; transition: background 0.15s ease; }
.rr-row:hover, .rr-row.open { background: var(--blue-mid); }
.rr-main { display: block; max-width: 440px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.rr-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 3px; font-size: 0.82rem; color: var(--text-secondary); }
.rr-flag { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: color-mix(in srgb, var(--orange) 60%, var(--text-primary)); }
.rr-loc { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.rr-pill {
  display: inline-block; padding: 3px 12px; border-radius: 6px; font-size: 0.82rem; font-weight: 700;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  color: color-mix(in srgb, var(--c) 55%, var(--text-primary));
}
.rr-time { color: var(--text-secondary); white-space: nowrap; }
.rr-cell-chev { width: 56px; text-align: right; }
.rr-chev {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0;
  background: none; border: 1px solid var(--blue-border); border-radius: 8px; cursor: pointer; color: var(--text-secondary);
}
.rr-chev:hover { color: var(--accent); border-color: var(--accent); }
.rr-chev:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rr-chev svg { transition: transform 0.2s ease; }
.rr-row.open .rr-chev svg { transform: rotate(180deg); }

.rr-detail td { padding: 18px 20px 20px; background: var(--blue-mid); }
.rr-detail-grid { display: flex; flex-wrap: wrap; gap: 20px; }
.rr-photo { width: 200px; height: 200px; object-fit: cover; border-radius: 10px; border: 1px solid var(--blue-border); }
.rr-detail-body { flex: 1 1 260px; min-width: 0; }
.rr-label { margin-bottom: 5px; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); }
.rr-desc { padding: 12px 14px; border-radius: 10px; font-size: 0.92rem; line-height: 1.6; background: var(--blue-card); border: 1px solid var(--blue-border); color: var(--text-primary); }
.rr-link { display: inline-block; margin-top: 10px; font-size: 0.88rem; font-weight: 600; color: var(--accent); }
.rr-reason { margin-top: 10px; font-size: 0.88rem; font-weight: 600; color: color-mix(in srgb, var(--red) 65%, var(--text-primary)); }
.rr-dup {
  margin-top: 16px; padding: 10px 14px; border-radius: 10px; font-size: 0.86rem; color: var(--text-primary);
  background: color-mix(in srgb, var(--orange) 12%, transparent); border: 1px solid color-mix(in srgb, var(--orange) 45%, transparent);
}
.rr-dup strong { display: block; margin-bottom: 4px; }
.rr-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.rr-btn-verify { background: #16a34a; border-color: #16a34a; color: #fff; }
.rr-btn-verify:hover:not(:disabled) { background: #15803d; border-color: #15803d; }
.rr-btn-reject { color: color-mix(in srgb, var(--red) 70%, var(--text-primary)); border-color: color-mix(in srgb, var(--red) 55%, transparent); }
.rr-btn-dup { color: color-mix(in srgb, var(--orange) 65%, var(--text-primary)); border-color: color-mix(in srgb, var(--orange) 55%, transparent); }

.rr-more {
  width: 100%; margin-top: 14px; padding: 12px; cursor: pointer; font: inherit; font-weight: 600; font-size: 0.92rem;
  background: var(--blue-card); color: var(--text-primary); border: 1px solid var(--blue-border); border-radius: 12px;
}
.rr-more:hover { border-color: var(--accent); color: var(--accent); }
.rr-empty { padding: 52px 24px; text-align: center; color: var(--text-secondary); }
.rr-empty svg { font-size: 2rem; color: var(--text-muted); margin-bottom: 8px; }
.rr-empty strong { display: block; font-size: 0.98rem; color: var(--text-primary); margin-bottom: 4px; }

@media (max-width: 760px) {
  .rr-title { font-size: 1.5rem; }
  .rr-table thead { display: none; }
  .rr-table, .rr-table tbody, .rr-table tr, .rr-table td { display: block; width: 100%; }
  .rr-row { position: relative; padding: 12px 56px 12px 14px; border-bottom: 1px solid var(--blue-border); }
  .rr-row td { padding: 3px 0; border: none; }
  .rr-main { max-width: none; white-space: normal; }
  .rr-table td.rr-cell-chev { position: absolute; top: 12px; right: 10px; width: auto; padding: 0; }
  .rr-detail td { padding: 14px; }
  .rr-photo { width: 100%; height: 200px; }
  .rr-count { margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) { .rr-row, .rr-chev svg { transition: none; } }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className="rr-pill" style={{ '--c': STATUS_COLORS[status] ?? '#8da4be' }}>{label}</span>;
}

function RejectDialog({ onConfirm, onCancel }) {
  const [reason, setReason]   = useState(REJECTION_REASONS[0]);
  const [custom, setCustom]   = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      padding: 20,
    }}>
      <div className="card" style={{ width: 380, maxWidth: '100%', padding: 20 }}>
        <SectionLabel>Reject Report</SectionLabel>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Let the resident know why this report wasn't verified.
        </div>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="form-select"
          style={{ width: '100%', marginBottom: 10, fontSize: '0.82rem' }}
        >
          {REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {reason === 'Other' && (
          <textarea
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Describe the reason..."
            rows={3}
            className="form-control"
            style={{ width: '100%', marginBottom: 10, fontSize: '0.82rem' }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ fontSize: '0.8rem' }}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', background: '#ef4444', borderColor: '#ef4444' }}
            onClick={() => onConfirm(reason === 'Other' ? (custom.trim() || 'Other') : reason)}
          >
            Reject Report
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportRow({ report, allReports, canModerate, open, onToggle, onVerify, onReject, onPromote }) {
  const [updating, setUpdating]     = useState(false);
  const [showReject, setShowReject] = useState(false);
  const duplicates = findNearbyDuplicates(report, allReports);
  const detailId = `rr-detail-${report.id}`;

  const handleVerify = async () => {
    setUpdating(true);
    await onVerify(report.id);
    setUpdating(false);
  };

  const handleReject = async (reason) => {
    setShowReject(false);
    setUpdating(true);
    await onReject(report.id, reason);
    setUpdating(false);
  };

  // One click instead of four for the common "yep, that's the same flood"
  // case the duplicate check exists for.
  const handleRejectAsDuplicate = () => handleReject('Duplicate of another report');

  const location = report.location_label || (report.latitude != null ? 'Pinned on map' : '—');

  return (
    <>
      <tr className={`rr-row${open ? ' open' : ''}`} onClick={onToggle}>
        <td>
          <span className="rr-main">{report.description || 'No description'}</span>
          <div className="rr-sub">
            <span>by {report.reporter_name}</span>
            {duplicates.length > 0 && (
              <span className="rr-flag">
                <LuTriangleAlert size={13} aria-hidden="true" /> {duplicates.length} similar nearby
              </span>
            )}
          </div>
        </td>
        <td><span className="rr-loc"><LuMapPin size={14} aria-hidden="true" /> {location}</span></td>
        <td><StatusPill status={report.status} /></td>
        <td><span className="rr-time" title={new Date(report.created_at).toLocaleString('en-PH')}>{timeAgo(report.created_at)}</span></td>
        <td className="rr-cell-chev">
          <button
            type="button"
            className="rr-chev"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? 'Hide details' : 'Show details'}
          >
            <LuChevronDown size={18} aria-hidden="true" />
          </button>
        </td>
      </tr>

      {open && (
        <tr className="rr-detail" id={detailId}>
          <td colSpan={5}>
            <div className="rr-detail-grid">
              {report.photo_url && <img className="rr-photo" src={report.photo_url} alt="Reported incident" />}
              <div className="rr-detail-body">
                <div className="rr-label">Description</div>
                <div className="rr-desc">{report.description}</div>
                {report.latitude && report.longitude && (
                  <a
                    className="rr-link"
                    href={`https://maps.google.com/?q=${report.latitude},${report.longitude}`}
                    target="_blank" rel="noreferrer"
                  >
                    View exact pinned location
                  </a>
                )}
                {report.status === 'rejected' && report.rejection_reason && (
                  <div className="rr-reason">Rejected: {report.rejection_reason}</div>
                )}
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="rr-dup">
                <strong>Possibly the same incident as {duplicates.length} other report{duplicates.length > 1 ? 's' : ''}</strong>
                {duplicates.map(d => (
                  <div key={d.id}>
                    <StatusPill status={d.status} /> · {timeAgo(d.created_at)}
                    {d.location_label ? ` · ${d.location_label}` : ''}
                  </div>
                ))}
              </div>
            )}

            {canModerate && report.status === 'pending' && (
              <div className="rr-actions">
                <button className="btn btn-primary rr-btn-verify" disabled={updating} onClick={handleVerify}>
                  Verify &amp; publish
                </button>
                <button className="btn btn-ghost rr-btn-reject" disabled={updating} onClick={() => setShowReject(true)}>
                  Reject
                </button>
                {duplicates.length > 0 && (
                  <button className="btn btn-ghost rr-btn-dup" disabled={updating} onClick={handleRejectAsDuplicate}>
                    Reject as duplicate
                  </button>
                )}
              </div>
            )}

            {canModerate && report.status === 'verified' && (
              <div className="rr-actions">
                <button className="btn btn-ghost" onClick={() => onPromote(report)}>
                  Open in Flood Log
                </button>
              </div>
            )}

            {showReject && <RejectDialog onConfirm={handleReject} onCancel={() => setShowReject(false)} />}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunityReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canModerate = user?.roles?.role_desc && user.roles.role_desc !== 'Resident';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('incident_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('incident_reports fetch error:', error.message);
      setErrorMsg('Could not load resident reports.');
    } else {
      setReports(data ?? []);
      setErrorMsg('');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Live updates: new resident reports appear without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('incident_reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, () => {
        fetchReports();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReports]);

  const updateStatus = async (id, status, extra = {}) => {
    const { error } = await supabase
      .from('incident_reports')
      .update({
        status,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        ...extra,
      })
      .eq('id', id);
    if (error) {
      logger.error('incident_reports update error:', error.message);
      setErrorMsg('Could not update that report. Please try again.');
      return;
    }
    setReports(prev => prev.map(r => r.id === id ? { ...r, status, ...extra } : r));
  };

  const handleVerify = (id) => updateStatus(id, 'verified');
  const handleReject = (id, reason) => updateStatus(id, 'rejected', { rejection_reason: reason });

  // Hands the report off to ReportsPage's "File New Report" form, prefilled,
  // via router state -- the official still reviews/completes the official-
  // only fields (water level, casualties, response time...) before it's
  // actually inserted as a flood_reports record. See ReportsPage.jsx.
  const handlePromote = (report) => {
    const d = new Date(report.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    navigate('/reports', { state: { logDate: key } });
  };

  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const tabRefs = useRef([]);

  const counts = useMemo(() => ({
    pending:  reports.filter(r => r.status === 'pending').length,
    verified: reports.filter(r => r.status === 'verified').length,
    rejected: reports.filter(r => r.status === 'rejected').length,
    ALL:      reports.length,
  }), [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(r => {
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (!q) return true;
      return [r.reporter_name, r.description, r.location_label]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [reports, filterStatus, query]);

  useEffect(() => { setVisible(PAGE_SIZE); setOpenId(null); }, [filterStatus, query]);

  const selectTab = (i) => {
    setFilterStatus(STATUS_FILTERS[i].key);
    tabRefs.current[i]?.focus();
  };
  const onTabKey = (e, i) => {
    const last = STATUS_FILTERS.length - 1;
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(i === last ? 0 : i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(i === 0 ? last : i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); selectTab(0); }
    else if (e.key === 'End') { e.preventDefault(); selectTab(last); }
  };

  const activeLabel = STATUS_FILTERS.find(f => f.key === filterStatus)?.label.toLowerCase();
  const shown = filtered.slice(0, visible);

  return (
    <div className="fade-in">
      <style>{STYLES}</style>
      {errorMsg && <ErrorBanner>{errorMsg}</ErrorBanner>}

      <div>
        <div className="rr-eyebrow">Submitted through the mobile app</div>
        <h2 className="rr-title">Resident reports</h2>
      </div>

      <div className="rr-tabs" role="tablist" aria-label="Report status">
        {STATUS_FILTERS.map((f, i) => (
          <button
            key={f.key}
            ref={el => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`rr-tab-${f.key}`}
            aria-selected={filterStatus === f.key}
            aria-controls="rr-panel"
            tabIndex={filterStatus === f.key ? 0 : -1}
            className="rr-tab"
            onClick={() => setFilterStatus(f.key)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {f.label}
            {counts[f.key] > 0 && <span className="rr-tab-count">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      <div className="rr-toolbar">
        <div className="rr-search">
          <LuSearch size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports"
            aria-label="Search reports"
          />
        </div>
        <span className="rr-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'report' : 'reports'}
        </span>
      </div>

      <div id="rr-panel" role="tabpanel" aria-labelledby={`rr-tab-${filterStatus}`}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rr-card rr-empty">
            <LuInbox aria-hidden="true" />
            <strong>{query ? 'No reports match your search.' : `No ${activeLabel === 'all' ? '' : `${activeLabel} `}reports.`}</strong>
            <span>{query ? 'Try a different name or place.' : 'New reports appear here as residents send them.'}</span>
          </div>
        ) : (
          <>
            <div className="rr-card">
              <table className="rr-table">
                <thead>
                  <tr>
                    <th scope="col">Report</th>
                    <th scope="col">Location</th>
                    <th scope="col">Status</th>
                    <th scope="col">Reported</th>
                    <th scope="col"><span className="rr-sr">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      allReports={reports}
                      canModerate={canModerate}
                      open={openId === r.id}
                      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                      onVerify={handleVerify}
                      onReject={handleReject}
                      onPromote={handlePromote}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > shown.length && (
              <button type="button" className="rr-more" onClick={() => setVisible(v => v + PAGE_SIZE)}>
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
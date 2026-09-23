import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LuMegaphone, LuHourglass, LuCircleCheckBig, LuCircleX,
  LuDroplets, LuMapPin, LuTriangleAlert,
} from 'react-icons/lu';
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const color = STATUS_COLORS[status] ?? '#8da4be';
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: `${color}18`, color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '2px 8px',
    }}>
      {status}
    </span>
  );
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

function ReportCard({ report, allReports, canModerate, onVerify, onReject, onPromote, highlighted }) {
  const [expanded, setExpanded]   = useState(highlighted);
  const [updating, setUpdating]   = useState(false);
  const [showReject, setShowReject] = useState(false);
  const duplicates = findNearbyDuplicates(report, allReports);

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

  // Skips the reason dialog since the reason is already known -- one
  // click instead of four for the common "yep, that's the same flood"
  // case the duplicate check exists for.
  const handleRejectAsDuplicate = () => handleReject('Duplicate of another report');

  return (
    <div
      id={`report-${report.id}`}
      style={{
        background: 'var(--blue-mid)',
        border: `1px solid ${expanded ? STATUS_COLORS[report.status] + '60' : 'var(--blue-border)'}`,
        borderLeft: `4px solid ${STATUS_COLORS[report.status]}`,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.4s',
        boxShadow: highlighted ? '0 0 0 3px rgba(56,189,248,0.45)' : 'none',
      }}
    >
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '13px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)',
            background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
            borderRadius: 5, padding: '2px 8px 2px 6px',
          }}>
            <LuDroplets size={12} aria-hidden="true" /> Flood
          </span>
          <StatusPill status={report.status} />
          {report.location_label && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--blue-card)',
              border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 7px',
            }}>
              <LuMapPin size={10} aria-hidden="true" /> {report.location_label}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {timeAgo(report.created_at)}
          </span>
          {duplicates.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.65rem', fontWeight: 700, color: '#f97316',
              background: '#f9731618', border: '1px solid #f9731640',
              borderRadius: 4, padding: '1px 7px',
            }}>
              <LuTriangleAlert size={10} aria-hidden="true" /> {duplicates.length} similar nearby
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            by <strong style={{ color: 'var(--text-secondary)' }}>{report.reporter_name}</strong>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--blue-border)' }}>
          <div style={{ marginTop: 14, marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {report.photo_url && (
              <img
                src={report.photo_url}
                alt="Reported incident"
                style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--blue-border)' }}
              />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>
                Description
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--blue-card)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--blue-border)', marginBottom: 10 }}>
                {report.description}
              </div>
              {report.latitude && report.longitude && (
                <a
                  href={`https://maps.google.com/?q=${report.latitude},${report.longitude}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--accent)' }}
                >
                  View exact pinned location
                </a>
              )}
              {report.status === 'rejected' && report.rejection_reason && (
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#ef4444' }}>
                  Rejected: {report.rejection_reason}
                </div>
              )}
            </div>
          </div>

          {duplicates.length > 0 && (
            <div style={{
              marginBottom: 12, padding: '8px 12px', borderRadius: 6,
              background: '#f9731612', border: '1px solid #f9731640',
              fontSize: '0.76rem', color: 'var(--text-secondary)',
            }}>
              <div style={{ fontWeight: 700, color: '#f97316', marginBottom: 4 }}>
                Possibly the same incident as {duplicates.length} other report{duplicates.length > 1 ? 's' : ''}
              </div>
              {duplicates.map(d => (
                <div key={d.id} style={{ opacity: 0.85 }}>
                  • <StatusPill status={d.status} /> · {timeAgo(d.created_at)}
                  {d.location_label ? ` · ${d.location_label}` : ''}
                </div>
              ))}
            </div>
          )}

          {canModerate && report.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                disabled={updating}
                onClick={handleVerify}
                style={{ fontSize: '0.78rem', background: '#22c55e', borderColor: '#22c55e' }}
              >
                Verify & Publish
              </button>
              <button
                className="btn btn-ghost"
                disabled={updating}
                onClick={() => setShowReject(true)}
                style={{ fontSize: '0.78rem', color: '#ef4444', borderColor: '#ef444460' }}
              >
                Reject
              </button>
              {duplicates.length > 0 && (
                <button
                  className="btn btn-ghost"
                  disabled={updating}
                  onClick={handleRejectAsDuplicate}
                  style={{ fontSize: '0.78rem', color: '#f97316', borderColor: '#f9731660' }}
                >
                  Reject as Duplicate
                </button>
              )}
            </div>
          )}

          {canModerate && report.status === 'verified' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {report.promoted_report_id ? (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Already promoted to an official report
                </span>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => onPromote(report)}
                  style={{ fontSize: '0.78rem', color: 'var(--accent)', borderColor: 'var(--accent)60' }}
                >
                  Promote to Official Report
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showReject && (
        <RejectDialog onConfirm={handleReject} onCancel={() => setShowReject(false)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunityReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canModerate = user?.roles?.role_desc && user.roles.role_desc !== 'Resident';

  // Deep-link support: TeamChatPage's "linked incident" chip navigates here
  // with { state: { focusReportId } } so a coordination message can jump
  // straight to the report it's about, instead of just landing on the
  // general moderation list.
  const focusReportId = location.state?.focusReportId ?? null;
  const appliedFocusFilter = useRef(false);

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

  // Jump to a specific report when arriving via a deep link (e.g. the
  // "linked incident" chip in TeamChatPage). The target report might not
  // be in the current status tab (default is "pending"), so switch to
  // "ALL" once, then scroll/flash the card once it's rendered.
  useEffect(() => {
    if (!focusReportId || appliedFocusFilter.current) return;
    appliedFocusFilter.current = true;
    setFilterStatus('ALL');
  }, [focusReportId]);

  useEffect(() => {
    if (!focusReportId || reports.length === 0) return;
    const el = document.getElementById(`report-${focusReportId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusReportId, reports, filterStatus]);

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
  const handlePromote = (report) => navigate('/reports', { state: { promoteFrom: report } });

  const filtered = reports.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const verifiedCount = reports.filter(r => r.status === 'verified').length;
  const rejectedCount = reports.filter(r => r.status === 'rejected').length;

  return (
    <div className="fade-in">
      {errorMsg && <ErrorBanner>{errorMsg}</ErrorBanner>}

      {/* ── Page header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'rgba(56,189,248,0.14)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LuMegaphone size={19} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Resident Reports
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Flood reports submitted by residents through the mobile app, awaiting review.
          </div>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
        {[
          { key: 'pending',  label: 'Awaiting Review', count: pendingCount,  color: '#eab308', Icon: LuHourglass },
          { key: 'verified', label: 'Verified',         count: verifiedCount, color: '#22c55e', Icon: LuCircleCheckBig },
          { key: 'rejected', label: 'Rejected',         count: rejectedCount, color: '#ef4444', Icon: LuCircleX },
        ].map(s => (
          <div
            key={s.key}
            className="card"
            style={{
              flex: '1 1 170px', minWidth: 170, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: `${s.color}20`, color: s.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <s.Icon size={18} aria-hidden="true" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>
                {s.count}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SectionLabel>Reports</SectionLabel>
        <div
          className="view-toggle-group"
          style={{
            marginLeft: 'auto', display: 'flex', gap: 0,
            background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
            borderRadius: 8, overflow: 'hidden',
          }}
        >
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className="toggle-pill"
              onClick={() => setFilterStatus(f.key)}
              style={{
                padding: '7px 16px', fontSize: '0.76rem', fontWeight: 700,
                letterSpacing: '0.02em', cursor: 'pointer', border: 'none',
                background: filterStatus === f.key ? 'var(--accent)' : 'transparent',
                color: filterStatus === f.key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            No reports match this filter.
          </div>
          <div style={{ fontSize: '0.78rem' }}>
            Try switching to a different status above.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              allReports={reports}
              canModerate={canModerate}
              onVerify={handleVerify}
              onReject={handleReject}
              onPromote={handlePromote}
              highlighted={r.id === focusReportId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

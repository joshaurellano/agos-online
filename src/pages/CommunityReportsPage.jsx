import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel, Badge, ErrorBanner } from '../components/ui';
import { logger } from '../lib/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON = {
  Flood:               '🌊',
  Fire:                '🔥',
  Landslide:           '⛰️',
  'Road Accident':     '🚗',
  'Power Outage':      '💡',
  'Medical Emergency': '🚑',
  Other:               '📍',
};

const STATUS_COLORS = {
  pending:  '#eab308',
  verified: '#22c55e',
  rejected: '#ef4444',
};

const REJECTION_REASONS = [
  'Duplicate of another report',
  'Not enough information',
  'Unable to verify / no evidence',
  'False or misleading report',
  'Outside barangay jurisdiction',
  'Other',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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
    }}>
      <div className="card" style={{ width: 380, padding: 20 }}>
        <SectionLabel>❌ Reject Report</SectionLabel>
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

function ReportCard({ report, canModerate, onVerify, onReject }) {
  const [expanded, setExpanded]   = useState(false);
  const [updating, setUpdating]   = useState(false);
  const [showReject, setShowReject] = useState(false);
  const icon = CATEGORY_ICON[report.category] ?? '📍';

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

  return (
    <div style={{
      background: 'var(--blue-mid)',
      border: `1px solid ${expanded ? STATUS_COLORS[report.status] + '60' : 'var(--blue-border)'}`,
      borderLeft: `4px solid ${STATUS_COLORS[report.status]}`,
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '13px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1rem' }}>{icon}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
            {report.category}
          </span>
          <StatusPill status={report.status} />
          {report.location_label && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--blue-card)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 7px' }}>
              📍 {report.location_label}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {timeAgo(report.created_at)}
          </span>
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
                  🗺 View exact pinned location
                </a>
              )}
              {report.status === 'rejected' && report.rejection_reason && (
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#ef4444' }}>
                  Rejected: {report.rejection_reason}
                </div>
              )}
            </div>
          </div>

          {canModerate && report.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={updating}
                onClick={handleVerify}
                style={{ fontSize: '0.78rem', background: '#22c55e', borderColor: '#22c55e' }}
              >
                ✅ Verify & Publish
              </button>
              <button
                className="btn btn-ghost"
                disabled={updating}
                onClick={() => setShowReject(true)}
                style={{ fontSize: '0.78rem', color: '#ef4444', borderColor: '#ef444460' }}
              >
                ❌ Reject
              </button>
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
  const canModerate = user?.roles?.role_desc && user.roles.role_desc !== 'Resident';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterCategory, setFilterCategory] = useState('ALL');

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

  const filtered = reports.filter(r => {
    if (filterStatus   !== 'ALL' && r.status   !== filterStatus)   return false;
    if (filterCategory !== 'ALL' && r.category !== filterCategory) return false;
    return true;
  });

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const presentCategories = ['ALL', ...new Set(reports.map(r => r.category).filter(Boolean))];

  return (
    <div className="fade-in">
      {errorMsg && <ErrorBanner>{errorMsg}</ErrorBanner>}

      {/* ── Stat strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="card" style={{ borderTop: '3px solid #eab308', padding: '12px 16px', minWidth: 140 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: '#eab308' }}>{pendingCount}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Awaiting Review</div>
        </div>
        <div className="card" style={{ borderTop: '3px solid #22c55e', padding: '12px 16px', minWidth: 140 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>
            {reports.filter(r => r.status === 'verified').length}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Verified</div>
        </div>
        <div className="card" style={{ borderTop: '3px solid #ef4444', padding: '12px 16px', minWidth: 140 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>
            {reports.filter(r => r.status === 'rejected').length}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Rejected</div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SectionLabel>📥 Resident Reports</SectionLabel>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-select" style={{ fontSize: '0.8rem' }}>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="ALL">All Statuses</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="form-select" style={{ fontSize: '0.8rem' }}>
            {presentCategories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>)}
          </select>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading reports…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No reports match this filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              canModerate={canModerate}
              onVerify={handleVerify}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

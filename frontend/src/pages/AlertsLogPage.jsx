import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel, ErrorBanner } from '../components/ui';
import { ALERT_LEVELS } from '../data/mockData';
import { reportTimeAgo as timeAgo } from '../lib/incidentReports';
import { logger } from '../lib/logger';

// Public, read-only history of dispatched alerts -- deliberately separate
// from AlertDeliveryStatus (components/AlertDeliveryStatus.jsx), which stays
// staff/admin-only since it exposes SMS provider errors and FCM payloads.
// This page only ever reads `type`, `message`, and `created_at` from the
// `alerts` table -- `sent_by` (the dispatching officer's name/email) is
// intentionally left out of the query so no individual official's identity
// is published here.
const PAGE_SIZE = 20;

// Short headline per severity -- this is the resident-facing counterpart of
// what an alert *is*, shown bold above the actual dispatched message, the
// same way a phone's system notification pairs a short bold headline
// ("Warming over next 3 days") with a longer body underneath.
const HEADLINE = {
  ADVISORY: 'Flood Advisory',
  WARNING: 'Flood Warning',
  CRITICAL: 'Flood Critical Alert',
};

// Plain triangle-warning glyph, drawn from two shapes (no external icon
// library in this project) -- sits inside the colored avatar circle the
// same way a source's icon sits inside its round badge on a phone's
// notification shade.
function WarningGlyph({ color, size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 3.5 L2 20.5 H22 Z" fill="#fff" />
      <rect x="10.9" y="9.3" width="2.2" height="6" rx="1.1" fill={color} />
      <rect x="10.9" y="16.3" width="2.2" height="2.2" rx="1.1" fill={color} />
    </svg>
  );
}

function ChevronIcon({ open, size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
    >
      <path d="M6 9l6 6 6-6" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One dispatched alert, styled like a phone's system notification card:
// a colored round icon avatar, a "source · time ago" row, a bold headline,
// then the actual message body -- collapsible via the chevron so a long
// history stays scannable without hiding anything by default.
function NotificationCard({ alert, expanded, onToggle }) {
  const info = ALERT_LEVELS[alert.type] ?? ALERT_LEVELS.ADVISORY;
  const headline = HEADLINE[alert.type] ?? info.label;

  return (
    <div
      style={{
        background: 'var(--bg-elevated, #16233b)',
        border: '1px solid var(--blue-border)',
        borderRadius: 14,
        padding: '14px 14px 12px',
      }}
    >
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
      >
        <div style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
          background: info.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <WarningGlyph color={info.color} />
        </div>

        <div style={{ flex: '1 1 auto', minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            AGOS · {timeAgo(alert.created_at)}
          </div>
          <div style={{
            fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
            marginTop: 3, lineHeight: 1.35,
          }}>
            {headline}
          </div>
          {!expanded && (
            <div style={{
              fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {alert.message}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <ChevronIcon open={expanded} />
        </div>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 44, marginTop: 4 }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {alert.message}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8 }}>
            {new Date(alert.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlertsLogPage() {
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [limit, setLimit]       = useState(PAGE_SIZE);
  const [hasMore, setHasMore]   = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  // Cards default to expanded (matches the log's old always-visible-message
  // behavior) -- this set tracks which ones the visitor has collapsed.
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  const toggleCollapsed = (id) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const load = useCallback(async (currentLimit) => {
    const { data, error: fetchErr } = await supabase
      .from('alerts')
      .select('id, type, message, created_at')
      .order('created_at', { ascending: false })
      .limit(currentLimit + 1); // +1 lookahead to know if a next page exists

    if (fetchErr) {
      logger.error('alerts log fetch error:', fetchErr.message);
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    setHasMore((data ?? []).length > currentLimit);
    setAlerts((data ?? []).slice(0, currentLimit));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(limit);

    // New dispatches should show up here immediately without a refresh --
    // same realtime pattern the rest of the app uses for the `alerts` /
    // `incident_reports` tables.
    const channel = supabase
      .channel('alerts_log_public')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => load(limit))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [limit, load]);

  const visibleAlerts = typeFilter === 'ALL' ? alerts : alerts.filter(a => a.type === typeFilter);

  return (
    <div className="fade-in">
      <div className="card-title" style={{ marginBottom: 4 }}>
        Public Alert Log
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 640 }}>
        A public record of every flood advisory, warning, and critical alert dispatched for Barangay Triangulo.
        For live SMS/push delivery status, barangay officials and admins can check the delivery panel on the Dashboard.
      </p>

      {error && <ErrorBanner>Could not load the alert log — {error}</ErrorBanner>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <SectionLabel>Dispatched Alerts</SectionLabel>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="form-select"
          style={{ width: 'auto', fontSize: '0.78rem' }}
        >
          <option value="ALL">All severities</option>
          <option value="ADVISORY">Advisory</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {loading && alerts.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
          Loading alert history…
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
          No alerts have been dispatched{typeFilter !== 'ALL' ? ` at this severity` : ''} yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleAlerts.map(alert => (
            <NotificationCard
              key={alert.id}
              alert={alert}
              expanded={!collapsedIds.has(alert.id)}
              onToggle={() => toggleCollapsed(alert.id)}
            />
          ))}
        </div>
      )}

      {!loading && hasMore && visibleAlerts.length > 0 && (
        <button
          onClick={() => setLimit(l => l + PAGE_SIZE)}
          className="btn btn-outline-secondary"
          style={{ width: '100%', marginTop: 14, fontSize: '0.8rem' }}
        >
          Load older alerts
        </button>
      )}

      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 14 }}>
        This log lists what was sent, not whether every resident received it. Always follow instructions from
        the Barangay and the City Disaster Risk Reduction and Management Office during an actual emergency.
      </div>
    </div>
  );
}

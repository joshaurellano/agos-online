import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel, Badge, ErrorBanner } from '../components/ui';
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

export default function AlertsLogPage() {
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [limit, setLimit]       = useState(PAGE_SIZE);
  const [hasMore, setHasMore]   = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');

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

      <div className="card" style={{ marginBottom: 16 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibleAlerts.map((alert, i) => (
              <div
                key={alert.id}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12,
                  padding: '12px 4px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--blue-border)',
                }}
              >
                <div style={{ flexShrink: 0, paddingTop: 1 }}>
                  <Badge level={alert.type} />
                </div>
                <div style={{ flex: '1 1 320px', minWidth: 220 }}>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {alert.message}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(alert.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{timeAgo(alert.created_at)}
                  </div>
                </div>
              </div>
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
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        This log lists what was sent, not whether every resident received it. Always follow instructions from
        the Barangay and the City Disaster Risk Reduction and Management Office during an actual emergency.
      </div>
    </div>
  );
}

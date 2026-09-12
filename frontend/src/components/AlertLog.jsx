// Full alert history — dispatched evacuation alerts plus their SMS/push
// delivery outcome, in one always-visible table. Replaces the old
// "Recent Alert Delivery Status" widget, which only looked back 24 hours
// and stayed collapsed by default; staff asked for the fuller picture
// (every alert ever sent, not just today's) surfaced without an extra
// click. Reads `alerts` + `alert_deliveries`, the same tables the old
// widget used (alert_deliveries is written by the on-alert-change DB
// webhook after calling send-alert / send-push-notification — see
// supabase/functions/on-alert-change and supabase/alert_deliveries_schema.sql).
//
// Admin-only by convention -- render this gated the same way the "Send
// Alert" button is (canSendAlert), since delivery detail (SMS provider
// errors, FCM error payloads) isn't something residents need to see.
import { useEffect, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../lib/supabaseClient';

const PAGE_SIZE = 25;

const STATUS_STYLE = {
  success: { color: '#22c55e', label: 'Sent' },
  partial: { color: '#f59e0b', label: 'Partial' },
  failed:  { color: '#ef4444', label: 'Failed' },
  pending: { color: '#8da4be', label: 'Pending…' },
};

const TYPE_COLORS = {
  ADVISORY: '#eab308',
  WARNING:  '#f97316',
  CRITICAL: '#ef4444',
};

const CHANNEL_LABEL = { sms: 'SMS', push: 'Push' };

function deliveryDetailText(channel, status, detail) {
  if (status === 'pending') return 'Waiting for dispatch confirmation';
  if (channel === 'sms') {
    const sent   = detail?.sent   ?? 0;
    const failed = detail?.failed ?? 0;
    const total  = detail?.total  ?? sent + failed;
    if (status === 'failed' && !total) return detail?.error ?? 'No response recorded';
    return `${sent}/${total} delivered`;
  }
  // push
  if (status === 'failed') return detail?.error ?? 'FCM send failed';
  return 'Delivered to flood_alerts topic';
}

function needsAttention(delivery) {
  const status = delivery?.status ?? 'pending';
  return status === 'failed' || status === 'partial' || status === 'pending';
}

function DeliveryPill({ channel, delivery }) {
  const status = delivery?.status ?? 'pending';
  const style  = STATUS_STYLE[status] ?? STATUS_STYLE.pending;

  return (
    <div
      title={deliveryDetailText(channel, status, delivery?.detail)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap',
        background: `${style.color}18`, border: `1px solid ${style.color}40`,
      }}
    >
      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{CHANNEL_LABEL[channel]}</span>
      <span style={{ fontSize: '0.64rem', fontWeight: 700, color: style.color }}>{style.label}</span>
    </div>
  );
}

export default function AlertLog() {
  const [alerts, setAlerts]         = useState([]);
  const [deliveries, setDeliveries] = useState({}); // alert_id -> { sms, push }
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const loadDeliveriesFor = useCallback(async (alertRows) => {
    const ids = alertRows.map(a => a.id);
    if (ids.length === 0) return {};
    const { data: deliveryRows } = await supabase
      .from('alert_deliveries')
      .select('alert_id, channel, status, detail')
      .in('alert_id', ids);
    const byAlert = {};
    (deliveryRows ?? []).forEach(d => {
      byAlert[d.alert_id] = { ...(byAlert[d.alert_id] ?? {}), [d.channel]: d };
    });
    return byAlert;
  }, []);

  // Initial page + periodic refresh of that same page, so in-flight
  // deliveries (pending -> sent/failed) update without the admin needing
  // to do anything. Loading page 2+ is a manual "Load more" action.
  const loadFirstPage = useCallback(async () => {
    const { data: alertRows, error } = await supabase
      .from('alerts')
      .select('id, type, message, sent_by, created_at')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error || !alertRows) {
      setLoading(false);
      return;
    }
    setAlerts(alertRows);
    setHasMore(alertRows.length === PAGE_SIZE);
    setDeliveries(await loadDeliveriesFor(alertRows));
    setLoading(false);
  }, [loadDeliveriesFor]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data: nextRows, error } = await supabase
      .from('alerts')
      .select('id, type, message, sent_by, created_at')
      .order('created_at', { ascending: false })
      .range(alerts.length, alerts.length + PAGE_SIZE - 1);

    if (!error && nextRows) {
      const nextDeliveries = await loadDeliveriesFor(nextRows);
      setAlerts(prev => [...prev, ...nextRows]);
      setHasMore(nextRows.length === PAGE_SIZE);
      setDeliveries(prev => ({ ...prev, ...nextDeliveries }));
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    loadFirstPage();
    // Poll rather than subscribe -- delivery rows land within a couple
    // seconds of the alert insert, so a short interval is enough to turn
    // "pending" into "sent/failed" without needing a realtime channel just
    // for this panel. Only the currently-loaded page is refreshed.
    const t = setInterval(loadFirstPage, 5000);
    return () => clearInterval(t);
  }, [loadFirstPage]);

  const handleDelete = async (alert) => {
    const result = await Swal.fire({
      title: 'Remove this entry?',
      html: `<p style="color:#8da4be;font-size:0.85rem">This only clears it from the alert log -- SMS/push already sent won't be recalled.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      background: '#0d1f3c', color: '#e2eaf5',
    });
    if (!result.isConfirmed) return;

    setDeletingId(alert.id);
    // Deleting the alerts row cascades to alert_deliveries (on delete
    // cascade) -- one delete clears both.
    const { error } = await supabase.from('alerts').delete().eq('id', alert.id);
    setDeletingId(null);

    if (error) {
      Swal.fire({ title: 'Could not remove', text: error.message, icon: 'error', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
      return;
    }
    setAlerts(prev => prev.filter(a => a.id !== alert.id));
  };

  const attentionCount = alerts.filter(a =>
    needsAttention(deliveries[a.id]?.push) || needsAttention(deliveries[a.id]?.sms)
  ).length;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Alert Log</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {attentionCount > 0 && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b',
              background: '#f59e0b18', border: '1px solid #f59e0b40',
              borderRadius: 6, padding: '2px 8px', textTransform: 'none', letterSpacing: 0,
            }}>
              {attentionCount} need{attentionCount === 1 ? 's' : ''} a look
            </span>
          )}
          <span style={{ fontSize: '0.68rem', color: 'inherit', opacity: 0.75, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
            {alerts.length} shown
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>Loading alert history…</div>
      ) : alerts.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>
          No alerts have been dispatched yet.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                  {['Time', 'Severity', 'Message', 'Sent By', 'Push', 'SMS', ''].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: 'left',
                      color: 'var(--text-muted)', fontWeight: 700,
                      textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr
                    key={alert.id}
                    style={{ borderBottom: '1px solid rgba(30,58,95,0.4)', opacity: deletingId === alert.id ? 0.5 : 1 }}
                  >
                    <td style={{ padding: '9px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(alert.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{
                        fontSize: '0.66rem', fontWeight: 700,
                        background: `${TYPE_COLORS[alert.type] ?? '#8da4be'}18`,
                        color: TYPE_COLORS[alert.type] ?? '#8da4be',
                        border: `1px solid ${TYPE_COLORS[alert.type] ?? '#8da4be'}40`,
                        borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                      }}>{alert.type ?? '—'}</span>
                    </td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', minWidth: 220 }}>
                      {alert.message?.slice(0, 100)}{alert.message?.length > 100 ? '…' : ''}
                    </td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {alert.sent_by ?? '—'}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <DeliveryPill channel="push" delivery={deliveries[alert.id]?.push} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <DeliveryPill channel="sms" delivery={deliveries[alert.id]?.sms} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <button
                        onClick={() => handleDelete(alert)}
                        disabled={deletingId === alert.id}
                        title="Remove from the log"
                        style={{
                          background: 'transparent', border: '1px solid var(--blue-border)',
                          borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
                          fontSize: '0.75rem', padding: '5px 8px', lineHeight: 1,
                        }}
                      >
                        
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={loadMore} disabled={loadingMore} style={{ fontSize: '0.75rem' }}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

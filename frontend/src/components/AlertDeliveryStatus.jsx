// Shows the actual dispatch outcome (SMS + push) for recent alerts, instead
// of assuming success the moment an `alerts` row is inserted. Reads from
// alert_deliveries, which on-alert-change writes to after calling
// send-alert / send-push-notification (see supabase/functions/on-alert-change
// and supabase/alert_deliveries_schema.sql).
//
// Admin-only by convention -- render this gated the same way the "Send
// Alert" button is (canSendAlert), since delivery detail (SMS provider
// errors, FCM error payloads) isn't something residents need to see.
//
// Deliberately quiet by default: collapsed, only renders at all when there's
// something from the last RECENT_HOURS to show, and only badges itself when
// collapsed if something actually needs attention (pending/failed) -- an
// all-green panel sitting open on every dashboard load is exactly the kind
// of thing people stop reading.
//
// Entries are DISMISSIBLE, not deletable -- this used to hard-delete the
// underlying `alerts` row (cascading to alert_deliveries), but that row is
// also the public Alert Log's only copy of that alert (see
// pages/AlertsLogPage.jsx), so removing it here was silently erasing public
// history too. Dismissal is purely local: the id is stashed in
// localStorage so a handled entry stays out of *this admin's* view across
// refreshes, without touching the shared record at all.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel } from './ui';

const RECENT_HOURS = 24;
const DISMISSED_KEY = 'agos_dismissed_alert_deliveries';

function loadDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveDismissed(set) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) -- dismissal just
    // won't survive a refresh; not worth surfacing an error for.
  }
}

const STATUS_STYLE = {
  success: { color: '#22c55e', label: 'Sent' },
  partial: { color: '#f59e0b', label: 'Partial' },
  failed:  { color: '#ef4444', label: 'Failed' },
  pending: { color: '#8da4be', label: 'Pending…' },
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

function DeliveryBadge({ channel, delivery }) {
  const status = delivery?.status ?? 'pending';
  const style  = STATUS_STYLE[status] ?? STATUS_STYLE.pending;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 6,
      background: `${style.color}18`, border: `1px solid ${style.color}40`,
    }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{CHANNEL_LABEL[channel]}</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: style.color }}>{style.label}</span>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        {deliveryDetailText(channel, status, delivery?.detail)}
      </span>
    </div>
  );
}

export default function AlertDeliveryStatus({ limit = 5 }) {
  const [alerts, setAlerts]         = useState([]);
  const [deliveries, setDeliveries] = useState({}); // alert_id -> { sms, push }
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(false);
  const [dismissed, setDismissed]   = useState(loadDismissed);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000).toISOString();

    const { data: alertRows, error: alertsErr } = await supabase
      .from('alerts')
      .select('id, type, message, sent_by, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (alertsErr || !alertRows) {
      setLoading(false);
      return;
    }
    setAlerts(alertRows);

    const ids = alertRows.map(a => a.id);
    if (ids.length === 0) {
      setDeliveries({});
      setLoading(false);
      return;
    }

    const { data: deliveryRows } = await supabase
      .from('alert_deliveries')
      .select('alert_id, channel, status, detail')
      .in('alert_id', ids);

    const byAlert = {};
    (deliveryRows ?? []).forEach(d => {
      byAlert[d.alert_id] = { ...(byAlert[d.alert_id] ?? {}), [d.channel]: d };
    });
    setDeliveries(byAlert);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    // Poll rather than subscribe -- delivery rows land within a couple
    // seconds of the alert insert, so a short interval is enough to turn
    // "pending" into "sent/failed" without needing a realtime channel just
    // for this panel.
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleDismiss = (alert) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(alert.id);
      saveDismissed(next);
      return next;
    });
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (loading && visibleAlerts.length === 0) return null;
  if (visibleAlerts.length === 0) return null;

  const attentionCount = visibleAlerts.filter(a =>
    needsAttention(deliveries[a.id]?.push) || needsAttention(deliveries[a.id]?.sms)
  ).length;

  return (
    <div className="card" style={{ marginBottom: 16, padding: expanded ? undefined : '10px 16px' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <SectionLabel>Recent Alert Delivery Status</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {attentionCount > 0 && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b',
              background: '#f59e0b18', border: '1px solid #f59e0b40',
              borderRadius: 6, padding: '2px 8px',
            }}>
              {attentionCount} need{attentionCount === 1 ? 's' : ''} a look
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {visibleAlerts.map(alert => (
            <div key={alert.id} style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--blue-border)',
            }}>
              <div style={{ minWidth: 180, flex: '1 1 auto' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {alert.type} — {new Date(alert.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {alert.message?.slice(0, 80)}{alert.message?.length > 80 ? '…' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <DeliveryBadge channel="push" delivery={deliveries[alert.id]?.push} />
                <DeliveryBadge channel="sms"  delivery={deliveries[alert.id]?.sms} />
                <button
                  onClick={() => handleDismiss(alert)}
                  title="Dismiss from this view -- stays in the public Alert Log"
                  style={{
                    background: 'transparent', border: '1px solid var(--blue-border)',
                    borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: '0.75rem', padding: '5px 8px', lineHeight: 1,
                  }}
                >
                  ✓ Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
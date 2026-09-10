import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALERT_TITLES: Record<string, string> = {
  ADVISORY: '🟡 ADVISORY',
  WARNING:  '🟠 WARNING',
  CRITICAL: '🔴 EVACUATION ALERT',
  NORMAL:   '🟢 All Clear',
};

// Best-effort logging of a channel's dispatch outcome into alert_deliveries.
// Deliberately swallows its own errors -- a logging failure must never take
// down the actual alert dispatch, which is the whole point of this function.
async function logDelivery(
  supabase: ReturnType<typeof createClient>,
  alertId: number,
  channel: 'sms' | 'push',
  status: 'success' | 'partial' | 'failed',
  detail: unknown,
) {
  try {
    const { error } = await supabase.from('alert_deliveries').insert({
      alert_id: alertId,
      channel,
      status,
      detail: detail ?? {},
    });
    if (error) console.error(`[alert_deliveries] insert failed (${channel}):`, error.message);
  } catch (err) {
    console.error(`[alert_deliveries] insert threw (${channel}):`, err.message);
  }
}

serve(async (req) => {
  try {
    const rawText = await req.text();
    const payload = JSON.parse(rawText);

    const record = payload.record;
    const alertId: number | undefined = record?.id;
    const alertType: string = record?.type;
    const message: string   = record?.message ?? `AGOS Alert: ${alertType}`;

    console.log('alertType:', alertType);

    if (!alertType) {
      return new Response(
        JSON.stringify({ error: 'No type found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const title       = ALERT_TITLES[alertType] ?? 'AGOS Alert';

    // Service-role client purely for writing delivery outcomes below --
    // same pattern send-alert already uses to read all profiles.
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Call send-push-notification (JWT verification disabled)
    console.log('Calling send-push-notification...');
    const pushRes  = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: message, level: alertType, topic: 'flood_alerts' }),
    });
    const pushText = await pushRes.text();
    console.log('send-push-notification status:', pushRes.status, pushText);

    if (alertId) {
      let pushDetail: unknown;
      try { pushDetail = JSON.parse(pushText); } catch { pushDetail = { raw: pushText }; }
      await logDelivery(supabase, alertId, 'push', pushRes.ok ? 'success' : 'failed', pushDetail);
    }

    // Call send-alert (JWT verification disabled)
    console.log('Calling send-alert...');
    const smsRes  = await fetch(`${supabaseUrl}/functions/v1/send-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, type: alertType }),
    });
    const smsText = await smsRes.text();
    console.log('send-alert status:', smsRes.status, smsText);

    if (alertId) {
      let smsDetail: unknown;
      try { smsDetail = JSON.parse(smsText); } catch { smsDetail = { raw: smsText }; }

      let smsStatus: 'success' | 'partial' | 'failed' = 'failed';
      if (smsRes.ok && smsDetail && typeof smsDetail === 'object') {
        const { sent, failed } = smsDetail as { sent?: number; failed?: number };
        if ((sent ?? 0) > 0 && (failed ?? 0) === 0) smsStatus = 'success';
        else if ((sent ?? 0) > 0 && (failed ?? 0) > 0) smsStatus = 'partial';
        else smsStatus = 'failed';
      }
      await logDelivery(supabase, alertId, 'sms', smsStatus, smsDetail);
    }

    return new Response(
      JSON.stringify({ ok: true, firedFor: alertType }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('on-alert-change error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALERT_TITLES: Record<string, string> = {
  ADVISORY: '🟡 Advisory – Barangay Triangulo',
  WARNING:  '🟠 Warning – Barangay Triangulo',
  CRITICAL: '🔴 CRITICAL – Barangay Triangulo',
  NORMAL:   '🟢 All Clear – Barangay Triangulo',
};

serve(async (req) => {
  try {
    const rawText = await req.text();
    const payload = JSON.parse(rawText);

    const record = payload.record;
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

    // Call send-push-notification (JWT verification disabled)
    console.log('Calling send-push-notification...');
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: message, level: alertType, topic: 'flood_alerts' }),
    });
    const pushData = await pushRes.text();
    console.log('send-push-notification status:', pushRes.status, pushData);

    // Call send-alert (JWT verification disabled)
    console.log('Calling send-alert...');
    const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, type: alertType }),
    });
    const smsData = await smsRes.text();
    console.log('send-alert status:', smsRes.status, smsData);

    return new Response(
      JSON.stringify({ ok: true, firedFor: alertType }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('on-alert-change error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
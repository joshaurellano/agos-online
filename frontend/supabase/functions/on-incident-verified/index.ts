import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Mirrors on-alert-change/index.ts: fired by a Database Webhook on
// UPDATE of public.incident_reports, and only acts when a report has
// just transitioned INTO 'verified' (not on every edit).

const CATEGORY_EMOJI: Record<string, string> = {
  Flood:              '🌊',
  Fire:               '🔥',
  Landslide:          '⛰️',
  'Road Accident':    '🚗',
  'Power Outage':     '💡',
  'Medical Emergency':'🚑',
  Other:              '📍',
};

serve(async (req) => {
  try {
    const rawText = await req.text();
    const payload = JSON.parse(rawText);

    const record: any    = payload.record;
    const oldRecord: any = payload.old_record;

    // Only fire the very moment status flips to 'verified'. Without this
    // check, every subsequent edit to an already-verified report (e.g. a
    // typo fix) would re-notify every resident.
    const justVerified =
      record?.status === 'verified' && oldRecord?.status !== 'verified';

    if (!justVerified) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const category    = record?.category ?? 'Other';
    const emoji        = CATEGORY_EMOJI[category] ?? '📍';
    const locationText = record?.location_label ?? 'Barangay Triangulo';
    const title         = `${emoji} ${category} reported — ${locationText}`;
    const body          = record?.description ?? 'A resident report has been verified.';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    console.log('Calling send-push-notification for verified incident...');
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        level: 'ADVISORY',
        topic: 'community_reports',
      }),
    });
    const pushData = await pushRes.text();
    console.log('send-push-notification status:', pushRes.status, pushData);

    return new Response(
      JSON.stringify({ ok: true, firedFor: record.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('on-incident-verified error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

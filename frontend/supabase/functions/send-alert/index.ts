import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PHILSMS_API_URL = 'https://dashboard.philsms.com/api/v3/sms/send';

// Plain-language severity label shown at the start of every SMS, in place
// of the old "[AGOS ALERT] TYPE:" wrapper -- residents shouldn't have to
// know the app's name to know how serious this is. Keys match the `type`
// values written to the `alerts` table (poll-flood, outlook check, mock
// test dispatch, etc.).
const SMS_LABEL: Record<string, string> = {
  ADVISORY:       '[FLOOD ADVISORY]',
  WARNING:        '[FLOOD WARNING]',
  CRITICAL:       '[FLOOD EMERGENCY]',
  NORMAL:         '[ALL CLEAR]',
  OUTLOOK:        '[FLOOD OUTLOOK]',
  STILL_ELEVATED: '[FLOOD UPDATE]',
  RAPID_RISE:     '[FLOOD WARNING]',
};

// PhilSMS accepts a comma-separated `recipient` list in one request, so we
// batch instead of firing one request per phone. The provider's own limit
// on recipients-per-request isn't documented anywhere we've seen -- 100 is
// a conservative guess. Lower it (or raise it, once confirmed) via the
// PHILSMS_BATCH_SIZE env var if the dashboard/support says otherwise.
const DEFAULT_BATCH_SIZE = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  // Internal-only. This function texts every registered number and is
  // deployed with verify_jwt = false, so without this check anyone holding the
  // public anon key could send a fake alert to the whole barangay. The
  // on-alert-change webhook sends the shared secret.
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (!expectedSecret || req.headers.get('x-internal-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const { message, type } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: corsHeaders });
    }

    // Init Supabase with service role key to read phone numbers
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Who gets an SMS: every row in `residents` -- the registry, filled in
    // person at the barangay office (see supabase/migrations/
    // 20260920000000_resident_registry.sql). Staff/admin `profiles` phones
    // are no longer texted here.
    //
    // `network` / `sms_deliverable` are computed and stored at
    // registration/edit time (src/lib/phoneNetwork.js) from the number's
    // prefix. It's a heuristic -- number portability can make it wrong --
    // but it's the same signal the registry UI shows, so we filter on it
    // here rather than re-deriving it: Smart/TNT (and Sun, which rides the
    // Smart network) are marked non-deliverable and skipped.
    const { data: residents, error: residentsError } = await supabase
      .from('residents')
      .select('phone, network, sms_deliverable')
      .not('phone', 'is', null)
      .neq('phone', '');

    if (residentsError) {
      return new Response(JSON.stringify({ error: residentsError.message }), { status: 500, headers: corsHeaders });
    }

    // residents.phone is already normalised to 09XXXXXXXXX by the table's
    // trigger, so this is a straight prefix swap. PhilSMS wants
    // 63XXXXXXXXXX -- no leading "+" (see their sample: "recipient":
    // "639171234567,639201234567").
    const toPhilSmsFormat = (phone: string): string => {
      const cleaned = phone.trim();
      if (cleaned.startsWith('63')) return cleaned;
      if (cleaned.startsWith('+63')) return cleaned.slice(1);
      if (cleaned.startsWith('09')) return '63' + cleaned.slice(1);
      if (cleaned.startsWith('9')) return '63' + cleaned;
      return cleaned;
    };

    const deliverable = (residents ?? []).filter(r => r.phone && r.sms_deliverable === true);
    const skipped = (residents ?? []).length - deliverable.length;

    // De-dupe defensively (phone is unique in the table, but two rows could
    // still normalise to the same handset if edited outside the app).
    const phones = Array.from(new Set(deliverable.map(r => toPhilSmsFormat(r.phone))));

    if (phones.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No deliverable phone numbers found', skipped }),
        { status: 404, headers: corsHeaders },
      );
    }

    const philsmsApiKey  = Deno.env.get('PHILSMS_API_KEY')!;
    const philsmsSenderId = Deno.env.get('PHILSMS_SENDER_ID') ?? 'philsms';
    const batchSize = Number(Deno.env.get('PHILSMS_BATCH_SIZE')) || DEFAULT_BATCH_SIZE;

    const smsMessage = `${SMS_LABEL[type] ?? '[FLOOD ALERT]'} ${message}`;
    const batches = chunk(phones, batchSize);

    const results = await Promise.allSettled(
      batches.map(async (batch) => {
        const res = await fetch(PHILSMS_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${philsmsApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            recipient: batch.join(','),
            sender_id: philsmsSenderId,
            type: 'plain',
            message: smsMessage,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Batch of ${batch.length} failed: ${err}`);
        }

        return batch.length;
      })
    );

    // PhilSMS sends a whole batch in one call, so success/failure is
    // per-batch, not per-phone -- a failed call counts every number in that
    // batch as failed even though it was one request.
    const sent = results
      .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
      .reduce((n, r) => n + r.value, 0);
    const failed = phones.length - sent;

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: phones.length,
        skipped, // non-deliverable numbers (Smart/TNT/Sun/unknown) excluded before sending
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
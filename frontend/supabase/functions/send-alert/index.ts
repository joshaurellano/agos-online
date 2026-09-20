import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HTTPSMS_API_URL = 'https://api.httpsms.com/v1/messages/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    // Init Supabase with service role key to read all phone numbers
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Who gets an SMS:
    //   - every row in `residents` -- the registry, filled in person at the
    //     barangay office (see supabase/migrations/
    //     20260920000000_resident_registry.sql).
    //   - Staff/admin phones on `profiles` (role_id 7 = mobile-app resident
    //     accounts are excluded: those people only get SMS if the barangay
    //     registered their number in the registry).
    const [{ data: profiles, error: profilesError }, { data: residents, error: residentsError }] =
      await Promise.all([
        supabase.from('profiles').select('phone').neq('role_id', 7).not('phone', 'is', null).neq('phone', ''),
        supabase.from('residents').select('phone').not('phone', 'is', null).neq('phone', ''),
      ]);

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), { status: 500, headers: corsHeaders });
    }
    if (residentsError) {
      return new Response(JSON.stringify({ error: residentsError.message }), { status: 500, headers: corsHeaders });
    }

    // Convert 09XXXXXXXXX to +639XXXXXXXXX
    const toInternational = (phone: string): string => {
      const cleaned = phone.trim();
      if (cleaned.startsWith('+')) return cleaned;
      if (cleaned.startsWith('09')) return '+63' + cleaned.slice(1);
      if (cleaned.startsWith('9')) return '+63' + cleaned;
      return cleaned;
    };

    // De-dupe AFTER normalising: "0917..." and "+63917..." are the same
    // handset and must not be texted twice.
    const phones = Array.from(new Set([
      ...(profiles ?? []).map(p => p.phone),
      ...(residents ?? []).map(r => r.phone),
    ].filter(Boolean).map(toInternational)));

    if (phones.length === 0) {
      return new Response(JSON.stringify({ error: 'No phone numbers found' }), { status: 404, headers: corsHeaders });
    }

    const httpsmsApiKey  = Deno.env.get('HTTPSMS_API_KEY')!;
    const httpsmsFrom    = Deno.env.get('HTTPSMS_FROM')!; // your Android phone number e.g. +639XXXXXXXXX

    const smsMessage = `[AGOS ALERT] ${type ?? 'NOTICE'}: ${message}`;

    const results = await Promise.allSettled(
      phones.map(async (phone) => {
        const to = toInternational(phone);
        const res = await fetch(HTTPSMS_API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': httpsmsApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: smsMessage,
            from:    httpsmsFrom,
            to,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Failed to send to ${phone}: ${err}`);
        }

        return phone;
      })
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: phones.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
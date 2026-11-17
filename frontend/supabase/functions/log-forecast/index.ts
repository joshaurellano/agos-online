// Saves today's forecast into forecast_log. Called once a day by pg_cron.
// Secrets needed: MODEL_BASE_URL (same as VITE_LIVE_URL). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MODEL_KEY = 'gru';

const manilaDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d); // YYYY-MM-DD

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

const alertKey = (p: number) =>
  p >= 0.75 ? 'CRITICAL' : p >= 0.5 ? 'WARNING' : p >= 0.25 ? 'ADVISORY' : 'NORMAL';

Deno.serve(async () => {
  const base = (Deno.env.get('MODEL_BASE_URL') ?? Deno.env.get('MODEL_API_URL') ?? '').replace(/\/+$/, '');
  if (!base) return new Response('MODEL_BASE_URL not set', { status: 500 });

  const res = await fetch(`${base}/api/forecast-flood/${MODEL_KEY}`);
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    return new Response(`model error: ${json.message ?? res.status}`, { status: 502 });
  }

  const issued = manilaDate(new Date());
  const rows = (json.forecast ?? [])
    .map((d: { date: string; flood_probability?: number }) => {
      const target = String(d.date).slice(0, 10);
      const p = Number(d.flood_probability ?? 0);
      return {
        issued_date: issued,
        target_date: target,
        lead_days: dayDiff(issued, target),
        model_key: MODEL_KEY,
        probability: p,
        alert_key: alertKey(p),
      };
    })
    .filter((r: { lead_days: number }) => r.lead_days >= 0);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  // Keep the first forecast of the day; a re-run does not overwrite it.
  const { error } = await supabase
    .from('forecast_log')
    .upsert(rows, { onConflict: 'issued_date,target_date,model_key', ignoreDuplicates: true });
  if (error) return new Response(error.message, { status: 500 });

  return new Response(`logged ${rows.length} rows for ${issued}`);
});
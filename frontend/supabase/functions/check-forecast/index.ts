import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Separate, less-frequent job from poll-flood -- the forecast itself
// doesn't change fast enough to need checking every few minutes. Schedule
// this one on its own pg_cron entry (e.g. every 3-6 hours), not alongside
// poll-flood's tight loop.

// Overridable so you can point this at the mock (flood-api-mock) during
// testing/demo without editing code -- set the MODEL_BASE_URL secret via
// `supabase secrets set MODEL_BASE_URL=https://<your-mock-url>` and unset
// it (or set it back) to return to production.
const BASE_URL            = Deno.env.get('MODEL_BASE_URL') ?? 'https://flood-api-553657561163.asia-southeast1.run.app'
const BACKUP_BASE_URL     = 'https://agos-flood-predict.onrender.com'
const MODEL_KEY           = 'gru'
const FORECAST_URL        = `${BASE_URL}/api/forecast-flood/${MODEL_KEY}`
const BACKUP_FORECAST_URL = `${BACKUP_BASE_URL}/api/forecast-flood/${MODEL_KEY}`

const LOOKAHEAD_DAYS = 3

// Same 4-tier bucketing used everywhere else in the app (modelApi.js
// probabilityToAlertKey) -- kept in sync manually since this function can't
// import frontend code.
const TIER_RANK: Record<string, number> = { NORMAL: 0, ADVISORY: 1, WARNING: 2, CRITICAL: 3 }

function tierFromProbability(p: number): string {
  if (p >= 0.75) return 'CRITICAL'
  if (p >= 0.50) return 'WARNING'
  if (p >= 0.25) return 'ADVISORY'
  return 'NORMAL'
}

async function fetchForecast() {
  try {
    const res = await fetch(FORECAST_URL)
    if (!res.ok) throw new Error(`Primary API error: ${res.status}`)
    const data = await res.json()
    if (data.status && data.status !== 'success') throw new Error(data.message || 'Primary API returned error status')
    return data
  } catch (err) {
    console.error(`Forecast fetch failed (${FORECAST_URL}): ${err.message} — trying backup`)
    const res = await fetch(BACKUP_FORECAST_URL)
    if (!res.ok) throw new Error(`Backup API error: ${res.status}`)
    const data = await res.json()
    if (data.status && data.status !== 'success') throw new Error(data.message || 'Backup API returned error status')
    return data
  }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let forecastData
  try {
    forecastData = await fetchForecast()
  } catch (err) {
    console.error('check-forecast: forecast fetch failed entirely:', err.message)
    return new Response(`forecast fetch error: ${err.message}`, { status: 502 })
  }

  const upcoming = (forecastData.forecast ?? []).slice(0, LOOKAHEAD_DAYS)
  if (upcoming.length === 0) {
    return new Response('no forecast data', { status: 200 })
  }

  // The worst (highest-probability) day within the lookahead window drives
  // the tier -- a single bad day 2 days out matters even if day 1 and 3
  // look fine.
  const worst = upcoming.reduce((max: any, day: any) =>
    (day.flood_probability ?? 0) > (max.flood_probability ?? 0) ? day : max
  )
  const newTier = tierFromProbability(worst.flood_probability ?? 0)

  const { data: state } = await supabase
    .from('forecast_state')
    .select('last_tier')
    .eq('id', true)
    .single()

  const lastTier = state?.last_tier ?? 'NORMAL'

  // Only alert on an UPWARD crossing versus last check -- a forecast that's
  // still flat at ADVISORY shouldn't refire every run, and a downgrade
  // carries no urgency of its own (the state-change/downgrade alert in
  // poll-flood already covers actual current-condition improvements).
  if (TIER_RANK[newTier] > TIER_RANK[lastTier]) {
    const dateLabel = new Date(worst.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })
    const pct = Math.round((worst.flood_probability ?? 0) * 100)

    await supabase.from('alerts').insert({
      type: 'FORECAST_WARNING',
      message: `Flood risk is forecast to reach ${newTier} (${pct}%) by ${dateLabel}, within the next ${LOOKAHEAD_DAYS} days. Prepare now.`,
      sent_by: 'AGOS Auto-Alert',
    })
  }

  await supabase
    .from('forecast_state')
    .update({ last_tier: newTier, last_checked_at: new Date().toISOString() })
    .eq('id', true)

  return new Response('ok')
})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Overridable so you can point this at the mock (flood-api-mock) during
// testing/demo without editing code -- set the MODEL_BASE_URL secret via
// `supabase secrets set MODEL_BASE_URL=https://<your-mock-url>` and unset
// it (or set it back) to return to production.
const BASE_URL            = Deno.env.get('MODEL_BASE_URL') ?? 'https://flood-api-553657561163.asia-southeast1.run.app'
const BACKUP_BASE_URL     = 'https://agos-flood-predict.onrender.com'
const MODEL_URL           = `${BASE_URL}/api/predict-flood`               // unchanged from before
const BACKUP_MODEL_URL    = `${BACKUP_BASE_URL}/api/predict-flood`
const MODEL_KEY           = 'gru'                                          // matches backend DEFAULT_MODEL_KEY
const FORECAST_URL        = `${BASE_URL}/api/forecast-flood/${MODEL_KEY}`
const BACKUP_FORECAST_URL = `${BACKUP_BASE_URL}/api/forecast-flood/${MODEL_KEY}`

const ALERT_MESSAGES: Record<string, string> = {
  ADVISORY: 'AGOS Alert: ADVISORY level reached...',
  WARNING:  'AGOS Alert: WARNING level reached...',
  CRITICAL: 'AGOS Alert: CRITICAL level reached. EVACUATE IMMEDIATELY.',
  NORMAL:   'AGOS Alert: Situation has returned to NORMAL.',
}

// #1 Rapid rise
const RAPID_RISE_THRESHOLD      = 0.25   // probability jump (25 points) that counts as "rapid"
const RAPID_RISE_WINDOW_MINUTES = 120    // ...within this many minutes
const RAPID_RISE_DEBOUNCE_HOURS = 3      // don't refire while a rise is still ongoing

// #2 Still-elevated reminder
const STILL_ELEVATED_REMINDER_HOURS = 3  // remind at most this often while elevated & unchanged

// #4 Downgrade caution
const FORECAST_LOOKAHEAD_DAYS = 3

// Piggyback check-forecast onto THIS cron instead of maintaining a second
// one. poll-flood runs every 5 min; this only actually fires once per
// CHECK_FORECAST_EVERY_HOURS window (whichever run lands in that hour's
// first 5 minutes) -- so check-forecast still only runs every few hours,
// it's just triggered by poll-flood's existing schedule instead of its own.
const CHECK_FORECAST_EVERY_HOURS = 4

async function maybeTriggerForecastCheck(supabaseUrl: string, serviceRoleKey: string) {
  const now = new Date()
  const isTriggerWindow =
    now.getUTCHours() % CHECK_FORECAST_EVERY_HOURS === 0 && now.getUTCMinutes() < 5

  if (!isTriggerWindow) return

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/check-forecast`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceRoleKey}` },
    })
    console.log(`Piggybacked check-forecast trigger: ${res.status}`)
  } catch (err) {
    // Never let a forecast-check hiccup affect poll-flood's own job.
    console.error('Piggybacked check-forecast trigger failed:', err.message)
  }
}

// Fetches JSON from a primary URL, falling back to a backup host on any
// failure (network error, non-2xx, or an application-level `status: "error"`
// body) -- mirrors the fallback pattern already used on the frontend
// (modelApi.js fetchModelJson), so predict/forecast calls here are no more
// fragile than the client's.
async function fetchModelData(primaryUrl: string, backupUrl: string) {
  try {
    const res = await fetch(primaryUrl)
    if (!res.ok) throw new Error(`Primary API error: ${res.status}`)
    const data = await res.json()
    if (data.status && data.status !== 'success') throw new Error(data.message || 'Primary API returned error status')
    return data
  } catch (err) {
    console.error(`Primary fetch failed (${primaryUrl}): ${err.message} — trying backup`)
    const res = await fetch(backupUrl)
    if (!res.ok) throw new Error(`Backup API error: ${res.status}`)
    const data = await res.json()
    if (data.status && data.status !== 'success') throw new Error(data.message || 'Backup API returned error status')
    return data
  }
}

// #1: has probability jumped by >= RAPID_RISE_THRESHOLD within the window?
// Debounced so a sustained rise (polled every few minutes) only fires once.
async function checkRapidRise(supabase: any, currentProbability: number) {
  const windowStart = new Date(Date.now() - RAPID_RISE_WINDOW_MINUTES * 60_000).toISOString()

  const { data: baseline } = await supabase
    .from('flood_snapshots')
    .select('probability, created_at')
    .lte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!baseline) return null // not enough history yet to judge a rate of change

  const delta = currentProbability - (baseline.probability ?? 0)
  if (delta < RAPID_RISE_THRESHOLD) return null

  const debounceSince = new Date(Date.now() - RAPID_RISE_DEBOUNCE_HOURS * 3_600_000).toISOString()
  const { data: recentAlert } = await supabase
    .from('alerts')
    .select('id')
    .eq('type', 'RAPID_RISE')
    .gte('created_at', debounceSince)
    .limit(1)
    .maybeSingle()

  if (recentAlert) return null // already alerted for this rise recently

  return { delta }
}

// #2: has it been long enough since the last alert of ANY kind while we're
// still sitting above NORMAL with no state change? Prevents reminders from
// piling on top of a state-change alert we may have just sent this same run.
async function isDueForReminder(supabase: any, hours: number) {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const { data: recent } = await supabase
    .from('alerts')
    .select('id')
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  return !recent
}

// #4: when downgrading to NORMAL, check whether the 3-day forecast still
// shows elevated risk ahead, and soften the all-clear message if so. Any
// failure here falls back to the plain message -- a broken forecast check
// must never block the real downgrade alert.
async function buildDowngradeMessage(defaultMessage: string): Promise<string> {
  try {
    const forecastData = await fetchModelData(FORECAST_URL, BACKUP_FORECAST_URL)
    const upcoming = (forecastData.forecast ?? []).slice(0, FORECAST_LOOKAHEAD_DAYS)
    const risky = upcoming.find((d: any) => (d.flood_probability ?? 0) >= 0.25) // ADVISORY tier+

    if (risky) {
      const dateLabel = new Date(risky.date).toLocaleDateString('en-PH', { weekday: 'long' })
      const pct = Math.round((risky.flood_probability ?? 0) * 100)
      return `Current conditions have returned to NORMAL, but the forecast shows elevated flood risk again by ${dateLabel} (${pct}%). Stay prepared and continue monitoring.`
    }
  } catch (err) {
    console.error('Forecast check for downgrade message failed:', err.message)
  }
  return defaultMessage
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Fetch current prediction
  let data
  try {
    data = await fetchModelData(MODEL_URL, BACKUP_MODEL_URL)
  } catch (err) {
    console.error('predict-flood fetch failed entirely:', err.message)
    return new Response(`model fetch error: ${err.message}`, { status: 502 })
  }

  const currentAlert       = data.alert_level
  const currentProbability = data.probability ?? 0

  // 2. Get last known snapshot
  const { data: last } = await supabase
    .from('flood_snapshots')
    .select('alert_key')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const prevAlert = last?.alert_key ?? null

  // 3a. State-change alert (existing behavior, now forecast-aware on downgrade)
  if (prevAlert !== null && prevAlert !== currentAlert) {
    let message = ALERT_MESSAGES[currentAlert]
    if (currentAlert === 'NORMAL') {
      message = await buildDowngradeMessage(message)
    }
    await supabase.from('alerts').insert({
      type: currentAlert, message, sent_by: 'AGOS Auto-Alert'
    })
    // on-alert-change webhook handles SMS + push dispatch on this insert
  }
  // 3b. Still-elevated reminder (#2) -- only when nothing changed this run
  else if (currentAlert !== 'NORMAL' && prevAlert === currentAlert) {
    if (await isDueForReminder(supabase, STILL_ELEVATED_REMINDER_HOURS)) {
      await supabase.from('alerts').insert({
        type: 'STILL_ELEVATED',
        message: `${currentAlert} conditions are still in effect. Stay alert and continue monitoring.`,
        sent_by: 'AGOS Auto-Alert',
      })
    }
  }

  // 3c. Rapid rise (#1) -- independent of the above; a fast jump matters
  // even before it crosses a tier boundary.
  const rapidRise = await checkRapidRise(supabase, currentProbability)
  if (rapidRise) {
    await supabase.from('alerts').insert({
      type: 'RAPID_RISE',
      message: `Flood risk is rising quickly — up ${Math.round(rapidRise.delta * 100)} points in the last ${RAPID_RISE_WINDOW_MINUTES} minutes (now ${Math.round(currentProbability * 100)}%). Stay alert.`,
      sent_by: 'AGOS Auto-Alert',
    })
  }

  // 4. Save snapshot
  const rainfall = data?.live_metrics?.rainfall_mm ?? 0

  await supabase.from('flood_snapshots').insert({
    alert_level: currentAlert === 'CRITICAL' ? 3 : currentAlert === 'WARNING' ? 2 : currentAlert === 'ADVISORY' ? 1 : 0,
    alert_key:   currentAlert,
    probability: currentProbability,
    rainfall_mm: rainfall,
    humidity:    data?.live_metrics?.humidity ?? null,
    wind_signal: data?.live_metrics?.wind_signal ?? null,
    status:      data.status ?? null,
  })

  // Piggyback: nudge check-forecast roughly every CHECK_FORECAST_EVERY_HOURS
  // hours, off this same cron, instead of running a second one.
  await maybeTriggerForecastCheck(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  return new Response('ok')
})
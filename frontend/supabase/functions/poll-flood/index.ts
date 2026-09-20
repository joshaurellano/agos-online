import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchPrediction, fetchForecast } from '../_shared/model-api.ts'
import { checkOutlook } from '../_shared/outlook.ts'

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

// 3-day outlook: save the forecast window into forecast_snapshots ONCE PER
// DAY (Manila time), from FORECAST_SNAPSHOT_HOUR_MANILA onward. This runs off
// poll-flood's existing 5-minute cron, so if the model is down at 06:00 it
// simply retries on the next cycle until a snapshot for today is saved.
// The outlook check itself only ever reads that table.
const FORECAST_SNAPSHOT_HOUR_MANILA = 6   // 6:00 AM Asia/Manila
const MANILA_OFFSET_MS = 8 * 3_600_000    // UTC+8, no DST

function manilaParts(ms: number) {
  const d = new Date(ms + MANILA_OFFSET_MS)
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }
}

async function maybeSaveForecastSnapshot(supabase: any) {
  const now = manilaParts(Date.now())
  if (now.hour < FORECAST_SNAPSHOT_HOUR_MANILA) return

  const { data: latest } = await supabase
    .from('forecast_snapshots')
    .select('created_at')
    .eq('source', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Already saved one today.
  if (latest && manilaParts(new Date(latest.created_at).getTime()).date === now.date) return

  const forecastData = await fetchForecast()
  const upcoming = (forecastData.forecast ?? []).slice(0, FORECAST_LOOKAHEAD_DAYS)
  if (upcoming.length === 0) throw new Error('forecast response had no days')

  // The worst (highest-probability) day drives the tier -- a single bad day
  // 2 days out matters even if day 1 and 3 look fine.
  const worst = upcoming.reduce((max: any, day: any) =>
    (day.flood_probability ?? 0) > (max.flood_probability ?? 0) ? day : max
  )

  const { error } = await supabase.from('forecast_snapshots').insert({
    days: upcoming.map((d: any) => ({ date: d.date, flood_probability: d.flood_probability ?? 0 })),
    worst_date: String(worst.date),
    worst_probability: worst.flood_probability ?? 0,
  })
  if (error) throw new Error(error.message)
  console.log('forecast snapshot saved')
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
    const forecastData = await fetchForecast()
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
    data = await fetchPrediction()
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

  // 5. 3-day outlook. Each step is isolated: a forecast hiccup must never
  // affect the current-conditions alerting above.
  try {
    await maybeSaveForecastSnapshot(supabase)
  } catch (err) {
    console.error('Forecast snapshot failed:', err.message)
  }
  try {
    // Cheap when there's nothing new (one read). Runs every cycle so a snapshot
    // whose check failed once is retried on the next run.
    console.log('outlook check:', await checkOutlook(supabase))
  } catch (err) {
    console.error('Outlook check failed:', err.message)
  }

  return new Response('ok')
})
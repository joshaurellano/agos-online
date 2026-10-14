// 3-day OUTLOOK alert logic. Reads forecast_snapshots only -- never the model.
//
// Rule: one alert per episode. Fires when the worst day in the 3-day window
// goes from NORMAL (at the last checked snapshot) to anything above NORMAL.
// Escalations inside an episode (ADVISORY -> WARNING, ...) stay silent; once
// the window returns to NORMAL the next rise re-arms.

const STALE_AFTER_HOURS = 30  // snapshots are daily; don't alert off one older than this
const LOOKAHEAD_DAYS = 3      // only used in the alert message

// Same 4-tier bucketing used everywhere else in the app (modelApi.js
// probabilityToAlertKey) -- kept in sync manually since functions can't
// import frontend code.
export function tierFromProbability(p: number): string {
  if (p >= 0.75) return 'CRITICAL'
  if (p >= 0.50) return 'WARNING'
  if (p >= 0.25) return 'ADVISORY'
  return 'NORMAL'
}

// Live and mock snapshots are checked independently: each is compared only
// against earlier snapshots of its own source.
export async function checkOutlook(supabase: any): Promise<string> {
  const results: string[] = []
  for (const source of ['live', 'mock'] as const) {
    results.push(`${source}: ${await checkOutlookForSource(supabase, source)}`)
  }
  return results.join(' | ')
}

async function checkOutlookForSource(supabase: any, source: 'live' | 'mock'): Promise<string> {
  // Every unchecked row, oldest first -- not just the newest. If more than
  // one snapshot piles up before a run (a missed poll, two saves close
  // together), the old code jumped straight to the latest and bulk-marked
  // everything before it as checked without ever evaluating those rows'
  // own transitions. A NORMAL blip buried in that backlog could cross above
  // NORMAL and back out before the newest row was compared to anything,
  // silently swallowing a real crossing. Walking the backlog in order means
  // every transition gets its turn.
  const { data: pending, error: pendingErr } = await supabase
    .from('forecast_snapshots')
    .select('id, created_at, worst_date, worst_probability')
    .eq('source', source)
    .eq('checked', false)
    .order('created_at', { ascending: true })
  if (pendingErr) throw new Error(`forecast_snapshots read failed: ${pendingErr.message}`)
  if (!pending || pending.length === 0) return 'no unchecked snapshots'

  const newest = pending[pending.length - 1]
  const ageHours = (Date.now() - new Date(newest.created_at).getTime()) / 3_600_000
  if (ageHours > STALE_AFTER_HOURS) {
    return `latest snapshot is stale (${ageHours.toFixed(1)}h old) -- skipped`
  }

  // Tier at the last snapshot we already checked. Comparing against the last
  // CHECKED row (not just the previous row) means a crossing is still caught
  // if a run was missed in between.
  const { data: prev, error: prevErr } = await supabase
    .from('forecast_snapshots')
    .select('worst_probability')
    .eq('source', source)
    .eq('checked', true)
    .lt('created_at', pending[0].created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prevErr) throw new Error(`forecast_snapshots read failed: ${prevErr.message}`)

  let lastTier = prev ? tierFromProbability(Number(prev.worst_probability)) : 'NORMAL'
  let result = 'checked, no alert'

  for (const row of pending) {
    const probability = Number(row.worst_probability)
    const newTier = tierFromProbability(probability)

    // Logged on every real check so a quiet all-NORMAL forecast is verifiable.
    console.log(
      `outlook[${source}]: worst day ${row.worst_date} (${Math.round(probability * 100)}% -> ${newTier}), ` +
      `last checked tier = ${lastTier}`
    )

    if (lastTier === 'NORMAL' && newTier !== 'NORMAL') {
      const dateLabel = new Date(row.worst_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })

      // Must be 'OUTLOOK': the push title map (on-alert-change), the alerts log
      // and the frontend alert config all key off of that type.
      const { error: alertErr } = await supabase.from('alerts').insert({
        type: 'OUTLOOK',
        message: `Flood risk is forecast to reach ${newTier} (${Math.round(probability * 100)}%) by ${dateLabel}, take precaution.`,
        // Mock-driven rows stay identifiable in the alert log, same as the
        // dashboard's mock level alerts. It is NOT a dry run -- it dispatches.
        sent_by: source === 'mock' ? 'AGOS Mock Test' : 'AGOS Auto-Alert',
      })
      // Not marked as checked on failure, so this row (and anything after
      // it in the backlog) is retried on the next run.
      if (alertErr) throw new Error(`alerts insert failed: ${alertErr.message}`)
      result = `OUTLOOK alert created (${lastTier} -> ${newTier})`
    }

    const { error: markErr } = await supabase
      .from('forecast_snapshots')
      .update({ checked: true })
      .eq('id', row.id)
    if (markErr) throw new Error(`could not mark snapshot ${row.id} checked: ${markErr.message}`)

    lastTier = newTier
  }

  return result
}
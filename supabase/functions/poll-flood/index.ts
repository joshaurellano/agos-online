import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL_URL = 'https://flood-api-553657561163.asia-southeast1.run.app/api/predict-flood'
const BASELINE_LEVEL = 1.4
const RISE_RATE = 0.045

const ALERT_MESSAGES = {
  ADVISORY: 'AGOS Alert - Barangay Triangulo: ADVISORY level reached...',
  WARNING:  'AGOS Alert - Barangay Triangulo: WARNING level reached...',
  CRITICAL: 'AGOS Alert - Barangay Triangulo: CRITICAL level reached. EVACUATE IMMEDIATELY.',
  NORMAL:   'AGOS Alert - Barangay Triangulo: Situation has returned to NORMAL.',
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Fetch prediction
  const res = await fetch(MODEL_URL)
  const data = await res.json()
  const currentAlert = data.alert_level

  // 2. Get last known alert level from DB
  const { data: last } = await supabase
    .from('flood_snapshots')
    .select('alert_key')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const prevAlert = last?.alert_key ?? null

  // 3. Send SMS if alert level changed
  if (prevAlert !== null && prevAlert !== currentAlert) {
    const message = ALERT_MESSAGES[currentAlert]
    await supabase.from('alerts').insert({
      type: currentAlert, message, sent_by: 'AGOS Auto-Alert'
    })
    await supabase.functions.invoke('send-alert', {
      body: { message, type: currentAlert }
    })
  }

  // 4. Save snapshot
  const rainfall = data?.live_metrics?.rainfall_mm ?? 0
  const waterLevel = parseFloat((BASELINE_LEVEL + rainfall * RISE_RATE).toFixed(2))

  await supabase.from('flood_snapshots').insert({
    alert_level: data.alert_level === 'CRITICAL' ? 3 : data.alert_level === 'WARNING' ? 2 : data.alert_level === 'ADVISORY' ? 1 : 0,
    alert_key:   currentAlert,
    probability: data.probability,
    rainfall_mm: rainfall,
    humidity:    data?.live_metrics?.humidity ?? null,
    wind_signal: data?.live_metrics?.wind_signal ?? null,
    water_level: waterLevel,
    status:      data.status ?? null,
  })

  return new Response('ok')
})
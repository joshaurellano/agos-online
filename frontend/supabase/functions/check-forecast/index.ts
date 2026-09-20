import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkOutlook } from '../_shared/outlook.ts'

// Reads the latest forecast_snapshots row (saved by poll-flood) and sends an
// OUTLOOK alert if the 3-day window just went from NORMAL to above NORMAL.
// It never calls the model. poll-flood also runs this same check after each
// new snapshot; this endpoint is here for manual runs and testing. Running it
// repeatedly is safe -- each snapshot is only ever checked once.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const result = await checkOutlook(supabase)
    console.log(`check-forecast: ${result}`)
    return new Response(result)
  } catch (err) {
    console.error('check-forecast error:', err.message)
    return new Response(`check-forecast error: ${err.message}`, { status: 500 })
  }
})

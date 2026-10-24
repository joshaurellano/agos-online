import { corsHeaders, json, PHONE_RE } from '../_shared/admin-auth.ts'
import { requireStaff } from '../_shared/staff-auth.ts'
import {
  hashCode, makeCode, sendSms,
  MAX_SENDS_PER_HOUR, OTP_TTL_MIN, RESEND_WAIT_SEC,
} from '../_shared/otp.ts'

// Texts a 6-digit code to a resident's mobile number before staff register it.
// Staff only. Limits: one code per minute and 5 per hour for each number.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ctx = await requireStaff(req)
  if (ctx instanceof Response) return ctx
  const { admin, callerId } = ctx

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (!PHONE_RE.test(phone)) return json({ error: 'Phone must be 11 digits starting with 09.' }, 400)

  // Tidy up: nothing older than a day is useful.
  await admin.from('phone_otps').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString())

  // Don't spend an SMS on a number that is already on the list.
  const { data: existing } = await admin.from('residents').select('id').eq('phone', phone).maybeSingle()
  if (existing) return json({ error: 'This number is already registered.' }, 409)

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { data: recent, error: recentError } = await admin
    .from('phone_otps').select('created_at').eq('phone', phone).gte('created_at', hourAgo)
    .order('created_at', { ascending: false })
  if (recentError) {
    console.error('phone_otps read failed:', recentError.message)
    return json({ error: 'Could not send the code.' }, 500)
  }

  if (recent && recent.length > 0) {
    const waited = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000
    if (waited < RESEND_WAIT_SEC) {
      return json({ error: `Wait ${Math.ceil(RESEND_WAIT_SEC - waited)} seconds before asking for a new code.` }, 429)
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      return json({ error: 'Too many codes sent to this number. Try again in an hour.' }, 429)
    }
  }

  // A new code replaces any earlier one for this number.
  await admin.from('phone_otps').update({ consumed_at: new Date().toISOString() })
    .eq('phone', phone).is('consumed_at', null)

  const code = makeCode()
  const { data: row, error: insertError } = await admin.from('phone_otps').insert({
    phone,
    code_hash: await hashCode(phone, code),
    created_by: callerId,
    expires_at: new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString(),
  }).select('id').single()
  if (insertError || !row) {
    console.error('phone_otps insert failed:', insertError?.message)
    return json({ error: 'Could not send the code.' }, 500)
  }

  // Local testing without an SMS account: OTP_DEV_ECHO=true prints the code
  // in the function log instead of texting it. Never set this in production.
  if (Deno.env.get('OTP_DEV_ECHO') === 'true') {
    console.log(`[dev] OTP for ${phone}: ${code}`)
  } else {
    const failure = await sendSms(
      phone,
      `AGOS code: ${code}. Valid ${OTP_TTL_MIN} min. Give it only to the barangay staff who is registering you.`,
    )
    if (failure) {
      console.error('OTP SMS failed:', failure)
      await admin.from('phone_otps').delete().eq('id', row.id)
      return json({ error: 'Could not send the SMS. Check the number and try again.' }, 502)
    }
  }

  return json({ success: true, resend_in: RESEND_WAIT_SEC })
})

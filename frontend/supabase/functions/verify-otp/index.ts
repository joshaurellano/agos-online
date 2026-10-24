import { corsHeaders, json, PHONE_RE } from '../_shared/admin-auth.ts'
import { requireStaff } from '../_shared/staff-auth.ts'
import { hashCode, safeEqual, OTP_LENGTH, OTP_MAX_ATTEMPTS } from '../_shared/otp.ts'

// Checks the code for a number. On success the number is marked verified;
// create-user and the residents insert trigger then accept it once.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ctx = await requireStaff(req)
  if (ctx instanceof Response) return ctx
  const { admin } = ctx

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!PHONE_RE.test(phone)) return json({ error: 'Phone must be 11 digits starting with 09.' }, 400)
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) return json({ error: `Enter the ${OTP_LENGTH}-digit code.` }, 400)

  const { data: row, error } = await admin
    .from('phone_otps').select('id, code_hash, expires_at, attempts')
    .eq('phone', phone).is('consumed_at', null).is('verified_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) {
    console.error('phone_otps read failed:', error.message)
    return json({ error: 'Could not check the code.' }, 500)
  }

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: 'This code has expired. Send a new one.' }, 400)
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return json({ error: 'Too many wrong tries. Send a new code.' }, 429)
  }

  if (!safeEqual(await hashCode(phone, code), row.code_hash)) {
    await admin.from('phone_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return json({ error: 'Wrong code.' }, 400)
  }

  const { error: updateError } = await admin
    .from('phone_otps').update({ verified_at: new Date().toISOString() }).eq('id', row.id)
  if (updateError) {
    console.error('phone_otps update failed:', updateError.message)
    return json({ error: 'Could not check the code.' }, 500)
  }
  return json({ success: true })
})

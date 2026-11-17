// Shared bits for send-otp / verify-otp / create-user.

export const OTP_LENGTH = 6
export const OTP_TTL_MIN = 5            // how long a code can be typed in
export const OTP_MAX_ATTEMPTS = 5       // wrong tries before the code is dead
export const RESEND_WAIT_SEC = 60       // minimum gap between two codes
export const MAX_SENDS_PER_HOUR = 5     // per number
export const VERIFIED_WINDOW_MIN = 15   // how long a verified number stays usable

const PHILSMS_API_URL = 'https://dashboard.philsms.com/api/v3/sms/send'

// Uniform random 6-digit code (rejection sampling, no modulo bias).
export function makeCode(): string {
  const buf = new Uint32Array(1)
  const range = 10 ** OTP_LENGTH
  const max = Math.floor(0x100000000 / range) * range
  do { crypto.getRandomValues(buf) } while (buf[0] >= max)
  return String(buf[0] % range).padStart(OTP_LENGTH, '0')
}

// HMAC-SHA256(secret, "phone:code"). A 6-digit code is easy to brute-force
// from a plain hash, so the secret matters: set OTP_SECRET on the project.
// It falls back to the service-role key so nothing breaks if it is missing.
export async function hashCode(phone: string, code: string): Promise<string> {
  const secret = Deno.env.get('OTP_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${phone}:${code}`))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// 09XXXXXXXXX -> 639XXXXXXXXX (PhilSMS wants no leading +).
const toPhilSms = (phone: string) => '63' + phone.slice(1)

// Returns null on success, or a short reason on failure.
export async function sendSms(phone: string, message: string): Promise<string | null> {
  const apiKey = Deno.env.get('PHILSMS_API_KEY')
  if (!apiKey) return 'SMS is not set up'
  try {
    const res = await fetch(PHILSMS_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient: toPhilSms(phone),
        sender_id: Deno.env.get('PHILSMS_SENDER_ID') ?? 'philsms',
        type: 'plain',
        message,
      }),
    })
    const text = await res.text()
    if (!res.ok) return `provider ${res.status}: ${text.slice(0, 200)}`
    // PhilSMS can answer 200 with { status: "error" }.
    try {
      const body = JSON.parse(text)
      if (body?.status === 'error') return `provider error: ${String(body.message ?? '').slice(0, 200)}`
    } catch { /* not JSON -- treat the 200 as sent */ }
    return null
  } catch (err) {
    return `network: ${(err as Error).message}`
  }
}

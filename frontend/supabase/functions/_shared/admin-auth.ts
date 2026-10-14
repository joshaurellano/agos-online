// Shared helpers for the admin-only account functions (create-user,
// manage-user). The caller is verified from their own JWT and must be an
// active Admin -- the service-role client below is never exposed to callers.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/
export const PHONE_RE = /^09\d{9}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const RESIDENT_ROLE_ID = 7

// 8-72 chars (72 is bcrypt's limit), at least one letter and one digit.
export function validPassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 72 && /[A-Za-z]/.test(pw) && /\d/.test(pw)
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type AdminContext = { admin: SupabaseClient; callerId: string }

export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return json({ error: 'Missing auth header' }, 401)

  const admin = adminClient()
  const { data: userData, error: userError } = await admin.auth.getUser(header.slice(7))
  if (userError || !userData.user) return json({ error: 'Invalid token' }, 401)

  const callerId = userData.user.id
  let { data: profile, error } = await admin
    .from('profiles').select('is_active, roles(role_desc)').eq('id', callerId).maybeSingle()
  if (error?.code === '42703') {
    // is_active column not created yet (migration pending) -- treat as active
    ;({ data: profile, error } = await admin
      .from('profiles').select('roles(role_desc)').eq('id', callerId).maybeSingle())
  }
  if (error) return json({ error: 'Could not verify permissions' }, 500)

  // deno-lint-ignore no-explicit-any
  const p = profile as any
  if (!p || p.roles?.role_desc !== 'Admin' || p.is_active === false) return json({ error: 'Forbidden' }, 403)

  return { admin, callerId }
}

// Best effort: a failed audit write must not undo a change that already happened.
export async function audit(
  admin: SupabaseClient, actor: string, action: string, rowId: string,
  oldData: unknown = null, newData: unknown = null,
) {
  const { error } = await admin.from('audit_log').insert({
    actor, action, table_name: 'profiles', row_id: rowId, old_data: oldData, new_data: newData,
  })
  if (error) console.error('audit_log insert failed:', error.message)
}

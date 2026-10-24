// Same idea as requireAdmin in admin-auth.ts, but any active non-resident
// account passes. Registering a resident is a staff job, not admin-only.

import { adminClient, json, RESIDENT_ROLE_ID, type AdminContext } from './admin-auth.ts'

export async function requireStaff(req: Request): Promise<AdminContext | Response> {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return json({ error: 'Missing auth header' }, 401)

  const admin = adminClient()
  const { data: userData, error: userError } = await admin.auth.getUser(header.slice(7))
  if (userError || !userData.user) return json({ error: 'Invalid token' }, 401)

  const callerId = userData.user.id
  const { data: profile, error } = await admin
    .from('profiles').select('role_id, is_active').eq('id', callerId).maybeSingle()
  if (error) return json({ error: 'Could not verify permissions' }, 500)

  if (!profile || profile.role_id === RESIDENT_ROLE_ID || profile.is_active === false) {
    return json({ error: 'Forbidden' }, 403)
  }
  return { admin, callerId }
}

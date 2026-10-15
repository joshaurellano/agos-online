import {
  audit, corsHeaders, json, requireAdmin,
  UUID_RE, RESIDENT_ROLE_ID, validPassword,
} from '../_shared/admin-auth.ts'

// Admin-only account management for staff logins:
//   set_role        { user_id, role_id }
//   set_active      { user_id, active }      disables / re-enables sign-in
//   reset_password  { user_id, password }
//
// Rules enforced here (not just in the UI): admins cannot change or disable
// themselves, the last active admin cannot be demoted or disabled, and
// resident accounts are out of scope.

const BAN_FOREVER = '876000h' // ~100 years; 'none' lifts it

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { admin, callerId } = ctx

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  const action = body.action
  const userId = body.user_id
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) return json({ error: 'Invalid user.' }, 400)

  const { data: target, error: targetError } = await admin
    .from('profiles').select('id, name, role_id, is_active, roles(role_desc)').eq('id', userId).maybeSingle()
  if (targetError) {
    console.error('target lookup failed:', targetError.message)
    return json({ error: 'Could not load the account. Is the latest migration applied?' }, 500)
  }
  if (!target) return json({ error: 'Account not found.' }, 404)
  if (target.role_id === RESIDENT_ROLE_ID) return json({ error: 'Not a staff account.' }, 400)

  // deno-lint-ignore no-explicit-any
  const targetIsAdmin = (target as any).roles?.role_desc === 'Admin'

  // True when removing this admin's access would leave nobody able to manage accounts.
  async function isLastActiveAdmin(): Promise<boolean> {
    const { data: adminRole } = await admin.from('roles').select('role_id').eq('role_desc', 'Admin').maybeSingle()
    if (!adminRole) return true
    const { count, error } = await admin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('role_id', adminRole.role_id).eq('is_active', true).neq('id', userId)
    return error ? true : (count ?? 0) === 0
  }

  if (action === 'set_role') {
    const roleId = body.role_id
    if (!Number.isInteger(roleId) || roleId === RESIDENT_ROLE_ID) return json({ error: 'Choose a staff role.' }, 400)
    if (userId === callerId) return json({ error: 'You cannot change your own role.' }, 400)

    const { data: role } = await admin.from('roles').select('role_id, role_desc').eq('role_id', roleId).maybeSingle()
    if (!role) return json({ error: 'Choose a staff role.' }, 400)
    if (targetIsAdmin && role.role_desc !== 'Admin' && (await isLastActiveAdmin())) {
      return json({ error: 'There must be at least one active admin.' }, 400)
    }

    const { error } = await admin.from('profiles').update({ role_id: roleId }).eq('id', userId)
    if (error) { console.error(error.message); return json({ error: 'Could not change the role.' }, 400) }
    await audit(admin, callerId, 'STAFF_ROLE_CHANGED', userId, { role_id: target.role_id }, { role_id: roleId })
    return json({ success: true })
  }

  if (action === 'set_active') {
    const active = body.active
    if (typeof active !== 'boolean') return json({ error: 'Invalid request' }, 400)
    if (userId === callerId) return json({ error: 'You cannot disable your own account.' }, 400)
    if (!active && targetIsAdmin && (await isLastActiveAdmin())) {
      return json({ error: 'There must be at least one active admin.' }, 400)
    }

    // Block / unblock sign-in first, then flip the flag that RLS checks.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : BAN_FOREVER })
    if (banError) { console.error(banError.message); return json({ error: 'Could not update the account.' }, 400) }

    const { error } = await admin.from('profiles').update({ is_active: active }).eq('id', userId)
    if (error) {
      console.error(error.message)
      await admin.auth.admin.updateUserById(userId, { ban_duration: active ? BAN_FOREVER : 'none' }) // undo
      return json({ error: 'Could not update the account.' }, 400)
    }
    await audit(admin, callerId, active ? 'STAFF_ENABLED' : 'STAFF_DISABLED', userId, { is_active: target.is_active }, { is_active: active })
    return json({ success: true })
  }

  if (action === 'reset_password') {
    const password = body.password
    if (!validPassword(password)) return json({ error: 'Password needs 8+ characters with letters and numbers.' }, 400)
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) { console.error(error.message); return json({ error: 'Could not reset the password.' }, 400) }
    await audit(admin, callerId, 'STAFF_PASSWORD_RESET', userId) // never log the password
    return json({ success: true })
  }

  return json({ error: 'Unknown action.' }, 400)
})

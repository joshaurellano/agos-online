import {
  audit, corsHeaders, json, requireAdmin,
  USERNAME_RE, PHONE_RE, RESIDENT_ROLE_ID, validPassword,
} from '../_shared/admin-auth.ts'

// Creates a staff login (admins only). Residents never get a login here.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { admin, callerId } = ctx

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = body.password
  const roleId = body.role_id

  if (!name || name.length > 100) return json({ error: 'Enter a name.' }, 400)
  if (!USERNAME_RE.test(username)) return json({ error: 'Username must be 3-30 characters: letters, numbers, . _ -' }, 400)
  if (!PHONE_RE.test(phone)) return json({ error: 'Phone must be 11 digits starting with 09.' }, 400)
  if (!validPassword(password)) return json({ error: 'Password needs 8+ characters with letters and numbers.' }, 400)
  if (!Number.isInteger(roleId) || roleId === RESIDENT_ROLE_ID) return json({ error: 'Choose a staff role.' }, 400)

  const { data: role } = await admin.from('roles').select('role_id').eq('role_id', roleId).maybeSingle()
  if (!role) return json({ error: 'Choose a staff role.' }, 400)

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@agos.local`,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    const taken = /already.*registered|already exists/i.test(error?.message ?? '')
    return json({ error: taken ? 'That username is already taken.' : 'Could not create the login.' }, taken ? 409 : 400)
  }

  const { error: insertError } = await admin.from('profiles').insert({
    id: data.user.id, name, username, role_id: roleId, phone,
  })
  if (insertError) {
    // Don't leave a login behind with no profile (the username would be stuck).
    await admin.auth.admin.deleteUser(data.user.id)
    console.error('profile insert failed:', insertError.message)
    return json({ error: 'Could not create the account.' }, 400)
  }

  await audit(admin, callerId, 'STAFF_CREATED', data.user.id, null, { username, name, role_id: roleId })
  return json({ success: true })
})

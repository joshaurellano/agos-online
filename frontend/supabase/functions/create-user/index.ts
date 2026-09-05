import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json()
  const { name, username, password, role_id, phone } = body

  const authHeader = req.headers.get("Authorization")

  console.log("AUTH HEADER:", authHeader)

  if (!authHeader) {
    return new Response("Missing auth header", {
      status: 401,
      headers: corsHeaders
    })
  }

  const token = authHeader.replace("Bearer ", "")

  const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const { data: userData, error: userError } =
  await supabaseAdmin.auth.getUser(token)

  console.log("USER ERROR:", userError)
  console.log("USER DATA:", userData)

  if (userError || !userData.user) {
    return new Response("Invalid token", {
      status: 401,
      headers: corsHeaders
    })
  }


  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("roles(role_desc)")
    .eq("id", userData.user.id)
    .single()

  console.log("PROFILE:", JSON.stringify(profile))
  console.log("PROFILE ERROR:", JSON.stringify(profileError))

  if (profileError) {
  return new Response("Failed to fetch profile", { status: 500, headers: corsHeaders })
}

  if (profile?.roles?.role_desc !== "Admin") {
    return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders
    })
  }


  const email = `${username}@agos.local`

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
console.log("CREATE USER ERROR:", JSON.stringify(error))
console.log("CREATE USER DATA:", JSON.stringify(data))
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders
    })
  }

  const { error: insertError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: data.user.id,
      name,
      username,
      role_id,
      phone
    })

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 400,
      headers: corsHeaders
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  })
})
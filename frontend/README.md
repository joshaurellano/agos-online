# AGOS: Flood Early Warning System (web)

React + Vite dashboard for Barangay Triangulo, Naga City. Staff manage alerts,
residents and the daily flood log; the public can view the dashboard.
Backend: Supabase (database, auth, edge functions). Hosting: Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the DEV project values
npm run dev
```

| Variable | What |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `VITE_LIVE_URL` / `VITE_MOCK_URL` | Flood model API base addresses |

Use the **dev** Supabase project locally. Alerts sent from a project that has
SMS / Firebase keys reach real residents. Keep those keys out of dev.

## Environments

| | Dev | Prod |
| --- | --- | --- |
| Supabase | separate project | live project |
| SMS / push keys (`PHILSMS_*`, `FIREBASE_*`) | not set | set |
| Cron `poll-flood` | off | every 5 min |

## Releasing a change

Always dev first, then prod, in this order:

1. **Database**: run new files in `supabase/migrations/` in the SQL editor.
2. **Functions**: `npx supabase functions deploy --project-ref <ref> --use-api`
3. **Web app**: push to the branch Vercel deploys.

Edge function secrets (Dashboard > Edge Functions > Secrets):
`INTERNAL_FUNCTION_SECRET`, `MODEL_BASE_URL` (if your functions read it),
`PHILSMS_*`, `FIREBASE_*` (prod only).

## Accounts and roles

- Staff sign in with a username (stored as `<username>@agos.local`).
- Only admins create staff (**Staff > Add staff**), change roles, reset
  passwords, and disable accounts. A disabled account loses access at once.
  The last active admin cannot be demoted or disabled.
- Residents are not given web logins. They are added to the SMS list from
  **Add Resident** and use the mobile app.
- First admin on a new project: create the Auth user in the dashboard, then
  insert a `profiles` row with the admin role.

## Troubleshooting

- **Signs in, then "This account has no profile"**: the Auth user has no
  `profiles` row. Insert one with the same id.
- **Blank page after deploy**: check the two `VITE_SUPABASE_*` variables are set
  in Vercel; the app shows a "not set up" message when they are missing.
- **Staff page says disabling needs the latest database update**: run the
  newest migration.

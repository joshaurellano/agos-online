# AGOS — Flood Early Warning System (Web)

Web dashboard for **Barangay Triangulo, Naga City**. Anyone can view live flood
status, rainfall, forecasts and the evacuation map. Signed-in staff dispatch
alerts, manage residents and keep the daily flood log.

**Stack:** React 19 · Vite · Supabase (Postgres, Auth, Edge Functions) · MapLibre / Leaflet · Recharts · Vercel

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # fill in the DEV project values
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |

### Environment variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `VITE_LIVE_URL` / `VITE_MOCK_URL` | Flood model API base addresses (no path, no trailing slash) |

> Use the **dev** Supabase project locally. A project with SMS / Firebase keys
> sends alerts to real residents, so keep those keys out of dev.

## Project structure

```
├── public/                 Static assets (icons, web manifest)
├── src/
│   ├── App.jsx             Providers and routes (pages are lazy-loaded)
│   ├── main.jsx            Entry point
│   ├── index.css           Design tokens and global styles
│   ├── components/         Layout, maps, banners, alert widgets
│   │   └── ui/             Small shared primitives (Badge, TabBar, ErrorBanner, ...)
│   ├── pages/              One file per route
│   ├── hooks/              Context providers: auth, theme, language, data source, ...
│   ├── lib/                Supabase client, model API, routing, hazard and risk logic, i18n
│   ├── data/               Triangulo GeoJSON, critical facilities, mock data
│   └── assets/             Bundled images
├── supabase/
│   ├── migrations/         Database schema, applied in filename order
│   ├── functions/          Edge functions (+ _shared helpers)
│   └── config.toml
├── docs/                   PAGASA.md (wind-signal integration), BENCHMARK.md (design references)
└── vercel.json             SPA rewrites, security and cache headers
```

### Edge functions

| Function | Role |
| --- | --- |
| `poll-flood` | Polls the flood model on a schedule and dispatches alerts |
| `check-forecast` | Sends an OUTLOOK alert when the 3-day forecast turns from normal to elevated |
| `send-alert` | Sends SMS to registered residents |
| `send-push-notification` | Sends push notifications |
| `on-alert-change` | Database webhook that logs per-channel delivery results |
| `on-incident-verified` | Database webhook that notifies when a community report is verified |
| `pagasa-bulletin` | Reads PAGASA Tropical Cyclone Bulletins ([details](docs/PAGASA.md)) |
| `create-user`, `manage-user` | Admin-only staff account management |

## Environments

| | Dev | Prod |
| --- | --- | --- |
| Supabase | Separate project | Live project |
| SMS / push keys (`PHILSMS_*`, `FIREBASE_*`) | Not set | Set |
| Cron `poll-flood` | Off | Every 5 min |

## Releasing a change

Always release to dev first, then prod:

1. **Database:** apply new files from `supabase/migrations/` (SQL editor or `npx supabase db push`).
2. **Functions:** `npx supabase functions deploy --project-ref <ref> --use-api`
3. **Web app:** push to the branch Vercel deploys.

Edge function secrets (Dashboard → Edge Functions → Secrets):
`INTERNAL_FUNCTION_SECRET`, `MODEL_BASE_URL`, and in prod only `PHILSMS_*` and
`FIREBASE_*`.

## Accounts and roles

- Staff sign in with a username (stored as `<username>@agos.local`).
- Only admins create staff (**Staff → Add staff**), change roles, reset
  passwords and disable accounts. A disabled account loses access at once, and
  the last active admin cannot be demoted or disabled.
- Residents have no web login. Staff add them to the SMS list from
  **Add Resident**; residents use the mobile app.
- **First admin on a new project:** create the Auth user in the Supabase
  dashboard, then insert a `profiles` row with the admin role and the same id.

## Troubleshooting

- **Signs in, then "This account has no profile"** — the Auth user has no
  `profiles` row. Insert one with the same id.
- **Blank page after deploy** — check both `VITE_SUPABASE_*` variables are set
  in Vercel; the app shows a "not set up" message when they are missing.
- **Staff page says disabling needs the latest database update** — run the
  newest migration.

# Dev and prod environments

Goal: testing alerts must never reach a real resident's phone, and test devices
must never end up in the real Firebase project.

The app now has two Android build flavors:

|                    | `prod` (real app)              | `dev` (testing)                    |
|--------------------|--------------------------------|------------------------------------|
| Android app id     | `com.gr4.agos`                 | `com.gr4.agos.dev`                 |
| App name on phone  | AGOS                           | AGOS Dev (with an orange DEV ribbon) |
| Firebase project   | `flood-forecasting-c68d6`      | a new dev project (you create it)  |
| Firebase config    | `android/app/src/prod/google-services.json` + `lib/firebase_options.dart` | `android/app/src/dev/google-services.json` + `lib/firebase_options_dev.dart` |
| Supabase project   | your current one               | a new dev project (you create it)  |
| Env file           | `.env`                         | `.env.dev`                         |

Because the ids differ, both apps can be installed on the same phone.

## Why Firebase alone is not enough

A push goes through four steps:

1. The web dashboard inserts a row into the `alerts` table (Supabase).
2. The `send-push-notification` Edge Function sends it to FCM, using a Firebase **service account**.
3. FCM delivers it to the topic `flood_alerts` (and `community_reports`).
4. Phones subscribed to that topic show it. Each phone's token is stored in the `device_tokens` table.

Topics and tokens belong to one Firebase project. So a separate dev Firebase project keeps dev phones out
of the real topics, **but** the dashboard and the Edge Function you test with must also be the dev ones:

- If the dev app saved its token into the **prod** Supabase, the prod `device_tokens` table would fill up with
  test tokens that the prod Edge Function can't deliver to.
- If you sent a test alert from the **prod** dashboard, it would go to real residents.

So the dev setup is: dev app + dev Firebase + dev Supabase + dev Edge Function + dev dashboard.

## One-time setup

### 1. Create the dev Firebase project
1. Firebase console → **Add project** → e.g. `agos-dev`.
2. Project settings → **Your apps → Add app → Android**. Package name: `com.gr4.agos.dev`.
3. Download `google-services.json` and put it in `android/app/src/dev/`.
4. In the console, turn on **Crashlytics** if you want crash reports from test builds (optional).

### 2. Generate the Dart options for dev
From the `mobile/` folder:

```
flutterfire configure --project=agos-dev --platforms=android --android-package-name=com.gr4.agos.dev --out=lib/firebase_options_dev.dart
```

This replaces the placeholder `lib/firebase_options_dev.dart`. Use your real dev project id.
(If the tool asks to overwrite `google-services.json` or `firebase.json`, say no, or check afterwards that
the prod ones were not changed.)

### 3. Create the dev Supabase project
1. Supabase → **New project** (e.g. `agos-dev`).
2. Copy the table structure from prod, no data. With the Supabase CLI:
   ```
   supabase link --project-ref <PROD_REF>
   supabase db dump -f schema.sql
   supabase link --project-ref <DEV_REF>
   supabase db push   # or run schema.sql in the dev project's SQL editor
   ```
   The dump includes tables such as `alerts`, `device_tokens`, `incident_reports`, `residents`, and their
   row-level security rules. Check that nothing in it contains real data.
3. **Authentication → Providers → Anonymous sign-ins: enable** (the app signs in anonymously at startup).
4. Create a throwaway admin account in the dev project for the web dashboard.

### 4. Deploy the push Edge Function to dev
The function source wasn't in the zip I received, so these steps assume it lives in your backend repo
as `supabase/functions/send-push-notification`.

1. Firebase dev project → Project settings → **Service accounts → Generate new private key**.
2. Store it as a secret on the **dev** Supabase project. Use the same secret name your prod function reads
   (check the function code), for example:
   ```
   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" --project-ref <DEV_REF>
   ```
3. Deploy it:
   ```
   supabase functions deploy send-push-notification --project-ref <DEV_REF>
   ```
4. Recreate whatever triggers it in prod (a database webhook or trigger on `alerts` inserts) in the dev project.

Do not copy the prod service account into dev, and never commit either file.

### 5. Fill in `.env.dev`
Edit `.env.dev` (already created, git-ignored) with the dev project's values. Keep any other keys that your real `.env`
has (API URLs and so on); the model API can stay the same if it's read-only.

```
SUPABASE_URL=https://<dev-ref>.supabase.co
SUPABASE_ANON_KEY=<dev anon key>
```

### 6. Point the web dashboard at dev when testing
In the web app's `.env.local` (not committed), set the dev values for `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Run `npm run dev` for testing; the deployed site keeps using prod.

## Day-to-day

```
flutter run --flavor dev      # test build: dev Firebase + dev Supabase
flutter run --flavor prod     # real configuration (be careful)
flutter build apk --flavor prod --release   # release build
```

In VS Code, pick **AGOS (dev)** or **AGOS (prod)** in Run and Debug (`.vscode/launch.json`).
A plain `flutter run` with no flavor will now ask you to choose one.

## Check that it is isolated
1. Install both apps on a phone. Open **AGOS Dev**: it should show the DEV ribbon.
2. In the dev Supabase, `device_tokens` should get a new row. In the prod one it should not.
3. Send a test alert from the dashboard running against dev. It should arrive on AGOS Dev only.
4. A phone with only the real AGOS installed should receive nothing.

## Things to watch

- **Prod Firebase app ids don't match.** `android/app/src/prod/google-services.json` is for app id
  `1:431037447423:android:6c94019d1868701fd5e0ca`, but `lib/firebase_options.dart` and `firebase.json` use
  `...:android:ae3aa511c3cfd0a3d5e0ca`. Two Android apps are registered in the project. Re-run
  `flutterfire configure --project=flood-forecasting-c68d6 --platforms=android --android-package-name=com.gr4.agos --out=lib/firebase_options.dart`
  and re-download `google-services.json` so both agree.
- **Renaming the prod app id** (see `RELEASE_CHECKLIST.md`): change `applicationId` in `defaultConfig`; the dev
  id then becomes `<new id>.dev` automatically. Register that new `.dev` id in the dev Firebase project and
  re-download the dev `google-services.json`.
- **Flavor-specific env files** need Flutter 3.22 or newer (the project already requires 3.38+).
- **Crashlytics** reports from dev builds go to the dev Firebase project, so the real dashboard stays clean.

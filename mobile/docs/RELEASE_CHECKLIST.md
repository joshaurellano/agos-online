# AGOS: Android release checklist

AGOS is Android-only for now (no iOS build), so this covers Android only.
✅ = already done in the files I delivered. ⚠ = needs you.

## 1. Blockers before the first Play upload

### ⚠ Change the application ID: `com.gr4.agos` is rejected by Google Play
Google Play does not accept package names starting with `com.example`, and the
ID can **never be changed after you publish**. Do this first. It has to be done
together with Firebase, because `google-services.json` is tied to the package name:

1. Pick an ID you own, e.g. `com.<yourname>.agos` (lowercase, letters/digits/dots).
2. Firebase console → Project settings → **Add app → Android** using the new ID.
3. Download the new `google-services.json` into `android/app/` (replace the old one).
4. Run `flutterfire configure` to regenerate `lib/firebase_options.dart`.
5. In `android/app/build.gradle.kts` change **only** `applicationId`.
   Leave `namespace = "com.gr4.agos"` alone; it's internal and changing it
   would mean moving `MainActivity`.
6. `flutter clean`, rebuild, and confirm push notifications still arrive
   (new app registration means new FCM tokens).

### ⚠ Create a release signing key: the current release build uses the *debug* key
✅ `build.gradle.kts` is now set up to sign with a real key **if `android/key.properties` exists**
(otherwise it falls back to debug so `flutter run --release` still works, but
such a build cannot be uploaded to Play).

1. Create the key (keep the file and passwords somewhere safe and backed up):
   ```
   keytool -genkey -v -keystore upload-keystore.jks -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Create `android/key.properties`:
   ```
   storePassword=<password>
   keyPassword=<password>
   keyAlias=upload
   storeFile=C:/full/path/to/upload-keystore.jks
   ```
3. Make sure `key.properties` and `*.jks` are in `.gitignore`. **Never commit them.**
4. Enroll in Play App Signing when you create the app (default). Then losing the
   upload key is recoverable.
5. Build: `flutter build appbundle --release`.

## 2. Already done ✅
- Removed unused packages `google_maps_flutter`, `maplibre_gl`, `webview_flutter` and the Google Maps API-key setup (smaller app, no unused key to manage). The maps use `flutter_map`.
- Crashlytics Gradle plugin (v3.0.6) declared and applied. *If Gradle can't resolve that
  version, use the latest one listed in Firebase's Crashlytics setup docs.*
- Manifest: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `VIBRATE`, and `<queries>` for
  https + mailto links.
- Notification status-bar icon (white silhouette) + default FCM icon, color, and channel.
- Launcher icons: adaptive icon (navy background + wave/cloud foreground), Android 13 themed-icon layer,
  and legacy icons are already generated into `android/app/src/main/res/`. No need to run
  `flutter_launcher_icons` unless you change the source images in `assets/icon/`.
- App name on the launcher is now **AGOS** (was "Agos"). Change `android:label` if you prefer otherwise.
- Release signing template: `android/key.properties.example`. The build prints a warning whenever it falls back to the debug key.

## 3. Fill in what only you know
- [ ] `lib/config/app_links.dart`: privacy policy URL, feedback email (Settings rows appear once set).
- [ ] Review and publish `docs/PRIVACY_POLICY_DRAFT.md` at a public URL.
- [ ] Apply the Edge Function change in `docs/EDGE_FUNCTION_NOTES.md`.

## 4. Security review (Supabase)
Anyone can create an anonymous session, so review before launch:
- [ ] Row-Level Security on `incident_reports`: inserts only for the caller's own `reported_by`; no public UPDATE/DELETE.
- [ ] Rate-limit or otherwise guard report submission and photo uploads (spam/abuse).
- [ ] Storage bucket `incident-photos`: size and type limits; who can read.
- [ ] `device_tokens`: tokens should not be publicly readable.
- [ ] Confirm `incident_reports.id` accepts client-generated UUIDs and `created_at` (the offline outbox relies on it).

## 5. Play Console
**Data safety** (confirm against the current form; based on what the app does today):
| Data type | Collected | Optional | Shared |
|---|---|---|---|
| Approximate/precise location | Only if attached to a report | Yes | Shown in verified reports; sent to OSRM for routing |
| Name | Only if typed | Yes | Shown with the report |
| Photos | Only if attached | Yes | Shown in verified reports |
| Device or other IDs (anonymous ID, FCM token) | Yes | No | No |
| Crash logs / diagnostics | Yes | Yes (Settings toggle) | Google Crashlytics (service provider) |
- Data encrypted in transit: yes (HTTPS). Provide a way to request deletion (email in the policy).
- Target audience: not children. Category: your call (Weather / Tools / Maps).
- Store listing: short description (≤ 80 chars), full description, 512×512 icon, 1024×500 feature graphic, phone screenshots.

## 6. Test on a real Android phone before release
- [ ] **Notification tap** for each of CRITICAL / WARNING / community: app open, in background, fully closed. Correct screen opens.
- [ ] The status-bar icon shows the AGOS wave (not a white square).
- [ ] Settings → **Send test alert** works; the "Notifications are off" row appears when permission is denied.
- [ ] Critical alert is audible with the ringer on silent (*once the server names `agos_critical`*).
- [ ] First launch **offline**: fonts render, onboarding works.
- [ ] File a report in airplane mode → reconnect → it sends once (no duplicates).
- [ ] Download the offline map, then browse it in airplane mode.
- [ ] Large text and High contrast on every screen.
- [ ] A low-end phone: Flood Map scrolling, animation smoothness, cold-start time.
- [ ] Android back button on every tab.
- [ ] Privacy and feedback links open (after you fill in `app_links.dart`).
- [ ] A `--release` build behaves like debug: **the release build has INTERNET only via the manifest**, so test that data loads.

# AGOS: settings screen + offline support

## Before you run it
1. Copy `lib/`, `pubspec.yaml` and `google_fonts/` over your project (keep your own `.env`, `assets/data/`, `android/`, `ios/`).
2. `flutter pub get`, then `flutter analyze`.
   This code was written without a Flutter SDK available, so it has NOT been compiled.
   New deps: connectivity_plus, path_provider, cached_network_image,
   flutter_cache_manager, package_info_plus. Bump versions if pub complains.

## Verify against your backend
- Offline reports use a client-generated UUID as `incident_reports.id` (so a retry can't duplicate).
  Confirm the column is `uuid`/text and accepts inserted ids. They also send `created_at`;
  if the server rejects that, the outbox retries without it.

## What changed
- New: `screens/settings_screen.dart` (gear icons open it; the old bottom sheet is gone).
- Saved-data fallback for: flood status, hourly + 14-day forecasts, rainfall, alerts,
  community reports (incl. photos), walking routes, map tiles.
- Reports filed offline are queued on the device and sent on reconnect.
- Settings → Offline map downloads ~150 street-map tiles (~2 MB) for Brgy. Triangulo.
  Satellite/terrain cache only as you browse (OSM/Esri/OpenTopoMap restrict bulk downloads).
- Polling pauses in the background; interval is configurable.
- Bundled Plus Jakarta Sans (SIL OFL) so fonts render on a first offline launch.
- Android back from any tab returns to Dashboard first.

## Notes
- Evacuation centers are hardcoded in evacuation_screen.dart, so they already worked offline;
  EvacuationService (Supabase) is not used by that screen.
- Both maps now send the same User-Agent package name to OpenStreetMap.

## Round 2: alerts, onboarding, polish, release readiness
- **Alerts:** Critical/Warning notification channels, Android foreground alerts now displayed
  by the app, "Send test alert" in Settings. **Needs one server change**: docs/EDGE_FUNCTION_NOTES.md.
- **Onboarding:** 3 screens on first launch; notification permission is asked there (no longer cold at startup).
- **Polish:** skeleton loaders (Alerts, Reports, Rainfall chart), haptic cue when the alert level rises,
  adaptive launcher icons prepared in `assets/icon/` (run `dart run flutter_launcher_icons`).
- **Release:** Crashlytics (opt-out in Settings, off in debug), privacy/feedback rows (hidden until you fill
  `lib/config/app_links.dart`), and docs/: PRIVACY_POLICY_DRAFT.md, RELEASE_CHECKLIST.md.
- New deps: firebase_crashlytics, url_launcher. Copy `assets/` and `docs/` over too.

## Round 3: Android project files
- New `android/` folder (only the files that changed; copy over your project's `android/`):
  manifest (INTERNET, POST_NOTIFICATIONS, VIBRATE, FCM defaults, url_launcher queries, label "AGOS"),
  Crashlytics Gradle plugin, release signing via `android/key.properties`, adaptive + themed launcher icons,
  status-bar notification icon. Read `docs/RELEASE_CHECKLIST.md`: two blockers remain
  (application ID `com.example.agos` is rejected by Google Play, and you need an upload key).
- iOS is intentionally not covered anywhere.

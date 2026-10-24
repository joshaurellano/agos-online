# AGOS redesign – round 1

Not compiled (no Flutter SDK where this was written). Files were syntax-checked only.
Run `flutter pub get && flutter analyze` first and send me anything it flags.

## Problems found in the screenshots / code
1. Dashboard hero was a fixed 296 px banner: ~45% of the screen was permanently used,
   so real content scrolled in a half-screen window.
2. "32%" had no context (32% of what? is that bad?).
3. Same message repeated 3x: hero, "Right now, you should", and "CURRENT" in the alert table.
4. 7-day trend + 14-day list overlapped, and the 14-day list was a very long scroll.
5. "Prepare an emergency go-bag" was advice with nothing to act on.
6. Flood Map had a duplicate "Flood Map" title (shared header already shows it) and no
   "where am I" – you couldn't find yourself on the map.

## What changed
Dashboard (screens/dashboard_screen.dart)
- NEW widgets/agos_hero.dart: collapsing hero. Risk gauge on a 4-zone dial (25/50/75 cut-offs,
  same as your backend), shrinks to a slim pinned bar on scroll (SliverPersistentHeader).
- NEW "insight row": Highest risk day / Rain next 24h / When risk eases (or rises).
- NEW widgets/prepare_card.dart: go-bag checklist, saved on device, auto-expands at Advisory+.
- NEW widgets/safety_tools.dart: "I'm safe" SMS to saved family contacts (with current level)
  + tap-to-call hotlines.
- 14-day list collapsed to next 5 days with "Show all 14 days".
- Alert-level table collapsed into an expander.
- At Warning/Critical the "Be prepared" block moves above the forecast.

Flood Map (screens/flood_map_screen.dart)
- Removed duplicate title row -> more map.
- NEW "my location" button, blue dot, and "You are inside this flood zone / outside" line in the status pill.
- "?" help moved into the legend panel ("How to use this map") to keep the tool stack short.

Android: AndroidManifest.xml now declares sms: and tel: query intents (needed on Android 11+).

## Before you ship
- Hotlines: only 911 and 143 (Philippine Red Cross) are included. Add your barangay / Naga City
  DRRMO numbers in `kEmergencyHotlines` (widgets/safety_tools.dart) after verifying them.
- Go-bag items are generic; adjust to what your barangay's DRRM office recommends.
- The hero now paints the weather backdrop inside the header only (the content sheet is opaque).

## Round 2 – Flood Map
- Status card now carries the Normal→Critical scale with a marker at the current %, so the
  always-on left legend is gone (tap the card for the full legend + facilities key).
- Tool stack 7 → 4 buttons: my location, layers, recenter, fullscreen. Zoom +/- removed
  (pinch + double-tap zoom). Basemap switcher and hospitals/schools toggle moved into the Layers sheet.
- Fixed the cut-off basemap switcher at the bottom-left.
- Timeline: short labels (no more "Tomorro/w" wrapping), a dot per day in that day's alert colour,
  tap a day to jump to it.
- Light mode now uses a light basemap (dark inverted tiles only in dark mode).
- "My location" outside the barangay frames both you and the barangay.
- Top-left items are one Column, so the card, wind pill and legend can't overlap.
- Leftover unused code (_styleSwitcher, _zoomBy, _canZoomIn/Out) can be deleted; analyze will warn about them.

## Round 3 – Evacuation screen
- Map now fills the whole tab. The half-screen list of long address cards is replaced by a
  swipeable card strip over the map (nearest first once located). Swiping flies the map to that
  center; tapping a marker brings its card into view.
- Each card: walking time + distance (street route when available, straight-line estimate
  otherwise), address, "Directions" (opens Google Maps walking directions for real turn-by-turn)
  and "Tell family" (SMS with the center + your live location link).
- Top strip reacts to the flood level: calm -> "No evacuation needed", Advisory -> "know your route",
  Warning -> "Be ready to evacuate", Critical -> red "Evacuate now" button straight to directions.
- Markers: name label only on the selected center (the 7 px always-on labels were unreadable and
  overlapped); selected marker is larger.
- Big "Find nearest to me" button until location is known.
- Tools 5 -> 3 (locate, show-all, key). Zoom buttons and fullscreen removed (pinch / double-tap).
  The key panel also holds short "if you have to evacuate" tips.
- Removed: the search bar (only 3 centers - swiping is faster), dead banner/list code.
- Needs network only for the street route and Directions; centers, distances and cards work offline.
- `_nearestDist` is now unused; analyze will warn - safe to delete.

## Round 4 – Rainfall screen
- Hero is now "Rain right now + what happens next": PAGASA 5-band scale with a marker at the current
  rate, always-visible status chip (NO RAIN / LIGHT / ...), and ONE plain sentence from the forecast
  ("Dry for now - rain expected around 3 PM" / "Rain should ease around 6 PM") plus the heaviest hour.
- NEW "Next 24 hours" card: tap-able hourly bars coloured by PAGASA band, plus 6h/12h/24h totals and
  chance. Uses the same /api/forecast + cache key as the Dashboard (works offline from its saved copy).
- The 4 KPI cards (two of which read "-- / Insufficient hourly data") became one "Rain that has fallen"
  card: last 3h / 6h / 24h and the trend. Empty state is a single calm line.
- History chart: Hourly/Daily is a segmented switch inside the card; boxed disclaimer became a caption.
- Threshold reference collapsed into "What do the rain levels mean?" (highlights the current level only
  on the hourly table - previously an hourly reading was also compared against the daily table).
- Removed unused _MiniStat/_KpiCard/_PeriodTab/_total/_peak.
- Heads-up (not changed): widgets/minute_forecast_card.dart defines its own light-only AppColors, so the
  Dashboard's MinuteCast card ignores dark mode.

## Round 5 – Reports (community feed + report form)
Found: IncidentService.fetchMyReports / deleteOwnPendingReport / streamVerifiedReports existed but no
screen used them - after submitting, a resident could never see if their report was verified, pending or
rejected (and why), couldn't withdraw it, and the feed wasn't live.

Feed (screens/community_reports_screen.dart)
- Tabs: Community | My reports (badge = reports awaiting review). After sending a report the app jumps
  to My reports. Each own report shows Pending review / Verified / Not verified (+ reason) and a
  Withdraw button while pending.
- Realtime updates via streamVerifiedReports, with a "Live" dot. If Realtime isn't enabled for the
  incident_reports table the stream errors quietly and pull-to-refresh still works.
- Filter chips: All / Last 24 hours / With photo, plus a count.
- Alert-aware banner: at Advisory+ asks "is water rising on your street?" -> opens the form.
- Cards: depth / passability chips, NEW tag (<1 h), friendly "Pinned location" instead of raw
  coordinates, "View on map" (opens the pin in the maps app), tap photo for full-screen pinch-zoom.
- Better empty states with a "Report flooding" button.

Form (screens/report_incident_screen.dart)
- NEW "How deep is the water?" (Ankle / Knee / Waist / Chest+, with Filipino hints) and "Can vehicles
  pass?" quick picks. Stored as a "[Knee-deep · Not passable]" prefix on the description
  (models/incident_report.dart: ReportTags) - NO database change. Description is now optional if a
  depth is picked.
- Location is attached automatically when permission was already granted (shows accuracy).
- Submit button pinned to the bottom; name field moved last; shorter copy.

Note: officials viewing reports on the web dashboard will see the "[Knee-deep · ...]" prefix as plain
text; the dashboard can parse it the same way (regex ^\[(.+?)\]).

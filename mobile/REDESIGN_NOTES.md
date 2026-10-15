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

> **Status note (added during review):** only part of this plan is in the code. The slate palette, the `StatusHero` card, the five-slot mobile nav and the `.seg`/`.chip` styles described below are **not** present in this folder. What is actually implemented: the Your Place card as a summary with its pin and route on the single main map, flood-zone tags and fixed distances in the facilities list, round/pin facility icons, topbar and weather-panel layout fixes.

# AGOS web redesign (Oct 2026)

**Goal:** a calmer, status-first interface. The page answers "how bad is it and what do I do?" before anything else, and the four alert colours are the only loud colours on screen.

**Inspiration:** Google Flood Hub (map and status first), NWS / PAGASA bulletins (level, plain-language action), Apple Weather (small metric tiles), Windy (compact map controls), and the AGOS mobile app (five-slot bottom navigation).

## What changed
- **Design tokens** (`src/index.css`): new slate palette, one sky-blue accent, softer borders and shadows. Variable names are unchanged, so every page still works. Light mode no longer uses solid blue title bands or a navy sidebar.
- **Cards:** sentence-case headings with a small accent tick, replacing full-width coloured bands in ALL-CAPS. Cards no longer lift on hover.
- **Dashboard** (`src/pages/Dashboard.jsx`): the title strip, advisory card, dispatch card and two-cell "conditions" strip are now one `StatusHero` (level, stance, gauge, 4-step scale, action, rainfall / trend / humidity / wind tiles). Dispatch is a button inside the hero, still staff-only. The map is shorter so the forecast tabs are reachable without a long scroll.
- **Topbar:** theme switch is an icon button, clock drops seconds, rounder model/language controls.
- **Mobile:** `QuickActionsBar` is now a five-slot bottom nav (Status, Rainfall, Evacuate, Alerts, More) with the evacuation map raised in the centre. Staff see Status, Flood log, Evacuate, Reports, More.
- **Facilities:** viewers more than 15 km from the barangay no longer see "261 km away" on every card; the list says so and sorts alphabetically instead.
- Shared `.seg` segmented control and `.chip` filter styles replace repeated inline styles.

## Not touched
Login screen, Swal dialogs (still dark-styled), analytics/staff/registry pages (they pick up the new tokens but were not redesigned individually), all data, auth and Supabase logic.

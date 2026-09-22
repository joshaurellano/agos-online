# AGOS Privacy Policy: DRAFT

> **This is a starting point, not legal advice.** It describes what the app's
> code does today. Fill in every `[PLACEHOLDER]`, check every `[VERIFY]`, and have
> someone qualified review it before publishing. If AGOS is operated in the
> Philippines, obligations under the Data Privacy Act of 2012 (RA 10173) may
> apply; a data-privacy adviser or your local government's DPO can confirm.
> Google Play requires a public privacy policy URL; host this page and put the
> link in `lib/config/app_links.dart`.

**Last updated:** [DATE]
**Operated by:** [ORGANIZATION / BARANGAY / PROJECT NAME]
**Contact:** [EMAIL]

## What AGOS is
AGOS is a flood early-warning app for Barangay Triangulo, Naga City. It shows
flood risk, rainfall, evacuation centers, and community reports.

## No account
You don't create an account or sign in. When the app first runs it creates an
**anonymous ID** so that reports you submit can be linked to your device. It is
not linked to your name, phone number, or email.

## Information AGOS collects

| Information | When | Why |
|---|---|---|
| Anonymous ID | First launch | So your reports and device can be recognized without an account |
| Notification token (FCM) and platform (Android) | When notifications are set up | To send flood alerts to your phone |
| Report details: category, description | Only when you submit a report | To let barangay officials review it |
| Your name (optional) | Only if you type one into a report | Shown with the report; leave blank to appear as "Resident" |
| Photo (optional) | Only if you attach one | To help officials assess the report |
| Location (optional) | Only if you attach it to a report | To show where the flooding is |
| Crash and diagnostic data | If crash reports are on (Settings) | To find and fix problems. Collected by Google Firebase Crashlytics; may include device model, OS version and an installation identifier |

**Verified reports may be visible to all AGOS users**, including their
description, photo and location. [VERIFY: confirm exactly which fields the
community feed shows.]

## Information that stays on your phone
Your settings, saved forecasts and alerts (for offline use), downloaded map
tiles, and any report waiting to be sent while you're offline. Deleting the
app removes it.

## Location
AGOS asks for location only when you use walking directions to an evacuation
center or choose to add your location to a report. Your position is:
- used on your phone to find the nearest center;
- **sent to a public routing service (OSRM, router.project-osrm.org)** when you
  request walking directions, so it can draw the route;
- sent to AGOS's servers only if you attach it to a report.

## Third-party services
- **Supabase**: database, anonymous sign-in and photo storage for AGOS.
- **Google Firebase**: push notifications (Cloud Messaging) and crash reports (Crashlytics).
- **OpenStreetMap, Esri, OpenTopoMap**: map images. Requesting map tiles reveals your IP address and the area you're viewing to those providers.
- **OSRM public server**: walking routes (see Location).
- **Open-Meteo**: weather data used by AGOS's servers. [VERIFY]

## How long we keep information
[PLACEHOLDER: e.g. reports kept for X months; notification tokens removed when a device stops receiving.]

## Your choices
- Turn off notifications or individual alert types in **Settings → Notifications**.
- Turn off crash reports in **Settings → Privacy & support**.
- Don't attach a name, photo or location to a report.
- To ask that a report you submitted be removed, contact [EMAIL] with the approximate time and description. [VERIFY: confirm you can actually delete by that route.]

## Children
AGOS is not directed at children. [VERIFY against your intended audience.]

## Changes
We'll update the date above when this policy changes.

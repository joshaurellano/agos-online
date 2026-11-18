// help_content.dart
//
// All the text behind the Help Center (screens/help_screen.dart), kept
// separate from the UI so wording can be fixed without touching widgets.
//
// Everything here describes what AGOS actually does today. If a screen or
// setting changes, update the matching entry — a wrong help answer is worse
// than none.
import 'package:flutter/material.dart';

/// Somewhere in the app a help answer can send the person to.
enum HelpAction {
  dashboard('Open Dashboard', Icons.dashboard_rounded),
  floodMap('Open Flood Map', Icons.radar_rounded),
  rainfall('Open Rainfall', Icons.water_drop_rounded),
  evacuation('Open Evacuation', Icons.directions_run_rounded),
  reports('Open Reports', Icons.campaign_rounded),
  reportFlood('Report a flood', Icons.add_a_photo_rounded),
  alerts('Open Alerts', Icons.notifications_rounded),
  emergency('Emergency numbers', Icons.phone_in_talk_rounded),
  settings('Open Settings', Icons.settings_rounded),
  privacy('Privacy notice', Icons.shield_outlined);

  final String label;
  final IconData icon;
  const HelpAction(this.label, this.icon);
}

class HelpFaq {
  final String question;
  final String answer;

  /// Extra words people might search for that the text itself doesn't use
  /// (including common Filipino terms: baha, ulan, likas, ...).
  final String keywords;
  final HelpAction? action;

  /// Shown on the Help Center home under "Common questions".
  final bool popular;
  const HelpFaq(
    this.question,
    this.answer, {
    this.keywords = '',
    this.action,
    this.popular = false,
  });
}

class HelpTopic {
  final String id;
  final String title;
  final String blurb;
  final IconData icon;
  final List<HelpFaq> faqs;
  const HelpTopic({
    required this.id,
    required this.title,
    required this.blurb,
    required this.icon,
    required this.faqs,
  });
}

class GlossaryTerm {
  final String term;
  final String meaning;
  const GlossaryTerm(this.term, this.meaning);
}

const kHelpTopics = <HelpTopic>[
  // ── Getting started ────────────────────────────────────────────────────
  HelpTopic(
    id: 'start',
    title: 'Getting started',
    blurb: 'What AGOS is and how to use it',
    icon: Icons.waving_hand_rounded,
    faqs: [
      HelpFaq(
        'What is AGOS?',
        'AGOS is a flood early-warning app for Barangay Triangulo, Naga City. '
            "It predicts flood risk from live rainfall and wind readings, shows it on a map, tells you where to evacuate, "
            'and lets residents report flooding to the barangay.',
        keywords: 'about app purpose what does',
      ),
      HelpFaq(
        'Do I need an account or to log in?',
        'No. AGOS works without an account. It gives your phone an anonymous ID so alerts and your own reports can reach you, '
            'but it never asks for your name, email or password.',
        keywords: 'login sign in register password username',
        popular: true,
      ),
      HelpFaq(
        'What do the bottom bar and the buttons at the top do?',
        'The bottom bar has Dashboard (today\'s flood status and forecast), Flood Map, Evacuation and Reports. '
            'The red phone button in the middle opens Emergency numbers. '
            'Rainfall details open from the Dashboard\'s "Rainfall Details" shortcut. '
            'The bell opens your alert history and the gear opens Settings.',
        keywords: 'navigation menu tabs bottom bar bell gear buttons',
        action: HelpAction.dashboard,
      ),
      HelpFaq(
        'What should I do first?',
        '1) Allow notifications so you get flood warnings. '
            '2) Download the offline map in Settings so the map still works without signal. '
            '3) Look at the Evacuation tab and note your nearest center. '
            '4) Tick off the go-bag checklist on the Dashboard.',
        keywords: 'setup start begin new user first time tutorial',
        action: HelpAction.settings,
        popular: true,
      ),
      HelpFaq(
        'Which area does AGOS cover?',
        'Barangay Triangulo in Naga City. Flood predictions, the map, evacuation centers and critical facilities are all for this barangay.',
        keywords: 'location coverage naga triangulo other barangay city',
      ),
    ],
  ),

  // ── Alerts & risk ──────────────────────────────────────────────────────
  HelpTopic(
    id: 'alerts',
    title: 'Alerts & flood risk',
    blurb: 'Normal, Advisory, Warning, Critical',
    icon: Icons.warning_amber_rounded,
    faqs: [
      HelpFaq(
        'What do Normal, Advisory, Warning and Critical mean?',
        'Normal: no significant flood risk. '
            'Advisory: water levels are rising and minor flooding is possible in low-lying areas, so stay alert. '
            'Warning: significant flooding is expected — prepare to evacuate and secure valuables. '
            'Critical: severe flooding is imminent — evacuate now and go to an evacuation center. '
            'Each level has its own color and icon shape, so you can tell them apart without relying on color.',
        keywords: 'levels colors green yellow orange red meaning code water code',
        action: HelpAction.alerts,
        popular: true,
      ),
      HelpFaq(
        'What does the flood percentage mean?',
        'It is AGOS\'s predicted chance of flooding. The gauge on the Dashboard is split into the four alert levels: '
            'below 25% is Normal, 25–50% Advisory, 50–75% Warning, and above 75% Critical.',
        keywords: 'probability percent gauge dial chance risk',
        action: HelpAction.dashboard,
      ),
      HelpFaq(
        'How does AGOS predict flooding?',
        'A flood model checks live rainfall and wind readings for the barangay and estimates the risk. '
            'Hourly and daily outlooks use Open-Meteo weather data. '
            'Tap a day in the Dashboard\'s 7-day outlook to see what drove that forecast.',
        keywords: 'model prediction accuracy how works forecast machine learning',
      ),
      HelpFaq(
        'Are the alerts official?',
        'No. Alerts are AGOS predictions, not official government announcements. '
            'Always follow instructions from barangay officials, the local DRRMO and PAGASA.',
        keywords: 'official pagasa drrmo trust reliable accurate',
      ),
      HelpFaq(
        'Where can I see past alerts?',
        'Tap the bell icon. The alert log lists earlier alerts, can be filtered by level, and has a "Clear all" button to empty the list.',
        keywords: 'history log notifications bell clear filter',
        action: HelpAction.alerts,
      ),
      HelpFaq(
        'How often does the flood status update?',
        'Every 30 seconds by default while the app is open. You can change it to 1 minute, 5 minutes or manual-only in '
            'Settings → Data & refresh. Updates pause while AGOS is in the background.',
        keywords: 'refresh interval update frequency auto battery data',
        action: HelpAction.settings,
      ),
    ],
  ),

  // ── Dashboard ──────────────────────────────────────────────────────────
  HelpTopic(
    id: 'dashboard',
    title: 'Dashboard & forecast',
    blurb: 'Reading the home screen',
    icon: Icons.dashboard_rounded,
    faqs: [
      HelpFaq(
        'What am I looking at on the Dashboard?',
        'The top banner shows the current alert level, flood chance, rain right now and when it was last updated. '
            'Below it are the hourly forecast, the 7-day flood outlook, weather details, a go-bag checklist, '
            'and tools to tell family you are safe.',
        keywords: 'home screen overview banner hero',
        action: HelpAction.dashboard,
      ),
      HelpFaq(
        'What does "Updated 5 min ago" or "showing saved data" mean?',
        'AGOS shows when it last received data. If it cannot reach the server, it shows the most recent saved reading '
            'instead of a blank screen. Once you are back online, tap Refresh in Settings to update right away.',
        keywords: 'stale old cached outdated last updated cant reach',
      ),
      HelpFaq(
        'What is the 7-day flood outlook?',
        'A day-by-day look at expected flood risk. Tap any day to see the main factors behind it, such as expected rainfall.',
        keywords: 'daily week forecast days',
      ),
      HelpFaq(
        'What is the go-bag checklist?',
        'A checklist of things to prepare before a flood — water, food, IDs, medicines, flashlight, power bank, cash, '
            'clothes, whistle and a family meeting point. Your ticks are saved on your phone. '
            'It opens automatically when the alert level rises above Normal.',
        keywords: 'prepare emergency kit bag supplies checklist',
        action: HelpAction.dashboard,
      ),
      HelpFaq(
        'What does the "I\'m safe" button do?',
        'It opens your phone\'s share sheet with a ready-made message about the current flood level. '
            'You pick the app (SMS, Viber, WhatsApp...) and who gets it. AGOS stores no contact list and sends nothing itself.',
        keywords: 'tell family share message safe sms viber contacts',
      ),
    ],
  ),

  // ── Flood map ──────────────────────────────────────────────────────────
  HelpTopic(
    id: 'map',
    title: 'Flood Map',
    blurb: 'Zones, layers and the forecast timeline',
    icon: Icons.radar_rounded,
    faqs: [
      HelpFaq(
        'How do I read the map?',
        'The barangay boundary is shaded with the current alert color. '
            'Tap the information button to see the legend, and the wind pill shows which way the wind is blowing.',
        keywords: 'legend colors boundary zone shading wind direction',
        action: HelpAction.floodMap,
        popular: true,
      ),
      HelpFaq(
        'What do the buttons on the right edge do?',
        'Fullscreen enlarges the map. The info button explains the colors. The hospital button shows hospitals, schools, police and fire stations. '
            'The layers button changes what the map shows. Recenter returns to Barangay Triangulo, and + / − zoom (you can also pinch).',
        keywords: 'controls fullscreen recenter zoom buttons',
        action: HelpAction.floodMap,
      ),
      HelpFaq(
        'How do I see the rain forecast on the map?',
        'Open the layers button and choose Flood risk (next 7 days), Chance of rain (next 24 hours) or Amount of rain (next 24 hours). '
            'Then press play on the timeline at the bottom to watch it change over time.',
        keywords: 'layers timeline play radar rain probability',
        action: HelpAction.floodMap,
      ),
      HelpFaq(
        'How do I switch to satellite or terrain view?',
        'In the layers sheet, pick a base map: Standard, Satellite or Terrain.',
        keywords: 'base map satellite terrain street view',
      ),
      HelpFaq(
        'What are critical facilities?',
        'Hospitals, schools, fire stations and police stations. Turn them on with the hospital button; the legend lists each icon.',
        keywords: 'hospital school fire police station places pins',
      ),
      HelpFaq(
        'The map is blank or gray when I have no signal.',
        'Download the offline map first: Settings → Offline data → Offline map → Download (about 2 MB). '
            'Satellite and terrain layers only save the areas you browsed while online.',
        keywords: 'offline blank tiles no internet gray missing',
        action: HelpAction.settings,
      ),
    ],
  ),

  // ── Rainfall ───────────────────────────────────────────────────────────
  HelpTopic(
    id: 'rain',
    title: 'Rainfall',
    blurb: 'Rain now, next hours, rain totals',
    icon: Icons.water_drop_rounded,
    faqs: [
      HelpFaq(
        'What does the Rainfall screen show?',
        '"Rain right now", the expected rain for the next 6, 12 and 24 hours, and how much has already fallen in the last 3, 6 and 24 hours.',
        keywords: 'rain amount mm millimeters hourly',
        action: HelpAction.rainfall,
      ),
      HelpFaq(
        'Why are the "rain that has fallen" totals empty or low?',
        'Totals fill in as AGOS records more readings, so they may be incomplete shortly after you first install the app.',
        keywords: 'totals missing zero history',
      ),
      HelpFaq(
        'What do Light, Moderate, Heavy and Torrential mean?',
        'They follow PAGASA\'s rainfall intensity classification. Tap "What do the rain levels mean?" on the Rainfall screen for the exact hourly and 24-hour thresholds.',
        keywords: 'pagasa intensity categories heavy light moderate torrential intense',
        action: HelpAction.rainfall,
      ),
      HelpFaq(
        'The forecast says unavailable.',
        'Pull down on the screen to retry. If you are offline, AGOS shows the last saved forecast when it has one.',
        keywords: 'error unavailable not loading retry',
      ),
    ],
  ),

  // ── Evacuation ─────────────────────────────────────────────────────────
  HelpTopic(
    id: 'evac',
    title: 'Evacuation',
    blurb: 'Centers, routes and what to bring',
    icon: Icons.directions_run_rounded,
    faqs: [
      HelpFaq(
        'How do I find my nearest evacuation center?',
        'Open the Evacuation tab and tap "Find nearest to me". AGOS asks for permission to use your location, then marks the closest center. '
            'The closest one is labeled NEAREST.',
        keywords: 'nearest closest shelter center school gym location',
        action: HelpAction.evacuation,
        popular: true,
      ),
      HelpFaq(
        'How do I get walking directions?',
        'Tap "Directions" on a center\'s card. AGOS draws a walking route on the map with distance and walking time. '
            'To make the route it sends your position to a public routing service — nothing else is shared.',
        keywords: 'route navigation walk path map directions',
        action: HelpAction.evacuation,
      ),
      HelpFaq(
        'What do the colors on the evacuation map mean?',
        'Tap the map key. Primary centers and school centers have different colors, green marks the nearest center or your position, '
            'a blue line is the barangay boundary, and a green line is your walking route.',
        keywords: 'legend map key dots colors',
      ),
      HelpFaq(
        'What should I bring if I have to evacuate?',
        'IDs, medicines, phone and power bank, water, food, and a change of clothes. Go early before the water rises, '
            'avoid walking through floodwater, and follow the barangay officials\' instructions.',
        keywords: 'bring pack go bag leave tips safety',
      ),
      HelpFaq(
        'How do I tell my family where I am going?',
        'Tap "Tell family" on a center\'s card. Your phone\'s share sheet opens with a ready message; you choose the app and the person.',
        keywords: 'share family message viber sms notify',
      ),
      HelpFaq(
        'Directions or "Find nearest" does not work.',
        'Check that location is on for your phone and that AGOS is allowed to use it (phone Settings → Apps → AGOS → Permissions). '
            'Directions also need an internet connection.',
        keywords: 'location permission gps denied not working',
      ),
    ],
  ),

  // ── Community reports ──────────────────────────────────────────────────
  HelpTopic(
    id: 'reports',
    title: 'Reporting a flood',
    blurb: 'Send and track resident reports',
    icon: Icons.campaign_rounded,
    faqs: [
      HelpFaq(
        'How do I report flooding?',
        'Open the Reports tab and tap "Report Flood". Pick how deep the water is, whether the road is passable, '
            'add a short description, an optional photo and your name, then tap "Send report".',
        keywords: 'submit file send incident report baha',
        action: HelpAction.reportFlood,
        popular: true,
      ),
      HelpFaq(
        'How deep is ankle, knee, waist and chest-deep?',
        'Ankle-deep (bukung-bukong), knee-deep (tuhod), waist-deep (baywang), chest-deep or higher (dibdib pataas). '
            'Road choices are Passable, High vehicles only, and Not passable.',
        keywords: 'depth height water level lalim tubig road passable',
      ),
      HelpFaq(
        'Why isn\'t my report in the public feed?',
        'Every report starts as Pending. It only appears in the community feed after a barangay official verifies it. '
            'You can always see your own reports, with their status, in the Reports tab.',
        keywords: 'pending verified rejected approve review missing not showing',
        action: HelpAction.reports,
      ),
      HelpFaq(
        'What do Pending, Verified and Rejected mean?',
        'Pending: waiting for review. Verified: confirmed and now visible to the community. '
            'Rejected: not accepted — the reason is shown on the report.',
        keywords: 'status declined approved reason',
      ),
      HelpFaq(
        'Can I take back a report?',
        'Yes, while it is still Pending. Open your report in the Reports tab and tap "Withdraw". Reports already reviewed cannot be withdrawn.',
        keywords: 'delete cancel withdraw remove undo',
        action: HelpAction.reports,
      ),
      HelpFaq(
        'I have no signal. Can I still report?',
        'Yes. The report is saved on your phone and sent automatically when you are back online. '
            'You can see what is waiting in the Reports tab or in Settings → Offline data, and send it right away with "Send now".',
        keywords: 'offline queue outbox waiting later no internet',
      ),
      HelpFaq(
        'Why does a report ask for my location?',
        'Pinning the location lets officials find the flooded spot. If location permission is already allowed, AGOS attaches it for you. '
            'Your location is only sent when you submit a report.',
        keywords: 'gps privacy position pin permission',
      ),
      HelpFaq(
        'Is it safe to report during a flood?',
        'Your safety comes first. Do not wade into floodwater or put yourself in danger for a photo. For emergencies call 911 or COMCEN instead.',
        keywords: 'danger photo safety emergency',
        action: HelpAction.emergency,
      ),
    ],
  ),

  // ── Emergency ──────────────────────────────────────────────────────────
  HelpTopic(
    id: 'emergency',
    title: 'Emergency numbers',
    blurb: 'Who to call and how',
    icon: Icons.phone_in_talk_rounded,
    faqs: [
      HelpFaq(
        'Who should I call in an emergency?',
        'Call 911 (national emergency) or COMCEN, Naga City\'s 24/7 Central Communications Center, which dispatches ambulance, police and fire teams. '
            'Both are one tap away from the red phone button.',
        keywords: 'call 911 comcen ambulance fire police rescue help tulong',
        action: HelpAction.emergency,
        popular: true,
      ),
      HelpFaq(
        'How do I call or copy a number?',
        'Tap a number to open your phone\'s dialer; press and hold to copy it. '
            'COMCEN has several lines — pick the one that matches your network or landline.',
        keywords: 'dial copy phone smart globe landline',
      ),
      HelpFaq(
        'How do I find a hospital, fire station or barangay hall?',
        'Use the search box on the Emergency screen (for example "hospital" or "fire"), or browse the categories.',
        keywords: 'search contacts directory hotline',
        action: HelpAction.emergency,
      ),
      HelpFaq(
        'What should I tell the operator?',
        'Stay calm. Say where you are, what happened, how many people need help, and whether anyone is injured or trapped.',
        keywords: 'call script what to say dispatcher',
      ),
      HelpFaq(
        'Does AGOS call for me automatically?',
        'No. AGOS never contacts anyone on its own. You always choose to call.',
        keywords: 'auto sos automatic',
      ),
    ],
  ),

  // ── Notifications ──────────────────────────────────────────────────────
  HelpTopic(
    id: 'notifications',
    title: 'Notifications',
    blurb: 'Flood warnings and report updates',
    icon: Icons.notifications_active_rounded,
    faqs: [
      HelpFaq(
        'How do I turn flood alerts on or off?',
        'Settings → Notifications → Flood alerts. Community report updates (when an official verifies a report) is a separate switch under it.',
        keywords: 'enable disable switch push mute',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'I\'m not getting notifications.',
        'Check: 1) Flood alerts is on in Settings. 2) Notifications are allowed for AGOS in your phone\'s system settings. '
            '3) Battery saver is not stopping AGOS in the background. 4) You are online — a change made offline applies once you reconnect. '
            'The "Check my setup" card on the Help Center home checks these for you, and Settings → Send test alert confirms they work.',
        keywords: 'not receiving push alert missing silent blocked permission troubleshoot',
        action: HelpAction.settings,
        popular: true,
      ),
      HelpFaq(
        'Does tapping a notification open the right screen?',
        'Yes. Flood alerts open the Alerts screen, and report updates open the Reports tab.',
        keywords: 'tap open deep link',
      ),
      HelpFaq(
        'Will alerts sound if my phone is on silent?',
        'That depends on your phone\'s sound and Do Not Disturb settings. Use "Send test alert" in Settings to hear exactly what you will get.',
        keywords: 'sound volume silent dnd do not disturb vibrate',
      ),
    ],
  ),

  // ── Offline ────────────────────────────────────────────────────────────
  HelpTopic(
    id: 'offline',
    title: 'Offline & saved data',
    blurb: 'Using AGOS with weak or no signal',
    icon: Icons.cloud_off_rounded,
    faqs: [
      HelpFaq(
        'Does AGOS work without internet?',
        'Partly. A strip at the bottom says "Offline · showing saved data". You can still see the last saved forecast and alerts, '
            'the downloaded map, evacuation centers and emergency numbers, and you can write reports that send later. '
            'Live updates, walking directions and new alerts need a connection.',
        keywords: 'no signal wifi data load internet connection',
        popular: true,
      ),
      HelpFaq(
        'How do I download the map for offline use?',
        'Settings → Offline data → Offline map → Download. It saves the street map of Barangay Triangulo (about 2 MB). Use "Update" to refresh it and "Delete saved maps" to remove it.',
        keywords: 'download tiles maps storage',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'How do I free up space?',
        'Settings → Offline data → Saved forecasts & alerts → Clear. Saved items return the next time you are online. '
            'You can also delete the offline map there.',
        keywords: 'storage cache clear delete space memory',
        action: HelpAction.settings,
      ),
    ],
  ),

  // ── Display & accessibility ────────────────────────────────────────────
  HelpTopic(
    id: 'display',
    title: 'Display & accessibility',
    blurb: 'Dark mode, text size, contrast',
    icon: Icons.contrast_rounded,
    faqs: [
      HelpFaq(
        'How do I switch between light and dark mode?',
        'Settings → Display → Appearance. Choose Match phone, Light or Dark.',
        keywords: 'theme night mode dark light appearance',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'How do I make the text bigger?',
        'Settings → Display → Text size. The slider changes the text size across the whole app.',
        keywords: 'font size larger zoom reading eyesight',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'What does High contrast do?',
        'It boosts contrast across the whole app to make text and shapes easier to see. Alert levels also use different icon shapes, so you never need color alone.',
        keywords: 'colorblind color blind vision accessibility',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'How do I reset all my settings?',
        'Settings → Data & refresh → Reset settings. Appearance, text size, contrast, refresh interval and notification choices return to defaults. Saved offline data is kept.',
        keywords: 'default restore reset',
        action: HelpAction.settings,
      ),
    ],
  ),

  // ── Privacy ────────────────────────────────────────────────────────────
  HelpTopic(
    id: 'privacy',
    title: 'Privacy & data',
    blurb: 'What AGOS does and doesn\'t collect',
    icon: Icons.shield_outlined,
    faqs: [
      HelpFaq(
        'Where can I read the full privacy notice?',
        'Settings → Privacy & support → Privacy notice, or the button below. It explains what AGOS collects, why, who can see it, '
            'which outside services are involved, and your rights under the Data Privacy Act.',
        keywords: 'terms policy consent data protection law dpa ra 10173',
        action: HelpAction.privacy,
      ),
      HelpFaq(
        'How do I withdraw my consent or ask for my data to be deleted?',
        'Open the privacy notice and tap "Withdraw consent": AGOS stops alerts on this phone, clears saved data and closes. '
            'To have information on our servers (your anonymous ID or reports) deleted, use "Email us" there and include your Device ID.',
        keywords: 'delete erase remove account opt out revoke consent forget',
        action: HelpAction.privacy,
      ),
      HelpFaq(
        'What information does AGOS collect?',
        'An anonymous device ID and your phone\'s notification token, used to send alerts and to link your reports to you. '
            'No account, email or password. Reports include what you type, an optional photo and an optional location.',
        keywords: 'data collect personal information tracking anonymous',
        popular: true,
      ),
      HelpFaq(
        'When is my location used?',
        'Only when you ask for it: "Find nearest" and walking directions, or when you attach it to a report. '
            'It stays on your phone otherwise. Directions send your position to a public routing service to draw the route.',
        keywords: 'gps location sharing permission',
      ),
      HelpFaq(
        'What are crash reports?',
        'Anonymous technical details sent when the app crashes, so problems can be fixed. Turn them off in Settings → Privacy & support.',
        keywords: 'diagnostics analytics bug telemetry',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'Who can see my reports?',
        'Barangay officials see every report. The public sees a report only after it is verified. Your own list is visible to you on this phone.',
        keywords: 'visible public name photo anonymous',
      ),
    ],
  ),

  // ── Troubleshooting ────────────────────────────────────────────────────
  HelpTopic(
    id: 'trouble',
    title: 'Troubleshooting',
    blurb: 'When something isn\'t working',
    icon: Icons.build_circle_rounded,
    faqs: [
      HelpFaq(
        'The flood status won\'t load.',
        'Check your connection, then tap Settings → Refresh. If the strip at the bottom says offline, AGOS is showing saved data until you reconnect. '
            'If it still fails when you are online, the server may be temporarily unreachable — try again in a few minutes.',
        keywords: 'not loading error cant reach stuck spinner blank',
        action: HelpAction.settings,
        popular: true,
      ),
      HelpFaq(
        'My report is stuck on "Waiting to send".',
        'It needs an internet connection. When you are back online it sends by itself, or you can use Settings → Offline data → Send now.',
        keywords: 'outbox pending queue stuck failed upload',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'Location is wrong or won\'t update.',
        'Turn on location for your phone, set AGOS to "While using the app", and move to open sky or a window for a better GPS fix. '
            'The report screen shows the accuracy in meters.',
        keywords: 'gps inaccurate permission not found precise',
      ),
      HelpFaq(
        'The app is slow or uses too much data or battery.',
        'Set a longer refresh time in Settings → Data & refresh, such as 5 minutes or manual. Polling already pauses while AGOS is in the background.',
        keywords: 'battery drain data usage lag performance',
        action: HelpAction.settings,
      ),
      HelpFaq(
        'The app froze or something looks wrong.',
        'Close and reopen AGOS, and update to the newest version from the store. Clearing saved data (Settings → Offline data) can also help. '
            'If it keeps happening, use "Copy support info" on the Help Center home and send it with a description when you contact support.',
        keywords: 'crash bug freeze glitch broken restart update',
      ),
    ],
  ),

  // ── Safety guide ───────────────────────────────────────────────────────
  HelpTopic(
    id: 'safety',
    title: 'Flood safety guide',
    blurb: 'Before, during and after a flood',
    icon: Icons.health_and_safety_rounded,
    faqs: [
      HelpFaq(
        'Before a flood',
        'Know your nearest evacuation center and the route to it. Prepare a go-bag and keep documents in waterproof bags. '
            'Agree on a family meeting point. Charge your phone and power bank when rain is forecast. Keep AGOS notifications on.',
        keywords: 'prepare plan preparedness ready',
        action: HelpAction.evacuation,
        popular: false,
      ),
      HelpFaq(
        'During a flood',
        'Move to higher ground early. Do not walk, swim or drive through floodwater — it can be deeper and faster than it looks. '
            'Stay away from fallen power lines and switch off electricity if it is safe to do so. '
            'Follow barangay officials\' instructions and call 911 or COMCEN if you are in danger.',
        keywords: 'evacuate danger rising water electric drowning',
        action: HelpAction.emergency,
      ),
      HelpFaq(
        'After a flood',
        'Return home only when officials say it is safe. Avoid floodwater — it may be contaminated. '
            'Throw away food that touched floodwater and check for electrical or structural damage before using anything. '
            'Report remaining flooding in the Reports tab so others know.',
        keywords: 'recovery cleanup return home safe disease',
        action: HelpAction.reportFlood,
      ),
    ],
  ),
];

const kGlossary = <GlossaryTerm>[
  GlossaryTerm('Brgy. / Barangay', 'The smallest local government unit in the Philippines. AGOS covers Barangay Triangulo.'),
  GlossaryTerm('PAGASA', 'The national weather agency. AGOS follows its rainfall intensity categories.'),
  GlossaryTerm('COMCEN', 'Naga City\'s 24/7 Central Communications Center — dispatches ambulance, police and fire teams.'),
  GlossaryTerm('DRRMO', 'Disaster Risk Reduction and Management Office — the local office that leads flood preparedness and response.'),
  GlossaryTerm('Evacuation center', 'A school or other building opened as a safe shelter during floods.'),
  GlossaryTerm('Go-bag', 'A bag of essentials (water, food, IDs, medicines, flashlight) ready to grab if you must leave quickly.'),
  GlossaryTerm('Flood probability', 'AGOS\'s predicted chance of flooding, shown as a percentage on the Dashboard gauge.'),
  GlossaryTerm('mm / mm per hour', 'Millimeters of rain. 1 mm is one liter of rain spread over one square meter.'),
  GlossaryTerm('Verified report', 'A resident report confirmed by a barangay official, now visible to the community.'),
];

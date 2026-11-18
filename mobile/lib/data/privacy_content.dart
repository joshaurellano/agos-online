// privacy_content.dart
//
// The text of AGOS's privacy notice. Written to describe what the app does
// today (Data Privacy Act of 2012, Republic Act No. 10173). When the app's
// data handling changes — a new outside service, a new kind of data — update
// this AND raise PrivacyConsent.noticeVersion so people are asked again.
//
// Have it reviewed by the barangay / your school's data protection contact
// before release; it is a plain-language description, not legal advice.
import '../config/app_links.dart';

const String kPrivacyNoticeUpdated = '18 November 2026';

class PrivacySection {
  final String title;
  final String? intro;
  final List<String> bullets;
  final String? outro;
  const PrivacySection(this.title, {this.intro, this.bullets = const [], this.outro});
}

/// The one-screen summary shown on the consent screen and at the top of the
/// full notice.
const kPrivacySummary = <String>[
  'AGOS gives your phone an anonymous ID and uses its notification token to send flood alerts. No account, email or password.',
  'Your location is used only when you ask (nearest evacuation center, walking directions) or add it to a flood report.',
  'A flood report goes to barangay officials. Once verified, its description, photo, optional name and location can be seen by the community.',
  'Maps, directions and push notifications rely on outside services, listed in the full notice.',
  'You can change your choices or withdraw consent at any time in Settings → Privacy notice.',
];

List<PrivacySection> buildPrivacySections() => [
      PrivacySection(
        'Who is responsible',
        intro: 'AGOS is run by $kDataControllerName ("we"). '
            'We decide why and how the information described here is used.',
      ),
      const PrivacySection(
        'What we collect, and why',
        intro: 'Only what AGOS needs to warn you about floods and let you report them.',
        bullets: [
          'Anonymous device ID. Created automatically the first time you open AGOS so alerts and your own reports can be linked to your phone. It is not your name or phone number.',
          'Notification token. A code from Google\'s Firebase Cloud Messaging that lets us send alerts to your phone. We also save which alert types you chose (flood alerts, community updates).',
          'Flood reports you send. Water depth, road condition, your description, an optional photo, an optional name, and the location if you attach it.',
          'Location. Read from your phone only when you tap "Find nearest", ask for walking directions, or add a location to a report. AGOS does not track you in the background.',
          'Crash reports (optional). If you allow them: technical details about a crash, such as phone model, Android/iOS version and the error. They don\'t include your reports or messages.',
          'Network details. Whenever your phone contacts a server or map provider, that provider can see your IP address — this is how the internet works.',
          'Saved on your phone only. Theme, text size, go-bag ticks, saved forecasts and alerts, offline map, and reports waiting to send. These stay on your phone and are removed if you clear AGOS\'s data or uninstall it.',
        ],
      ),
      const PrivacySection(
        'Why we may use it (your consent)',
        intro: 'We use your information with your consent, which you give when you tap "I agree and continue". Specifically to:',
        bullets: [
          'send you flood warnings and updates about your reports;',
          'let barangay officials review and verify flood reports and respond;',
          'show verified reports to the community so people can avoid flooded areas;',
          'find and fix problems in the app (crash reports, only if you allow them).',
        ],
        outro: 'We do not sell your information and AGOS shows no advertising.',
      ),
      const PrivacySection(
        'Who can see it',
        bullets: [
          'Barangay officials and the AGOS team can see every report, including pending ones, with its location, photo and name if you gave them.',
          'The community can see a report only after it is verified: its description, depth and road choices, optional name, photo and map location.',
          'A photo is stored with a web link. Anyone who has the link can open it, so avoid faces, IDs, house numbers or other private details.',
          'Children should ask a parent or guardian before sending a report with a name or photo.',
        ],
      ),
      const PrivacySection(
        'Outside services that handle data for AGOS',
        bullets: [
          'Supabase — hosts the AGOS database and photo storage, and creates your anonymous ID.',
          'Google Firebase — delivers push notifications (Cloud Messaging) and, if you allow, collects crash reports (Crashlytics).',
          'OSRM public routing service (router.project-osrm.org) — receives your position and the chosen evacuation center only when you ask for walking directions.',
          'OpenStreetMap, Esri (satellite) and OpenTopoMap (terrain) — send map pictures; they can see your IP address and which map area you view.',
          'Weather data — the AGOS server fetches forecasts for the barangay from Open-Meteo. Your location is not sent for this.',
        ],
        outro: 'These providers have their own privacy policies. We share with them only what is needed for the feature to work.',
      ),
      const PrivacySection(
        'How long we keep it',
        intro: 'We keep information only as long as needed for flood warning and response and for the barangay\'s flood records.',
        bullets: [
          'Your anonymous ID and notification token are kept while AGOS is in use on your phone.',
          'Reports are kept as flood records after review. You can withdraw a report yourself while it is still pending.',
          'You can ask us to delete your information sooner (see "Your rights").',
        ],
      ),
      const PrivacySection(
        'Keeping it safe',
        intro: 'Data travels between AGOS and our servers over encrypted (HTTPS) connections, and access to reports is limited to authorized officials and the AGOS team. '
            'No system is perfectly secure. If a breach affects you, we will tell you and the National Privacy Commission as the law requires.',
      ),
      const PrivacySection(
        'Your rights',
        intro: 'Under the Data Privacy Act you have the right to:',
        bullets: [
          'be informed about how your data is used (this notice);',
          'access the personal information we hold about you;',
          'correct information that is wrong;',
          'object to, or ask us to block or delete, your information;',
          'withdraw your consent at any time, without affecting what was done before;',
          'receive your information in a common format, and claim damages if you were harmed by misuse.',
        ],
        outro: 'To use these rights, contact us (below) and include your Device ID — you can copy it from this screen. '
            'If you are not satisfied with our answer, you may complain to the National Privacy Commission at privacy.gov.ph.',
      ),
      const PrivacySection(
        'Changing your choices',
        bullets: [
          'Flood alerts and community updates: Settings → Notifications.',
          'Crash reports: switch below, or Settings → Privacy & support.',
          'Location: your phone\'s app permissions. AGOS still works without it.',
          'Withdraw consent: button below. AGOS stops sending alerts to this phone and asks you again next time it opens.',
        ],
      ),
      const PrivacySection(
        'Changes to this notice',
        intro: 'If what AGOS does with your information changes in a way that matters, we will update this notice and ask for your consent again. '
            'The date at the bottom shows the latest version.',
      ),
    ];

/// The address privacy requests go to, or empty if none is configured yet.
String get privacyContactEmail =>
    kPrivacyContactEmail.isNotEmpty ? kPrivacyContactEmail : kFeedbackEmail;

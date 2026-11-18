// help_screen.dart
//
// AGOS Help Center: searchable answers about every part of the app, a live
// "Check my setup" panel that finds the usual reasons alerts / maps / reports
// don't work, a glossary, and a way to copy support info.
//
// All wording lives in data/help_content.dart. Open it from anywhere with
// HelpScreen.open(context) (or HelpScreen.open(context, topicId: 'map') to
// jump straight to one topic).
import 'dart:io' show Platform;
import 'package:firebase_messaging/firebase_messaging.dart' show AuthorizationStatus;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_links.dart';
import '../data/help_content.dart';
import '../main.dart';
import '../services/app_navigation.dart';
import '../services/app_settings.dart';
import '../services/connectivity_service.dart';
import '../services/flood_status_service.dart';
import '../services/notification_service.dart';
import '../services/offline_cache.dart' show agoLabel;
import '../services/pending_reports_service.dart';
import 'alert_screen.dart';
import 'emergency_screen.dart';
import 'privacy_notice_screen.dart';
import 'report_incident_screen.dart';
import 'settings_screen.dart';

// ── Navigation helper ───────────────────────────────────────────────────────
/// Takes the person where a help answer points. Tabs live in MainShell, so we
/// ask it to switch and close everything on top of it; other screens are
/// pushed on top of the Help Center so Back returns here.
void runHelpAction(BuildContext context, HelpAction action) {
  void tab(int i) {
    AppNavigation.goToTab(i);
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void push(Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  switch (action) {
    case HelpAction.dashboard:
      tab(AppNavigation.tabDashboard);
    case HelpAction.floodMap:
      tab(AppNavigation.tabFloodMap);
    case HelpAction.rainfall:
      tab(AppNavigation.tabRainfall);
    case HelpAction.evacuation:
      tab(AppNavigation.tabEvacuation);
    case HelpAction.reports:
      tab(AppNavigation.tabReports);
    case HelpAction.reportFlood:
      push(const ReportIncidentScreen());
    case HelpAction.alerts:
      push(const AlertScreen());
    case HelpAction.emergency:
      push(const EmergencyScreen());
    case HelpAction.settings:
      push(const SettingsScreen());
    case HelpAction.privacy:
      push(const PrivacyNoticeScreen());
  }
}

PreferredSizeWidget _appBar(String title) => AppBar(
      backgroundColor: AppColors.bgDark,
      elevation: 0,
      iconTheme: IconThemeData(color: AppColors.textPri),
      title: Text(title,
          style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800)),
    );

// ═════════════════════════════════════════════════════════════════════════
// Help Center home
// ═════════════════════════════════════════════════════════════════════════
class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  /// Opens the Help Center. With [topicId] it opens that topic directly
  /// (the Help Center home is still one Back press away).
  static void open(BuildContext context, {String? topicId}) {
    final nav = Navigator.of(context);
    nav.push(MaterialPageRoute(builder: (_) => const HelpScreen()));
    if (topicId != null) {
      final topic = kHelpTopics.where((t) => t.id == topicId);
      if (topic.isNotEmpty) {
        nav.push(MaterialPageRoute(builder: (_) => HelpTopicScreen(topic: topic.first)));
      }
    }
  }

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  String _version = '';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) setState(() => _version = '${info.version} (${info.buildNumber})');
    } catch (_) {}
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _open(Uri uri) async {
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _snack("Couldn't open that on this phone.");
    } catch (_) {
      if (mounted) _snack("Couldn't open that on this phone.");
    }
  }

  // ── Support info ──────────────────────────────────────────────────────
  String? get _deviceId {
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  Future<String> _supportInfo() async {
    final conn = ConnectivityService.instance;
    final flood = context.read<FloodStatusService>(); // before any await
    String notif = 'unknown';
    try {
      notif = (await NotificationService.instance.permissionStatus()).name;
    } catch (_) {}
    String os = '';
    try {
      os = '${Platform.operatingSystem} ${Platform.operatingSystemVersion}';
    } catch (_) {}
    return [
      'AGOS ${_version.isEmpty ? '' : 'v$_version'}'.trim(),
      if (os.isNotEmpty) 'Phone: $os',
      'Online: ${conn.isOnline ? 'yes' : 'no'}',
      'Notifications: $notif',
      'Flood data: ${flood.lastUpdated == null ? 'none yet' : '${flood.isFromCache ? 'saved' : 'live'}, ${agoLabel(flood.lastUpdated!)}'}',
      if (_deviceId != null) 'Device ID: $_deviceId',
    ].join('\n');
  }

  Future<void> _copySupportInfo() async {
    final info = await _supportInfo();
    await Clipboard.setData(ClipboardData(text: info));
    if (mounted) _snack('Support info copied.');
  }

  Future<void> _emailFeedback() async {
    final info = await _supportInfo();
    final subject = Uri.encodeComponent('AGOS help request${_version.isEmpty ? '' : ' (v$_version)'}');
    final body = Uri.encodeComponent('Describe the problem here:\n\n\n---\n$info');
    await _open(Uri.parse('mailto:$kFeedbackEmail?subject=$subject&body=$body'));
  }

  // ── Search ────────────────────────────────────────────────────────────
  List<({HelpFaq faq, HelpTopic topic})> _search(String raw) {
    final tokens = raw
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((t) => t.length > 1)
        .toList();
    if (tokens.isEmpty) return const [];
    final hits = <({HelpFaq faq, HelpTopic topic, int score})>[];
    for (final topic in kHelpTopics) {
      for (final faq in topic.faqs) {
        final q = faq.question.toLowerCase();
        final hay = '$q ${faq.answer.toLowerCase()} ${faq.keywords.toLowerCase()} ${topic.title.toLowerCase()}';
        if (!tokens.every(hay.contains)) continue;
        // Question matches rank above answer-only matches.
        final score = tokens.where(q.contains).length * 2 +
            tokens.where(faq.keywords.toLowerCase().contains).length;
        hits.add((faq: faq, topic: topic, score: score));
      }
    }
    hits.sort((a, b) => b.score.compareTo(a.score));
    return [for (final h in hits) (faq: h.faq, topic: h.topic)];
  }

  @override
  Widget build(BuildContext context) {
    final searching = _query.trim().isNotEmpty;
    final results = searching ? _search(_query) : const <({HelpFaq faq, HelpTopic topic})>[];

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: _appBar('Help Center'),
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusScope.of(context).unfocus(),
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              _SearchField(
                controller: _searchCtrl,
                onChanged: (v) => setState(() => _query = v),
                onClear: () => setState(() {
                  _searchCtrl.clear();
                  _query = '';
                }),
              ),
              const SizedBox(height: 14),
              if (searching) ...[
                _SectionLabel(results.isEmpty
                    ? 'NO RESULTS'
                    : '${results.length} RESULT${results.length == 1 ? '' : 'S'}'),
                if (results.isEmpty) _NoResults(query: _query.trim()),
                for (final r in results) FaqTile(faq: r.faq, topicLabel: r.topic.title),
              ] else ...[
                const _EmergencyCard(),
                const _SectionLabel('CHECK MY SETUP'),
                const _SetupCheckCard(),
                const _SectionLabel('BROWSE TOPICS'),
                _TopicList(),
                const _SectionLabel('COMMON QUESTIONS'),
                for (final t in kHelpTopics)
                  for (final f in t.faqs)
                    if (f.popular) FaqTile(faq: f, topicLabel: t.title),
                const _SectionLabel('GLOSSARY'),
                const _GlossaryCard(),
                const _SectionLabel('STILL NEED HELP?'),
                _Panel(children: [
                  Text(
                    'If you or someone near you is in danger, don\'t wait for an answer here — '
                    'call 911 or COMCEN from the Emergency screen.',
                    style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.45),
                  ),
                  const _Divider(),
                  _LinkRow(
                    icon: Icons.copy_rounded,
                    title: 'Copy support info',
                    subtitle: 'App version, phone and connection details to paste into a message.',
                    onTap: _copySupportInfo,
                  ),
                  if (kFeedbackEmail.isNotEmpty) ...[
                    const _Divider(),
                    _LinkRow(
                      icon: Icons.mail_outline_rounded,
                      title: 'Email us',
                      subtitle: 'Opens your email app with support info filled in.',
                      onTap: _emailFeedback,
                    ),
                  ],
                  const _Divider(),
                  _LinkRow(
                    icon: Icons.shield_outlined,
                    title: 'Privacy notice',
                    subtitle: 'What AGOS collects and your choices.',
                    onTap: () => runHelpAction(context, HelpAction.privacy),
                  ),
                  if (kPrivacyPolicyUrl.isNotEmpty) ...[
                    const _Divider(),
                    _LinkRow(
                      icon: Icons.policy_outlined,
                      title: 'Privacy policy',
                      subtitle: 'How AGOS handles your information.',
                      onTap: () => _open(Uri.parse(kPrivacyPolicyUrl)),
                    ),
                  ],
                ]),
              ],
              Padding(
                padding: const EdgeInsets.only(top: 22),
                child: Center(
                  child: Text(
                    _version.isEmpty ? 'AGOS' : 'AGOS · v$_version',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11.5),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
// One topic's questions
// ═════════════════════════════════════════════════════════════════════════
class HelpTopicScreen extends StatelessWidget {
  final HelpTopic topic;
  const HelpTopicScreen({super.key, required this.topic});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.bgDeep,
        appBar: _appBar(topic.title),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 14),
                child: Row(children: [
                  _IconBadge(icon: topic.icon),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(topic.blurb,
                        style: TextStyle(color: AppColors.textSec, fontSize: 13, height: 1.35)),
                  ),
                ]),
              ),
              for (final f in topic.faqs) FaqTile(faq: f),
              const SizedBox(height: 8),
              Center(
                child: TextButton.icon(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back_rounded, size: 16),
                  label: const Text('All help topics'),
                ),
              ),
            ],
          ),
        ),
      );
}

// ═════════════════════════════════════════════════════════════════════════
// Pieces
// ═════════════════════════════════════════════════════════════════════════

/// One expandable question. Public so other screens could reuse it.
class FaqTile extends StatelessWidget {
  final HelpFaq faq;
  final String? topicLabel;
  const FaqTile({super.key, required this.faq, this.topicLabel});

  @override
  Widget build(BuildContext context) {
    final action = faq.action;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.bgBorder),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          expandedAlignment: Alignment.centerLeft,
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          iconColor: AppColors.accent,
          collapsedIconColor: AppColors.textMuted,
          shape: const Border(),
          collapsedShape: const Border(),
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (topicLabel != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(topicLabel!.toUpperCase(),
                    style: TextStyle(
                        color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
              ),
            Text(faq.question,
                style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700, height: 1.3)),
          ]),
          children: [
            Text(faq.answer,
                style: TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.5)),
            if (action != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => runHelpAction(context, action),
                icon: Icon(action.icon, size: 16),
                label: Text(action.label),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  const _SearchField({required this.controller, required this.onChanged, required this.onClear});

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        style: TextStyle(color: AppColors.textPri, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'Search help, e.g. "notifications" or "report"',
          hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 13.5),
          prefixIcon: Icon(Icons.search_rounded, color: AppColors.textMuted),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  icon: Icon(Icons.close_rounded, color: AppColors.textMuted),
                  onPressed: onClear,
                ),
          filled: true,
          fillColor: AppColors.bgCard,
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: AppColors.bgBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: AppColors.bgBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: AppColors.accent, width: 1.5),
          ),
        ),
      );
}

class _NoResults extends StatelessWidget {
  final String query;
  const _NoResults({required this.query});

  @override
  Widget build(BuildContext context) => _Panel(children: [
        Text('Nothing matched "$query".',
            style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Try fewer or different words, or clear the search to browse every topic.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4)),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => runHelpAction(context, HelpAction.emergency),
          icon: const Icon(Icons.phone_in_talk_rounded, size: 16),
          label: const Text('Emergency numbers'),
        ),
      ]);
}

class _EmergencyCard extends StatelessWidget {
  const _EmergencyCard();

  @override
  Widget build(BuildContext context) {
    final red = AppColors.ink(AppColors.red);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.red.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.red.withValues(alpha: 0.45)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.crisis_alert_rounded, color: red, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Flooding or in danger right now?',
                style: TextStyle(color: red, fontSize: 14, fontWeight: FontWeight.w800)),
          ),
        ]),
        const SizedBox(height: 4),
        Text('Don\'t search for answers — call for help first.',
            style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.4)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: '911')),
              icon: const Icon(Icons.call_rounded, size: 16),
              label: const Text('Call 911', style: TextStyle(fontWeight: FontWeight.w800)),
              style: FilledButton.styleFrom(backgroundColor: AppColors.red, foregroundColor: Colors.white),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => runHelpAction(context, HelpAction.emergency),
              icon: const Icon(Icons.phone_in_talk_rounded, size: 16),
              label: const Text('All numbers'),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () {
              Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => HelpTopicScreen(topic: kHelpTopics.firstWhere((t) => t.id == 'safety')),
              ));
            },
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 30)),
            child: const Text('Read the flood safety guide'),
          ),
        ),
      ]),
    );
  }
}

class _TopicList extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.bgBorder),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          for (var i = 0; i < kHelpTopics.length; i++) ...[
            if (i > 0) Divider(height: 1, color: AppColors.bgBorder),
            InkWell(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => HelpTopicScreen(topic: kHelpTopics[i])),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                child: Row(children: [
                  _IconBadge(icon: kHelpTopics[i].icon),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(kHelpTopics[i].title,
                          style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
                      Text(kHelpTopics[i].blurb,
                          style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                    ]),
                  ),
                  Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                ]),
              ),
            ),
          ],
        ]),
      );
}

class _GlossaryCard extends StatelessWidget {
  const _GlossaryCard();

  @override
  Widget build(BuildContext context) => _Panel(children: [
        for (var i = 0; i < kGlossary.length; i++) ...[
          if (i > 0) const _Divider(),
          Text(kGlossary[i].term,
              style: TextStyle(color: AppColors.textPri, fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(kGlossary[i].meaning,
              style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.45)),
        ],
      ]);
}

// ═════════════════════════════════════════════════════════════════════════
// "Check my setup" — live status of everything AGOS needs to work well,
// each with a one-tap fix.
// ═════════════════════════════════════════════════════════════════════════
enum _Health { ok, warn, bad }

class _SetupCheckCard extends StatefulWidget {
  const _SetupCheckCard();

  @override
  State<_SetupCheckCard> createState() => _SetupCheckCardState();
}

class _SetupCheckCardState extends State<_SetupCheckCard> with WidgetsBindingObserver {
  AuthorizationStatus? _notif;
  LocationPermission? _locPerm;
  bool _locServiceOn = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Someone fixing a permission in the phone's settings comes straight back
  // to this screen — re-check so the card reflects it.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    AuthorizationStatus? notif;
    LocationPermission? perm;
    var serviceOn = true;
    try {
      notif = await NotificationService.instance.permissionStatus();
    } catch (_) {}
    try {
      perm = await Geolocator.checkPermission();
      serviceOn = await Geolocator.isLocationServiceEnabled();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _notif = notif;
      _locPerm = perm;
      _locServiceOn = serviceOn;
    });
  }

  Future<void> _run(Future<void> Function() job) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await job();
    } catch (_) {}
    await _load();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final conn = context.watch<ConnectivityService>();
    final flood = context.watch<FloodStatusService>();
    final settings = context.watch<AppSettings>();
    final outbox = context.watch<PendingReportsService>();

    final notifOk = _notif == AuthorizationStatus.authorized || _notif == AuthorizationStatus.provisional;
    final locOk = _locServiceOn &&
        (_locPerm == LocationPermission.whileInUse || _locPerm == LocationPermission.always);

    final rows = <_CheckRow>[
      _CheckRow(
        health: conn.isOffline ? _Health.warn : _Health.ok,
        title: conn.isOffline ? 'You\'re offline' : 'Connected',
        detail: conn.isOffline
            ? 'AGOS is showing saved data. Live updates and new alerts need a connection.'
            : 'Live updates are working.',
        fixLabel: conn.isOffline ? 'Retry' : null,
        onFix: () => _run(() => ConnectivityService.instance.checkNow()),
      ),
      _CheckRow(
        health: flood.lastUpdated == null
            ? _Health.warn
            : (flood.isFromCache ? _Health.warn : _Health.ok),
        title: 'Flood status',
        detail: flood.lastUpdated == null
            ? 'No reading saved yet.'
            : '${flood.isFromCache ? 'Showing a saved reading from' : 'Updated'} ${agoLabel(flood.lastUpdated!)}.',
        fixLabel: 'Refresh',
        onFix: () => _run(() => flood.refresh()),
      ),
      _CheckRow(
        health: notifOk
            ? _Health.ok
            : (_notif == AuthorizationStatus.denied ? _Health.bad : _Health.warn),
        title: 'Notifications',
        detail: notifOk
            ? 'Allowed on this phone.'
            : _notif == AuthorizationStatus.denied
                ? 'Blocked. Allow AGOS in your phone\'s system settings to receive flood warnings.'
                : 'Not turned on yet — you won\'t get flood warnings.',
        fixLabel: notifOk ? null : (_notif == AuthorizationStatus.denied ? 'Check again' : 'Turn on'),
        onFix: () => _run(() async {
          await NotificationService.instance.requestPermission();
        }),
      ),
      _CheckRow(
        health: settings.floodAlerts ? _Health.ok : _Health.warn,
        title: 'Flood alerts',
        detail: settings.floodAlerts
            ? 'On — you\'ll be warned when the risk rises.'
            : 'Off in Settings — you won\'t get push warnings.',
        fixLabel: settings.floodAlerts ? null : 'Turn on',
        onFix: () => _run(() => context.read<AppSettings>().setFloodAlerts(true)),
      ),
      _CheckRow(
        health: locOk ? _Health.ok : _Health.warn,
        title: 'Location',
        detail: locOk
            ? 'Allowed — "Find nearest" and directions will work.'
            : !_locServiceOn
                ? 'Location is switched off on this phone. Needed for nearest center, directions and pinning reports.'
                : _locPerm == LocationPermission.deniedForever
                    ? 'Blocked for AGOS. Allow it in your phone\'s app settings.'
                    : 'Not allowed yet. Only used for nearest center, directions and reports.',
        fixLabel: locOk
            ? null
            : !_locServiceOn
                ? 'Location settings'
                : _locPerm == LocationPermission.deniedForever
                    ? 'App settings'
                    : 'Allow',
        onFix: () => _run(() async {
          if (!_locServiceOn) {
            await Geolocator.openLocationSettings();
          } else if (_locPerm == LocationPermission.deniedForever) {
            await Geolocator.openAppSettings();
          } else {
            await Geolocator.requestPermission();
          }
        }),
      ),
      _CheckRow(
        health: outbox.count == 0 ? _Health.ok : _Health.warn,
        title: 'Reports',
        detail: outbox.count == 0
            ? 'Nothing waiting to send.'
            : '${outbox.count} report${outbox.count == 1 ? '' : 's'} waiting to send.',
        fixLabel: outbox.count == 0 || outbox.isFlushing ? null : 'Send now',
        onFix: () => _run(() async {
          await context.read<PendingReportsService>().flush();
        }),
      ),
    ];

    final problems = rows.where((r) => r.health != _Health.ok).length;
    final worst = rows.any((r) => r.health == _Health.bad)
        ? _Health.bad
        : (problems > 0 ? _Health.warn : _Health.ok);

    return _Panel(children: [
      Row(children: [
        Icon(worst.icon, color: worst.color, size: 22),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(problems == 0 ? 'All good' : '$problems thing${problems == 1 ? '' : 's'} to check',
                style: TextStyle(color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800)),
            Text('Live status of what AGOS needs to alert you.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
          ]),
        ),
        if (_busy)
          const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
        else
          IconButton(
            tooltip: 'Check again',
            onPressed: () => _run(() async {}),
            icon: Icon(Icons.refresh_rounded, color: AppColors.textSec),
          ),
      ]),
      for (final r in rows) ...[
        const _Divider(),
        r,
      ],
    ]);
  }
}

extension on _Health {
  IconData get icon => switch (this) {
        _Health.ok => Icons.check_circle_rounded,
        _Health.warn => Icons.error_outline_rounded,
        _Health.bad => Icons.cancel_rounded,
      };
  Color get color => switch (this) {
        _Health.ok => AppColors.greenText,
        _Health.warn => AppColors.ink(AppColors.orange),
        _Health.bad => AppColors.redText,
      };
}

class _CheckRow extends StatelessWidget {
  final _Health health;
  final String title, detail;
  final String? fixLabel;
  final VoidCallback onFix;
  const _CheckRow({
    required this.health,
    required this.title,
    required this.detail,
    required this.fixLabel,
    required this.onFix,
  });

  @override
  Widget build(BuildContext context) => Semantics(
        label: '$title: ${health == _Health.ok ? 'OK' : 'needs attention'}. $detail',
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(health.icon, color: health.color, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
              Text(detail, style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.4)),
            ]),
          ),
          if (fixLabel != null) TextButton(onPressed: onFix, child: Text(fixLabel!)),
        ]),
      );
}

// ── Small building blocks ───────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 0, 8),
        child: Text(text,
            style: TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
      );
}

class _Panel extends StatelessWidget {
  final List<Widget> children;
  const _Panel({required this.children});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1, color: AppColors.bgBorder));
}

class _IconBadge extends StatelessWidget {
  final IconData icon;
  const _IconBadge({required this.icon});
  @override
  Widget build(BuildContext context) => Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.accent, size: 18),
      );
}

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  const _LinkRow({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Row(children: [
          Icon(icon, color: AppColors.textSec, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
              Text(subtitle, style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
            ]),
          ),
          Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
        ]),
      );
}

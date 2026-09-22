// settings_screen.dart
//
// AGOS's dedicated settings screen (replaces the old device/about bottom
// sheet in main_shell.dart). Sections: connection, notifications, display,
// data & refresh, offline data, about.
import 'package:firebase_messaging/firebase_messaging.dart' show AuthorizationStatus;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_links.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/accessibility_settings.dart';
import '../services/app_settings.dart';
import '../services/connectivity_service.dart';
import '../services/crash_reporting.dart';
import '../services/flood_status_service.dart';
import '../services/notification_service.dart';
import '../services/offline_cache.dart';
import '../services/pending_reports_service.dart';
import '../services/tile_cache.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _cacheBytes = 0;
  AuthorizationStatus? _permission;
  String _version = '';

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final bytes = await OfflineCache.totalBytes();
    final perm = await NotificationService.instance.permissionStatus();
    String version = '';
    try {
      final info = await PackageInfo.fromPlatform();
      version = '${info.version} (${info.buildNumber})';
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _cacheBytes = bytes;
      _permission = perm;
      _version = version;
    });
  }

  String? get _deviceId {
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<bool> _confirm(String title, String body, String action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgMid,
        title: Text(title, style: const TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700)),
        content: Text(body, style: const TextStyle(color: AppColors.textSec, fontSize: 13, height: 1.4)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action, style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _requestNotifications() async {
    final s = await NotificationService.instance.requestPermission();
    if (mounted) setState(() => _permission = s);
  }

  Future<void> _sendTestAlert() async {
    final status = await NotificationService.instance.permissionStatus();
    if (status != AuthorizationStatus.authorized && status != AuthorizationStatus.provisional) {
      if (mounted) _snack('Notifications are off for AGOS — turn them on first.');
      return;
    }
    await NotificationService.instance.showTestAlert();
    if (mounted) _snack('Test alert sent. Check your notifications.');
  }

  Future<void> _open(Uri uri) async {
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _snack("Couldn't open that link on this phone.");
    } catch (_) {
      if (mounted) _snack("Couldn't open that link on this phone.");
    }
  }

  Future<void> _setFloodAlerts(bool v) async {
    if (!v) {
      final ok = await _confirm(
        'Turn off flood alerts?',
        "You won't get push warnings when the flood risk rises. "
            'You can still check the app manually.',
        'Turn off',
      );
      if (!ok || !mounted) return;
    }
    await context.read<AppSettings>().setFloodAlerts(v);
  }

  String _intervalLabel(Duration d) {
    if (d == Duration.zero) return 'Manual';
    if (d.inSeconds < 60) return '${d.inSeconds}s';
    return '${d.inMinutes} min';
  }

  @override
  Widget build(BuildContext context) {
    final conn = context.watch<ConnectivityService>();
    final flood = context.watch<FloodStatusService>();
    final settings = context.watch<AppSettings>();
    final a11y = context.watch<AccessibilitySettings>();
    final outbox = context.watch<PendingReportsService>();
    final maps = context.watch<OfflineMapService>();

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDark,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.textPri),
        title: const Text('Settings',
            style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // ── Connection ───────────────────────────────────────────
            _Card(children: [
              Row(children: [
                Icon(conn.isOffline ? Icons.cloud_off_rounded : Icons.cloud_done_rounded,
                    color: conn.isOffline ? AppColors.orange : AppColors.green, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(conn.isOffline ? 'Offline — showing saved data' : 'Online',
                        style: const TextStyle(color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800)),
                    Text(
                      flood.lastUpdated == null
                          ? 'No flood reading saved yet'
                          : 'Flood status ${flood.isFromCache ? 'saved' : 'updated'} ${agoLabel(flood.lastUpdated!)}',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ]),
                ),
                TextButton(
                  onPressed: () async {
                    await ConnectivityService.instance.checkNow();
                    await flood.refresh();
                    _loadInfo();
                  },
                  child: const Text('Refresh'),
                ),
              ]),
            ]),

            // ── Notifications ────────────────────────────────────────
            const _SectionTitle('NOTIFICATIONS'),
            _Card(children: [
              _SwitchRow(
                icon: Icons.notifications_active_rounded,
                title: 'Flood alerts',
                subtitle: 'Push warnings when the flood risk changes',
                value: settings.floodAlerts,
                onChanged: _setFloodAlerts,
              ),
              const _Divider(),
              _SwitchRow(
                icon: Icons.campaign_rounded,
                title: 'Community report updates',
                subtitle: 'When an official verifies a resident report',
                value: settings.communityUpdates,
                onChanged: (v) => context.read<AppSettings>().setCommunityUpdates(v),
              ),
              if (settings.hasPendingSync) ...[
                const SizedBox(height: 6),
                const Text('Will apply as soon as you\'re back online.',
                    style: TextStyle(color: AppColors.orange, fontSize: 11.5)),
              ],
              if (_permission == AuthorizationStatus.denied ||
                  _permission == AuthorizationStatus.notDetermined) ...[
                const _Divider(),
                _ActionRow(
                  icon: Icons.notifications_off_rounded,
                  title: _permission == AuthorizationStatus.denied
                      ? 'Notifications are blocked'
                      : 'Notifications are off',
                  subtitle: _permission == AuthorizationStatus.denied
                      ? "Enable them for AGOS in your phone's system settings to receive alerts."
                      : 'Turn them on to get flood warnings on this phone.',
                  actionLabel: _permission == AuthorizationStatus.denied ? 'Check again' : 'Turn on',
                  onTap: _requestNotifications,
                ),
              ],
              const _Divider(),
              _ActionRow(
                icon: Icons.volume_up_rounded,
                title: 'Send test alert',
                subtitle: 'Check that alerts appear and are audible on this phone.',
                actionLabel: 'Test',
                onTap: _sendTestAlert,
              ),
            ]),

            // ── Display ──────────────────────────────────────────────
            const _SectionTitle('DISPLAY'),
            _Card(children: [
              Row(children: [
                const Icon(Icons.text_fields_rounded, color: AppColors.textSec, size: 18),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text('Text size',
                      style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
                ),
                Text('${(a11y.textScale * 100).round()}%',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
              ]),
              Slider(
                value: a11y.textScale,
                min: AccessibilitySettings.minScale,
                max: AccessibilitySettings.maxScale,
                divisions: 3,
                onChanged: (v) => context.read<AccessibilitySettings>().setTextScale(v),
              ),
              _SwitchRow(
                icon: Icons.contrast_rounded,
                title: 'High contrast',
                subtitle: 'Boosts contrast across the whole app',
                value: a11y.highContrast,
                onChanged: (v) => context.read<AccessibilitySettings>().setHighContrast(v),
              ),
            ]),

            // ── Data & refresh ───────────────────────────────────────
            const _SectionTitle('DATA & REFRESH'),
            _Card(children: [
              const Text('Auto-refresh flood status',
                  style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('Longer intervals save battery and mobile data. Polling always pauses while the app is in the background.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.4)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  for (final d in FloodStatusService.intervalChoices)
                    ChoiceChip(
                      label: Text(_intervalLabel(d)),
                      selected: flood.refreshInterval == d,
                      onSelected: (_) => flood.setRefreshInterval(d),
                    ),
                ],
              ),
              const _Divider(),
              _ActionRow(
                icon: Icons.restart_alt_rounded,
                title: 'Reset settings',
                subtitle: 'Restores defaults. Saved offline data is kept.',
                actionLabel: 'Reset',
                onTap: () async {
                  final ok = await _confirm('Reset settings?', 'Text size, contrast, refresh interval and notification choices go back to their defaults.', 'Reset');
                  if (!ok || !mounted) return;
                  final a = context.read<AccessibilitySettings>();
                  final s = context.read<AppSettings>();
                  await a.setTextScale(1.0);
                  await a.setHighContrast(false);
                  await flood.setRefreshInterval(FloodStatusService.defaultInterval);
                  await s.setFloodAlerts(true);
                  await s.setCommunityUpdates(true);
                },
              ),
            ]),

            // ── Offline data ─────────────────────────────────────────
            const _SectionTitle('OFFLINE DATA'),
            _Card(children: [
              _ActionRow(
                icon: Icons.outbox_rounded,
                title: outbox.count == 0
                    ? 'No reports waiting'
                    : '${outbox.count} report${outbox.count == 1 ? '' : 's'} waiting to send',
                subtitle: outbox.count == 0
                    ? 'Reports filed offline are sent automatically when you reconnect.'
                    : 'They\'ll send automatically when you\'re back online.',
                actionLabel: outbox.count == 0 ? null : (outbox.isFlushing ? 'Sending…' : 'Send now'),
                onTap: outbox.count == 0 || outbox.isFlushing
                    ? null
                    : () async {
                        final n = await context.read<PendingReportsService>().flush();
                        if (mounted) _snack(n > 0 ? 'Sent $n report${n == 1 ? '' : 's'}.' : "Couldn't send yet — will retry when online.");
                      },
              ),
              const _Divider(),
              _MapDownloadRow(maps: maps, onChanged: _loadInfo),
              const _Divider(),
              _ActionRow(
                icon: Icons.storage_rounded,
                title: 'Saved forecasts & alerts',
                subtitle: formatBytes(_cacheBytes),
                actionLabel: _cacheBytes == 0 ? null : 'Clear',
                onTap: _cacheBytes == 0
                    ? null
                    : () async {
                        final ok = await _confirm('Clear saved data?',
                            'Forecasts, alerts and reports saved for offline use will be removed. They\'ll re-save the next time you\'re online.',
                            'Clear');
                        if (!ok) return;
                        await OfflineCache.clear();
                        _loadInfo();
                      },
              ),
            ]),

            // ── How to read alerts ───────────────────────────────────
            const _SectionTitle('HOW TO READ ALERTS'),
            _Card(children: [
              const _AlertLevelRow(
                type: AlertLevelType.normal,
                text: 'No significant flooding risk. Nothing to do, but keep an eye on updates.',
              ),
              const _Divider(),
              const _AlertLevelRow(
                type: AlertLevelType.advisory,
                text: 'Water levels are rising and minor flooding is possible in low-lying areas. If you live near a waterway, stay alert.',
              ),
              const _Divider(),
              const _AlertLevelRow(
                type: AlertLevelType.warning,
                text: 'Significant flooding is expected. Get ready to evacuate, secure your valuables, and check the Evacuation tab for your nearest center.',
              ),
              const _Divider(),
              const _AlertLevelRow(
                type: AlertLevelType.critical,
                text: 'Severe flooding is imminent, with immediate danger to life and property. Evacuate now and go to a designated evacuation center.',
              ),
              const SizedBox(height: 12),
              const Text(
                'Alerts are AGOS predictions. Always follow instructions from barangay officials.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.45, fontStyle: FontStyle.italic),
              ),
            ]),

            // ── About AGOS ───────────────────────────────────────────
            const _SectionTitle('ABOUT AGOS'),
            _Card(children: [
              _InfoRow(
                title: 'Flood status',
                body: flood.refreshInterval == Duration.zero
                    ? "Predicted by AGOS's flood model from live rainfall and wind readings. Updates when you refresh manually."
                    : "Predicted by AGOS's flood model from live rainfall and wind readings. Checked every ${_intervalWords(flood.refreshInterval)} (change this under Data & refresh).",
              ),
              const _Divider(),
              const _InfoRow(
                title: 'Forecasts',
                body: 'Hourly and daily rainfall and flood outlooks, based on Open-Meteo weather data.',
              ),
              const _Divider(),
              const _InfoRow(
                title: 'Rainfall categories',
                body: "Light to Torrential, following PAGASA's rainfall intensity classification.",
              ),
              const _Divider(),
              const _InfoRow(
                title: 'Maps',
                body: '© OpenStreetMap contributors. Satellite imagery by Esri, terrain by OpenTopoMap.',
              ),
              const _Divider(),
              const _InfoRow(
                title: 'Privacy',
                body: "No account needed. AGOS uses an anonymous ID and your phone's notification token to send alerts. "
                    'Your location stays on your phone unless you submit a report or ask for walking directions, '
                    'which sends your position to a public routing service.',
              ),
            ]),
            // ── Privacy & support ────────────────────────────────────
            const _SectionTitle('PRIVACY & SUPPORT'),
            _Card(children: [
              _SwitchRow(
                icon: Icons.bug_report_outlined,
                title: 'Send crash reports',
                subtitle: 'Anonymous technical details when the app crashes, so problems can be fixed.',
                value: CrashReporting.enabled,
                onChanged: (v) async {
                  await CrashReporting.setEnabled(v);
                  if (mounted) setState(() {});
                },
              ),
              if (kPrivacyPolicyUrl.isNotEmpty) ...[
                const _Divider(),
                _ActionRow(
                  icon: Icons.policy_outlined,
                  title: 'Privacy policy',
                  subtitle: 'How AGOS handles your information.',
                  actionLabel: 'Open',
                  onTap: () => _open(Uri.parse(kPrivacyPolicyUrl)),
                ),
              ],
              if (kFeedbackEmail.isNotEmpty) ...[
                const _Divider(),
                _ActionRow(
                  icon: Icons.mail_outline_rounded,
                  title: 'Send feedback',
                  subtitle: 'Report a problem or suggest an improvement.',
                  actionLabel: 'Email',
                  onTap: () => _open(Uri.parse(
                      'mailto:$kFeedbackEmail?subject=${Uri.encodeComponent('AGOS feedback${_version.isEmpty ? '' : ' (v$_version)'}')}')),
                ),
              ],
            ]),
            // Version line. Long-press copies the device ID (for support) —
            // deliberately not shown as its own row, since residents never
            // need it.
            GestureDetector(
              onLongPress: _deviceId == null
                  ? null
                  : () {
                      Clipboard.setData(ClipboardData(text: _deviceId!));
                      _snack('Device ID copied.');
                    },
              child: Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Center(
                  child: Text(
                    _version.isEmpty ? 'AGOS' : 'AGOS · v$_version',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _intervalWords(Duration d) {
    if (d.inSeconds < 60) return '${d.inSeconds} seconds';
    final m = d.inMinutes;
    return m == 1 ? '1 minute' : '$m minutes';
  }
}

// One alert level: its own icon + color, name, and what it means.
class _AlertLevelRow extends StatelessWidget {
  final AlertLevelType type;
  final String text;
  const _AlertLevelRow({required this.type, required this.text});

  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(type.icon, color: type.color, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(type.label,
                style: TextStyle(color: type.color, fontSize: 13.5, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(text, style: const TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.4)),
          ]),
        ),
      ]);
}

class _InfoRow extends StatelessWidget {
  final String title, body;
  const _InfoRow({required this.title, required this.body});

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(body, style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.45)),
      ]);
}

// ── Offline map row ───────────────────────────────────────────────────────────
class _MapDownloadRow extends StatelessWidget {
  final OfflineMapService maps;
  final VoidCallback onChanged;
  const _MapDownloadRow({required this.maps, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final subtitle = maps.isDownloading
        ? 'Downloading… ${maps.done}/${maps.total}'
        : maps.hasDownload
            ? 'Saved ${maps.savedTiles} tiles (${formatBytes(maps.savedBytes ?? 0)}) · ${agoLabel(maps.savedAt!)}'
            : 'Street map of Brgy. Triangulo (~2 MB). Satellite and terrain layers save as you browse them.';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _ActionRow(
        icon: Icons.map_rounded,
        title: 'Offline map',
        subtitle: subtitle,
        actionLabel: maps.isDownloading ? 'Cancel' : (maps.hasDownload ? 'Update' : 'Download'),
        onTap: maps.isDownloading
            ? maps.cancel
            : () async {
                await maps.download();
                onChanged();
              },
      ),
      if (maps.isDownloading) ...[
        const SizedBox(height: 8),
        LinearProgressIndicator(value: maps.progress, color: AppColors.accent, backgroundColor: AppColors.bgBorder),
      ],
      if (maps.message != null) ...[
        const SizedBox(height: 6),
        Text(maps.message!, style: const TextStyle(color: AppColors.orange, fontSize: 11.5)),
      ],
      if (maps.hasDownload && !maps.isDownloading)
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () async {
              await maps.deleteAll();
              onChanged();
            },
            child: const Text('Delete saved maps', style: TextStyle(color: AppColors.red, fontSize: 12)),
          ),
        ),
    ]);
  }
}

// ── Small building blocks ─────────────────────────────────────────────────────
class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 0, 8),
        child: Text(text,
            style: const TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
      );
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});
  @override
  Widget build(BuildContext context) => Container(
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
      const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1, color: AppColors.bgBorder));
}

class _SwitchRow extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SwitchRow({
    required this.icon, required this.title, required this.subtitle,
    required this.value, required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(icon, color: AppColors.textSec, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
            Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
          ]),
        ),
        Switch(value: value, onChanged: onChanged),
      ]);
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final String? actionLabel;
  final VoidCallback? onTap;
  const _ActionRow({
    required this.icon, required this.title, required this.subtitle,
    this.actionLabel, this.onTap,
  });
  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(icon, color: AppColors.textSec, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
            Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
          ]),
        ),
        if (actionLabel != null)
          TextButton(onPressed: onTap, child: Text(actionLabel!)),
      ]);
}

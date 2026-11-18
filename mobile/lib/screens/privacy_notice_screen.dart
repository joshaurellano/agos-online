// privacy_notice_screen.dart
//
// Two screens:
//
//  * PrivacyConsentScreen — shown by SplashScreen on first launch (and again
//    whenever PrivacyConsent.noticeVersion goes up), BEFORE Firebase /
//    Supabase / push registration start. Short summary, a link to the full
//    notice, one optional switch (crash reports, off until chosen), and
//    "I agree and continue". Declining closes the app. The emergency numbers
//    stay reachable without agreeing — they are static and collect nothing.
//
//  * PrivacyNoticeScreen — the full notice (Settings → Privacy notice, and
//    from the Help Center). When opened from inside the app it also shows
//    the person's choices: crash reports, copy Device ID, withdraw consent.
//
// Wording: data/privacy_content.dart.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/privacy_content.dart';
import '../main.dart';
import '../services/app_settings.dart';
import '../services/crash_reporting.dart';
import '../services/offline_cache.dart';
import '../services/privacy_consent.dart';
import 'emergency_screen.dart';

// ═════════════════════════════════════════════════════════════════════════
// Consent (first launch)
// ═════════════════════════════════════════════════════════════════════════
class PrivacyConsentScreen extends StatefulWidget {
  const PrivacyConsentScreen({super.key});

  @override
  State<PrivacyConsentScreen> createState() => _PrivacyConsentScreenState();
}

class _PrivacyConsentScreenState extends State<PrivacyConsentScreen> {
  // Optional and off until the person turns it on — it is not needed for
  // AGOS to work, so it isn't bundled into "I agree".
  bool _crashReports = false;
  bool _busy = false;

  Future<void> _agree() async {
    if (_busy) return;
    setState(() => _busy = true);
    await CrashReporting.rememberChoice(_crashReports);
    await PrivacyConsent.record();
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _decline() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgMid,
        title: Text("Can't continue without agreeing",
            style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700)),
        content: Text(
          'AGOS needs an anonymous ID and your notification token to send flood alerts. '
          "If you don't agree, AGOS will close and collect nothing. "
          'The emergency numbers are still available from this screen.',
          style: TextStyle(color: AppColors.textSec, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Go back')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Close AGOS', style: TextStyle(color: AppColors.ink(AppColors.red), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (leave == true) await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) => PopScope(
        // Back must not skip the choice.
        canPop: false,
        child: Scaffold(
          backgroundColor: AppColors.bgDeep,
          body: SafeArea(
            child: Column(children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(22, 24, 22, 12),
                  children: [
                    Row(children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.shield_outlined, color: AppColors.accent, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text('Your privacy',
                            style: TextStyle(
                                color: AppColors.textPri, fontSize: 24, fontWeight: FontWeight.w800)),
                      ),
                    ]),
                    const SizedBox(height: 10),
                    Text('Before you start, here is what AGOS does with your information.',
                        style: TextStyle(color: AppColors.textSec, fontSize: 14, height: 1.45)),
                    const SizedBox(height: 18),
                    for (final s in kPrivacySummary) _Bullet(s),
                    const SizedBox(height: 6),
                    TextButton.icon(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => const PrivacyNoticeScreen(manage: false),
                      )),
                      icon: const Icon(Icons.article_outlined, size: 18),
                      label: const Text('Read the full privacy notice'),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                      decoration: BoxDecoration(
                        color: AppColors.bgCard,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.bgBorder),
                      ),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Help fix crashes (optional)',
                                style: TextStyle(
                                    color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
                            Text('Send anonymous technical details if the app crashes. Off unless you turn it on.',
                                style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
                          ]),
                        ),
                        Switch(value: _crashReports, onChanged: (v) => setState(() => _crashReports = v)),
                      ]),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 8, 22, 12),
                child: Column(children: [
                  Text(
                    'By tapping "I agree and continue" you consent to AGOS using your information as described in the privacy notice.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.4),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: FilledButton(
                      onPressed: _busy ? null : _agree,
                      style: FilledButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('I agree and continue',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    TextButton(
                      onPressed: _busy ? null : _decline,
                      child: Text("I don't agree", style: TextStyle(color: AppColors.textSec)),
                    ),
                    TextButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const EmergencyScreen()),
                      ),
                      icon: Icon(Icons.phone_in_talk_rounded, size: 16, color: AppColors.ink(AppColors.red)),
                      label: Text('Emergency numbers', style: TextStyle(color: AppColors.ink(AppColors.red))),
                    ),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      );
}

// ═════════════════════════════════════════════════════════════════════════
// Full notice
// ═════════════════════════════════════════════════════════════════════════
class PrivacyNoticeScreen extends StatefulWidget {
  /// True when opened from inside the app (Settings, Help): shows the
  /// person's choices. False on the consent screen, where Firebase and
  /// Supabase aren't running yet and nothing can be changed.
  final bool manage;
  const PrivacyNoticeScreen({super.key, this.manage = true});

  @override
  State<PrivacyNoticeScreen> createState() => _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends State<PrivacyNoticeScreen> {
  DateTime? _consentAt;

  @override
  void initState() {
    super.initState();
    if (widget.manage) {
      PrivacyConsent.givenAt().then((d) {
        if (mounted) setState(() => _consentAt = d);
      });
    }
  }

  String? get _deviceId {
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _emailUs() async {
    final id = _deviceId;
    final subject = Uri.encodeComponent('AGOS privacy request');
    final body = Uri.encodeComponent(
        'Tell us what you need (access, correction, deletion, a question):\n\n\n---\n'
        '${id == null ? '' : 'Device ID: $id'}');
    try {
      await launchUrl(Uri.parse('mailto:$privacyContactEmail?subject=$subject&body=$body'),
          mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) _snack("Couldn't open an email app.");
    }
  }

  Future<void> _withdraw() async {
    // Grab everything from context BEFORE awaiting.
    final settings = context.read<AppSettings>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgMid,
        title: Text('Withdraw consent?',
            style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700)),
        content: Text(
          'AGOS will stop flood alerts and community updates on this phone, turn off crash reports, '
          'clear saved forecasts and alerts, and close. You will be asked again next time you open it.\n\n'
          'Information already on our servers (your anonymous ID and any reports you sent) stays there '
          'until you ask us to delete it — use "Email us" on this screen.',
          style: TextStyle(color: AppColors.textSec, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Withdraw', style: TextStyle(color: AppColors.ink(AppColors.red), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await settings.setFloodAlerts(false);
      await settings.setCommunityUpdates(false);
    } catch (_) {}
    await CrashReporting.setEnabled(false);
    try {
      await OfflineCache.clear();
    } catch (_) {}
    await PrivacyConsent.withdraw();
    await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final sections = buildPrivacySections();
    final hasContact = privacyContactEmail.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDark,
        elevation: 0,
        iconTheme: IconThemeData(color: AppColors.textPri),
        title: Text('Privacy notice',
            style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            _Card(children: [
              Text('The short version',
                  style: TextStyle(color: AppColors.textPri, fontSize: 15, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              for (final s in kPrivacySummary) _Bullet(s, small: true),
            ]),
            for (final s in sections) ...[
              const SizedBox(height: 12),
              _Card(children: [
                Text(s.title,
                    style: TextStyle(color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w800)),
                if (s.intro != null) ...[
                  const SizedBox(height: 6),
                  Text(s.intro!, style: TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.5)),
                ],
                if (s.bullets.isNotEmpty) const SizedBox(height: 8),
                for (final b in s.bullets) _Bullet(b, small: true),
                if (s.outro != null) ...[
                  const SizedBox(height: 4),
                  Text(s.outro!, style: TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.5)),
                ],
              ]),
            ],

            // ── Choices (only from inside the app) ─────────────────────
            if (widget.manage) ...[
              const SizedBox(height: 12),
              _Card(children: [
                Text('Your choices',
                    style: TextStyle(color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w800)),
                if (_consentAt != null) ...[
                  const SizedBox(height: 4),
                  Text('You agreed on ${_fmtDate(_consentAt!)}.',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                ],
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Send crash reports',
                          style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
                      Text('Anonymous technical details when the app crashes.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                    ]),
                  ),
                  Switch(
                    value: CrashReporting.enabled,
                    onChanged: (v) async {
                      await CrashReporting.setEnabled(v);
                      if (mounted) setState(() {});
                    },
                  ),
                ]),
                if (_deviceId != null) ...[
                  const _Rule(),
                  _RowButton(
                    icon: Icons.copy_rounded,
                    title: 'Copy my Device ID',
                    subtitle: 'Include it when you ask to see or delete your information.',
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: _deviceId!));
                      _snack('Device ID copied.');
                    },
                  ),
                ],
                if (hasContact) ...[
                  const _Rule(),
                  _RowButton(
                    icon: Icons.mail_outline_rounded,
                    title: 'Email us',
                    subtitle: 'Ask to access, correct or delete your information, or ask a question.',
                    onTap: _emailUs,
                  ),
                ],
                const _Rule(),
                _RowButton(
                  icon: Icons.undo_rounded,
                  title: 'Withdraw consent',
                  subtitle: 'Stops alerts on this phone and closes AGOS.',
                  danger: true,
                  onTap: _withdraw,
                ),
              ]),
            ],

            const SizedBox(height: 12),
            _Card(children: [
              Text('Contact',
                  style: TextStyle(color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                hasContact
                    ? 'Questions or requests about your information: $privacyContactEmail. '
                        'You may also complain to the National Privacy Commission (privacy.gov.ph).'
                    : 'Questions or requests about your information: ask at the Barangay Triangulo hall. '
                        'You may also complain to the National Privacy Commission (privacy.gov.ph).',
                style: TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.5),
              ),
            ]),
            Padding(
              padding: const EdgeInsets.only(top: 18),
              child: Center(
                child: Text('Version ${PrivacyConsent.noticeVersion} · Updated $kPrivacyNoticeUpdated',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _fmtDate(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ── Small building blocks ───────────────────────────────────────────────────
class _Bullet extends StatelessWidget {
  final String text;
  final bool small;
  const _Bullet(this.text, {this.small = false});

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: small ? 7 : 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: EdgeInsets.only(top: small ? 6 : 7),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    color: AppColors.textSec, fontSize: small ? 12.5 : 14, height: small ? 1.45 : 1.5)),
          ),
        ]),
      );
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});
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

class _Rule extends StatelessWidget {
  const _Rule();
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1, color: AppColors.bgBorder));
}

class _RowButton extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  final bool danger;
  const _RowButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = danger ? AppColors.ink(AppColors.red) : AppColors.textPri;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Row(children: [
        Icon(icon, color: danger ? c : AppColors.textSec, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(color: c, fontSize: 13.5, fontWeight: FontWeight.w700)),
            Text(subtitle, style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
          ]),
        ),
        Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
      ]),
    );
  }
}

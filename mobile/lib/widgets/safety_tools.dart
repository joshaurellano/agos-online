// safety_tools.dart
//
// Two things people reach for in a flood:
//
//  1. "I'm safe" — one tap opens the phone's share sheet with a ready message
//     (current flood level for the barangay). The sheet lists the messaging
//     app, Viber, WhatsApp, email, ... and the resident chooses the app and who
//     to send it to, straight from their own contacts. (A direct sms: link was
//     tried first, but many Android messaging apps ignore it when no phone
//     number is given — the share sheet is what works everywhere.)
//     Nothing is stored by AGOS:
//     no contact list to lose on uninstall, no account, no server, no
//     contacts permission, and no third parties' phone numbers held by the app.
//     (An earlier version kept a saved contact list on the device; it vanished
//     with the app's data, which is worse than not having one.)
//  2. Emergency hotlines — tap to call.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, HapticFeedback;
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';

class Hotline {
  final String name;
  final String number;
  final String note;
  const Hotline(this.name, this.number, this.note);
}

/// NOTE(thesis): add the numbers your barangay / city DRRMO actually
/// answers (Brgy. Triangulo hall, Naga City DRRMO, nearest fire station).
/// Only add numbers you've verified — a wrong number here is worse than none.
const kEmergencyHotlines = <Hotline>[
  Hotline('National Emergency', '911', 'Police, fire, medical'),
  Hotline('Philippine Red Cross', '143', 'Rescue and relief'),
];

class SafetyToolsCard extends StatefulWidget {
  final String alertLabel; // "Advisory"
  final int? percent; // 32
  final String location; // "Brgy. Triangulo, Naga City"
  const SafetyToolsCard({
    super.key,
    required this.alertLabel,
    required this.percent,
    required this.location,
  });

  @override
  State<SafetyToolsCard> createState() => _SafetyToolsCardState();
}

class _SafetyToolsCardState extends State<SafetyToolsCard> {
  @override
  void initState() {
    super.initState();
    _forgetOldContacts();
  }

  // Earlier versions saved family numbers in plain text on the device. That
  // feature is gone, so remove what it left behind rather than keep other
  // people's phone numbers around with no way to see or delete them.
  Future<void> _forgetOldContacts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('agos_family_contacts_v1');
    } catch (_) {}
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  String get _message {
    final pct = widget.percent;
    final status = pct == null
        ? ''
        : ' Flood risk in ${widget.location} is ${widget.alertLabel.toLowerCase()} ($pct%).';
    return "I'm safe.$status — sent from AGOS";
  }

  // Share sheet: lets the resident use whatever app their family actually
  // answers on (Viber, WhatsApp, Telegram, email, ...) — useful when mobile
  // load is out but there is Wi-Fi or data. Note: sharing text into Facebook
  // Messenger is restricted by Meta and may not appear or may not work; SMS
  // and the other apps are the dependable routes.
  Future<void> _send() async {
    HapticFeedback.mediumImpact();
    try {
      await SharePlus.instance.share(
        ShareParams(text: _message, subject: "I'm safe"),
      );
    } catch (_) {
      _toast("Couldn't open the share menu.");
    }
  }

  Future<void> _copy() async {
    HapticFeedback.selectionClick();
    await Clipboard.setData(ClipboardData(text: _message));
    _toast('Message copied. Paste it in any app.');
  }

  Future<void> _call(Hotline h) async {
    HapticFeedback.selectionClick();
    try {
      final ok = await launchUrl(Uri(scheme: 'tel', path: h.number));
      if (!ok) _toast("Couldn't open the dialer. Number: ${h.number}");
    } catch (_) {
      _toast("Couldn't open the dialer. Number: ${h.number}");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // ── I'm safe ─────────────────────────────────────────────────────
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.family_restroom_rounded, color: AppColors.accent, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Let family know you\u2019re okay',
                  style: TextStyle(
                      color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800)),
            ),
          ]),
          const SizedBox(height: 10),
          // Preview: shows exactly what will be sent.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
            decoration: BoxDecoration(
              color: AppColors.bgMid,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.bgBorder),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Text(_message,
                    style: TextStyle(
                        color: AppColors.textPri, fontSize: 12, height: 1.4, fontStyle: FontStyle.italic)),
              ),
              IconButton(
                tooltip: 'Copy message',
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.copy_rounded, size: 17, color: AppColors.textMuted),
                onPressed: _copy,
              ),
            ]),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _send,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text("I'm safe — send update",
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text('Choose Messages, Viber, or any app — and who gets it.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
          ),
        ]),
      ),
      const SizedBox(height: 12),

      // ── Hotlines ─────────────────────────────────────────────────────
      Row(children: [
        for (var i = 0; i < kEmergencyHotlines.length; i++) ...[
          Expanded(child: _hotlineTile(kEmergencyHotlines[i])),
          if (i != kEmergencyHotlines.length - 1) const SizedBox(width: 8),
        ],
      ]),
    ]);
  }

  Widget _hotlineTile(Hotline h) => InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _call(h),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.errorBg.withValues(alpha: AppColors.isLight ? 1 : 0.55),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.red.withValues(alpha: 0.35)),
          ),
          child: Row(children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.red.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.call_rounded, color: AppColors.redText, size: 17),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(h.number,
                    style: TextStyle(
                        color: AppColors.redText, fontSize: 17, fontWeight: FontWeight.w900)),
                Text(h.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: AppColors.textSec, fontSize: 10.5)),
              ]),
            ),
          ]),
        ),
      );
}

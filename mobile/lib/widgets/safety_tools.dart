// safety_tools.dart
//
// Two things people reach for in a flood that the app didn't offer:
//
//  1. "I'm safe" — one tap sends an SMS to the family contacts the resident
//     saved, with the current flood level for their barangay. (Modeled on the
//     Red Cross Emergency app's "Family Safe" / one-touch "I'm safe"
//     message.) It uses the phone's own SMS app via the sms: link, so it
//     needs no server, no account and works on a weak signal.
//  2. Emergency hotlines — tap to call.
//
// Contacts are stored only on the device (shared_preferences).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
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

class _Contact {
  final String name;
  final String number;
  const _Contact(this.name, this.number);
  String encode() => '${name.replaceAll('|', ' ')}|$number';
  static _Contact? decode(String s) {
    final i = s.indexOf('|');
    if (i <= 0) return null;
    return _Contact(s.substring(0, i), s.substring(i + 1));
  }
}

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
  static const _prefsKey = 'agos_family_contacts_v1';
  final List<_Contact> _contacts = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_prefsKey) ?? const [];
      _contacts
        ..clear()
        ..addAll(raw.map(_Contact.decode).whereType<_Contact>());
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<void> _save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_prefsKey, _contacts.map((c) => c.encode()).toList());
    } catch (_) {}
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _addContact() async {
    // The dialog owns its text controllers and disposes them itself once it is
    // truly gone. (Disposing them here, right after showDialog returns, broke
    // the app: the dialog is still animating out at that moment and its
    // TextFields rebuilt with already-disposed controllers.)
    final result = await showDialog<_Contact>(
      context: context,
      builder: (_) => const _AddContactDialog(),
    );
    if (result == null || !mounted) return;
    setState(() => _contacts.add(result));
    await _save();
  }

  String get _message {
    final pct = widget.percent;
    final status = pct == null
        ? ''
        : ' Flood risk in ${widget.location} is ${widget.alertLabel.toLowerCase()} ($pct%).';
    return "I'm safe.$status — sent from AGOS";
  }

  Future<void> _sendSafe() async {
    HapticFeedback.mediumImpact();
    if (_contacts.isEmpty) {
      await _addContact();
      if (_contacts.isEmpty) return;
    }
    final numbers = _contacts.map((c) => c.number).join(',');
    // Build the query by hand: Uri(queryParameters:) encodes spaces as '+',
    // which several SMS apps then show literally.
    final uri = Uri.parse('sms:$numbers?body=${Uri.encodeComponent(_message)}');
    try {
      final ok = await launchUrl(uri);
      if (!ok) _toast("Couldn't open your messaging app.");
    } catch (_) {
      _toast("Couldn't open your messaging app.");
    }
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
          const SizedBox(height: 4),
          Text('One tap texts your saved contacts with the current flood level.',
              style: TextStyle(color: AppColors.textSec, fontSize: 11.5, height: 1.35)),
          const SizedBox(height: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (var i = 0; i < _contacts.length; i++)
              InputChip(
                label: Text(_contacts[i].name, style: const TextStyle(fontSize: 12)),
                onDeleted: () async {
                  setState(() => _contacts.removeAt(i));
                  await _save();
                },
                visualDensity: VisualDensity.compact,
              ),
            ActionChip(
              avatar: Icon(Icons.add_rounded, size: 16, color: AppColors.accent),
              label: const Text('Add contact', style: TextStyle(fontSize: 12)),
              onPressed: _addContact,
              visualDensity: VisualDensity.compact,
            ),
          ]),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _sendSafe,
              icon: const Icon(Icons.sms_rounded, size: 18),
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


// ── Add-contact dialog ────────────────────────────────────────────────────────
class _AddContactDialog extends StatefulWidget {
  const _AddContactDialog();

  @override
  State<_AddContactDialog> createState() => _AddContactDialogState();
}

class _AddContactDialogState extends State<_AddContactDialog> {
  final _nameCtl = TextEditingController();
  final _numCtl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _nameCtl.dispose();
    _numCtl.dispose();
    super.dispose();
  }

  void _save() {
    final digits = _numCtl.text.replaceAll(RegExp(r'[^0-9+]'), '');
    final name = _nameCtl.text.trim();
    if (digits.length < 7) {
      setState(() => _error = 'Enter a valid mobile number.');
      return;
    }
    Navigator.pop(context, _Contact(name.isEmpty ? digits : name, digits));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.bgMid,
      title: Text('Add family contact',
          style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 16)),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(
          controller: _nameCtl,
          textCapitalization: TextCapitalization.words,
          style: TextStyle(color: AppColors.textPri),
          decoration: const InputDecoration(labelText: 'Name'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _numCtl,
          keyboardType: TextInputType.phone,
          style: TextStyle(color: AppColors.textPri),
          decoration: InputDecoration(
            labelText: 'Mobile number',
            hintText: '09XX XXX XXXX',
            errorText: _error,
          ),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
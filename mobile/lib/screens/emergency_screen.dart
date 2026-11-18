// emergency_screen.dart
//
// Emergency numbers for Brgy. Triangulo / Naga City: COMCEN hotlines, fire
// protection, hospitals and the barangay's Punong Barangay. Every number has
// a call button and a copy button. Works offline (the list is built in).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, HapticFeedback;
import 'package:url_launcher/url_launcher.dart';
import '../data/emergency_contacts.dart';
import '../main.dart';

class EmergencyScreen extends StatefulWidget {
  const EmergencyScreen({super.key});

  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  String _filter = 'all'; // 'all' or a category id

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 2)));
  }

  Future<void> _call(EmergencyNumber n) async {
    HapticFeedback.selectionClick();
    try {
      final ok = await launchUrl(Uri(scheme: 'tel', path: n.dial));
      if (!ok) _toast("Couldn't open the dialer. Number: ${n.display}");
    } catch (_) {
      _toast("Couldn't open the dialer. Number: ${n.display}");
    }
  }

  Future<void> _copy(EmergencyNumber n) async {
    HapticFeedback.selectionClick();
    await Clipboard.setData(ClipboardData(text: n.display));
    _toast('Copied ${n.display}');
  }

  Future<void> _openSite() async {
    try {
      final ok = await launchUrl(Uri.parse(kNagaOfficialSiteUrl), mode: LaunchMode.externalApplication);
      if (!ok) _toast("Couldn't open the website on this phone.");
    } catch (_) {
      _toast("Couldn't open the website on this phone.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final cats = _filter == 'all'
        ? kEmergencyCategories
        : kEmergencyCategories.where((c) => c.id == _filter).toList();

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDark,
        foregroundColor: AppColors.textPri,
        elevation: 0,
        title: const Text('Emergency Numbers',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          _comcenCard(),
          const SizedBox(height: 14),
          _nationalRow(),
          const SizedBox(height: 14),
          _filterChips(),
          for (final c in cats) ...[
            _sectionTitle('${c.emoji}  ${c.title}'),
            for (final e in c.entries) _entryCard(e),
          ],
          const SizedBox(height: 18),
          _sourceNote(),
        ],
      ),
    );
  }

  // ── COMCEN ───────────────────────────────────────────────────────────
  Widget _comcenCard() => Container(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
        decoration: BoxDecoration(
          color: AppColors.errorBg.withValues(alpha: AppColors.isLight ? 1 : 0.55),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.red.withValues(alpha: 0.35)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.support_agent_rounded, color: AppColors.redText, size: 22),
            const SizedBox(width: 8),
            Expanded(
              child: Text('COMCEN Hotlines',
                  style: TextStyle(
                      color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800)),
            ),
          ]),
          const SizedBox(height: 4),
          Text('The Central Communications Center is available for emergency assistance.',
              style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.4)),
          const SizedBox(height: 6),
          for (var i = 0; i < kComcenNumbers.length; i++) ...[
            if (i > 0) _hairline(),
            _numberRow(kComcenNumbers[i], bigger: true),
          ],
        ]),
      );

  // ── 911 / PNP / Red Cross ────────────────────────────────────────────
  Widget _nationalRow() => Row(children: [
        for (var i = 0; i < kNationalNumbers.length; i++) ...[
          Expanded(child: _nationalTile(kNationalNumbers[i])),
          if (i != kNationalNumbers.length - 1) const SizedBox(width: 8),
        ],
      ]);

  Widget _nationalTile(EmergencyEntry e) {
    final n = e.numbers.first;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _call(n),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(children: [
          Text(n.display,
              style: TextStyle(
                  color: AppColors.redText, fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(e.name.replaceAll(' Hotline', '').replaceAll('National Emergency', 'National'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: AppColors.textSec, fontSize: 10.5)),
        ]),
      ),
    );
  }

  // ── Filter chips ─────────────────────────────────────────────────────
  Widget _filterChips() {
    final items = <MapEntry<String, String>>[
      const MapEntry('all', 'All'),
      for (final c in kEmergencyCategories) MapEntry(c.id, c.title),
    ];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final it = items[i];
          final selected = _filter == it.key;
          return ChoiceChip(
            label: Text(it.value),
            selected: selected,
            onSelected: (_) => setState(() => _filter = it.key),
            showCheckmark: false,
            labelStyle: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : AppColors.textSec,
            ),
            selectedColor: AppColors.red,
            backgroundColor: AppColors.surface,
            side: BorderSide(color: selected ? AppColors.red : AppColors.bgBorder),
          );
        },
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 22, 0, 10),
        child: Text(text,
            style: TextStyle(
                color: AppColors.textPri, fontSize: 18, fontWeight: FontWeight.w800)),
      );

  // ── One organisation (hospital, fire station, ...) ───────────────────
  Widget _entryCard(EmergencyEntry e) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(e.name,
              style: TextStyle(
                  color: AppColors.textPri, fontSize: 15, fontWeight: FontWeight.w800)),
          if (e.person != null) ...[
            const SizedBox(height: 3),
            Text(e.person!, style: TextStyle(color: AppColors.textSec, fontSize: 12)),
          ],
          if (e.address != null) ...[
            const SizedBox(height: 3),
            Text(e.address!,
                style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
          ],
          const SizedBox(height: 6),
          for (var i = 0; i < e.numbers.length; i++) ...[
            if (i > 0) _hairline(),
            _numberRow(e.numbers[i]),
          ],
        ]),
      );

  Widget _hairline() => Divider(height: 1, thickness: 1, color: AppColors.divider);

  // ── A number with copy + call buttons ────────────────────────────────
  Widget _numberRow(EmergencyNumber n, {bool bigger = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n.display,
                  style: TextStyle(
                      color: AppColors.textPri,
                      fontSize: bigger ? 16 : 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2)),
              if (n.hint != null)
                Text(n.hint!, style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
            ]),
          ),
          _roundButton(
            icon: Icons.copy_rounded,
            color: AppColors.textSec,
            bg: AppColors.bgCard2,
            tooltip: 'Copy number',
            onTap: () => _copy(n),
          ),
          const SizedBox(width: 8),
          _roundButton(
            icon: Icons.call_rounded,
            color: Colors.white,
            bg: AppColors.red,
            tooltip: 'Call ${n.display}',
            onTap: () => _call(n),
          ),
        ]),
      );

  Widget _roundButton({
    required IconData icon,
    required Color color,
    required Color bg,
    required String tooltip,
    required VoidCallback onTap,
  }) =>
      Tooltip(
        message: tooltip,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Icon(icon, color: color, size: 18),
          ),
        ),
      );

  // ── Source note ──────────────────────────────────────────────────────
  Widget _sourceNote() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surfaceDim,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(kEmergencySourceNote,
              style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.45)),
          const SizedBox(height: 6),
          InkWell(
            onTap: _openSite,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.open_in_new_rounded, size: 15, color: AppColors.accent),
                const SizedBox(width: 6),
                Text(kNagaOfficialSiteLabel,
                    style: TextStyle(
                        color: AppColors.accent,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        decoration: TextDecoration.underline,
                        decorationColor: AppColors.accent)),
              ]),
            ),
          ),
        ]),
      );
}

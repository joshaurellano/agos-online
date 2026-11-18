// emergency_screen.dart
//
// Emergency numbers for Brgy. Triangulo / Naga City.
//
// Layout:
//  1. A red "Need help now?" banner with two big actions: Call 911 and
//     Call COMCEN (COMCEN opens a picker so people choose the number that
//     matches their network).
//  2. A search box (name, place or number).
//  3. Naga COMCEN and national lines as tap-to-call number chips.
//  4. Fire protection, hospitals and the Punong Barangay as collapsible
//     sections. Inside, every number is a chip: tap to call, hold to copy.
//
// Works offline — the list is built into the app.
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
  final _search = TextEditingController();
  final Set<String> _open = {}; // ids of expanded sections
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  // ── Actions ──────────────────────────────────────────────────────────
  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 2)));
  }

  Future<void> _call(EmergencyNumber n) async {
    HapticFeedback.mediumImpact();
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

  // Bottom sheet: pick which COMCEN number to call (by network).
  void _pickComcen() {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.bgBorder,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Call COMCEN',
                style: TextStyle(color: AppColors.textPri, fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text('Pick the number that matches your network or landline.',
                style: TextStyle(color: AppColors.textSec, fontSize: 12.5)),
            const SizedBox(height: 12),
            for (final n in kComcenNumbers)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.red.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.call_rounded, color: AppColors.redText, size: 19),
                ),
                title: Text(n.display,
                    style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 16)),
                subtitle: n.hint == null
                    ? null
                    : Text(n.hint!, style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _call(n);
                },
                onLongPress: () {
                  Navigator.of(ctx).pop();
                  _copy(n);
                },
              ),
          ]),
        ),
      ),
    );
  }

  // ── Search ───────────────────────────────────────────────────────────
  bool _numberMatches(EmergencyNumber n, String q) {
    final digits = q.replaceAll(RegExp(r'[^0-9]'), '');
    return n.display.toLowerCase().contains(q) ||
        (n.hint ?? '').toLowerCase().contains(q) ||
        (digits.length >= 2 && n.dial.replaceAll('+', '').contains(digits));
  }

  bool _entryMatches(EmergencyEntry e, String q) =>
      e.name.toLowerCase().contains(q) ||
      (e.address ?? '').toLowerCase().contains(q) ||
      (e.person ?? '').toLowerCase().contains(q) ||
      e.numbers.any((n) => _numberMatches(n, q));

  // ── Section styling ──────────────────────────────────────────────────
  Color _accentFor(String id) => switch (id) {
        'fire' => AppColors.orange,
        'hospital' => AppColors.accent,
        'barangay' => AppColors.green,
        _ => AppColors.violet,
      };

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final searching = q.isNotEmpty;

    final comcen = searching
        ? kComcenNumbers.where((n) => _numberMatches(n, q) || 'comcen'.contains(q)).toList()
        : kComcenNumbers;
    final national = searching
        ? kNationalNumbers.where((e) => _entryMatches(e, q)).toList()
        : kNationalNumbers;
    final cats = <EmergencyCategory>[
      for (final c in kEmergencyCategories)
        if (!searching)
          c
        else if (c.title.toLowerCase().contains(q))
          c
        else if (c.entries.any((e) => _entryMatches(e, q)))
          EmergencyCategory(
            id: c.id,
            title: c.title,
            emoji: c.emoji,
            entries: c.entries.where((e) => _entryMatches(e, q)).toList(),
          ),
    ];
    final nothing = searching && comcen.isEmpty && national.isEmpty && cats.isEmpty;

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDeep,
        foregroundColor: AppColors.textPri,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Get help', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
          children: [
            if (!searching) ...[
              _helpBanner(),
              const SizedBox(height: 14),
            ],
            _searchField(),
            const SizedBox(height: 18),
            if (comcen.isNotEmpty) ...[
              _groupHeader('📞', 'Naga COMCEN', 'Central Communications Center · 24/7', AppColors.red),
              const SizedBox(height: 10),
              _chipWrap(comcen, AppColors.red),
              const SizedBox(height: 22),
            ],
            if (national.isNotEmpty) ...[
              _groupHeader('🇵🇭', 'National lines', null, AppColors.violet),
              const SizedBox(height: 10),
              Wrap(spacing: 10, runSpacing: 10, children: [
                for (final e in national)
                  _NumberChip(
                    number: e.numbers.first,
                    caption: e.name.replaceAll(' Hotline', ''),
                    color: AppColors.violet,
                    onCall: () => _call(e.numbers.first),
                    onCopy: () => _copy(e.numbers.first),
                  ),
              ]),
              const SizedBox(height: 22),
            ],
            for (final c in cats) _section(c, searching),
            if (nothing) _emptyState(),
            const SizedBox(height: 10),
            _sourceNote(),
          ],
        ),
      ),
    );
  }

  // ── Pieces ───────────────────────────────────────────────────────────
  Widget _helpBanner() => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFEF4444), Color(0xFFB91C1C)],
          ),
          boxShadow: [
            BoxShadow(color: AppColors.red.withValues(alpha: 0.3), blurRadius: 22, offset: const Offset(0, 10)),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Need help now?',
              style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('Stay calm, say where you are, and what happened.',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5, height: 1.4)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: _bannerButton(
                icon: Icons.sos_rounded,
                title: 'Call 911',
                subtitle: 'National',
                filled: true,
                onTap: () => _call(const EmergencyNumber('911')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _bannerButton(
                icon: Icons.support_agent_rounded,
                title: 'Call COMCEN',
                subtitle: 'Naga City',
                filled: false,
                onTap: _pickComcen,
              ),
            ),
          ]),
        ]),
      );

  Widget _bannerButton({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool filled,
    required VoidCallback onTap,
  }) {
    final fg = filled ? const Color(0xFFB91C1C) : Colors.white;
    return Material(
      color: filled ? Colors.white : Colors.white.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 12),
          decoration: filled
              ? null
              : BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
                ),
          child: Row(children: [
            Icon(icon, color: fg, size: 26),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: fg, fontWeight: FontWeight.w900, fontSize: 14)),
                Text(subtitle,
                    style: TextStyle(color: fg.withValues(alpha: 0.75), fontSize: 11)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _searchField() => TextField(
        controller: _search,
        onChanged: (v) => setState(() => _query = v),
        textInputAction: TextInputAction.search,
        style: TextStyle(color: AppColors.textPri, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'Search hospital, fire, number…',
          hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 14),
          prefixIcon: Icon(Icons.search_rounded, color: AppColors.textMuted),
          suffixIcon: _query.isEmpty
              ? null
              : IconButton(
                  icon: Icon(Icons.close_rounded, color: AppColors.textMuted),
                  onPressed: () {
                    _search.clear();
                    setState(() => _query = '');
                  },
                ),
          filled: true,
          fillColor: AppColors.surface,
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide(color: AppColors.bgBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide(color: AppColors.accent, width: 1.5),
          ),
        ),
      );

  Widget _groupHeader(String emoji, String title, String? sub, Color color) =>
      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800)),
            if (sub != null)
              Text(sub, style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
          ]),
        ),
      ]);

  Widget _chipWrap(List<EmergencyNumber> numbers, Color color) => Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final n in numbers)
            _NumberChip(
              number: n,
              caption: n.hint,
              color: color,
              onCall: () => _call(n),
              onCopy: () => _copy(n),
            ),
        ],
      );

  // ── Collapsible section ──────────────────────────────────────────────
  Widget _section(EmergencyCategory c, bool forceOpen) {
    final color = _accentFor(c.id);
    final open = forceOpen || _open.contains(c.id);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: open ? color.withValues(alpha: 0.5) : AppColors.bgBorder),
      ),
      child: Column(children: [
        InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: forceOpen
              ? null
              : () => setState(() {
                    open ? _open.remove(c.id) : _open.add(c.id);
                  }),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Text(c.emoji, style: const TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(c.title,
                      style: TextStyle(color: AppColors.textPri, fontSize: 15.5, fontWeight: FontWeight.w800)),
                  Text('${c.entries.length} ${c.entries.length == 1 ? 'contact' : 'contacts'}',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                ]),
              ),
              if (!forceOpen)
                AnimatedRotation(
                  turns: open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 220),
                  child: Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.textSec, size: 26),
                ),
            ]),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: open
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    for (var i = 0; i < c.entries.length; i++) ...[
                      Divider(height: 22, thickness: 1, color: AppColors.divider),
                      _entry(c.entries[i], color),
                    ],
                    const SizedBox(height: 10),
                    Text('Tap a number to call · hold to copy',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
                  ]),
                )
              : const SizedBox(width: double.infinity),
        ),
      ]),
    );
  }

  Widget _entry(EmergencyEntry e, Color color) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(e.name,
            style: TextStyle(color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w800, height: 1.3)),
        if (e.person != null) ...[
          const SizedBox(height: 3),
          Row(children: [
            Icon(Icons.person_rounded, size: 14, color: AppColors.textMuted),
            const SizedBox(width: 4),
            Expanded(child: Text(e.person!, style: TextStyle(color: AppColors.textSec, fontSize: 12))),
          ]),
        ],
        if (e.address != null) ...[
          const SizedBox(height: 4),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(Icons.place_rounded, size: 14, color: AppColors.textMuted),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: Text(e.address!,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, height: 1.35)),
            ),
          ]),
        ],
        const SizedBox(height: 10),
        _chipWrap(e.numbers, color),
      ]);

  Widget _emptyState() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 36),
        child: Column(children: [
          Icon(Icons.search_off_rounded, size: 40, color: AppColors.textMuted),
          const SizedBox(height: 8),
          Text('No contacts match "${_query.trim()}"',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSec, fontSize: 13.5)),
          const SizedBox(height: 4),
          Text('In an emergency, call 911 or COMCEN.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ]),
      );

  // ── Source note ──────────────────────────────────────────────────────
  Widget _sourceNote() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surfaceDim,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline_rounded, size: 16, color: AppColors.textMuted),
            const SizedBox(width: 8),
            Expanded(
              child: Text(kEmergencySourceNote,
                  style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.45)),
            ),
          ]),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 24),
            child: InkWell(
              onTap: _openSite,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(kNagaOfficialSiteLabel,
                    style: TextStyle(
                        color: AppColors.accent,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        decoration: TextDecoration.underline,
                        decorationColor: AppColors.accent)),
              ),
            ),
          ),
        ]),
      );
}

/// A tap-to-call number "chip": number on top, short caption underneath.
/// Hold to copy.
class _NumberChip extends StatelessWidget {
  final EmergencyNumber number;
  final String? caption;
  final Color color;
  final VoidCallback onCall;
  final VoidCallback onCopy;

  const _NumberChip({
    required this.number,
    required this.caption,
    required this.color,
    required this.onCall,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Call ${number.display}${caption == null ? '' : ', $caption'}',
      child: Material(
        color: color.withValues(alpha: AppColors.isLight ? 0.10 : 0.14),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onCall,
          onLongPress: onCopy,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 9, 14, 9),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: color.withValues(alpha: 0.35)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.call_rounded, size: 17, color: AppColors.ink(color)),
              const SizedBox(width: 8),
              Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(number.display,
                    style: TextStyle(
                        color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w800, letterSpacing: 0.2)),
                if (caption != null)
                  Text(caption!, style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

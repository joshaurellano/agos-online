// prepare_card.dart
//
// "Go-bag" checklist. The Dashboard already tells residents to "prepare an
// emergency go-bag" at Advisory level — but gave them nothing to act on.
// The Red Cross Emergency/Flood apps solved this with a "Make a plan"
// checklist; this is the AGOS version. Progress is saved on the device
// (shared_preferences), so ticking items off now means that when the alert
// level rises the resident already knows how ready they are.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:shared_preferences/shared_preferences.dart';
import '../main.dart';

class _BagItem {
  final String id;
  final IconData icon;
  final String label;
  final String hint;
  const _BagItem(this.id, this.icon, this.label, this.hint);
}

const _bagItems = <_BagItem>[
  _BagItem('water', Icons.water_drop_rounded, 'Drinking water', 'About 3 litres per person per day'),
  _BagItem('food', Icons.restaurant_rounded, 'Ready-to-eat food', 'Canned goods, biscuits, no cooking needed'),
  _BagItem('docs', Icons.folder_rounded, 'IDs & documents', 'In a waterproof bag or sealed plastic'),
  _BagItem('meds', Icons.medical_services_rounded, 'First aid & medicines', 'Include maintenance meds for 3 days'),
  _BagItem('light', Icons.flashlight_on_rounded, 'Flashlight & batteries', 'Do not rely on candles'),
  _BagItem('power', Icons.battery_charging_full_rounded, 'Power bank, phone charged', 'Charge it before the rain starts'),
  _BagItem('cash', Icons.payments_rounded, 'Cash in small bills', 'ATMs and e-wallets may be down'),
  _BagItem('clothes', Icons.checkroom_rounded, 'Extra clothes & raincoat', 'One change per person'),
  _BagItem('whistle', Icons.campaign_rounded, 'Whistle', 'To signal for help'),
  _BagItem('plan', Icons.group_rounded, 'Family meeting point agreed', 'Everyone knows where to go'),
];

class GoBagCard extends StatefulWidget {
  /// NORMAL / ADVISORY / WARNING / CRITICAL — changes the headline only.
  final String alertKey;
  final Color alertColor;
  const GoBagCard({super.key, required this.alertKey, required this.alertColor});

  @override
  State<GoBagCard> createState() => _GoBagCardState();
}

class _GoBagCardState extends State<GoBagCard> {
  static const _prefsKey = 'agos_gobag_v1';
  final Set<String> _done = {};
  bool _loaded = false;
  bool? _userExpanded; // null = follow the alert level

  bool get _urgent => widget.alertKey != 'NORMAL';
  bool get _expanded => _userExpanded ?? _urgent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _done.addAll(prefs.getStringList(_prefsKey) ?? const []);
    } catch (_) {
      // Storage unavailable — the checklist still works for this session.
    }
    if (mounted) setState(() => _loaded = true);
  }

  Future<void> _toggle(String id) async {
    HapticFeedback.selectionClick();
    setState(() => _done.contains(id) ? _done.remove(id) : _done.add(id));
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_prefsKey, _done.toList());
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final total = _bagItems.length;
    final count = _bagItems.where((i) => _done.contains(i.id)).length;
    final ready = count == total;
    final progress = total == 0 ? 0.0 : count / total;
    final tint = ready ? AppColors.green : (_urgent ? widget.alertColor : AppColors.accent);

    final title = ready
        ? 'Go-bag ready'
        : (_urgent ? 'Prepare your go-bag now' : 'Build your go-bag');

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _urgent && !ready ? tint.withValues(alpha: 0.5) : AppColors.bgBorder),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _userExpanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                SizedBox(
                  width: 44,
                  height: 44,
                  child: Stack(alignment: Alignment.center, children: [
                    CircularProgressIndicator(
                      value: _loaded ? progress : null,
                      strokeWidth: 4,
                      color: tint,
                      backgroundColor: AppColors.bgBorder,
                    ),
                    Icon(ready ? Icons.check_rounded : Icons.backpack_rounded, color: AppColors.ink(tint), size: 19),
                  ]),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title,
                        style: TextStyle(
                            color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text('$count of $total essentials packed',
                        style: TextStyle(color: AppColors.textSec, fontSize: 11.5)),
                  ]),
                ),
                AnimatedRotation(
                  turns: _expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.textSec),
                ),
              ]),
            ),
          ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 220),
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
              child: Column(children: [
                Divider(height: 1, color: AppColors.divider),
                for (final item in _bagItems) _row(item),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(_BagItem item) {
    final checked = _done.contains(item.id);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => _toggle(item.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(children: [
          Icon(item.icon,
              size: 18, color: checked ? AppColors.greenText : AppColors.textMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.label,
                  style: TextStyle(
                    color: checked ? AppColors.textMuted : AppColors.textPri,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    decoration: checked ? TextDecoration.lineThrough : null,
                  )),
              Text(item.hint, style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
            ]),
          ),
          AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: checked ? AppColors.green : Colors.transparent,
              border: Border.all(color: checked ? AppColors.green : AppColors.bgBorder, width: 1.6),
            ),
            child: checked ? const Icon(Icons.check_rounded, size: 14, color: Colors.white) : null,
          ),
        ]),
      ),
    );
  }
}

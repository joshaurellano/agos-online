import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/accessibility_settings.dart';
import '../theme/panahon_ui.dart';
import 'dashboard_screen.dart';
import 'alert_screen.dart';
import 'evacuation_screen.dart';
import 'rainfall_screen.dart';
import 'flood_map_screen.dart';
import 'community_reports_screen.dart';

class MainShell extends StatefulWidget {
  final int initialTabIndex;
  // Lets a notification tap (see main.dart's '/alert' route) open straight
  // into the Alerts screen, which now lives behind the bell icon rather
  // than as its own bottom-nav tab.
  final bool openAlertsOnStart;
  const MainShell({super.key, this.initialTabIndex = 0, this.openAlertsOnStart = false});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _TabMeta {
  final String title;
  final String tagline;
  const _TabMeta(this.title, this.tagline);
}

const _tabMeta = [
  _TabMeta('AGOS', 'Brgy. Triangulo · Flood Forecast'),
  _TabMeta('Flood Map', 'Brgy. Triangulo · Zones & Radar'),
  _TabMeta('Rainfall', 'Brgy. Triangulo · Rain Monitor'),
  _TabMeta('Evacuation', 'Brgy. Triangulo · Evacuation Map'),
  _TabMeta('Reports', 'Brgy. Triangulo · Resident Reports'),
];

class _MainShellState extends State<MainShell> {
  late int _currentIndex;
  AlertLevelType _alertLevel = AlertLevelType.normal;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTabIndex;
    if (widget.openAlertsOnStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openAlerts());
    }
  }

  void _openAlerts() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AlertScreen()),
    );
  }

  void _onAlertChanged(AlertLevelType level) {
    if (_alertLevel != level) setState(() => _alertLevel = level);
  }

  // Was a profile/sign-out sheet for the old username+password login flow.
  // AGOS no longer has accounts — this now just shows the anonymous device
  // identity that incident reports are attributed to (see
  // report_incident_screen.dart / main.dart's silent anonymous sign-in),
  // so a resident can see "this is what your reports are tagged with"
  // without ever having signed in to anything.
  void _showAccountSheet() {
    final anonId = Supabase.instance.client.auth.currentUser?.id;
    final shortId = anonId != null && anonId.length >= 8
        ? anonId.substring(0, 8)
        : (anonId ?? 'unavailable');

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgDark,
      // Without this, a bottom sheet is capped at a fixed default height
      // and its content can't scroll — which is exactly what caused the
      // overflow once the Display/accessibility section was added below
      // the device-info block (RenderFlex overflowed by 78 pixels on
      // smaller screens). isScrollControlled + wrapping the content in a
      // SingleChildScrollView below lets it size to content up to the
      // full screen height, and scroll if it's still taller than that.
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            24, 16, 24, 32 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: AppColors.bgBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.accent.withValues(alpha: 0.15),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.4), width: 2),
              ),
              child: const Icon(Icons.shield_rounded, color: AppColors.accent, size: 30),
            ),
            const SizedBox(height: 14),
            const Text(
              'Anonymous Resident',
              style: TextStyle(color: AppColors.textPri, fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              'Device ID: $shortId',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13, fontFamily: 'monospace'),
            ),
            const SizedBox(height: 16),
            Text(
              'AGOS is fully public — no account needed to view flood, '
              'rainfall, or evacuation data. This anonymous device ID is '
              'only used so reports you submit under Reports can be traced '
              'back to your device (e.g. to show their status), never to '
              'your identity.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.45),
            ),
            const SizedBox(height: 22),
            const Divider(color: AppColors.bgBorder, height: 1),
            const SizedBox(height: 18),
            const _AccessibilitySection(),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final alertInfo = AlertLevel.levels[_alertLevel]!;
    final meta = _tabMeta[_currentIndex];

    final screens = [
      DashboardScreen(
        onAlertChanged: _onAlertChanged,
        onNavigate: (i) => setState(() => _currentIndex = i),
        onOpenAlerts: _openAlerts,
        onOpenSettings: _showAccountSheet,
      ),
      const FloodMapScreen(),
      const RainfallScreen(),
      const EvacuationScreen(),
      const CommunityReportsScreen(),
    ];

    // Dashboard (tab 0) renders its own full-bleed FloodHeroBanner — with
    // its own location/status line and bell/settings icons baked in — so
    // showing MainShell's compact PanahonHeader on top of it would just
    // duplicate that chrome. Every other tab keeps the shared header.
    final showSharedHeader = _currentIndex != 0;

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      body: Column(
        children: [
          if (showSharedHeader)
            PanahonHeader(
              appName: meta.title,
              tagline: meta.tagline,
              height: 96,
              leading: Container(
                width: 34, height: 34,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                ),
                child: const Center(child: Text('🌊', style: TextStyle(fontSize: 16))),
              ),
              trailing: Row(
                children: [
                  // Alert level pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      color: alertInfo.color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: alertInfo.color.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 7, height: 7,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: alertInfo.color),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          alertInfo.label.toUpperCase(),
                          style: TextStyle(
                            color: alertInfo.color, fontSize: 10,
                            fontWeight: FontWeight.w700, letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  PanahonHeaderIcon(
                    icon: Icons.notifications_rounded,
                    showDot: _alertLevel != AlertLevelType.normal,
                    dotColor: alertInfo.color,
                    onTap: _openAlerts,
                  ),
                  PanahonHeaderIcon(
                    icon: Icons.settings_rounded,
                    onTap: _showAccountSheet,
                  ),
                ],
              ),
            ),
          Expanded(
            child: IndexedStack(index: _currentIndex, children: screens),
          ),
        ],
      ),
      bottomNavigationBar: PanahonBottomNav(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
        items: const [
          PanahonNavItem(icon: Icons.dashboard_rounded, label: 'Dashboard'),
          PanahonNavItem(icon: Icons.radar_rounded, label: 'Flood Map'),
          PanahonNavItem(icon: Icons.water_drop_rounded, label: 'Rainfall'),
          PanahonNavItem(icon: Icons.directions_run_rounded, label: 'Evacuation'),
          PanahonNavItem(icon: Icons.campaign_rounded, label: 'Reports'),
        ],
      ),
    );
  }
}

// ── Accessibility settings (text size + high contrast) ───────────────────────
// Lives in the device/about sheet above. Reads/writes AccessibilitySettings
// directly — no local state needed here, since that ChangeNotifier is
// already the single source of truth the whole app (see main.dart's
// MaterialApp.builder) rebuilds from.
class _AccessibilitySection extends StatelessWidget {
  const _AccessibilitySection();

  @override
  Widget build(BuildContext context) {
    final a11y = context.watch<AccessibilitySettings>();
    final steps = <double>[0.85, 1.0, 1.15, 1.3];
    // Snap the slider to the nearest of a few sane steps rather than a
    // continuous drag — easier to hit a specific size with a thumb, and
    // avoids landing on an odd in-between scale that's hard to reason
    // about when reporting a display bug.
    final closestStep = steps.reduce(
      (a, b) => (a - a11y.textScale).abs() < (b - a11y.textScale).abs() ? a : b,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('DISPLAY', style: TextStyle(
            color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
        const SizedBox(height: 14),

        // ── Text size ──────────────────────────────────────────────────
        Row(children: [
          const Icon(Icons.text_fields_rounded, color: AppColors.textSec, size: 16),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('Text Size', style: TextStyle(
                color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
          ),
          Text('${(a11y.textScale * 100).round()}%',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
        Row(children: [
          Text('A', style: TextStyle(color: AppColors.textMuted, fontSize: 13 * AccessibilitySettings.minScale)),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: AppColors.accent,
                inactiveTrackColor: AppColors.bgBorder,
                thumbColor: AppColors.accent,
                overlayColor: AppColors.accent.withValues(alpha: 0.15),
                trackHeight: 3,
              ),
              child: Slider(
                value: closestStep,
                min: steps.first,
                max: steps.last,
                divisions: steps.length - 1,
                onChanged: (v) {
                  // Snap to nearest defined step even mid-drag.
                  final nearest = steps.reduce(
                      (a, b) => (a - v).abs() < (b - v).abs() ? a : b);
                  context.read<AccessibilitySettings>().setTextScale(nearest);
                },
              ),
            ),
          ),
          Text('A', style: TextStyle(color: AppColors.textMuted, fontSize: 13 * AccessibilitySettings.maxScale)),
        ]),
        const SizedBox(height: 10),

        // ── High contrast ───────────────────────────────────────────────
        InkWell(
          onTap: () => context.read<AccessibilitySettings>().setHighContrast(!a11y.highContrast),
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              const Icon(Icons.contrast_rounded, color: AppColors.textSec, size: 16),
              const SizedBox(width: 8),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('High Contrast', style: TextStyle(
                        color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w700)),
                    Text('Boosts contrast across the whole app', style: TextStyle(
                        color: AppColors.textMuted, fontSize: 11)),
                  ],
                ),
              ),
              Switch(
                value: a11y.highContrast,
                activeColor: AppColors.accent,
                onChanged: (v) => context.read<AccessibilitySettings>().setHighContrast(v),
              ),
            ]),
          ),
        ),
      ],
    );
  }
}

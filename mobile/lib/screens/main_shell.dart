import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/pending_reports_service.dart';
import '../theme/panahon_ui.dart';
import '../widgets/offline_banner.dart';
import 'settings_screen.dart';
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
    // Send any reports queued while offline in a previous session. init()
    // resolves once the saved queue has been read from disk; flush() then
    // quietly does nothing if we're still offline (it also runs on every
    // reconnect — see PendingReportsService).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final outbox = context.read<PendingReportsService>();
      await outbox.init();
      await outbox.flush();
    });
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

  // Opens the dedicated settings screen (was a bottom sheet with device
  // info + accessibility controls — both now live in SettingsScreen).
  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
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
        onOpenSettings: _openSettings,
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

    // Android back: from any other tab go to the Dashboard first, and only
    // leave the app from there (instead of exiting from, say, Rainfall).
    return PopScope(
      canPop: _currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _currentIndex = 0);
      },
      child: Scaffold(
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
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppColors.accent.withValues(alpha: 0.28),
                      AppColors.accent.withValues(alpha: 0.08),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                  boxShadow: [
                    BoxShadow(color: AppColors.accent.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 2)),
                  ],
                ),
                child: const Center(child: Text('🌊', style: TextStyle(fontSize: 16))),
              ),
              trailing: Row(
                children: [
                  // Alert level pill
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          alertInfo.color.withValues(alpha: 0.22),
                          alertInfo.color.withValues(alpha: 0.10),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: alertInfo.color.withValues(alpha: 0.4)),
                      boxShadow: [
                        BoxShadow(color: alertInfo.color.withValues(alpha: 0.15), blurRadius: 8),
                      ],
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
                    onTap: _openSettings,
                  ),
                ],
              ),
            ),
          Expanded(
            child: IndexedStack(index: _currentIndex, children: screens),
          ),
        ],
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Slim strip: "Offline · showing saved data" / "Back online".
          const OfflineBanner(),
          PanahonBottomNav(
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
        ],
      ),
    ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/auth_service.dart';
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

  void _showAccountSheet() {
    final user = context.read<AuthService>().currentUser;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
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
              child: const Icon(Icons.person_rounded, color: AppColors.accent, size: 32),
            ),
            const SizedBox(height: 14),
            Text(
              user?.name ?? 'Resident',
              style: const TextStyle(color: AppColors.textPri, fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              '@${user?.username ?? ''}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.3)),
              ),
              child: Text(
                user?.roleDesc ?? 'Resident',
                style: const TextStyle(
                  color: AppColors.accent, fontSize: 12,
                  fontWeight: FontWeight.w700, letterSpacing: 0.5,
                ),
              ),
            ),
            if (context.watch<AuthService>().isOffline) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.cloud_off_rounded, color: AppColors.textMuted, size: 13),
                  SizedBox(width: 5),
                  Text('Offline — showing your saved profile',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
              ),
            ],
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  context.read<AuthService>().logout();
                },
                icon: const Icon(Icons.logout_rounded, size: 18),
                label: const Text('Sign Out', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.red,
                  side: const BorderSide(color: AppColors.red),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
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
      ),
      const FloodMapScreen(),
      const RainfallScreen(),
      const EvacuationScreen(),
      const CommunityReportsScreen(),
    ];

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      body: Column(
        children: [
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
                  icon: Icons.person_rounded,
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

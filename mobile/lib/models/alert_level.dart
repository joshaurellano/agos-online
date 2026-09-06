import 'package:flutter/material.dart';
import '../main.dart';

enum AlertLevelType { normal, advisory, warning, critical }

class AlertLevel {
  final String label;
  final Color color;
  final String description;
  final String action;
  final AlertLevelType type;

  const AlertLevel({
    required this.label,
    required this.color,
    required this.description,
    required this.action,
    required this.type,
  });

  static const Map<AlertLevelType, AlertLevel> levels = {
    AlertLevelType.normal: AlertLevel(
      label: 'Normal',
      color: AppColors.green,
      description: 'No significant flooding risk. Water levels within safe range.',
      action: 'No action required. Continue monitoring.',
      type: AlertLevelType.normal,
    ),
    AlertLevelType.advisory: AlertLevel(
      label: 'Advisory',
      color: AppColors.yellow,
      description: 'Elevated water levels. Minor flooding possible in low-lying areas.',
      action: 'Residents near waterways should be on alert.',
      type: AlertLevelType.advisory,
    ),
    AlertLevelType.warning: AlertLevel(
      label: 'Warning',
      color: AppColors.orange,
      description: 'Significant flooding expected. Zone 3 at high risk.',
      action: 'Prepare evacuation. Secure valuables. Monitor updates.',
      type: AlertLevelType.warning,
    ),
    AlertLevelType.critical: AlertLevel(
      label: 'Critical',
      color: AppColors.red,
      description: 'Severe flooding imminent. Immediate danger to life and property.',
      action: 'EVACUATE IMMEDIATELY. Proceed to designated evacuation centers.',
      type: AlertLevelType.critical,
    ),
  };
}

// ─── AlertLevelTypeX ────────────────────────────────────────────────────────
// Lives here (rather than inside dashboard_screen.dart, where it originally
// was) so any screen can reuse the same shape-distinct icon per alert level
// without importing another screen file just to get it. Icon shape carries
// meaning independently of color — important since color alone isn't a
// reliable cue for colorblind users, and these are the icons used across
// the dashboard and alert log.
extension AlertLevelTypeX on AlertLevelType {
  AlertLevel get info => AlertLevel.levels[this]!;
  Color get color => info.color;
  String get label => info.label;

  IconData get icon {
    switch (this) {
      case AlertLevelType.normal:   return Icons.check_circle_outline_rounded;
      case AlertLevelType.advisory: return Icons.info_outline_rounded;
      case AlertLevelType.warning:  return Icons.warning_amber_rounded;
      case AlertLevelType.critical: return Icons.crisis_alert_rounded;
    }
  }

  bool get shouldPulse =>
      this == AlertLevelType.critical || this == AlertLevelType.warning;
}
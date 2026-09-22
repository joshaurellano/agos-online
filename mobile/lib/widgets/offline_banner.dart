// offline_banner.dart
//
// A slim strip that slides in above the bottom nav when the device has no
// working connection, and briefly confirms when it's back. Lives in
// MainShell's bottomNavigationBar so it shows on every tab — including the
// dashboard, whose full-bleed hero has no room for a top banner.
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../services/connectivity_service.dart';
import '../services/pending_reports_service.dart';

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final conn = context.watch<ConnectivityService>();
    final queued = context.watch<PendingReportsService>().count;

    Widget? bar;
    if (conn.isOffline) {
      final queuedText = queued > 0
          ? ' · $queued report${queued == 1 ? '' : 's'} waiting to send'
          : '';
      bar = _Bar(
        key: const ValueKey('offline'),
        color: AppColors.orange,
        icon: Icons.cloud_off_rounded,
        text: 'Offline · showing saved data$queuedText',
        actionLabel: 'Retry',
        onAction: () => ConnectivityService.instance.checkNow(),
      );
    } else if (conn.justReconnected) {
      bar = const _Bar(
        key: ValueKey('online'),
        color: AppColors.green,
        icon: Icons.cloud_done_rounded,
        text: 'Back online — updating…',
      );
    }

    return AnimatedSize(
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
      alignment: Alignment.bottomCenter,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: bar ?? const SizedBox(key: ValueKey('none'), width: double.infinity),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _Bar({
    super.key,
    required this.color,
    required this.icon,
    required this.text,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 7, 6, 7),
      decoration: BoxDecoration(
        color: Color.alphaBlend(color.withValues(alpha: 0.16), AppColors.bgDark),
        border: Border(top: BorderSide(color: color.withValues(alpha: 0.45))),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                height: 1.25,
              ),
            ),
          ),
          if (actionLabel != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: color,
                minimumSize: const Size(48, 32),
                padding: const EdgeInsets.symmetric(horizontal: 10),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                actionLabel!,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
              ),
            ),
        ],
      ),
    );
  }
}

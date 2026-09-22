import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../widgets/skeleton.dart';
import '../models/incident_report.dart';
import '../services/connectivity_service.dart';
import '../services/incident_service.dart';
import '../services/offline_cache.dart';
import '../services/pending_reports_service.dart';
import 'report_incident_screen.dart';

// Residents can only file flood reports now, so there's no category
// vocabulary left to key off of — every report card just uses these
// directly instead of looking a category up in a map.
const _reportIcon  = Icons.water_rounded;
const _reportColor = AppColors.accent;

class CommunityReportsScreen extends StatefulWidget {
  const CommunityReportsScreen({super.key});

  @override
  State<CommunityReportsScreen> createState() => _CommunityReportsScreenState();
}

class _CommunityReportsScreenState extends State<CommunityReportsScreen> {
  List<IncidentReport> _reports = [];
  bool _loading = true;
  String? _error;
  // Set when the feed on screen is a saved copy rather than live.
  DateTime? _savedAt;
  StreamSubscription<void>? _reconnectSub;

  @override
  void initState() {
    super.initState();
    _load();
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) => _load());
  }

  @override
  void dispose() {
    _reconnectSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    // Only show the spinner when there's nothing to show yet — a refresh
    // shouldn't blank out a list that's already on screen.
    setState(() { _loading = _reports.isEmpty; _error = null; });
    try {
      final result = await IncidentService.fetchVerifiedReportsCached();
      if (!mounted) return;
      setState(() {
        _reports = result.data;
        _savedAt = result.fromCache ? result.savedAt : null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Couldn't load community reports. Pull down to try again.";
        _loading = false;
      });
    }
  }

  Future<void> _openReportForm() async {
    final result = await Navigator.of(context).push<ReportSubmitResult>(
      MaterialPageRoute(builder: (_) => const ReportIncidentScreen()),
    );
    if (result == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result == ReportSubmitResult.sent
            ? 'Report submitted — a barangay official will review it shortly.'
            : "You're offline — your report is saved on this device and will send automatically when you're back online."),
        backgroundColor: AppColors.bgCard,
        duration: Duration(seconds: result == ReportSubmitResult.sent ? 4 : 6),
      ),
    );
    if (result == ReportSubmitResult.sent) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openReportForm,
        backgroundColor: AppColors.accent,
        icon: const Icon(Icons.add_alert_rounded, color: Colors.white),
        label: const Text('Report Flood', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.bgCard,
          onRefresh: _load,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _PendingReportsSection()),
              if (_savedAt != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Row(children: [
                      const Icon(Icons.history_rounded, size: 13, color: AppColors.orange),
                      const SizedBox(width: 5),
                      Text('Saved reports · updated ${agoLabel(_savedAt!)}',
                          style: const TextStyle(color: AppColors.orange, fontSize: 11, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                ),
              if (_loading)
                const SliverToBoxAdapter(child: SkeletonCardList(count: 4))
              else if (_error != null)
                SliverFillRemaining(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    ),
                  ),
                )
              else if (_reports.isEmpty)
                SliverFillRemaining(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.campaign_outlined, color: AppColors.textMuted, size: 40),
                          const SizedBox(height: 12),
                          const Text('No verified reports yet', style: TextStyle(color: AppColors.textSec, fontSize: 14, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          const Text(
                            'Reports appear here once a barangay official verifies them.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ReportCard(report: _reports[i]),
                      ),
                      childCount: _reports.length,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final IncidentReport report;
  const _ReportCard({required this.report});

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1)  return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24)   return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final color = _reportColor;
    final icon  = _reportIcon;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.bgBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (report.photoUrl != null)
            Image(
              image: CachedNetworkImageProvider(report.photoUrl!),
              height: 160,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Container(
                  height: 160,
                  color: AppColors.bgMid,
                  child: const Center(child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2)),
                );
              },
            ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                      child: Icon(icon, size: 16, color: color),
                    ),
                    const SizedBox(width: 8),
                    Text(report.category, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w700)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.green.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: AppColors.green.withValues(alpha: 0.35)),
                      ),
                      child: const Text('VERIFIED', style: TextStyle(color: AppColors.green, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(report.description, style: const TextStyle(color: AppColors.textPri, fontSize: 13.5, height: 1.4)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (report.locationLabel != null) ...[
                      const Icon(Icons.location_on_rounded, size: 13, color: AppColors.textMuted),
                      const SizedBox(width: 3),
                      Flexible(
                        child: Text(report.locationLabel!, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Text(_timeAgo(report.createdAt), style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                    const Spacer(),
                    Text('by ${report.reporterName}', style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5, fontStyle: FontStyle.italic)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Reports waiting to send (filed while offline) ─────────────────────────────
class _PendingReportsSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final outbox = context.watch<PendingReportsService>();
    if (outbox.items.isEmpty) return const SizedBox.shrink();
    final online = context.watch<ConnectivityService>().isOnline;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.orange.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.orange.withValues(alpha: 0.35)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.outbox_rounded, size: 16, color: AppColors.orange),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Waiting to send (${outbox.count})',
                  style: const TextStyle(color: AppColors.orange, fontSize: 12.5, fontWeight: FontWeight.w800)),
            ),
            if (online)
              TextButton(
                onPressed: outbox.isFlushing ? null : () => outbox.flush(),
                child: Text(outbox.isFlushing ? 'Sending…' : 'Send now'),
              ),
          ]),
          for (final r in outbox.items)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${r.category} · ${agoLabel(r.queuedAt)}',
                        style: const TextStyle(color: AppColors.textSec, fontSize: 11.5, fontWeight: FontWeight.w700)),
                    Text(r.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textPri, fontSize: 12.5)),
                    if (r.lastError != null)
                      Text(r.lastError!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
                  ]),
                ),
                IconButton(
                  tooltip: 'Delete',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.textMuted),
                  onPressed: () => outbox.discard(r.id),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}

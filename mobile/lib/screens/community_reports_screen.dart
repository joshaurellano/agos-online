import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../widgets/skeleton.dart';
import '../models/incident_report.dart';
import '../services/connectivity_service.dart';
import '../services/flood_status_service.dart';
import '../services/incident_service.dart';
import '../services/offline_cache.dart';
import '../services/pending_reports_service.dart';
import 'report_incident_screen.dart';

enum _Filter { all, today, photo }

// Colour for a quick-pick tag chip (depth / passability).
Color _tagColor(String t) {
  switch (t) {
    case 'Ankle-deep':
      return AppColors.yellow;
    case 'Knee-deep':
    case 'High vehicles only':
      return AppColors.orange;
    case 'Waist-deep':
    case 'Chest-deep or higher':
    case 'Not passable':
      return AppColors.red;
    case 'Passable':
      return AppColors.green;
    default:
      return AppColors.accent;
  }
}

String _timeAgo(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} h ago';
  return '${diff.inDays} d ago';
}

// Stored label is usually raw "13.61234, 123.18765" — not friendly to read.
final _coordLabel = RegExp(r'^-?\d+\.\d+,\s*-?\d+\.\d+$');

class CommunityReportsScreen extends StatefulWidget {
  const CommunityReportsScreen({super.key});

  @override
  State<CommunityReportsScreen> createState() => _CommunityReportsScreenState();
}

class _CommunityReportsScreenState extends State<CommunityReportsScreen> {
  bool _showMine = false;
  _Filter _filter = _Filter.all;

  List<IncidentReport> _reports = [];
  List<IncidentReport> _mine = [];
  bool _loading = true;
  bool _mineLoading = false;
  bool _live = false; // realtime stream connected
  String? _error;
  String? _mineError;
  // Set when the feed on screen is a saved copy rather than live.
  DateTime? _savedAt;
  StreamSubscription<void>? _reconnectSub;
  StreamSubscription<List<IncidentReport>>? _streamSub;

  String? get _uid => Supabase.instance.client.auth.currentUser?.id;

  @override
  void initState() {
    super.initState();
    _load();
    _loadMine();
    _startStream();
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) {
      _load();
      _loadMine();
    });
  }

  @override
  void dispose() {
    _reconnectSub?.cancel();
    _streamSub?.cancel();
    super.dispose();
  }

  // Live updates: a report appears the moment an official verifies it.
  // (IncidentService.streamVerifiedReports existed but nothing used it.) If
  // Realtime isn't enabled for the table this just errors quietly and the
  // feed keeps working with pull-to-refresh.
  void _startStream() {
    try {
      _streamSub = IncidentService.streamVerifiedReports().listen(
        (rows) {
          if (!mounted) return;
          setState(() {
            _reports = rows;
            _savedAt = null;
            _error = null;
            _loading = false;
            _live = true;
          });
        },
        onError: (_) {
          if (mounted) setState(() => _live = false);
        },
      );
    } catch (_) {}
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

  // The resident's OWN reports with their review status. The service method
  // existed but no screen used it, so after submitting there was no way to
  // see whether a report was verified, still pending, or rejected (and why).
  Future<void> _loadMine() async {
    final uid = _uid;
    if (uid == null) {
      if (mounted) setState(() { _mine = []; _mineLoading = false; });
      return;
    }
    setState(() { _mineLoading = _mine.isEmpty; _mineError = null; });
    try {
      final rows = await IncidentService.fetchMyReports(uid).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() { _mine = rows; _mineLoading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _mineError = "Couldn't load your reports. Pull down to try again.";
        _mineLoading = false;
      });
    }
  }

  Future<void> _withdraw(IncidentReport r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgMid,
        title: Text('Withdraw this report?',
            style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 16)),
        content: Text('It hasn\u2019t been reviewed yet. Withdrawing deletes it.',
            style: TextStyle(color: AppColors.textSec, fontSize: 13)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Withdraw')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await IncidentService.deleteOwnPendingReport(r.id);
      if (!mounted) return;
      setState(() => _mine = _mine.where((x) => x.id != r.id).toList());
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't withdraw the report. Please try again.")),
      );
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
    if (result == ReportSubmitResult.sent) {
      // Jump to "My reports" so they can see it sitting in review.
      setState(() => _showMine = true);
      _load();
      _loadMine();
    }
  }

  List<IncidentReport> get _visible {
    final now = DateTime.now();
    return _reports.where((r) {
      switch (_filter) {
        case _Filter.today:
          return now.difference(r.createdAt).inHours < 24;
        case _Filter.photo:
          return r.photoUrl != null;
        case _Filter.all:
          return true;
      }
    }).toList();
  }

  // ── UI pieces ──────────────────────────────────────────────────────────────
  Widget _promptBanner(String alertKey) {
    final tint = alertKey == 'CRITICAL'
        ? AppColors.red
        : alertKey == 'WARNING'
            ? AppColors.orange
            : AppColors.yellow;
    final level = alertKey[0] + alertKey.substring(1).toLowerCase();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: GestureDetector(
        onTap: _openReportForm,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: tint.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tint.withValues(alpha: 0.45)),
          ),
          child: Row(children: [
            Icon(Icons.water_rounded, color: AppColors.ink(tint), size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$level alert — is water rising on your street?',
                    style: TextStyle(color: AppColors.textPri, fontSize: 12.5, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('Tell your neighbors. It takes under a minute.',
                    style: TextStyle(color: AppColors.textSec, fontSize: 11)),
              ]),
            ),
            Icon(Icons.chevron_right_rounded, color: AppColors.ink(tint)),
          ]),
        ),
      ),
    );
  }

  Widget _tabSwitch(int pendingCount) {
    Widget seg(bool mine, String label, {int badge = 0}) {
      final sel = _showMine == mine;
      return Expanded(
        child: GestureDetector(
          onTap: () {
            if (_showMine != mine) setState(() => _showMine = mine);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: sel ? AppColors.accent.withValues(alpha: 0.16) : Colors.transparent,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: sel ? AppColors.accent.withValues(alpha: 0.5) : Colors.transparent),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(label,
                  style: TextStyle(
                      color: sel ? AppColors.accent : AppColors.textSec,
                      fontSize: 12.5,
                      fontWeight: sel ? FontWeight.w800 : FontWeight.w600)),
              if (badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(8)),
                  child: Text('$badge',
                      style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w800)),
                ),
              ],
            ]),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: AppColors.bgMid,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Row(children: [
          seg(false, 'Community'),
          seg(true, 'My reports', badge: pendingCount),
        ]),
      ),
    );
  }

  Widget _filterChip(_Filter f, String label) {
    final sel = _filter == f;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () => setState(() => _filter = f),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: sel ? AppColors.accent.withValues(alpha: 0.16) : AppColors.bgCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: sel ? AppColors.accent : AppColors.bgBorder),
          ),
          child: Text(label,
              style: TextStyle(
                  color: sel ? AppColors.accent : AppColors.textSec,
                  fontSize: 11.5,
                  fontWeight: sel ? FontWeight.w800 : FontWeight.w600)),
        ),
      ),
    );
  }

  Widget _empty(IconData icon, String title, String subtitle, {String? action}) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: AppColors.textMuted, size: 42),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSec, fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4)),
          if (action != null) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _openReportForm,
              icon: const Icon(Icons.add_alert_rounded, size: 18),
              label: Text(action),
            ),
          ],
        ]),
      );

  List<Widget> _communitySlivers() {
    final visible = _visible;
    return [
      if (_savedAt != null)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(children: [
              Icon(Icons.history_rounded, size: 13, color: AppColors.ink(AppColors.orange)),
              const SizedBox(width: 5),
              Text('Saved reports · updated ${agoLabel(_savedAt!)}',
                  style: TextStyle(color: AppColors.ink(AppColors.orange), fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _filterChip(_Filter.all, 'All'),
                _filterChip(_Filter.today, 'Last 24 hours'),
                _filterChip(_Filter.photo, 'With photo'),
              ]),
            ),
            if (!_loading && _error == null) ...[
              const SizedBox(height: 10),
              Row(children: [
                Text('${visible.length} verified report${visible.length == 1 ? '' : 's'}',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, fontWeight: FontWeight.w600)),
                if (_live) ...[
                  const SizedBox(width: 8),
                  Container(width: 7, height: 7, decoration: const BoxDecoration(color: AppColors.green, shape: BoxShape.circle)),
                  const SizedBox(width: 4),
                  Text('Live', style: TextStyle(color: AppColors.ink(AppColors.green), fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ]),
            ],
          ]),
        ),
      ),
      if (_loading)
        const SliverToBoxAdapter(child: SkeletonCardList(count: 4))
      else if (_error != null)
        SliverToBoxAdapter(child: _empty(Icons.cloud_off_rounded, 'Couldn\u2019t load reports', _error!))
      else if (_reports.isEmpty)
        SliverToBoxAdapter(
          child: _empty(Icons.campaign_outlined, 'No verified reports yet',
              'Reports appear here once a barangay official verifies them.',
              action: 'Report flooding'),
        )
      else if (visible.isEmpty)
        SliverToBoxAdapter(
          child: _empty(Icons.filter_alt_off_rounded, 'Nothing matches this filter', 'Try \u201cAll\u201d to see every verified report.'),
        )
      else
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ReportCard(report: visible[i]),
              ),
              childCount: visible.length,
            ),
          ),
        ),
    ];
  }

  List<Widget> _mineSlivers() {
    return [
      if (_mineLoading)
        const SliverToBoxAdapter(child: SkeletonCardList(count: 2))
      else if (_mineError != null)
        SliverToBoxAdapter(child: _empty(Icons.cloud_off_rounded, 'Couldn\u2019t load your reports', _mineError!))
      else if (_mine.isEmpty)
        SliverToBoxAdapter(
          child: _empty(Icons.assignment_outlined, 'You haven\u2019t sent any reports',
              'Reports you send will show here, so you can see when an official verifies them.',
              action: 'Report flooding'),
        )
      else
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ReportCard(
                  report: _mine[i],
                  mine: true,
                  onWithdraw: _mine[i].isPending ? () => _withdraw(_mine[i]) : null,
                ),
              ),
              childCount: _mine.length,
            ),
          ),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final alertKey =
        (context.watch<FloodStatusService>().rawJson?['alert_level']?.toString() ?? 'NORMAL').toUpperCase();
    final pendingCount = _mine.where((r) => r.isPending).length;

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
          onRefresh: () async {
            await Future.wait([_load(), _loadMine()]);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _PendingReportsSection()),
              if (alertKey != 'NORMAL') SliverToBoxAdapter(child: _promptBanner(alertKey)),
              SliverToBoxAdapter(child: _tabSwitch(pendingCount)),
              ..._showMine ? _mineSlivers() : _communitySlivers(),
            ],
          ),
        ),
      ),
    );
  }
}

// ── One report ────────────────────────────────────────────────────────────────
class _ReportCard extends StatelessWidget {
  final IncidentReport report;
  final bool mine; // "My reports" view: show review status instead of "verified"
  final VoidCallback? onWithdraw;
  const _ReportCard({required this.report, this.mine = false, this.onWithdraw});

  Future<void> _openInMaps(BuildContext context) async {
    final uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Couldn't open a maps app.")));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Couldn't open a maps app.")));
      }
    }
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Text(text,
            style: TextStyle(color: AppColors.ink(color), fontSize: 10.5, fontWeight: FontWeight.w800)),
      );

  @override
  Widget build(BuildContext context) {
    final parsed = ReportTags.parse(report.description);
    final isNew = DateTime.now().difference(report.createdAt).inMinutes < 60;
    final hasCoords = report.latitude != null && report.longitude != null;
    final label = report.locationLabel;
    final prettyLoc = label == null
        ? (hasCoords ? 'Pinned location' : null)
        : (_coordLabel.hasMatch(label.trim()) ? 'Pinned location' : label);

    final statusColor = report.isVerified
        ? AppColors.green
        : report.isRejected
            ? AppColors.red
            : AppColors.orange;
    final statusText = report.isVerified
        ? 'Verified'
        : report.isRejected
            ? 'Not verified'
            : 'Pending review';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.bgBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (report.photoUrl != null)
          GestureDetector(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
              fullscreenDialog: true,
              builder: (_) => _PhotoViewer(url: report.photoUrl!),
            )),
            child: Image(
              image: CachedNetworkImageProvider(report.photoUrl!),
              height: 170,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Container(
                  height: 170,
                  color: AppColors.bgMid,
                  child: Center(child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2)),
                );
              },
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Wrap(spacing: 6, runSpacing: 6, children: [
                  if (mine) _chip(statusText, statusColor),
                  for (final t in parsed.tags) _chip(t, _tagColor(t)),
                  if (parsed.tags.isEmpty && !mine) _chip('Flood report', AppColors.accent),
                ]),
              ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(_timeAgo(report.createdAt),
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
                if (isNew && report.isVerified)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text('NEW',
                        style: TextStyle(color: AppColors.accent, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.6)),
                  ),
              ]),
            ]),
            if (parsed.text.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(parsed.text, style: TextStyle(color: AppColors.textPri, fontSize: 13.5, height: 1.4)),
            ],
            if (mine && report.isRejected && (report.rejectionReason ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('Reason: ${report.rejectionReason}',
                    style: TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.35)),
              ),
            ],
            const SizedBox(height: 12),
            Row(children: [
              if (prettyLoc != null) ...[
                Icon(Icons.location_on_rounded, size: 14, color: AppColors.textMuted),
                const SizedBox(width: 3),
                Flexible(
                  child: Text(prettyLoc,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
                ),
              ],
              const Spacer(),
              if (!mine)
                Text('by ${report.reporterName}',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11.5, fontStyle: FontStyle.italic)),
            ]),
            if (hasCoords || onWithdraw != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                if (hasCoords)
                  TextButton.icon(
                    onPressed: () => _openInMaps(context),
                    icon: const Icon(Icons.map_rounded, size: 16),
                    label: const Text('View on map', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 32),
                    ),
                  ),
                const Spacer(),
                if (onWithdraw != null)
                  TextButton.icon(
                    onPressed: onWithdraw,
                    icon: const Icon(Icons.undo_rounded, size: 16),
                    label: const Text('Withdraw', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.red,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 32),
                    ),
                  ),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}

// Full-screen, pinch-to-zoom photo.
class _PhotoViewer extends StatelessWidget {
  final String url;
  const _PhotoViewer({required this.url});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        body: Center(
          child: InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Image(
              image: CachedNetworkImageProvider(url),
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.broken_image_rounded, color: Colors.white54, size: 48),
            ),
          ),
        ),
      );
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
            Icon(Icons.outbox_rounded, size: 16, color: AppColors.ink(AppColors.orange)),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Waiting to send (${outbox.count})',
                  style: TextStyle(color: AppColors.ink(AppColors.orange), fontSize: 12.5, fontWeight: FontWeight.w800)),
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
                        style: TextStyle(color: AppColors.textSec, fontSize: 11.5, fontWeight: FontWeight.w700)),
                    Text(r.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: AppColors.textPri, fontSize: 12.5)),
                    if (r.lastError != null)
                      Text(r.lastError!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
                  ]),
                ),
                IconButton(
                  tooltip: 'Delete',
                  visualDensity: VisualDensity.compact,
                  icon: Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.textMuted),
                  onPressed: () => outbox.discard(r.id),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}

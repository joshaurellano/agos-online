import 'package:flutter/material.dart';
import '../main.dart';
import '../models/incident_report.dart';
import '../services/incident_service.dart';
import 'report_incident_screen.dart';

const _categoryIcons = <String, IconData>{
  'Flood':              Icons.water_rounded,
  'Road Accident':      Icons.car_crash_rounded,
  'Power Outage':       Icons.power_off_rounded,
  'Medical Emergency':  Icons.medical_services_rounded,
  'Other':              Icons.report_rounded,
};

const _categoryColors = <String, Color>{
  'Flood':              AppColors.accent,
  'Road Accident':      AppColors.yellow,
  'Power Outage':       AppColors.textSec,
  'Medical Emergency':  AppColors.red,
  'Other':              AppColors.textMuted,
};

class CommunityReportsScreen extends StatefulWidget {
  const CommunityReportsScreen({super.key});

  @override
  State<CommunityReportsScreen> createState() => _CommunityReportsScreenState();
}

class _CommunityReportsScreenState extends State<CommunityReportsScreen> {
  List<IncidentReport> _reports = [];
  bool _loading = true;
  String? _error;
  String _filter = 'ALL';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final reports = await IncidentService.fetchVerifiedReports();
      if (!mounted) return;
      setState(() { _reports = reports; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Couldn't load community reports. Pull down to try again.";
        _loading = false;
      });
    }
  }

  Future<void> _openReportForm() async {
    final submitted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const ReportIncidentScreen()),
    );
    if (submitted == true) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report submitted — a barangay official will review it shortly.'),
          backgroundColor: AppColors.bgCard,
        ),
      );
      _load();
    }
  }

  List<IncidentReport> get _filtered => _filter == 'ALL'
      ? _reports
      : _reports.where((r) => r.category == _filter).toList();

  @override
  Widget build(BuildContext context) {
    final categories = ['ALL', ...{for (final r in _reports) r.category}];

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openReportForm,
        backgroundColor: AppColors.accent,
        icon: const Icon(Icons.add_alert_rounded, color: Colors.white),
        label: const Text('Report', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.bgCard,
          onRefresh: _load,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: categories.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final cat = categories[i];
                        final selected = _filter == cat;
                        return GestureDetector(
                          onTap: () => setState(() => _filter = cat),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: selected ? AppColors.accent.withValues(alpha: 0.16) : AppColors.bgCard,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: selected ? AppColors.accent : AppColors.bgBorder),
                            ),
                            child: Text(
                              cat,
                              style: TextStyle(
                                color: selected ? AppColors.accent : AppColors.textSec,
                                fontSize: 12.5,
                                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
              if (_loading)
                const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator(color: AppColors.accent)),
                )
              else if (_error != null)
                SliverFillRemaining(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    ),
                  ),
                )
              else if (_filtered.isEmpty)
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
                        child: _ReportCard(report: _filtered[i]),
                      ),
                      childCount: _filtered.length,
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
    final color = _categoryColors[report.category] ?? AppColors.textMuted;
    final icon  = _categoryIcons[report.category] ?? Icons.report_rounded;

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
            Image.network(
              report.photoUrl!,
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

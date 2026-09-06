// rainfall_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../main.dart';
import '../theme/panahon_ui.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../services/model_api_client.dart';


String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

String get _modelUrl => _requireEnv('MODEL_API_URL');

// GET /api/forecast — same endpoint the web frontend's WeatherForecast.jsx
// reads its "outlook" (next 6h/12h/24h rain) block from. Previously this
// screen only ever read live_metrics.rainfall_mm from MODEL_API_URL and
// never touched /api/forecast's outlook data at all.
String get _forecastUrl => _requireEnv('FORECAST_API_URL');

// ─── PAGASA Thresholds ──────────────────────────────────────────────────────
class _Threshold {
  final double min, max;
  final String label, pagasa, desc;
  final Color color;
  const _Threshold(this.min, this.max, this.label, this.pagasa, this.desc, this.color);
}

const _hourlyThresholds = [
  _Threshold(0, 2.5, 'Light', 'PAGASA Light Rain · < 2.5 mm/hr',
      'No significant flood impact expected. Normal activities may continue.', AppColors.green),
  _Threshold(2.5, 7.5, 'Moderate', 'PAGASA Moderate Rain · 2.5–7.5 mm/hr',
      'Minor flooding possible in low-lying and flood-prone areas of Barangay Triangulo.', AppColors.yellow),
  _Threshold(7.5, 15, 'Heavy', 'PAGASA Heavy Rain · 7.5–15 mm/hr',
      'Flooding likely. Monitor water levels and prepare go-bags.', AppColors.orange),
  _Threshold(15, 30, 'Intense', 'PAGASA Intense Rain · 15–30 mm/hr',
      'Severe flooding expected. Be ready for evacuation guidance from BDRRMC.', AppColors.red),
  _Threshold(30, 9999, 'Torrential', 'PAGASA Torrential Rain · > 30 mm/hr',
      'Extreme flooding imminent. Evacuate to designated centers immediately.', Color(0xFF7c3aed)),
];

const _dailyThresholds = [
  _Threshold(0, 10, 'Light', 'PAGASA Light · < 10 mm/24hr',
      'No significant flood impact expected for the day.', AppColors.green),
  _Threshold(10, 25, 'Moderate', 'PAGASA Moderate · 10–25 mm/24hr',
      'Minor flooding possible in low-lying areas. Monitor drainage and creek levels.', AppColors.yellow),
  _Threshold(25, 50, 'Heavy', 'PAGASA Heavy · 25–50 mm/24hr',
      'Flooding likely in flood-prone zones. Stay alert for updates.', AppColors.orange),
  _Threshold(50, 100, 'Intense', 'PAGASA Intense · 50–100 mm/24hr',
      'Severe flooding expected. Evacuation of riverside and low-lying residents advised.', AppColors.red),
  _Threshold(100, 9999, 'Torrential', 'PAGASA Torrential · > 100 mm/24hr',
      'Catastrophic flooding. Immediate evacuation required.', Color(0xFF7c3aed)),
];

_Threshold _categoryFor(double mm, List<_Threshold> table) =>
    table.firstWhere((t) => mm >= t.min && mm < t.max, orElse: () => table.first);

String _emojiFor(String label) {
  switch (label) {
    case 'Torrential': return '🌊';
    case 'Intense':    return '⛈';
    case 'Heavy':      return '🌧';
    case 'Moderate':   return '🌦';
    default:           return '🌤';
  }
}

// ─── Main Screen ────────────────────────────────────────────────────────────
class RainfallScreen extends StatefulWidget {
  const RainfallScreen({super.key});

  @override
  State<RainfallScreen> createState() => _RainfallScreenState();
}

class _RainfallOutlook {
  final double? mm6h, mm12h, mm24h;
  final int? pct6h, pct12h, pct24h;
  const _RainfallOutlook({
    this.mm6h, this.mm12h, this.mm24h, this.pct6h, this.pct12h, this.pct24h,
  });

  factory _RainfallOutlook.fromJson(Map<String, dynamic> j) {
    num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    return _RainfallOutlook(
      mm6h:  n(j['next_6h_rain_mm'])?.toDouble(),
      mm12h: n(j['next_12h_rain_mm'])?.toDouble(),
      mm24h: n(j['next_24h_rain_mm'])?.toDouble(),
      pct6h:  n(j['next_6h_rain_probability_pct'])?.toInt(),
      pct12h: n(j['next_12h_rain_probability_pct'])?.toInt(),
      pct24h: n(j['next_24h_rain_probability_pct'])?.toInt(),
    );
  }
}

class _RainfallScreenState extends State<RainfallScreen> {
  double? _liveRainfall;
  bool _loading = true;
  String _period = 'hourly'; // 'hourly' | 'daily'

  _RainfallOutlook? _outlook;
  bool _outlookLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchRainfall();
    _fetchOutlook();
  }

Future<void> _fetchRainfall() async {
  try {
    final res = await fetchModelApi(_modelUrl);
    if (!mounted) return;
    debugPrint('RAINFALL STATUS: ${res.statusCode}');
    debugPrint('RAINFALL BODY: ${res.body}');   // <-- add this
    if (res.statusCode == 200) {
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final m = j['live_metrics'] as Map<String, dynamic>? ?? {};
      final v = m['rainfall_mm'];
      setState(() {
        _liveRainfall = v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '');
        _loading = false;
      });
    } else {
      setState(() => _loading = false);
    }
  } catch (e, st) {
    debugPrint('RAINFALL FETCH ERROR: $e');   // <-- add this
    if (mounted) setState(() => _loading = false);
  }
}

  // GET /api/forecast's "outlook" block — next 6h/12h/24h accumulated
  // rain + rain probability. Same field WeatherForecast.jsx renders on
  // the web dashboard; wasn't surfaced anywhere on mobile before.
  Future<void> _fetchOutlook() async {
    try {
      final res = await fetchModelApi(_forecastUrl);
      if (!mounted) return;
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final o = j['outlook'] as Map<String, dynamic>?;
      setState(() {
        _outlook = o != null ? _RainfallOutlook.fromJson(o) : null;
        _outlookLoading = false;
      });
    } catch (e) {
      debugPrint('OUTLOOK FETCH ERROR: $e');
      if (mounted) setState(() => _outlookLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final table = _period == 'hourly' ? _hourlyThresholds : _dailyThresholds;
    final mm = _liveRainfall ?? 0;
    final cat = _categoryFor(mm, _hourlyThresholds);

    return RefreshIndicator(
      onRefresh: () => Future.wait([_fetchRainfall(), _fetchOutlook()]),
      color: AppColors.accent,
      backgroundColor: AppColors.bgDark,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.location_on_rounded, color: AppColors.textMuted, size: 13),
              const SizedBox(width: 3),
              const Text('PAGASA Rainfall Thresholds · Brgy. Triangulo',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 12),

            // ── Current status hero card (PANaHON-style) ────────────
            PanahonHeroCard(
              accentColor: (_liveRainfall ?? 0) > 0 ? cat.color : AppColors.bgBorder,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('CURRENT RAINFALL', style: TextStyle(
                          color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
                      const SizedBox(height: 6),
                      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(
                          _liveRainfall != null ? _liveRainfall!.toStringAsFixed(1) : '—',
                          style: const TextStyle(color: AppColors.textPri, fontSize: 40,
                              fontWeight: FontWeight.w900, height: 1, letterSpacing: -1),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(bottom: 6, left: 4),
                          child: Text('mm/hr', style: TextStyle(color: AppColors.textSec, fontSize: 14, fontWeight: FontWeight.w700)),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      if (_liveRainfall != null && _liveRainfall! > 0) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: cat.color.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: cat.color.withValues(alpha: 0.4)),
                          ),
                          child: Text('${cat.label.toUpperCase()} RAINFALL',
                              style: TextStyle(color: cat.color, fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 0.4)),
                        ),
                        const SizedBox(height: 10),
                        Text(cat.desc, style: const TextStyle(color: AppColors.textSec, fontSize: 12, height: 1.4)),
                        const SizedBox(height: 4),
                        Text(cat.pagasa, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                      ] else if (!_loading)
                        const Text('No significant rainfall detected right now.',
                            style: TextStyle(color: AppColors.textSec, fontSize: 12)),
                    ]),
                  ),
                  Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                      color: ((_liveRainfall ?? 0) > 0 ? cat.color : AppColors.accent).withValues(alpha: 0.14),
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: ((_liveRainfall ?? 0) > 0 ? cat.color : AppColors.accent).withValues(alpha: 0.4), width: 1.5),
                    ),
                    child: Center(
                      child: Text(
                        (_liveRainfall ?? 0) > 0 ? _emojiFor(cat.label) : '🌤',
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 16),

            // ── Rainfall outlook (GET /api/forecast → "outlook") ─────
            // Same next-6h/12h/24h accumulated-rain + rain-probability
            // block WeatherForecast.jsx renders on the web dashboard.
            const Text('RAINFALL OUTLOOK', style: TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
            const SizedBox(height: 8),
            _RainfallOutlookRow(outlook: _outlook, loading: _outlookLoading),
            const SizedBox(height: 16),

            // ── Period toggle ───────────────────────────────────────
            Row(children: [
              Expanded(child: _PeriodTab(
                label: 'Hourly (mm/hr)', selected: _period == 'hourly',
                onTap: () => setState(() => _period = 'hourly'),
              )),
              const SizedBox(width: 8),
              Expanded(child: _PeriodTab(
                label: '24-Hour (mm/day)', selected: _period == 'daily',
                onTap: () => setState(() => _period = 'daily'),
              )),
            ]),
            const SizedBox(height: 14),

            // ── Threshold reference list ────────────────────────────
            const Text('THRESHOLD REFERENCE', style: TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
            const SizedBox(height: 8),
            ...table.map((t) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                border: Border.all(color: AppColors.bgBorder),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 8, height: 8, margin: const EdgeInsets.only(top: 4),
                    decoration: BoxDecoration(color: t.color, borderRadius: BorderRadius.circular(2)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text(t.label, style: TextStyle(
                              color: t.color, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 0.6)),
                          const SizedBox(width: 8),
                          Text(t.pagasa.split('·').last.trim(), style: const TextStyle(
                              color: AppColors.textMuted, fontSize: 10, fontFamily: 'monospace')),
                        ]),
                        const SizedBox(height: 4),
                        Text(t.desc, style: const TextStyle(
                            color: AppColors.textSec, fontSize: 11.5, height: 1.4)),
                      ],
                    ),
                  ),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }
}

// ── Rainfall Outlook Row (next 6h / 12h / 24h) ──────────────────────────────
class _RainfallOutlookRow extends StatelessWidget {
  final _RainfallOutlook? outlook;
  final bool loading;
  const _RainfallOutlookRow({required this.outlook, required this.loading});

  @override
  Widget build(BuildContext context) {
    final cells = [
      ('Next 6 Hours', outlook?.mm6h, outlook?.pct6h),
      ('Next 12 Hours', outlook?.mm12h, outlook?.pct12h),
      ('Next 24 Hours', outlook?.mm24h, outlook?.pct24h),
    ];

    return Row(
      children: cells.map((c) {
        final (label, mm, pct) = c;
        final isLast = c == cells.last;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: isLast ? 0 : 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                border: Border.all(color: AppColors.bgBorder),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(
                      color: AppColors.textMuted, fontSize: 8.5, fontWeight: FontWeight.w800,
                      letterSpacing: 0.4)),
                  const SizedBox(height: 6),
                  loading
                      ? const Text('—', style: TextStyle(
                          color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800))
                      : Row(crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic, children: [
                          Text(mm != null ? mm.toStringAsFixed(1) : '—', style: const TextStyle(
                              color: AppColors.accent, fontSize: 17, fontWeight: FontWeight.w800)),
                          const SizedBox(width: 2),
                          const Text('mm', style: TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
                        ]),
                  if (!loading && pct != null) ...[
                    const SizedBox(height: 2),
                    Text('☔ $pct% chance', style: const TextStyle(
                        color: AppColors.textSec, fontSize: 9)),
                  ],
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Period Toggle Tab ───────────────────────────────────────────────────────
class _PeriodTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _PeriodTab({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: selected ? AppColors.accent.withValues(alpha: 0.12) : AppColors.bgCard,
        border: Border.all(color: selected ? AppColors.accent.withValues(alpha: 0.5) : AppColors.bgBorder),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: TextStyle(
        color: selected ? AppColors.accent : AppColors.textMuted,
        fontSize: 11.5, fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      )),
    ),
  );
}
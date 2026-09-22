// rainfall_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:fl_chart/fl_chart.dart';
import '../main.dart';
import '../widgets/skeleton.dart';
import '../theme/panahon_ui.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../services/cached_api.dart';
import '../services/connectivity_service.dart';
import '../services/offline_cache.dart';


String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

String get _modelUrl => _requireEnv('MODEL_API_URL');
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

double _round1(double v) => (v * 10).round() / 10;

String _formatHour(DateTime dt) {
  final local = dt.toLocal();
  final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final m = local.minute.toString().padLeft(2, '0');
  final period = local.hour < 12 ? 'AM' : 'PM';
  return '$h:$m $period';
}

String _formatDateLabel(String isoDate) {
  try {
    final dt = DateTime.parse(isoDate);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  } catch (_) {
    return isoDate;
  }
}

// ─── History data point (mirrors web's hourlyLogs / dailyData rows) ─────────
class _RainPoint {
  final String label;
  final double value;
  const _RainPoint(this.label, this.value);
}

class _Trend {
  final String label;
  final Color color;
  const _Trend(this.label, this.color);
}

// ─── Main Screen ────────────────────────────────────────────────────────────
class RainfallScreen extends StatefulWidget {
  const RainfallScreen({super.key});

  @override
  State<RainfallScreen> createState() => _RainfallScreenState();
}

class _RainfallScreenState extends State<RainfallScreen> {
  double? _liveRainfall;
  bool _loading = true;
  String _period = 'hourly'; // 'hourly' | 'daily'
  String _view = 'chart'; // 'chart' | 'table'

  List<_RainPoint> _hourlyLogs = [];
  List<_RainPoint> _dailyData = [];
  DateTime? _lastFetched;
  bool _loadingHistory = true;
  RealtimeChannel? _channel;
  // True when what's on screen was loaded from the saved copy.
  bool _fromSaved = false;
  StreamSubscription<void>? _reconnectSub;

  @override
  void initState() {
    super.initState();
    _fetchRainfall();
    _fetchHistory();
    _subscribeRealtime();
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) {
      _fetchRainfall();
      _fetchHistory();
    });
  }

  @override
  void dispose() {
    _reconnectSub?.cancel();
    final channel = _channel;
    if (channel != null) {
      Supabase.instance.client.removeChannel(channel);
    }
    super.dispose();
  }

  void _subscribeRealtime() {
    _channel = Supabase.instance.client
        .channel('rainfall-realtime-mobile')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'flood_snapshots',
          callback: (payload) => _fetchHistory(),
        )
        .subscribe();
  }

  void _applyRainfall(Cached<Map<String, dynamic>> c) {
    if (!mounted) return;
    final m = c.data['live_metrics'] as Map<String, dynamic>? ?? {};
    final v = m['rainfall_mm'];
    setState(() {
      _liveRainfall = v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '');
      _loading = false;
    });
  }

  Future<void> _fetchRainfall() async {
    try {
      final r = await fetchJsonCached(
        _modelUrl,
        cacheKey: 'flood_status', // same payload the shared poller saves
        onSaved: _applyRainfall,
      );
      _applyRainfall(r);
    } catch (e) {
      debugPrint('RAINFALL FETCH ERROR: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  static const _historyCacheKey = 'rainfall_history';

  Future<void> _fetchHistory() async {
    // Paint the saved copy immediately if there's nothing on screen yet.
    if (_hourlyLogs.isEmpty && _dailyData.isEmpty) {
      final saved = await OfflineCache.readJson(_historyCacheKey);
      if (saved != null && saved.data is Map) _applyHistory(saved.data as Map, saved.savedAt, true);
    }
    try {
      final since = DateTime.now().toUtc().subtract(const Duration(hours: 24));

      final hourlyRows = await Supabase.instance.client
          .from('flood_snapshots')
          .select('created_at, rainfall_mm')
          .gte('created_at', since.toIso8601String())
          .order('created_at', ascending: true)
          .timeout(const Duration(seconds: 15));

      final dailyRows = await Supabase.instance.client
          .rpc('get_daily_rainfall', params: {'days_back': 7})
          .timeout(const Duration(seconds: 15));

      final raw = {'hourly': hourlyRows, 'daily': dailyRows};
      unawaited(OfflineCache.writeJson(_historyCacheKey, raw));
      _applyHistory(raw, DateTime.now(), false);
    } catch (e) {
      debugPrint('RAINFALL HISTORY FETCH ERROR: $e');
      if (mounted) setState(() => _loadingHistory = false);
    }
  }

  // Turns the raw rows (live or saved) into chart points. `at` is when the
  // data was fetched — for a saved copy that's when it was saved, which is
  // what drives the "data may be stale" banner.
  void _applyHistory(Map raw, DateTime at, bool fromSaved) {
    if (!mounted) return;
    final sums = <String, double>{};
    final counts = <String, int>{};
    final labels = <String, String>{};
    final order = <String>[];

    for (final row in (raw['hourly'] as List)) {
      final dt = DateTime.parse(row['created_at'] as String).toLocal();
      final key = '${dt.year}-${dt.month}-${dt.day}-${dt.hour}';
      final rainfall = (row['rainfall_mm'] as num).toDouble();
      if (!sums.containsKey(key)) {
        sums[key] = 0;
        counts[key] = 0;
        labels[key] = _formatHour(dt);
        order.add(key);
      }
      sums[key] = sums[key]! + rainfall;
      counts[key] = counts[key]! + 1;
    }

    final hourlyLogs = order
        .map((key) => _RainPoint(labels[key]!, _round1(sums[key]! / counts[key]!)))
        .toList();

    final dailyData = (raw['daily'] as List).map((r) {
      final day = r['day'].toString();
      final rainfall = (r['rainfall'] as num).toDouble();
      return _RainPoint(_formatDateLabel(day), _round1(rainfall));
    }).toList();

    setState(() {
      _hourlyLogs = hourlyLogs;
      _dailyData = dailyData;
      _lastFetched = at;
      _fromSaved = fromSaved;
      _loadingHistory = false;
    });
  }

  // ── Derived metrics (mirrors web's derived metrics block) ────────────────
  List<_RainPoint> get _data => _period == 'hourly' ? _hourlyLogs : _dailyData;

  double get _total => _round1(_data.fold(0.0, (s, d) => s + d.value));

  double get _peak {
    if (_data.isEmpty) return 0;
    return _round1(_data.map((d) => d.value).reduce((a, b) => a > b ? a : b));
  }

  double? get _acc3hr {
    if (_hourlyLogs.isEmpty) return null;
    final slice = _hourlyLogs.length <= 3 ? _hourlyLogs : _hourlyLogs.sublist(_hourlyLogs.length - 3);
    return _round1(slice.fold(0.0, (s, d) => s + d.value));
  }

  double? get _acc6hr {
    if (_hourlyLogs.isEmpty) return null;
    final slice = _hourlyLogs.length <= 6 ? _hourlyLogs : _hourlyLogs.sublist(_hourlyLogs.length - 6);
    return _round1(slice.fold(0.0, (s, d) => s + d.value));
  }

  bool get _isStale =>
      _lastFetched != null && DateTime.now().difference(_lastFetched!) > const Duration(minutes: 5);

  _Trend? get _trend {
    if (_hourlyLogs.length < 6) return null;
    final last3 = _hourlyLogs.sublist(_hourlyLogs.length - 3).fold(0.0, (s, d) => s + d.value);
    final prev3 = _hourlyLogs.sublist(_hourlyLogs.length - 6, _hourlyLogs.length - 3).fold(0.0, (s, d) => s + d.value);
    final delta = last3 - prev3;
    if (delta > 1) return const _Trend('⬆ Increasing', AppColors.red);
    if (delta < -1) return const _Trend('⬇ Decreasing', AppColors.green);
    return const _Trend('➡ Steady', AppColors.textSec);
  }

  @override
  Widget build(BuildContext context) {
    final table = _period == 'hourly' ? _hourlyThresholds : _dailyThresholds;
    final mm = _liveRainfall ?? 0;
    final cat = _categoryFor(mm, _hourlyThresholds);

    final acc3hr = _acc3hr;
    final acc6hr = _acc6hr;
    final acc3hrCat = acc3hr != null ? _categoryFor(acc3hr, _hourlyThresholds) : null;
    final acc6hrCat = acc6hr != null ? _categoryFor(acc6hr, _hourlyThresholds) : null;
    final peak = _peak;
    final total = _total;

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_fetchRainfall(), _fetchHistory()]);
      },
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
              const Text('PAGASA Rainfall Thresholds',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 12),

            // ── Staleness warning ─────────────────────────────────────
            if (_isStale) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: AppColors.red.withValues(alpha: 0.07),
                  border: Border.all(color: AppColors.red.withValues(alpha: 0.25)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded, color: AppColors.red, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: const TextStyle(fontSize: 11.5, color: Color(0xFFF87171)),
                        children: [
                          TextSpan(
                              text: _fromSaved ? 'Showing saved data' : 'Data may be stale',
                              style: const TextStyle(fontWeight: FontWeight.w800)),
                          TextSpan(
                              text: _fromSaved
                                  ? ' — last updated ${agoLabel(_lastFetched!)}. It will refresh when you\'re back online.'
                                  : ' — last update was over 5 minutes ago. Check backend connectivity.'),
                        ],
                      ),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
            ],

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
                        const SizedBox(height: 8),
                        Wrap(spacing: 14, runSpacing: 4, children: [
                          if (acc3hr != null) _MiniStat(label: '3-hr accumulation', value: '${acc3hr.toStringAsFixed(1)} mm'),
                          if (acc6hr != null) _MiniStat(label: '6-hr accumulation', value: '${acc6hr.toStringAsFixed(1)} mm'),
                          _MiniStat(label: 'Peak intensity', value: '${peak.toStringAsFixed(1)} mm/hr'),
                        ]),
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

            // ── KPI Grid ─────────────────────────────────────────────
            const Text('AT A GLANCE', style: TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _KpiCard(
                label: 'Total Accumulated',
                value: total.toStringAsFixed(1),
                unit: 'mm',
                color: AppColors.accent,
                sub: _period == 'hourly' ? 'Last 24 hours · hourly average' : 'Last 7 days · daily total',
              )),
              const SizedBox(width: 10),
              Expanded(child: _KpiCard(
                label: _period == 'hourly' ? 'Peak Intensity' : 'Peak Day',
                value: peak.toStringAsFixed(1),
                unit: _period == 'hourly' ? 'mm/hr' : 'mm',
                color: peak > 0 ? _categoryFor(peak, table).color : AppColors.green,
                sub: peak > 0
                    ? '${_categoryFor(peak, table).label}${_period == 'hourly' ? ' intensity' : ''}'
                    : 'No rainfall recorded',
              )),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _KpiCard(
                label: '3-Hr Accumulation',
                value: acc3hr != null ? acc3hr.toStringAsFixed(1) : '—',
                unit: acc3hr != null ? 'mm' : '',
                color: acc3hrCat?.color ?? AppColors.textMuted,
                sub: acc3hr != null ? '${acc3hrCat!.label} · ${_trend?.label ?? '—'}' : 'Insufficient hourly data',
                badge: acc3hrCat?.label,
                badgeColor: acc3hrCat?.color,
              )),
              const SizedBox(width: 10),
              Expanded(child: _KpiCard(
                label: '6-Hr Accumulation',
                value: acc6hr != null ? acc6hr.toStringAsFixed(1) : '—',
                unit: acc6hr != null ? 'mm' : '',
                color: acc6hrCat?.color ?? AppColors.textMuted,
                sub: acc6hr != null ? 'PAGASA Intense threshold at 15mm/hr' : 'Insufficient hourly data',
                badge: (acc6hr != null && acc6hr >= 15) ? 'Above Intense' : null,
                badgeColor: AppColors.red,
              )),
            ]),
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

            // ── Chart / Table card ────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                border: Border.all(color: AppColors.bgBorder),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(
                      child: Text(
                        'Rainfall ${_period == 'hourly' ? 'Intensity (mm/hr)' : 'Accumulation (mm/24hr)'}',
                        style: const TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                    ),
                    if (_lastFetched != null) ...[
                      Text('synced ${_formatHour(_lastFetched!)}',
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
                      const SizedBox(width: 8),
                    ],
                    _ViewToggleButton(
                      icon: Icons.bar_chart_rounded,
                      selected: _view == 'chart',
                      onTap: () => setState(() => _view = 'chart'),
                    ),
                    const SizedBox(width: 4),
                    _ViewToggleButton(
                      icon: Icons.table_rows_rounded,
                      selected: _view == 'table',
                      onTap: () => setState(() => _view = 'table'),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.bgMid,
                      border: Border.all(color: AppColors.bgBorder),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      _period == 'hourly'
                          ? 'Thresholds based on PAGASA hourly rainfall intensity classification (mm/hr)'
                          : 'Thresholds based on PAGASA 24-hour accumulated rainfall classification (mm/24hr)',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 9.5, height: 1.4),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_loadingHistory)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Skeleton(height: 170, radius: 12),
                    )
                  else if (_data.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 30),
                      child: Center(
                        child: Text(
                          'No data yet — logs will appear once the backend starts recording.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  else if (_view == 'chart')
                    _RainfallBarChart(data: _data, thresholds: table, period: _period)
                  else
                    _RainfallTable(data: _data, thresholds: table, period: _period),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // ── Threshold reference list ────────────────────────────
            const Text('THRESHOLD REFERENCE', style: TextStyle(
                color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
            const SizedBox(height: 8),
            ...table.map((t) {
              final isActive = _liveRainfall != null && mm >= t.min && mm < t.max;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isActive ? t.color.withValues(alpha: 0.08) : AppColors.bgCard,
                  border: Border.all(color: isActive ? t.color.withValues(alpha: 0.5) : AppColors.bgBorder),
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
                            if (isActive) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: t.color.withValues(alpha: 0.2),
                                  border: Border.all(color: t.color.withValues(alpha: 0.5)),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text('NOW', style: TextStyle(
                                    color: t.color, fontWeight: FontWeight.w800, fontSize: 8.5, letterSpacing: 0.5)),
                              ),
                            ],
                          ]),
                          const SizedBox(height: 4),
                          Text(t.desc, style: const TextStyle(
                              color: AppColors.textSec, fontSize: 11.5, height: 1.4)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

// ── Mini stat (inline label:value pair used inside the hero card) ───────────
class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(
      style: const TextStyle(fontSize: 10.5, color: AppColors.textMuted),
      children: [
        TextSpan(text: '$label: '),
        TextSpan(text: value, style: const TextStyle(color: AppColors.textSec, fontWeight: FontWeight.w700)),
      ],
    ),
  );
}

// ── KPI card (mirrors web's KPI grid card) ───────────────────────────────────
class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final String unit;
  final Color color;
  final String sub;
  final String? badge;
  final Color? badgeColor;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.unit,
    required this.color,
    required this.sub,
    this.badge,
    this.badgeColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        border: Border.all(color: AppColors.bgBorder),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Colored top accent strip — kept as a separate clipped layer
          // instead of a per-side Border, since Flutter can't combine a
          // non-uniform Border with a borderRadius.
          Container(height: 3, color: color),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                const SizedBox(height: 6),
                Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                  Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900)),
                  if (unit.isNotEmpty) ...[
                    const SizedBox(width: 3),
                    Text(unit, style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5, fontWeight: FontWeight.w600)),
                  ],
                ]),
                if (badge != null) ...[
                  const SizedBox(height: 5),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (badgeColor ?? color).withValues(alpha: 0.15),
                      border: Border.all(color: (badgeColor ?? color).withValues(alpha: 0.4)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(badge!, style: TextStyle(color: badgeColor ?? color, fontSize: 9, fontWeight: FontWeight.w800)),
                  ),
                ],
                const SizedBox(height: 6),
                Text(sub, style: const TextStyle(color: AppColors.textSec, fontSize: 10, height: 1.3)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Chart/table view toggle button ───────────────────────────────────────────
class _ViewToggleButton extends StatelessWidget {
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _ViewToggleButton({required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: selected ? AppColors.accent.withValues(alpha: 0.15) : Colors.transparent,
        border: Border.all(color: selected ? AppColors.accent.withValues(alpha: 0.5) : AppColors.bgBorder),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Icon(icon, size: 15, color: selected ? AppColors.accent : AppColors.textMuted),
    ),
  );
}

// ── Bar chart (mirrors web's recharts BarChart with reference lines) ────────
class _RainfallBarChart extends StatelessWidget {
  final List<_RainPoint> data;
  final List<_Threshold> thresholds;
  final String period;

  const _RainfallBarChart({required this.data, required this.thresholds, required this.period});

  @override
  Widget build(BuildContext context) {
    final maxVal = data.map((d) => d.value).fold<double>(0, (a, b) => a > b ? a : b);
    final refLines = thresholds.skip(1).toList();
    final topRef = refLines.isNotEmpty ? refLines.last.min : 0.0;
    final chartMax = [maxVal * 1.2, topRef * 1.15, 1.0].reduce((a, b) => a > b ? a : b);
    final labelInterval = period == 'hourly' ? (data.length / 6).ceil().clamp(1, 999) : 1;

    return SizedBox(
      height: 220,
      child: BarChart(
        BarChartData(
          maxY: chartMax,
          minY: 0,
          alignment: BarChartAlignment.spaceAround,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: chartMax / 4,
            getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.bgBorder, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 32,
                getTitlesWidget: (value, meta) => Text(value.toStringAsFixed(0),
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 9)),
              ),
            ),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                getTitlesWidget: (value, meta) {
                  final i = value.toInt();
                  if (i < 0 || i >= data.length || i % labelInterval != 0) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(data[i].label,
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 8.5),
                        textAlign: TextAlign.center),
                  );
                },
              ),
            ),
          ),
          extraLinesData: ExtraLinesData(
            horizontalLines: refLines.map((t) => HorizontalLine(
              y: t.min,
              color: t.color.withValues(alpha: 0.5),
              strokeWidth: 1,
              dashArray: const [4, 3],
              label: HorizontalLineLabel(
                show: true,
                alignment: Alignment.topRight,
                style: TextStyle(color: t.color, fontSize: 8, fontWeight: FontWeight.w700),
                labelResolver: (line) => '${t.label} (${t.min.toStringAsFixed(0)}mm)',
              ),
            )).toList(),
          ),
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => AppColors.bgDark,
              tooltipBorder: const BorderSide(color: AppColors.bgBorder),
              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                final point = data[group.x.toInt()];
                final cat = _categoryFor(point.value, thresholds);
                return BarTooltipItem(
                  '${point.label}\n',
                  const TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700, fontSize: 11),
                  children: [
                    TextSpan(
                      text: '${point.value} ${period == 'hourly' ? 'mm/hr' : 'mm'} · ${cat.label}',
                      style: TextStyle(color: cat.color, fontWeight: FontWeight.w800, fontSize: 11),
                    ),
                  ],
                );
              },
            ),
          ),
          barGroups: List.generate(data.length, (i) {
            return BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: data[i].value,
                  color: AppColors.accent,
                  width: data.length > 16 ? 6 : 14,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}

// ── Table view (mirrors web's data table) ────────────────────────────────────
class _RainfallTable extends StatelessWidget {
  final List<_RainPoint> data;
  final List<_Threshold> thresholds;
  final String period;

  const _RainfallTable({required this.data, required this.thresholds, required this.period});

  @override
  Widget build(BuildContext context) {
    final rows = data.reversed.toList();
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 280),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const ClampingScrollPhysics(),
        itemCount: rows.length,
        separatorBuilder: (_, __) => const Divider(color: AppColors.bgBorder, height: 1),
        itemBuilder: (context, i) {
          final point = rows[i];
          final cat = _categoryFor(point.value, thresholds);
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 66,
                  child: Text(point.label, style: const TextStyle(color: AppColors.textSec, fontSize: 11)),
                ),
                SizedBox(
                  width: 68,
                  child: Text('${point.value} ${period == 'hourly' ? 'mm/hr' : 'mm'}',
                      style: TextStyle(color: cat.color, fontWeight: FontWeight.w800, fontSize: 11)),
                ),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: cat.color.withValues(alpha: 0.15),
                        border: Border.all(color: cat.color.withValues(alpha: 0.4)),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(cat.label,
                          style: TextStyle(color: cat.color, fontWeight: FontWeight.w800, fontSize: 9.5)),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
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
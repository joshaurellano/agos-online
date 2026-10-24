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
// Same /api/forecast the Dashboard uses (hourly + outlook). Shared cache key, so
// the Dashboard's saved copy also works here offline.
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

  // ── Forecast (what's COMING) ────────────────────────────────────────────
  // The screen used to show only what already fell. Residents mostly want to
  // know "when will it rain / when will it stop?", so the next 24 h now sits
  // right under the live reading.
  List<Map<String, dynamic>> _fcHourly = [];
  Map<String, dynamic>? _outlook;
  bool _fcLoading = true;
  int? _fcSel; // tapped forecast bar

  @override
  void initState() {
    super.initState();
    _fetchRainfall();
    _fetchHistory();
    _fetchForecast();
    _subscribeRealtime();
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) {
      _fetchRainfall();
      _fetchHistory();
      _fetchForecast();
    });
  }

  void _applyForecast(Cached<Map<String, dynamic>> c) {
    if (!mounted) return;
    var hourly = (c.data['hourly'] as List? ?? []).cast<Map<String, dynamic>>();
    if (c.fromCache) {
      // A saved forecast starts at the hour it was saved — drop hours that
      // have already passed so "Now" is never an old hour.
      final cutoff = DateTime.now().subtract(const Duration(minutes: 59));
      hourly = hourly.where((h) {
        final t = DateTime.tryParse(h['time']?.toString() ?? '');
        return t != null && t.isAfter(cutoff);
      }).toList();
    }
    setState(() {
      _fcHourly = hourly;
      _outlook = c.data['outlook'] as Map<String, dynamic>?;
      _fcLoading = false;
    });
  }

  Future<void> _fetchForecast() async {
    try {
      final r = await fetchJsonCached(
        _forecastUrl,
        cacheKey: 'forecast_hourly',
        maxCacheAge: const Duration(hours: 6),
        onSaved: _applyForecast,
      );
      _applyForecast(r);
    } catch (e) {
      debugPrint('RAINFALL FORECAST ERROR: $e');
      if (mounted) setState(() => _fcLoading = false);
    }
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
    return _Trend('➡ Steady', AppColors.textSec);
  }

  // ── Forecast helpers ──────────────────────────────────────────────────────
  static const _wet = 0.1; // mm/hr below this counts as dry (model noise)

  List<({DateTime? t, double v})> get _fcPoints => _fcHourly
      .take(24)
      .map((h) => (
            t: DateTime.tryParse(h['time']?.toString() ?? ''),
            v: (h['precipitation'] as num? ?? 0).toDouble(),
          ))
      .toList();

  String _hourLabel(DateTime? t, int fallbackIdx) {
    if (t == null) return 'in ~$fallbackIdx h';
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    return '$h ${t.hour < 12 ? 'AM' : 'PM'}';
  }

  // One plain-language sentence: the thing a resident actually wants to know.
  String? get _narrative {
    final pts = _fcPoints;
    if (pts.isEmpty) return null;
    final nowRate = _liveRainfall ?? pts.first.v;
    if (nowRate >= _wet) {
      final idx = pts.indexWhere((p) => p.v < _wet);
      if (idx == -1) return 'Rain is forecast to continue through the next 24 hours.';
      if (idx <= 0) return 'Rain should ease within the hour.';
      return 'Rain should ease around ${_hourLabel(pts[idx].t, idx)}.';
    }
    final idx = pts.indexWhere((p) => p.v >= _wet);
    if (idx == -1) return 'No rain expected in the next 24 hours.';
    return 'Dry for now — rain expected around ${_hourLabel(pts[idx].t, idx)}.';
  }

  String? get _peakLine {
    final pts = _fcPoints;
    if (pts.isEmpty) return null;
    var best = 0;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].v > pts[best].v) best = i;
    }
    if (pts[best].v < _wet) return null;
    final band = _categoryFor(pts[best].v, _hourlyThresholds);
    return 'Heaviest around ${_hourLabel(pts[best].t, best)} · '
        '${pts[best].v.toStringAsFixed(1)} mm/hr (${band.label.toLowerCase()})';
  }

  String _num1(dynamic v) {
    final n = v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '');
    return n == null ? '—' : n.toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    final table = _period == 'hourly' ? _hourlyThresholds : _dailyThresholds;
    final mm = _liveRainfall ?? 0;
    final cat = _categoryFor(mm, _hourlyThresholds);
    final raining = mm >= _wet;

    final acc3hr = _acc3hr;
    final acc6hr = _acc6hr;
    final narrative = _narrative;
    final peakLine = _peakLine;
    final fc = _fcPoints;
    final heroColor = raining ? cat.color : AppColors.green;

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_fetchRainfall(), _fetchHistory(), _fetchForecast()]);
      },
      color: AppColors.accent,
      backgroundColor: AppColors.bgDark,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
                  Icon(Icons.error_outline_rounded, color: AppColors.ink(AppColors.red), size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: TextStyle(fontSize: 11.5, color: AppColors.redText),
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

            // ── 1. Rain right now + what happens next ──────────────────
            PanahonHeroCard(
              accentColor: heroColor,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('RAIN RIGHT NOW', style: TextStyle(
                            color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
                        const SizedBox(height: 6),
                        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(
                            _liveRainfall != null ? _liveRainfall!.toStringAsFixed(1) : '—',
                            style: TextStyle(color: AppColors.textPri, fontSize: 44,
                                fontWeight: FontWeight.w900, height: 1, letterSpacing: -1.5),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 7, left: 5),
                            child: Text('mm/hr', style: TextStyle(
                                color: AppColors.textSec, fontSize: 14, fontWeight: FontWeight.w700)),
                          ),
                        ]),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: heroColor.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: heroColor.withValues(alpha: 0.4)),
                          ),
                          child: Text(
                            _loading && _liveRainfall == null
                                ? 'LOADING…'
                                : (raining ? '${cat.label.toUpperCase()} RAIN' : 'NO RAIN'),
                            style: TextStyle(color: AppColors.ink(heroColor),
                                fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 0.4),
                          ),
                        ),
                      ]),
                    ),
                    Container(
                      width: 56, height: 56,
                      decoration: BoxDecoration(
                        color: heroColor.withValues(alpha: 0.14),
                        shape: BoxShape.circle,
                        border: Border.all(color: heroColor.withValues(alpha: 0.4), width: 1.5),
                      ),
                      child: Center(
                        child: Text(raining ? _emojiFor(cat.label) : '🌤', style: const TextStyle(fontSize: 24)),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  _IntensityScale(rate: mm, table: _hourlyThresholds),
                  const SizedBox(height: 14),
                  if (narrative != null)
                    Text(narrative, style: TextStyle(
                        color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800, height: 1.3))
                  else if (_fcLoading)
                    const Skeleton(height: 16, radius: 6)
                  else
                    Text('Forecast unavailable right now.',
                        style: TextStyle(color: AppColors.textSec, fontSize: 12.5)),
                  if (peakLine != null) ...[
                    const SizedBox(height: 4),
                    Text(peakLine, style: TextStyle(color: AppColors.textSec, fontSize: 11.5)),
                  ],
                  if (raining) ...[
                    const SizedBox(height: 10),
                    Text(cat.desc, style: TextStyle(color: AppColors.textSec, fontSize: 11.5, height: 1.4)),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 16),

            // ── 2. Next 24 hours ──────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                border: Border.all(color: AppColors.bgBorder),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Text('🌧', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('Next 24 hours', style: TextStyle(
                        color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                  Text('tap a bar', style: TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
                ]),
                const SizedBox(height: 10),
                if (_fcLoading && fc.isEmpty)
                  const Skeleton(height: 110, radius: 12)
                else if (fc.length < 2)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 22),
                    child: Center(
                      child: Text('Forecast not available — pull down to retry.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ),
                  )
                else ...[
                  _ForecastBars(
                    points: fc,
                    selected: _fcSel,
                    onSelect: (i) => setState(() => _fcSel = _fcSel == i ? null : i),
                    labelFor: _hourLabel,
                  ),
                  if (_outlook != null) ...[
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: _StatCol(label: 'Next 6 h', value: '${_num1(_outlook!['next_6h_rain_mm'])} mm',
                          sub: _outlook!['next_6h_rain_probability_pct'] != null
                              ? '${_outlook!['next_6h_rain_probability_pct']}% chance' : null)),
                      const SizedBox(width: 8),
                      Expanded(child: _StatCol(label: 'Next 12 h', value: '${_num1(_outlook!['next_12h_rain_mm'])} mm',
                          sub: _outlook!['next_12h_rain_probability_pct'] != null
                              ? '${_outlook!['next_12h_rain_probability_pct']}% chance' : null)),
                      const SizedBox(width: 8),
                      Expanded(child: _StatCol(label: 'Next 24 h', value: '${_num1(_outlook!['next_24h_rain_mm'])} mm',
                          sub: _outlook!['next_24h_rain_probability_pct'] != null
                              ? '${_outlook!['next_24h_rain_probability_pct']}% chance' : null)),
                    ]),
                  ],
                ],
              ]),
            ),
            const SizedBox(height: 16),

            // ── 3. What already fell ──────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                border: Border.all(color: AppColors.bgBorder),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Text('📊', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('Rain that has fallen', style: TextStyle(
                        color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                  if (_trend != null)
                    Text(_trend!.label, style: TextStyle(
                        color: AppColors.ink(_trend!.color), fontSize: 11, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 10),
                if (_loadingHistory)
                  const Skeleton(height: 54, radius: 10)
                else ...[
                  Row(children: [
                    Expanded(child: _StatCol(label: 'Last 3 h',
                        value: acc3hr != null ? '${acc3hr.toStringAsFixed(1)} mm' : '—')),
                    const SizedBox(width: 8),
                    Expanded(child: _StatCol(label: 'Last 6 h',
                        value: acc6hr != null ? '${acc6hr.toStringAsFixed(1)} mm' : '—')),
                    const SizedBox(width: 8),
                    Expanded(child: _StatCol(label: 'Last 24 h',
                        value: _hourlyLogs.isNotEmpty
                            ? '${_round1(_hourlyLogs.fold(0.0, (s, d) => s + d.value)).toStringAsFixed(1)} mm'
                            : '—')),
                  ]),
                  if (_hourlyLogs.length < 3) ...[
                    const SizedBox(height: 8),
                    Text('Totals fill in as the app records more readings.',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
                  ] else if (acc6hr != null && acc6hr >= 15) ...[
                    const SizedBox(height: 8),
                    Text('6-hour total is above the PAGASA Intense threshold — watch creek and drainage levels.',
                        style: TextStyle(color: AppColors.ink(AppColors.red), fontSize: 10.5, height: 1.35)),
                  ],
                ],
              ]),
            ),
            const SizedBox(height: 16),

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
                        style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                    ),
                    if (_lastFetched != null) ...[
                      Text('synced ${_formatHour(_lastFetched!)}',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
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
                  const SizedBox(height: 10),
                  _PeriodSegmented(
                    period: _period,
                    onChanged: (v) => setState(() => _period = v),
                  ),
                  const SizedBox(height: 12),
                  if (_loadingHistory)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Skeleton(height: 170, radius: 12),
                    )
                  else if (_data.isEmpty)
                    Padding(
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
                  if (!_loadingHistory && _data.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      _period == 'hourly'
                          ? 'Bar colours follow the PAGASA hourly intensity scale (mm/hr).'
                          : 'Bar colours follow the PAGASA 24-hour rainfall scale (mm/day).',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 9.5, height: 1.4),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),


            _ReferenceTile(
              title: 'What do the rain levels mean?',
              subtitle: 'PAGASA ${_period == 'hourly' ? 'hourly' : '24-hour'} classification',
              child: Column(children: table.map((t) {
              final isActive = _period == 'hourly' && _liveRainfall != null && mm >= t.min && mm < t.max;
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
                                color: AppColors.ink(t.color), fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 0.6)),
                            const SizedBox(width: 8),
                            Text(t.pagasa.split('·').last.trim(), style: TextStyle(
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
                                    color: AppColors.ink(t.color), fontWeight: FontWeight.w800, fontSize: 8.5, letterSpacing: 0.5)),
                              ),
                            ],
                          ]),
                          const SizedBox(height: 4),
                          Text(t.desc, style: TextStyle(
                              color: AppColors.textSec, fontSize: 11.5, height: 1.4)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }).toList()),
            ),
          ],
        ),
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
            getDrawingHorizontalLine: (_) => FlLine(color: AppColors.bgBorder, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 32,
                getTitlesWidget: (value, meta) => Text(value.toStringAsFixed(0),
                    style: TextStyle(color: AppColors.textMuted, fontSize: 9)),
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
                        style: TextStyle(color: AppColors.textMuted, fontSize: 8.5),
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
                style: TextStyle(color: AppColors.ink(t.color), fontSize: 8, fontWeight: FontWeight.w700),
                labelResolver: (line) => '${t.label} (${t.min.toStringAsFixed(0)}mm)',
              ),
            )).toList(),
          ),
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => AppColors.bgDark,
              tooltipBorder: BorderSide(color: AppColors.bgBorder),
              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                final point = data[group.x.toInt()];
                final cat = _categoryFor(point.value, thresholds);
                return BarTooltipItem(
                  '${point.label}\n',
                  TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700, fontSize: 11),
                  children: [
                    TextSpan(
                      text: '${point.value} ${period == 'hourly' ? 'mm/hr' : 'mm'} · ${cat.label}',
                      style: TextStyle(color: AppColors.ink(cat.color), fontWeight: FontWeight.w800, fontSize: 11),
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
        separatorBuilder: (_, __) => Divider(color: AppColors.bgBorder, height: 1),
        itemBuilder: (context, i) {
          final point = rows[i];
          final cat = _categoryFor(point.value, thresholds);
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 66,
                  child: Text(point.label, style: TextStyle(color: AppColors.textSec, fontSize: 11)),
                ),
                SizedBox(
                  width: 68,
                  child: Text('${point.value} ${period == 'hourly' ? 'mm/hr' : 'mm'}',
                      style: TextStyle(color: AppColors.ink(cat.color), fontWeight: FontWeight.w800, fontSize: 11)),
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
                          style: TextStyle(color: AppColors.ink(cat.color), fontWeight: FontWeight.w800, fontSize: 9.5)),
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



// ─── Intensity scale: PAGASA bands with a marker at the current rate ────────
class _IntensityScale extends StatelessWidget {
  final double rate;
  final List<_Threshold> table;
  const _IntensityScale({required this.rate, required this.table});

  // Position 0..1: each of the 5 bands gets an equal slice, so a trickle and
  // a downpour are both readable (a linear mm scale would squash Light).
  double get _pos {
    for (var i = 0; i < table.length; i++) {
      final t = table[i];
      if (rate >= t.min && rate < t.max) {
        final hi = t.max > 1000 ? t.min * 2 : t.max;
        final f = ((rate - t.min) / (hi - t.min)).clamp(0.0, 1.0);
        return (i + f) / table.length;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      final left = (w * _pos - 6).clamp(0.0, (w - 12).clamp(0.0, double.infinity)).toDouble();
      return Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          height: 14,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(
              top: 4, bottom: 4,
              child: Row(children: [
                for (var i = 0; i < table.length; i++)
                  Expanded(
                    child: Container(
                      margin: EdgeInsets.only(right: i == table.length - 1 ? 0 : 2),
                      decoration: BoxDecoration(
                        color: table[i].color.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
              ]),
            ),
            Positioned(
              left: left,
              top: 0,
              child: Container(
                width: 14, height: 14,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: AppColors.bgDark, width: 2.5),
                  boxShadow: [BoxShadow(color: AppColors.shadow(0.4), blurRadius: 3)],
                ),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 3),
        Row(children: [
          for (final t in table)
            Expanded(
              child: Text(t.label,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 8.5, fontWeight: FontWeight.w600)),
            ),
        ]),
      ]);
    });
  }
}

// ─── 24-hour forecast bars (tap a bar for its hour) ─────────────────────────
class _ForecastBars extends StatelessWidget {
  final List<({DateTime? t, double v})> points;
  final int? selected;
  final ValueChanged<int> onSelect;
  final String Function(DateTime?, int) labelFor;
  const _ForecastBars({
    required this.points,
    required this.selected,
    required this.onSelect,
    required this.labelFor,
  });

  @override
  Widget build(BuildContext context) {
    final maxV = points.fold<double>(2.5, (m, p) => p.v > m ? p.v : m);
    // Default readout = the heaviest hour; tapping a bar shows that hour.
    var best = 0;
    for (var i = 1; i < points.length; i++) {
      if (points[i].v > points[best].v) best = i;
    }
    final idx = selected ?? best;
    final sel = points[idx];
    final band = _categoryFor(sel.v, _hourlyThresholds);
    final dry = sel.v < 0.1;
    final readout = '${idx == 0 ? 'Now' : labelFor(sel.t, idx)} · '
        '${dry ? 'dry' : '${sel.v.toStringAsFixed(1)} mm/hr · ${band.label}'}';

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(readout,
          style: TextStyle(
              color: dry ? AppColors.textSec : AppColors.ink(band.color),
              fontSize: 12,
              fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      SizedBox(
        height: 84,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: List.generate(points.length, (i) {
            final v = points[i].v;
            final isDry = v < 0.1;
            final h = isDry ? 3.0 : (8 + (v / maxV) * 76).clamp(8.0, 84.0).toDouble();
            final color = isDry ? AppColors.bgBorder : _categoryFor(v, _hourlyThresholds).color;
            return Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onSelect(i),
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      height: h,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: i == idx ? 1 : 0.7),
                        borderRadius: BorderRadius.circular(2),
                        border: i == idx ? Border.all(color: AppColors.textPri, width: 1.2) : null,
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
      const SizedBox(height: 4),
      Row(
        children: List.generate(points.length, (i) {
          final show = i % 4 == 0;
          return Expanded(
            child: show
                // Fixed height + explicit maxHeight: an OverflowBox with only
                // maxWidth inherits the (unbounded) height of the scroll view
                // and tries to be infinitely tall.
                ? SizedBox(
                    height: 12,
                    child: OverflowBox(
                    maxWidth: 48,
                    maxHeight: 12,
                    child: Text(i == 0 ? 'Now' : labelFor(points[i].t, i),
                        maxLines: 1,
                        softWrap: false,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w600)),
                  ))
                : const SizedBox(height: 12),
          );
        }),
      ),
    ]);
  }
}

// ─── Small labelled value tile ───────────────────────────────────────────────
class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  const _StatCol({required this.label, required this.value, this.sub});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: AppColors.bgMid,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: TextStyle(color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: AppColors.textPri, fontSize: 14.5, fontWeight: FontWeight.w900)),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub!, style: TextStyle(color: AppColors.textSec, fontSize: 9.5)),
          ],
        ]),
      );
}

// ─── Hourly / Daily segmented switch ─────────────────────────────────────────
class _PeriodSegmented extends StatelessWidget {
  final String period;
  final ValueChanged<String> onChanged;
  const _PeriodSegmented({required this.period, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    Widget seg(String key, String label) {
      final sel = period == key;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(key),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: sel ? AppColors.accent.withValues(alpha: 0.16) : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: sel ? AppColors.accent.withValues(alpha: 0.5) : Colors.transparent),
            ),
            child: Center(
              child: Text(label,
                  style: TextStyle(
                      color: sel ? AppColors.accent : AppColors.textSec,
                      fontSize: 12,
                      fontWeight: sel ? FontWeight.w800 : FontWeight.w600)),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.bgMid,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.bgBorder),
      ),
      child: Row(children: [
        seg('hourly', 'Last 24 hours'),
        seg('daily', 'Last 7 days'),
      ]),
    );
  }
}

// ─── Collapsible reference block ─────────────────────────────────────────────
class _ReferenceTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;
  const _ReferenceTile({required this.title, required this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 14),
            childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
            leading: Icon(Icons.help_outline_rounded, color: AppColors.accent, size: 18),
            title: Text(title,
                style: TextStyle(color: AppColors.textPri, fontSize: 13, fontWeight: FontWeight.w800)),
            subtitle: Text(subtitle, style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
            iconColor: AppColors.textSec,
            collapsedIconColor: AppColors.textSec,
            children: [child],
          ),
        ),
      );
}

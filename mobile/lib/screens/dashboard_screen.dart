// dashboard_screen.dart
//
// Resident-facing home screen for AGOS. Redesigned to read like a plain
// weather-forecast app first, technical instrument panel a distant second:
//
//   1. Hero card       — today's flood outlook, in plain language
//   2. Quick stat bar   — rainfall now / humidity
//   3. Hourly Forecast — next 48 hours, straight from Open-Meteo
//   4. Daily Flood Forecast — the model's actual 14-day forward outlook
//      (previously unused in this screen — GET /api/forecast-flood)
//   5. Quick actions, the Alert Levels reference table, and the Rain Map
//      link live further down, for anyone who wants to dig in.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/auth_service.dart';
import '../services/flood_status_service.dart';
import '../services/model_api_client.dart';
import '../theme/panahon_ui.dart';

// ─── URLs ─────────────────────────────────────────────────────────────────────
// Read from .env (see README) so the backend can be swapped between
// dev/staging/prod without touching code. No fallback: if a key is missing
// or misspelled in .env, this throws immediately at first use instead of
// silently hitting some other backend, which makes misconfiguration obvious
// right away rather than showing up as "forecast unavailable" in the UI.
//
// MODEL_API_URL itself is no longer read here directly — the day/hourly
// prediction now comes from the shared FloodStatusService (see
// services/flood_status_service.dart), which polls it once for the whole
// app instead of this screen and AlertScreen each running their own
// separate 30-second timer against the same endpoint.
String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

String get _forecastUrl => _requireEnv('FORECAST_API_URL');

// The model's own forward-looking 14-day flood forecast (GET /api/forecast-flood).
String get _forecastFloodUrl => _requireEnv('FORECAST_FLOOD_API_URL');

// ─── Alert Colors ─────────────────────────────────────────────────────────────
const _alertColors = {
  'NORMAL':   Color(0xFF22c55e),
  'ADVISORY': Color(0xFFeab308),
  'WARNING':  Color(0xFFf97316),
  'CRITICAL': Color(0xFFef4444),
};

// ─── Threshold data (used by the reference table further down) ──────────────
// Keyed off flood probability (%) rather than water level, since there's no
// live water-level sensor — probability is what the model actually outputs,
// and these cutoffs match the backend's own probability_to_alert_level().
class _Threshold {
  final double min, max;
  final String label, range, action;
  final Color color;
  const _Threshold(this.min, this.max, this.label, this.range, this.action, this.color);
}

const _thresholds = {
  'NORMAL':   _Threshold(0,  24.9, 'Normal',   '< 25%',      'Continue normal activities. Monitor updates.',              Color(0xFF22c55e)),
  'ADVISORY': _Threshold(25, 49.9, 'Advisory', '25 – 49%',   'Stay alert. Prepare emergency go-bags.',                   Color(0xFFeab308)),
  'WARNING':  _Threshold(50, 74.9, 'Warning',  '50 – 74%',   'Move valuables to higher ground. Be ready to evacuate.',   Color(0xFFf97316)),
  'CRITICAL': _Threshold(75, 100,  'Critical', '≥ 75%',      'Evacuate immediately to designated evacuation centers.',   Color(0xFFef4444)),
};

// ─── Plain-language guidance per alert level ──────────────────────────────────
class _LevelGuidance {
  final String key, range;
  final List<String> actions;
  const _LevelGuidance(this.key, this.range, this.actions);
}

const _levelGuidance = [
  _LevelGuidance('NORMAL', '< 25%', [
    'Continue your normal activities.',
    'Check the app occasionally for updates.',
  ]),
  _LevelGuidance('ADVISORY', '25 – 49%', [
    'Stay alert and monitor rainfall updates.',
    'Prepare an emergency go-bag.',
    'Move vehicles and valuables away from low-lying areas.',
  ]),
  _LevelGuidance('WARNING', '50 – 74%', [
    'Move valuables and appliances to higher ground.',
    'Charge phones and power banks.',
    'Keep go-bags ready near the door.',
    'Avoid flooded roads and bridges.',
  ]),
  _LevelGuidance('CRITICAL', '≥ 75%', [
    'Evacuate immediately to the nearest designated center.',
    'Turn off electrical mains before leaving, if safe.',
    'Assist elderly, children, and PWDs first.',
    'Follow official evacuation routes only.',
  ]),
];

// ─── Friendly hero copy per alert level ───────────────────────────────────────
class _HeroCopy {
  final String headline, tagline;
  const _HeroCopy(this.headline, this.tagline);
}

const _heroCopy = {
  'NORMAL':   _HeroCopy("You're Safe Right Now",  'No flooding risk in Brgy. Triangulo. Enjoy your day.'),
  'ADVISORY': _HeroCopy('Stay Alert',              'Water levels are starting to rise. Keep an eye on updates.'),
  'WARNING':  _HeroCopy('Get Ready to Evacuate',   'Flooding is likely soon. Prepare to leave if it worsens.'),
  'CRITICAL': _HeroCopy('Evacuate Now',            'Flooding is happening or about to happen. Move to safety.'),
};

// ─── Prediction model ─────────────────────────────────────────────────────────
AlertLevelType _alertFromInt(int level) {
  switch (level) {
    case 3:  return AlertLevelType.critical;
    case 2:  return AlertLevelType.warning;
    case 1:  return AlertLevelType.advisory;
    default: return AlertLevelType.normal;
  }
}

String _alertKey(int level) {
  switch (level) {
    case 3:  return 'CRITICAL';
    case 2:  return 'WARNING';
    case 1:  return 'ADVISORY';
    default: return 'NORMAL';
  }
}

int _alertKeyToInt(String key) {
  switch (key) {
    case 'CRITICAL': return 3;
    case 'WARNING':  return 2;
    case 'ADVISORY': return 1;
    default:         return 0;
  }
}

class _Prediction {
  final double probability;
  final int    alertLevel;
  final String status;
  final double rainfallMm;
  final int    windSignal;
  final int    humidity;
  final String leadTime;

  const _Prediction({
    required this.probability, required this.alertLevel, required this.status,
    required this.rainfallMm,  required this.windSignal,  required this.humidity,
    required this.leadTime,
  });

  factory _Prediction.fromJson(Map<String, dynamic> j) {
    final m = j['live_metrics'] as Map<String, dynamic>? ?? {};
    num? parseNum(dynamic v) {
      if (v == null) return null;
      if (v is num) return v;
      return num.tryParse(v.toString());
    }
    return _Prediction(
      probability: (parseNum(j['probability']))?.toDouble() ?? 0.0,
      alertLevel:  (parseNum(j['alert_level']))?.toInt()   ?? 0,
      status:       j['status']?.toString()                ?? '',
      rainfallMm:  (parseNum(m['rainfall_mm']))?.toDouble() ?? 0.0,
      windSignal:  (parseNum(m['wind_signal']))?.toInt()   ?? 0,
      humidity:    (parseNum(m['humidity']))?.toInt()      ?? 0,
      leadTime:     j['lead_time_estimate']?.toString()    ?? '1–3 hrs',
    );
  }

  double? get estimatedLevel {
    if (rainfallMm <= 0) return null;
    return double.parse((1.4 + rainfallMm * 0.045).toStringAsFixed(2));
  }

  String get probabilityPct => '${(probability * 100).toStringAsFixed(0)}%';

  String get riskWord {
    if (probability >= 0.75) return 'Severe';
    if (probability >= 0.50) return 'High';
    if (probability >= 0.25) return 'Moderate';
    return 'Low';
  }
}

// ─── Daily flood forecast entry (from GET /api/forecast-flood) ──────────────
class _DailyFloodForecast {
  final DateTime date;
  final int dayAhead;
  final double probability; // 0..1
  final String alertLevel;  // NORMAL / ADVISORY / WARNING / CRITICAL
  final String confidenceBand; // high / moderate / outlook-only
  final double? rainfallMm;
  final double? windSpeedMaxKph;

  const _DailyFloodForecast({
    required this.date,
    required this.dayAhead,
    required this.probability,
    required this.alertLevel,
    required this.confidenceBand,
    this.rainfallMm,
    this.windSpeedMaxKph,
  });

  factory _DailyFloodForecast.fromJson(Map<String, dynamic> j) {
    num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    return _DailyFloodForecast(
      date: DateTime.tryParse(j['date']?.toString() ?? '') ?? DateTime.now(),
      dayAhead: (n(j['day_ahead']))?.toInt() ?? 0,
      probability: (n(j['flood_probability']))?.toDouble() ?? 0.0,
      alertLevel: j['alert_level']?.toString() ?? 'NORMAL',
      confidenceBand: j['confidence_band']?.toString() ?? 'outlook-only',
      rainfallMm: n(j['rainfall_mm'])?.toDouble(),
      windSpeedMaxKph: n(j['wind_speed_max_kph'])?.toDouble(),
    );
  }

  double get probabilityPct => (probability * 100).clamp(0, 100).toDouble();
}

// ─── AlertLevelTypeX ───────────────────────────────────────────────────────
// Moved to models/alert_level.dart so alert_screen.dart can reuse the same
// shape-distinct icons without importing this whole screen file.

// ─── Small helpers ────────────────────────────────────────────────────────────
String _relativeTime(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 45) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24)   return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

String _greetingWord() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

String _riskEmoji(double pct) {
  if (pct >= 75) return '⛈';
  if (pct >= 50) return '🌧';
  if (pct >= 25) return '🌦';
  return '🌤';
}

String _riskWordFromPct(double pct) {
  if (pct >= 75) return 'Severe flood risk';
  if (pct >= 50) return 'High flood risk';
  if (pct >= 25) return 'Moderate flood risk';
  return 'Low flood risk';
}

const _confidenceLabels = {
  'high': 'High confidence',
  'moderate': 'Moderate confidence',
  'outlook-only': 'Outlook only',
};

// ─── Main Widget ──────────────────────────────────────────────────────────────
class DashboardScreen extends StatefulWidget {
  final ValueChanged<AlertLevelType>? onAlertChanged;
  // Lets "Quick Actions" jump straight to another bottom-nav tab
  // (0=Dashboard, 1=Map, 2=Rainfall, 3=Evacuation) — same pattern the
  // notification bell in MainShell already uses.
  final ValueChanged<int>? onNavigate;
  // Opens the Alerts screen (now a pushed page rather than a bottom-nav tab).
  final VoidCallback? onOpenAlerts;
  const DashboardScreen({super.key, this.onAlertChanged, this.onNavigate, this.onOpenAlerts});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  _Prediction? _pred;
  bool _loading = true;
  bool _error   = false;
  DateTime _lastUpdated = DateTime.now();

  // Prediction data now comes from the shared FloodStatusService (a single
  // app-wide poller — see services/flood_status_service.dart) instead of
  // this screen running its own independent 30-second Timer against the
  // same endpoint AlertScreen was also polling separately.
  FloodStatusService? _statusService;

  // Hourly (next 48h) — GET /api/forecast
  List<Map<String, dynamic>> _hourly = [];
  bool _hourlyLoading = true;

  // Daily flood outlook (next 14 days) — GET /api/forecast-flood
  List<_DailyFloodForecast> _dailyFlood = [];
  bool _dailyLoading = true;
  bool _dailyError = false;

  @override
  void initState() {
    super.initState();
    _fetchHourly();
    _fetchDailyFlood();
    // context.read is safe in initState (unlike context.watch).
    final svc = context.read<FloodStatusService>();
    _statusService = svc;
    svc.addListener(_onStatusUpdate);
    _onStatusUpdate(); // apply whatever the service already has (e.g. cache)
  }

  @override
  void dispose() {
    _statusService?.removeListener(_onStatusUpdate);
    super.dispose();
  }

  void _onStatusUpdate() {
    final svc = _statusService;
    if (svc == null || !mounted) return;
    final json = svc.rawJson;
    setState(() {
      _pred = json != null ? _Prediction.fromJson(json) : null;
      // _loading only blocks the UI when there's truly nothing to show yet.
      // _error tracks whether the *most recent* refresh attempt failed —
      // shown as a banner even when we still have a last-known reading to
      // display underneath it, same as the original behavior.
      _loading = svc.loading && json == null;
      _error = svc.error != null;
      if (svc.lastUpdated != null) _lastUpdated = svc.lastUpdated!;
    });
    if (_pred != null) {
      widget.onAlertChanged?.call(_alertFromInt(_pred!.alertLevel));
    }
  }

  Future<void> _fetchHourly() async {
    try {
      // Same primary→backup fallback as _fetchDailyFlood/FloodStatusService
      // (see services/model_api_client.dart). Previously this used a plain
      // http.get with no fallback, so whenever the primary backend host
      // was asleep/unreachable, the Hourly Forecast card alone would show
      // "unavailable" even though every other card had already recovered
      // via the backup host.
      final res = await getWithFallback(_forecastUrl,
          timeout: const Duration(seconds: 15));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() {
            _hourly = (body['hourly'] as List? ?? []).cast<Map<String, dynamic>>();
            _hourlyLoading = false;
          });
        });
      } else { throw Exception(); }
    } catch (_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _hourlyLoading = false);
      });
    }
  }

  Future<void> _fetchDailyFlood() async {
    try {
      final res = await getWithFallback(_forecastFloodUrl);
      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['status'] == 'success') {
          final list = (body['forecast'] as List? ?? [])
              .cast<Map<String, dynamic>>()
              .map(_DailyFloodForecast.fromJson)
              .toList();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() { _dailyFlood = list; _dailyLoading = false; _dailyError = false; });
          });
        } else {
          throw Exception(body['message']?.toString() ?? 'unknown error');
        }
      } else { throw Exception(); }
    } catch (_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() { _dailyLoading = false; _dailyError = true; });
      });
    }
  }

  Future<void> _refreshAll() => Future.wait([
    context.read<FloodStatusService>().refresh(),
    _fetchHourly(),
    _fetchDailyFlood(),
  ]);

  // ── Derived helpers ───────────────────────────────────────────────────────
  String get _currentAlertKey => _alertKey(_pred?.alertLevel ?? 0);
  Color  get _alertColor      => _alertColors[_currentAlertKey] ?? _alertColors['NORMAL']!;

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().currentUser;
    final firstName = (user?.name.trim().isNotEmpty ?? false)
        ? user!.name.trim().split(' ').first
        : 'Neighbor';

    return RefreshIndicator(
      onRefresh: _refreshAll,
      color: const Color(0xFF38bdf8),
      backgroundColor: const Color(0xFF0d1f3c),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_error) ...[_OfflineBanner(lastUpdated: _lastUpdated), const SizedBox(height: 12)],

            _TopBar(firstName: firstName, onOpenAlerts: widget.onOpenAlerts),
            const SizedBox(height: 10),

            // 1 — Hero: today's outlook, in plain language, with the
            // rainfall/humidity quick-stat bar baked in underneath it.
            _SafetyHeroCard(
              alertKey: _currentAlertKey,
              alertColor: _alertColor,
              pred: _pred,
              lastUpdated: _lastUpdated,
              onEvacuate: () => widget.onNavigate?.call(3),
            ),
            const SizedBox(height: 14),

            _RightNowCard(alertKey: _currentAlertKey, alertColor: _alertColor),
            const SizedBox(height: 22),

            // 2 — Hourly Forecast (next 48h)
            const _SectionLabel(icon: '🕐', text: 'Hourly Forecast'),
            const SizedBox(height: 2),
            const Text('OpenMeteo · Brgy. Triangulo, Naga City',
                style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
            const SizedBox(height: 10),
            _HourlyForecastStrip(hourly: _hourly, loading: _hourlyLoading),
            const SizedBox(height: 24),

            // 3 — Daily Flood Forecast (the model's own 14-day outlook)
            const _SectionLabel(icon: '📅', text: '14-Day Flood Forecast'),
            const SizedBox(height: 2),
            const Text('AI model outlook · updated with each Open-Meteo sync',
                style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
            const SizedBox(height: 10),
            _DailyFloodForecastList(
              days: _dailyFlood,
              loading: _dailyLoading,
              error: _dailyError,
            ),
            const SizedBox(height: 26),

            // 4 — Quick actions, reference table, and the map link, for
            // anyone who wants to dig in further.
            _QuickActionsRow(onNavigate: widget.onNavigate),
            const SizedBox(height: 22),

            const _SectionLabel(icon: '📋', text: 'Alert Levels Explained'),
            const SizedBox(height: 8),
            _AlertLevelTable(currentAlertKey: _currentAlertKey),
            const SizedBox(height: 18),

            _MapTeaserCard(onTap: () => widget.onNavigate?.call(1)),
          ],
        ),
      ),
    );
  }
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String icon, text;
  const _SectionLabel({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Row(children: [
    Text(icon, style: const TextStyle(fontSize: 13)),
    const SizedBox(width: 6),
    Text(text, style: const TextStyle(
      color: AppColors.textPri, fontSize: 15,
      fontWeight: FontWeight.w800, letterSpacing: -0.2,
    )),
  ]);
}

class _OfflineBanner extends StatelessWidget {
  final DateTime? lastUpdated;
  const _OfflineBanner({this.lastUpdated});

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(6),
    child: Row(children: [
      Container(width: 3, color: const Color(0xFFef4444)),
      Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFef4444).withValues(alpha: 0.07),
            border: Border.all(color: const Color(0xFFef4444).withValues(alpha: 0.25)),
          ),
          child: Row(children: [
            const Text('⚠', style: TextStyle(color: Color(0xFFf87171), fontSize: 13)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                lastUpdated != null
                    ? "Can't reach live data right now. Showing the status from ${_relativeTime(lastUpdated!)}."
                    : "We're having trouble reaching live data. Showing the last known status.",
                style: const TextStyle(color: Color(0xFFf87171), fontSize: 11.5, fontWeight: FontWeight.w500),
              ),
            ),
          ]),
        ),
      ),
    ]),
  );
}

// ── Top bar: greeting + notification bell ────────────────────────────────────
// Mirrors a typical weather app's header — app identity/location on the
// left, the alerts bell on the right — instead of burying alerts inside the
// quick-actions grid.
class _TopBar extends StatelessWidget {
  final String firstName;
  final VoidCallback? onOpenAlerts;
  const _TopBar({required this.firstName, this.onOpenAlerts});

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${_greetingWord()}, $firstName 👋', style: const TextStyle(
              color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: -0.2,
            )),
            const SizedBox(height: 2),
            const Text("Here's today's flood outlook for Brgy. Triangulo.",
                style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
          ],
        ),
      ),
      GestureDetector(
        onTap: onOpenAlerts,
        child: Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.bgBorder),
          ),
          child: const Icon(Icons.notifications_rounded, color: AppColors.accent, size: 19),
        ),
      ),
    ],
  );
}

// ── Safety Hero Card ─────────────────────────────────────────────────────────
class _SafetyHeroCard extends StatelessWidget {
  final String alertKey;
  final Color alertColor;
  final _Prediction? pred;
  final DateTime lastUpdated;
  final VoidCallback onEvacuate;

  const _SafetyHeroCard({
    required this.alertKey, required this.alertColor, required this.pred,
    required this.lastUpdated, required this.onEvacuate,
  });

  @override
  Widget build(BuildContext context) {
    final copy = _heroCopy[alertKey] ?? _heroCopy['NORMAL']!;
    final alertType = _alertFromInt(_alertKeyToInt(alertKey));
    final severe = alertKey == 'WARNING' || alertKey == 'CRITICAL';
    final hasRain = (pred?.rainfallMm ?? 0) > 0;

    return PanahonHeroCard(
      accentColor: alertColor,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.location_on_rounded, color: AppColors.textMuted, size: 13),
              const SizedBox(width: 3),
              const Expanded(
                child: Text('Brgy. Triangulo, Naga City',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
              ),
              _PulsingDot(color: alertColor),
              const SizedBox(width: 5),
              Text('Updated ${_relativeTime(lastUpdated)}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
            ]),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(
                      pred != null ? (pred!.probability * 100).toStringAsFixed(0) : '—',
                      style: TextStyle(color: alertColor, fontSize: 52,
                          fontWeight: FontWeight.w900, height: 1, letterSpacing: -1.6),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 9, left: 3),
                      child: Text('%', style: TextStyle(
                          color: alertColor, fontSize: 20, fontWeight: FontWeight.w800)),
                    ),
                  ]),
                  const SizedBox(height: 2),
                  const Text('FLOOD PROBABILITY TODAY', style: TextStyle(
                      color: AppColors.textMuted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 1.0)),
                  const SizedBox(height: 10),
                  Text(copy.headline, style: const TextStyle(
                      color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w800,
                      height: 1.15, letterSpacing: -0.2)),
                  const SizedBox(height: 3),
                  Text(copy.tagline, style: const TextStyle(
                      color: AppColors.textSec, fontSize: 12.5, height: 1.35)),
                ]),
              ),
              const SizedBox(width: 12),
              Container(
                width: 60, height: 60,
                decoration: BoxDecoration(
                  color: alertColor.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                  border: Border.all(color: alertColor.withValues(alpha: 0.4), width: 1.5),
                ),
                child: Icon(alertType.icon, color: alertColor, size: 28),
              ),
            ]),
          ]),
        ),

        // Quick-stat bar — rainfall now / humidity, laid out
        // like a weather app's "RAIN | HEAT INDEX" strip under the headline.
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.bgDeep.withValues(alpha: 0.45),
            border: Border(top: BorderSide(color: alertColor.withValues(alpha: 0.15))),
          ),
          child: IntrinsicHeight(
            child: Row(children: [
              Expanded(
                child: _HeroStat(
                  icon: Icons.water_drop_rounded,
                  label: 'RAINFALL NOW',
                  value: pred != null ? '${pred!.rainfallMm.toStringAsFixed(1)} mm/hr' : '—',
                  note: hasRain ? 'Actively raining' : 'No rain right now',
                ),
              ),
              Container(width: 1, color: alertColor.withValues(alpha: 0.15)),
              Expanded(
                child: _HeroStat(
                  icon: Icons.water_rounded,
                  label: 'HUMIDITY',
                  value: pred != null ? '${pred!.humidity}%' : '—',
                  note: 'Synced ${_relativeTime(lastUpdated)}',
                ),
              ),
            ]),
          ),
        ),

        if (severe) Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onEvacuate,
              icon: const Icon(Icons.map_rounded, size: 18),
              label: const Text('View Evacuation Routes',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              style: ElevatedButton.styleFrom(
                backgroundColor: alertColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _HeroStat extends StatelessWidget {
  final IconData icon;
  final String label, value, note;
  const _HeroStat({required this.icon, required this.label, required this.value, required this.note});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        Icon(icon, size: 13, color: AppColors.textMuted),
        const SizedBox(width: 5),
        Expanded(child: Text(label, style: const TextStyle(
            color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6))),
      ]),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(
          color: AppColors.textPri, fontSize: 15, fontWeight: FontWeight.w800)),
      const SizedBox(height: 1),
      Text(note, style: const TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
    ]),
  );
}

// ── "Right Now, You Should" Card ─────────────────────────────────────────────
class _RightNowCard extends StatelessWidget {
  final String alertKey;
  final Color alertColor;
  const _RightNowCard({required this.alertKey, required this.alertColor});

  @override
  Widget build(BuildContext context) {
    final guidance = _levelGuidance.firstWhere(
      (g) => g.key == alertKey,
      orElse: () => _levelGuidance.first,
    );
    final isNormal = alertKey == 'NORMAL';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: alertColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: alertColor.withValues(alpha: 0.35)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(isNormal ? Icons.check_circle_rounded : Icons.checklist_rounded,
              color: alertColor, size: 16),
          const SizedBox(width: 6),
          Text(isNormal ? 'Nothing to do right now' : 'Right now, you should:', style: TextStyle(
              color: alertColor, fontSize: 13, fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: 10),
        ...guidance.actions.map((a) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.circle, size: 5, color: alertColor.withValues(alpha: 0.8)),
            const SizedBox(width: 8),
            Expanded(child: Text(a, style: const TextStyle(
                color: AppColors.textPri, fontSize: 12.5, height: 1.4))),
          ]),
        )),
      ]),
    );
  }
}

// ── Hourly Forecast Strip (GET /api/forecast → "hourly") ─────────────────────
class _HourlyForecastStrip extends StatelessWidget {
  final List<Map<String, dynamic>> hourly;
  final bool loading;
  const _HourlyForecastStrip({required this.hourly, required this.loading});

  String _emoji(num precip) {
    if (precip > 10) return '⛈';
    if (precip > 2)  return '🌧';
    if (precip > 0)  return '🌦';
    return '☀️';
  }

  Color _precipColor(num precip) {
    if (precip > 10) return const Color(0xFFef4444);
    if (precip > 2)  return const Color(0xFFf97316);
    return const Color(0xFF38bdf8);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return SizedBox(
        height: 118,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: 6,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, __) => Container(
            width: 82, height: 110,
            decoration: BoxDecoration(
              color: const Color(0xFF0a1828),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF1e3a5f)),
            ),
          ),
        ),
      );
    }

    if (hourly.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: const Color(0xFF0a1828),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF1e3a5f)),
        ),
        child: const Center(
          child: Text('⚠️ Hourly forecast unavailable right now — check back soon',
              style: TextStyle(color: Color(0xFF4a6080), fontSize: 12), textAlign: TextAlign.center),
        ),
      );
    }

    final maxPrecip = hourly.fold<double>(1.0, (m, f) {
      final p = (f['precipitation'] as num? ?? 0).toDouble();
      return p > m ? p : m;
    });

    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: hourly.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, idx) {
          final f      = hourly[idx];
          final time   = DateTime.tryParse(f['time'] as String? ?? '') ?? DateTime.now();
          final temp   = f['temperature_c'] ?? '—';
          final precip = (f['precipitation'] as num? ?? 0).toDouble();
          final precipPct = (precip / maxPrecip).clamp(0.0, 1.0);
          final pc     = _precipColor(precip);
          final h      = time.hour % 12 == 0 ? 12 : time.hour % 12;
          final ampm   = time.hour < 12 ? 'AM' : 'PM';
          final label  = idx == 0 ? 'Now' : '$h:00 $ampm';

          return ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 82, height: 110,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              decoration: BoxDecoration(
                color: idx == 0
                    ? const Color(0xFF38bdf8).withValues(alpha: 0.08)
                    : const Color(0xFF0a1828),
                border: Border.all(
                    color: idx == 0 ? const Color(0xFF38bdf8) : const Color(0xFF1e3a5f)),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(label, style: TextStyle(
                      color: idx == 0 ? const Color(0xFF38bdf8) : const Color(0xFF8da4be),
                      fontSize: 10, fontWeight: FontWeight.w700),
                      textAlign: TextAlign.center),
                  Text(_emoji(precip), style: const TextStyle(fontSize: 20)),
                  Text('$temp°C', style: const TextStyle(
                      color: Color(0xFFe2eaf5), fontSize: 12, fontWeight: FontWeight.w700)),
                  Column(children: [
                    Container(height: 3,
                      decoration: BoxDecoration(
                          color: const Color(0xFF1e3a5f),
                          borderRadius: BorderRadius.circular(2)),
                      child: FractionallySizedBox(widthFactor: precipPct,
                          alignment: Alignment.centerLeft,
                          child: Container(decoration: BoxDecoration(
                              color: pc, borderRadius: BorderRadius.circular(2))))),
                    const SizedBox(height: 3),
                    Text('${precip.toStringAsFixed(1)}mm',
                        style: TextStyle(color: pc, fontSize: 9, fontWeight: FontWeight.w600)),
                  ]),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Daily Flood Forecast list (GET /api/forecast-flood → "forecast") ─────────
// Row-per-day, styled after a classic "5-Day Forecast" list: an icon, the
// day label, a plain-language risk description, and a value pill — but
// driven by the model's own forward flood-probability outlook rather than
// temperature.
class _DailyFloodForecastList extends StatelessWidget {
  final List<_DailyFloodForecast> days;
  final bool loading;
  final bool error;
  const _DailyFloodForecastList({required this.days, required this.loading, required this.error});

  String _dayLabel(_DailyFloodForecast d) {
    if (d.dayAhead == 1) return 'Tomorrow';
    const wdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return '${wdays[d.date.weekday - 1]} ${d.date.day}/${d.date.month}';
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Container(
        height: 160, alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFF0a1828),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF1e3a5f)),
        ),
        child: const Text('Loading the 14-day outlook...',
            style: TextStyle(color: Color(0xFF4a6080), fontSize: 12)),
      );
    }

    if (error || days.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: const Color(0xFF0a1828),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF1e3a5f)),
        ),
        child: const Center(
          child: Text('⚠️ 14-day flood outlook unavailable right now — check back soon',
              style: TextStyle(color: Color(0xFF4a6080), fontSize: 12), textAlign: TextAlign.center),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0d1f3c),
          border: Border.all(color: const Color(0xFF1e3a5f)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: days.asMap().entries.map((e) {
            final idx    = e.key;
            final d      = e.value;
            final isLast = idx == days.length - 1;
            final color  = _alertColors[d.alertLevel] ?? _alertColors['NORMAL']!;

            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                border: Border(
                  bottom: isLast ? BorderSide.none : const BorderSide(color: Color(0xFF13284a)),
                ),
              ),
              child: Row(children: [
                SizedBox(
                  width: 66,
                  child: Text(_dayLabel(d), style: const TextStyle(
                      color: Color(0xFFe2eaf5), fontSize: 11, fontWeight: FontWeight.w800)),
                ),
                Text(_riskEmoji(d.probabilityPct), style: const TextStyle(fontSize: 17)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_riskWordFromPct(d.probabilityPct), style: const TextStyle(
                        color: Color(0xFF8da4be), fontSize: 11.5, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(_confidenceLabels[d.confidenceBand] ?? 'Outlook only',
                        style: const TextStyle(color: Color(0xFF4a6080), fontSize: 9)),
                  ]),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: color.withValues(alpha: 0.4)),
                  ),
                  child: Text('${d.probabilityPct.toStringAsFixed(0)}%',
                      style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
                ),
              ]),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ── Quick Actions Row ─────────────────────────────────────────────────────────
class _QuickActionsRow extends StatelessWidget {
  final ValueChanged<int>? onNavigate;
  const _QuickActionsRow({required this.onNavigate});

  @override
  Widget build(BuildContext context) {
    final actions = [
      (icon: Icons.radar_rounded,          label: 'Flood\nMap',          tab: 1),
      (icon: Icons.water_drop_rounded,     label: 'Rainfall\nDetails',   tab: 2),
      (icon: Icons.directions_run_rounded, label: 'Evacuation\nCenters', tab: 3),
    ];

    return Row(
      children: actions.map((a) {
        final isLast = a == actions.last;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: isLast ? 0 : 8),
            child: GestureDetector(
              onTap: () => onNavigate?.call(a.tab),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.bgBorder),
                ),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 34, height: 34,
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(a.icon, color: AppColors.accent, size: 17),
                  ),
                  const SizedBox(height: 7),
                  Text(a.label, textAlign: TextAlign.center, style: const TextStyle(
                      color: AppColors.textSec, fontSize: 10.5, fontWeight: FontWeight.w700, height: 1.2)),
                ]),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Map Teaser Link ────────────────────────────────────────────────────────────
// Slim link row pointing to the dedicated Flood Map tab, echoing the small
// "Rain Map" link PANaHON tucks at the very bottom of its forecast screen.
class _MapTeaserCard extends StatelessWidget {
  final VoidCallback onTap;
  const _MapTeaserCard({required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0d1f3c),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF1e3a5f)),
      ),
      child: Row(children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.radar_rounded, color: AppColors.accent, size: 17),
        ),
        const SizedBox(width: 10),
        const Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Flood Zone Map & Live Radar', style: TextStyle(
                color: AppColors.textPri, fontSize: 12.5, fontWeight: FontWeight.w700)),
            SizedBox(height: 1),
            Text('See the barangay boundary and rain moving in, live',
                style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
          ]),
        ),
        const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted, size: 18),
      ]),
    ),
  );
}

// ── Alert Level Reference Table ───────────────────────────────────────────────
class _AlertLevelTable extends StatelessWidget {
  final String currentAlertKey;
  const _AlertLevelTable({required this.currentAlertKey});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0d1f3c),
          border: Border.all(color: const Color(0xFF1e3a5f)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: _levelGuidance.asMap().entries.map((e) {
            final idx   = e.key;
            final item  = e.value;
            final isCur = item.key == currentAlertKey;
            final color = _thresholds[item.key]!.color;
            final isLast = idx == _levelGuidance.length - 1;

            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isCur ? color.withValues(alpha: 0.08) : Colors.transparent,
                border: Border(
                  bottom: isLast ? BorderSide.none : const BorderSide(color: Color(0xFF1e3a5f))),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 3),
                    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 10),
                SizedBox(
                  width: 76,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_thresholds[item.key]!.label.toUpperCase(), style: TextStyle(
                        color: color, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.4)),
                    Text(item.range, style: const TextStyle(
                        color: Color(0xFF4a6080), fontSize: 9, fontFamily: 'monospace')),
                  ]),
                ),
                const SizedBox(width: 8),
                Expanded(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ...item.actions.map((a) => Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('•  ', style: TextStyle(
                            color: isCur ? color : const Color(0xFF2a4060),
                            fontSize: 10.5, height: 1.4,
                          )),
                          Expanded(child: Text(a, style: TextStyle(
                            color: isCur ? const Color(0xFFe2eaf5) : const Color(0xFF4a6080),
                            fontSize: 10.5, height: 1.4,
                          ))),
                        ]),
                      )),
                    ]),
                  ),
                  if (isCur) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.2),
                        border: Border.all(color: color.withValues(alpha: 0.4)),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Text('CURRENT', style: TextStyle(
                          color: color, fontSize: 8, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ])),
              ]),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ── Pulsing Dot ───────────────────────────────────────────────────────────────
class _PulsingDot extends StatefulWidget {
  final Color color;
  const _PulsingDot({required this.color});
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 1))
      ..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.4, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Container(
      width: 9, height: 9,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: widget.color.withValues(alpha: _anim.value),
        boxShadow: [BoxShadow(color: widget.color.withValues(alpha: 0.5), blurRadius: 5)],
      ),
    ),
  );
}
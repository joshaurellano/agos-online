// dashboard_screen.dart
//
// Resident-facing home screen for AGOS. Redesigned to read like a flood-
// forecasting app first, general weather app a distant second:
//
//   1. Hero card            — today's flood outlook, in plain language
//   2. Right Now guidance   — what to do at the current alert level
//   3. 7-Day Flood Risk Trend — at-a-glance bar trend of the model's daily
//      flood probability (the flood equivalent of a weather app's
//      temperature-over-the-week graph)
//   4. 14-Day Flood Forecast — the model's full forward outlook
//      (GET /api/forecast-flood)
//   5. Rainfall Outlook, Quick Actions, Alert Levels table, Flood Map link
//   6. "WEATHER DATA" divider, then the general weather-forecast content —
//      minute-by-minute precip, current temp, 48h hourly, and the full
//      wind/pressure/UV/etc. details grid — kept in full, just visually
//      demoted below the flood content instead of leading the screen.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/flood_status_service.dart';
import '../services/model_api_client.dart';
import '../theme/panahon_ui.dart';
import '../widgets/rain_overlay.dart';
import '../widgets/weather_backdrop.dart';
import '../widgets/minute_forecast_card.dart';

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

// ─── Hero gradient per alert level ────────────────────────────────────────────
// Styled after the reference weather app's mood gradients (a calm blue for
// clear skies, deep purple for a thunderstorm) — here the "mood" is flood
// risk instead of weather condition.
//
// Alpha is deliberately 0xCC (~80%), not 0xFF — fully opaque colors here
// would completely hide WeatherBackdrop/RainOverlay, which are painted
// behind the whole screen in build() below, no matter how the Stack is
// ordered. This is what actually lets the rain/mood animation show
// through the hero, the same way lightning bleeds through the reference
// app's purple storm header.
const _heroGradients = {
  'NORMAL':   [Color(0xCC1c6e6e), Color(0xCC0d3b52), Color(0xCC0a2540)],
  'ADVISORY': [Color(0xCC7a5a12), Color(0xCC4a3a1e), Color(0xCC0a2540)],
  'WARNING':  [Color(0xCC8a4310), Color(0xCC5c2a1c), Color(0xCC0a1830)],
  'CRITICAL': [Color(0xCC7a1620), Color(0xCC4a1030), Color(0xCC0a0f28)],
};

List<Color> _severityGradient(String key) => _heroGradients[key] ?? _heroGradients['NORMAL']!;

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
  'NORMAL':   _HeroCopy("You're Safe Right Now",  'No flooding risk. Enjoy your day.'),
  'ADVISORY': _HeroCopy('Stay Alert',              'Flood risk starting to rise. Keep an eye on updates.'),
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
      // The backend's alert_level has always been a string enum
      // ("NORMAL"/"ADVISORY"/"WARNING"/"CRITICAL" — see
      // probability_to_alert_level() in backend/app/utils/alerts.py),
      // never a number. Running it through parseNum() silently failed
      // for every value (none of those words parse as a number) and fell
      // back to the ?? 0 default — meaning this was always reporting
      // NORMAL regardless of the real alert level, whenever the backend
      // sent a live prediction. _alertKeyToInt() is the existing helper
      // for this exact conversion; it just wasn't being used here.
      alertLevel:  _alertKeyToInt(j['alert_level']?.toString() ?? 'NORMAL'),
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
  // The full per-day JSON object, kept as-is alongside the parsed fields
  // above. The backend may return extra per-day fields beyond rainfall/wind
  // (humidity, soil moisture, temperature, etc.) depending on what the
  // model actually keys its prediction on — rather than silently dropping
  // whatever isn't explicitly modeled here, the "What drove this forecast"
  // sheet below reads straight from this map, so any additional driver the
  // backend adds later shows up automatically without an app update.
  final Map<String, dynamic> raw;

  const _DailyFloodForecast({
    required this.date,
    required this.dayAhead,
    required this.probability,
    required this.alertLevel,
    required this.confidenceBand,
    this.rainfallMm,
    this.windSpeedMaxKph,
    this.raw = const {},
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
      raw: j,
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

const _confidenceExplainers = {
  'high': "This is within Open-Meteo's near-term forecast window, so it's "
      'the most reliable reading in the 14-day outlook.',
  'moderate': 'A few days out, so both the weather forecast and the flood '
      'model carry more uncertainty than the next couple of days.',
  'outlook-only': "This far ahead, treat this as a general trend rather "
      'than a precise number — both the weather forecast and the flood '
      'model are least certain this many days out.',
};

// Fields already parsed onto dedicated properties (date/probability/etc.),
// or plain metadata rather than a driver — never shown a second time in the
// generic "other factors" list on the drivers sheet.
const _driverExcludedKeys = {
  'date', 'day_ahead', 'flood_probability', 'alert_level', 'confidence_band',
  'rainfall_mm', 'wind_speed_max_kph', 'status', 'message', 'model_key',
  'meta', 'note',
};

// Friendly label/icon/unit for the per-day fields we know the backend might
// send, beyond the two primary drivers (rainfall, wind) that already have
// dedicated properties. Anything the backend returns that ISN'T in this map
// still shows up on the drivers sheet — just with a generically
// title-cased label — so a new field the model adds later is never
// silently hidden, it just isn't as prettily labeled until this map is
// updated.
class _DriverMeta {
  final String label, icon, suffix;
  final int round;
  const _DriverMeta(this.label, this.icon, {this.suffix = '', this.round = 1});
}

const _driverMeta = <String, _DriverMeta>{
  'humidity':              _DriverMeta('Humidity', '💧', suffix: '%', round: 0),
  'soil_moisture_vwc':     _DriverMeta('Soil Moisture', '🌱', suffix: '%', round: 1),
  'pressure_msl_hpa':      _DriverMeta('Pressure', '🧭', suffix: ' hPa', round: 0),
  'wind_gusts_kph':        _DriverMeta('Wind Gusts', '🌬', suffix: ' km/h', round: 0),
  'temperature_max_c':     _DriverMeta('High Temp', '🌡', suffix: '°C', round: 0),
  'temperature_min_c':     _DriverMeta('Low Temp', '🌡', suffix: '°C', round: 0),
  'feels_like_c':          _DriverMeta('Feels Like', '🥵', suffix: '°C', round: 0),
  'dew_point_c':           _DriverMeta('Dew Point', '🌡', suffix: '°C', round: 0),
  'uv_index':              _DriverMeta('UV Index', '☀️', round: 0),
  'visibility_km':         _DriverMeta('Visibility', '👁', suffix: ' km', round: 1),
  'rain_probability_pct':  _DriverMeta('Rain Chance', '☔', suffix: '%', round: 0),
};

String _titleCase(String snake) => snake
    .split('_')
    .where((w) => w.isNotEmpty)
    .map((w) => w[0].toUpperCase() + w.substring(1))
    .join(' ');

// ─── Main Widget ──────────────────────────────────────────────────────────────
class DashboardScreen extends StatefulWidget {
  final ValueChanged<AlertLevelType>? onAlertChanged;
  // Lets "Quick Actions" jump straight to another bottom-nav tab
  // (0=Dashboard, 1=Map, 2=Rainfall, 3=Evacuation) — same pattern the
  // notification bell in MainShell already uses.
  final ValueChanged<int>? onNavigate;
  // Opens the Alerts screen (now a pushed page rather than a bottom-nav tab).
  final VoidCallback? onOpenAlerts;
  // Opens the device/settings bottom sheet — the Dashboard now renders its
  // own full-bleed hero (see FloodHeroBanner in _buildContent) instead of
  // sharing MainShell's compact PanahonHeader, so the gear icon that used
  // to live in that shared header is surfaced here instead.
  final VoidCallback? onOpenSettings;
  const DashboardScreen({
    super.key, this.onAlertChanged, this.onNavigate, this.onOpenAlerts, this.onOpenSettings,
  });

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

  // Rainfall outlook (next 6h/12h/24h totals + peak chance) and the full
  // parameter set (wind, gusts, humidity, visibility, pressure, UV, dew
  // point, soil moisture) for the current hour — both already returned by
  // /api/forecast and already shown on the web dashboard's WeatherForecast
  // panel, but previously left unused here; the mobile Hourly Forecast
  // strip only ever read `hourly[].temperature_c`/`precipitation`.
  Map<String, dynamic>? _outlook;

  // Short-range (next ~2h, 15-min steps) precipitation — same
  // /api/forecast "minutely" field the web dashboard's MinuteForecastStrip
  // already consumes (see backend/app/api/routes_weather.py). Previously
  // fetched but unused here.
  List<Map<String, dynamic>> _minutely = [];

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
            _outlook = body['outlook'] as Map<String, dynamic>?;
            _minutely = (body['minutely'] as List? ?? []).cast<Map<String, dynamic>>();
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
    // Current condition string (e.g. "Light Rain", "Overcast", "Clear
    // sky") — same field RainOverlay.resolveIntensity() already knows how
    // to parse, from the freshest hourly entry ("Now"). Backend source:
    // wmo_label() in backend/app/utils/alerts.py, via GET /api/forecast.
    final currentCondition =
        _hourly.isNotEmpty ? _hourly.first['condition'] as String? : null;
    final hour = DateTime.now().hour;
    final isNight = hour >= 18 || hour < 6;

    return Stack(
      children: [
        // Background layers, in order: gradient/ambient mood first, then
        // the particle animation (rain/fog/clouds/lightning) on top of
        // it. Both are IgnorePointer'd internally, so scrolling/tapping
        // the real content below is unaffected. They sit behind the
        // colored hero banner and the floating panel below it — visible
        // as a faint bleed through the hero's gradient (the same trick
        // the reference app uses to show lightning through its purple
        // storm header), but otherwise covered by opaque content.
        Positioned.fill(
          child: WeatherBackdrop(condition: currentCondition, isNight: isNight),
        ),
        Positioned.fill(
          child: RainOverlay(
            rainfallMm: _pred?.rainfallMm,
            condition: currentCondition,
            windSignal: (_pred?.windSignal ?? 0).toDouble(),
          ),
        ),
        _buildContent(context),
      ],
    );
  }

  Widget _buildContent(BuildContext context) {
    final copy = _heroCopy[_currentAlertKey] ?? _heroCopy['NORMAL']!;
    final alertType = _alertFromInt(_alertKeyToInt(_currentAlertKey));
    final severe = _currentAlertKey == 'WARNING' || _currentAlertKey == 'CRITICAL';
    final hasRain = (_pred?.rainfallMm ?? 0) > 0;

    return Column(
      children: [
        // 1 — Hero: fixed (non-scrolling) full-bleed gradient banner, the
        // AGOS equivalent of a weather app's big "condition + temperature"
        // header — except the number is flood probability and the
        // gradient/icon track alert severity instead of weather condition.
        FloodHeroBanner(
          gradientColors: _severityGradient(_currentAlertKey),
          location: 'Brgy. Triangulo, Naga City',
          statusLine: _error
              ? "Can't reach live data · showing ${_relativeTime(_lastUpdated)}"
              : 'Live · updated ${_relativeTime(_lastUpdated)}',
          actions: [
            HeroIconButton(
              icon: Icons.notifications_rounded,
              showDot: _currentAlertKey != 'NORMAL',
              dotColor: _alertColor,
              onTap: widget.onOpenAlerts,
            ),
            HeroIconButton(
              icon: Icons.settings_rounded,
              onTap: widget.onOpenSettings,
            ),
          ],
          bigValue: _pred != null ? (_pred!.probability * 100).toStringAsFixed(0) : '—',
          bigUnit: '%',
          icon: alertType.icon,
          headline: copy.headline,
          tagline: copy.tagline,
          bannerText: severe
              ? '${_thresholds[_currentAlertKey]!.label} — ${_thresholds[_currentAlertKey]!.action}'
              : null,
          onBannerTap: widget.onOpenAlerts,
          stats: [
            (
              icon: Icons.water_drop_rounded,
              label: hasRain ? 'raining now' : 'rain now',
              value: _pred != null ? '${_pred!.rainfallMm.toStringAsFixed(1)}mm/hr' : '—',
            ),
            (
              icon: Icons.water_rounded,
              label: 'humidity',
              value: _pred != null ? '${_pred!.humidity}%' : '—',
            ),
          ],
          height: severe ? 328 : 296,
        ),

        // 2 — Floating rounded-top panel holding everything else — the
        // AGOS equivalent of the reference app's dark "Weather forecast"
        // sheet that overlaps the bottom of the colored hero.
        //
        // Translucent (not solid AppColors.bgDeep) so WeatherBackdrop's
        // mood gradient and RainOverlay's animation — both painted behind
        // this entire screen in build() below — show through the gaps
        // between cards, instead of being fully hidden behind an opaque
        // sheet. Individual cards inside (bgCard, etc.) stay fully opaque
        // for text readability; only this shared panel background is see-
        // through.
        Expanded(
          child: Transform.translate(
            offset: const Offset(0, -22),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
              child: Container(
                color: AppColors.bgDeep.withValues(alpha: 0.86),
                child: RefreshIndicator(
                  onRefresh: _refreshAll,
                  color: const Color(0xFF38bdf8),
                  backgroundColor: const Color(0xFF0d1f3c),
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 18, 14, 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Grab handle, echoing the sheet's floating/draggable feel.
                        Center(
                          child: Container(
                            width: 36, height: 4, margin: const EdgeInsets.only(bottom: 14),
                            decoration: BoxDecoration(
                              color: AppColors.bgBorder,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),

                        if (_error) ...[_OfflineBanner(lastUpdated: _lastUpdated), const SizedBox(height: 14)],

                        if (severe) ...[
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => widget.onNavigate?.call(3),
                              icon: const Icon(Icons.map_rounded, size: 18),
                              label: const Text('View Evacuation Routes',
                                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _alertColor,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 0,
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                        ],

                        _RightNowCard(alertKey: _currentAlertKey, alertColor: _alertColor),
                        const SizedBox(height: 18),

                        // ── FLOOD FORECASTING CORE ───────────────────────────
                        // Everything from here down to the "WEATHER DATA"
                        // divider is flood-specific: the week's risk trend,
                        // the model's own 14-day outlook, and the rainfall
                        // totals that actually drive that outlook. This is
                        // the app's main content, so it comes immediately
                        // after the hero/guidance — ahead of any raw weather
                        // numbers (temp, wind, pressure, etc.), which are
                        // supporting reference data, not the headline.
                        _FloodRiskTrendChart(days: _dailyFlood, loading: _dailyLoading),
                        const SizedBox(height: 22),

                        _SectionLabel(
                          icon: '📅', text: '14-Day Flood Forecast',
                          trailing: const SectionPill(text: '14 days'),
                        ),
                        const SizedBox(height: 2),
                        const Text('AI model outlook · updated with each Open-Meteo sync',
                            style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
                        const SizedBox(height: 10),
                        _DailyFloodForecastList(
                          days: _dailyFlood,
                          loading: _dailyLoading,
                          error: _dailyError,
                        ),
                        const SizedBox(height: 22),

                        // Rainfall outlook — next 6h/12h/24h accumulated totals and
                        // peak rain-probability. Flood-relevant (it's the direct
                        // input to the flood model above), so it stays up here
                        // with the rest of the flood content rather than down in
                        // the weather-data section below.
                        if (_outlook != null) ...[
                          _RainfallOutlookRow(outlook: _outlook!),
                          const SizedBox(height: 24),
                        ] else
                          const SizedBox(height: 8),

                        // Quick actions, reference table, and the map link.
                        _QuickActionsRow(onNavigate: widget.onNavigate),
                        const SizedBox(height: 22),

                        const _SectionLabel(icon: '📋', text: 'Alert Levels Explained'),
                        const SizedBox(height: 8),
                        _AlertLevelTable(currentAlertKey: _currentAlertKey),
                        const SizedBox(height: 18),

                        _MapTeaserCard(onTap: () => widget.onNavigate?.call(1)),
                        const SizedBox(height: 28),

                        // ── WEATHER DATA (supporting reference) ──────────────
                        // The general weather-forecasting features — none of
                        // them removed, all still one scroll away — just no
                        // longer competing with flood content for the top of
                        // the screen. Kept together, visually quieted (see
                        // _WeatherSectionDivider / muted _SectionLabels), so
                        // the app still reads as a flood-forecasting app that
                        // happens to include full weather detail, not the
                        // other way around.
                        const _WeatherSectionDivider(),
                        const SizedBox(height: 16),

                        if (_minutely.length >= 2) ...[
                          MinuteForecastCard(minutely: _minutely),
                          const SizedBox(height: 20),
                        ] else
                          const SizedBox(height: 4),

                        _CurrentWeatherHero(current: _hourly.isNotEmpty ? _hourly.first : null),
                        const SizedBox(height: 14),
                        _SectionLabel(
                          icon: '🕐', text: 'Hourly Weather',
                          muted: true,
                          trailing: const SectionPill(text: '48 hours'),
                        ),
                        const SizedBox(height: 2),
                        const Text('OpenMeteo · Brgy. Triangulo, Naga City',
                            style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
                        const SizedBox(height: 10),
                        _HourlyForecastStrip(hourly: _hourly, loading: _hourlyLoading),
                        const SizedBox(height: 16),

                        // Full current-conditions parameter grid — wind, gusts,
                        // humidity, visibility, pressure, UV index, dew point, soil
                        // moisture. Same 8 stats the web dashboard's WeatherForecast
                        // panel already shows.
                        _WeatherDetailsGrid(current: _hourly.isNotEmpty ? _hourly.first : null),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Current Weather Hero (big temp + stat row) ────────────────────────────────
// Styled after the reference weather app's hero: a large temperature
// reading with condition, then a horizontal Feels-like/Humidity/Wind row
// underneath. Sits below the flood-safety hero/guidance (never above it —
// this is a flood-warning app first), right before the Hourly Forecast
// strip it's summarizing the first entry of.
class _CurrentWeatherHero extends StatelessWidget {
  final Map<String, dynamic>? current;
  const _CurrentWeatherHero({required this.current});

  String? _roundedTemp(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.round().toString();
    final parsed = num.tryParse(v.toString());
    return parsed != null ? parsed.round().toString() : null;
  }

  String _emoji(num precip) {
    if (precip > 10) return '⛈';
    if (precip > 2) return '🌧';
    if (precip > 0) return '🌦';
    return '☀️';
  }

  @override
  Widget build(BuildContext context) {
    final c = current;
    if (c == null) return const SizedBox.shrink();

    final temp = _roundedTemp(c['temperature_c']);
    final feelsLike = _roundedTemp(c['feels_like_c']);
    final humidity = c['humidity'];
    final wind = c['wind_speed_kph'];
    final condition = c['condition']?.toString();
    final precip = (c['precipitation'] as num? ?? 0).toDouble();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF12305e), Color(0xFF0a1b3d)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1e3a5f)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(_emoji(precip), style: const TextStyle(fontSize: 34)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(temp != null ? '$temp°' : '—', style: const TextStyle(
                        color: Colors.white, fontSize: 42, fontWeight: FontWeight.w900, height: 1.0)),
                    if (condition != null) ...[
                      const SizedBox(height: 2),
                      Text(condition, style: const TextStyle(
                          color: Color(0xFFbcd3ea), fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(color: Color(0xFF2a4a70), height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _stat('Feels like', feelsLike != null ? '$feelsLike°' : '—')),
              Container(width: 1, height: 26, color: const Color(0xFF2a4a70)),
              Expanded(child: _stat('Humidity', humidity != null ? '$humidity%' : '—')),
              Container(width: 1, height: 26, color: const Color(0xFF2a4a70)),
              Expanded(child: _stat('Wind', wind != null ? '$wind km/h' : '—')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => Column(
    children: [
      Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(color: Color(0xFF8da4be), fontSize: 9.5, fontWeight: FontWeight.w600)),
    ],
  );
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String icon, text;
  final Widget? trailing;
  // Weather-data sections (temp, hourly, wind/pressure/UV grid) use muted:
  // true so they read as smaller, secondary reference headers — the flood
  // sections (trend, 14-day outlook, rainfall outlook) keep the full-size
  // bright treatment so they visually lead the screen.
  final bool muted;
  const _SectionLabel({required this.icon, required this.text, this.trailing, this.muted = false});

  @override
  Widget build(BuildContext context) => Row(children: [
    Text(icon, style: TextStyle(fontSize: muted ? 12 : 13)),
    const SizedBox(width: 6),
    Expanded(
      child: Text(text, style: TextStyle(
        color: muted ? AppColors.textSec : AppColors.textPri,
        fontSize: muted ? 13 : 15,
        fontWeight: FontWeight.w800, letterSpacing: -0.2,
      )),
    ),
    if (trailing != null) trailing!,
  ]);
}

// ── Weather Data section divider ──────────────────────────────────────────────
// Marks the boundary between AGOS's core flood-forecasting content (above)
// and the supporting raw-weather reference data (below) — temperature,
// hourly conditions, wind/pressure/UV grid. Deliberately quiet (a thin
// rule + small muted label) rather than another bold _SectionLabel, so it
// reads as "extra detail if you want it" rather than competing with the
// flood sections for attention.
class _WeatherSectionDivider extends StatelessWidget {
  const _WeatherSectionDivider();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Expanded(child: Container(height: 1, color: AppColors.bgBorder)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(children: const [
          Icon(Icons.cloud_outlined, size: 12, color: AppColors.textMuted),
          SizedBox(width: 5),
          Text('WEATHER DATA', style: TextStyle(
              color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.1)),
        ]),
      ),
      Expanded(child: Container(height: 1, color: AppColors.bgBorder)),
    ]),
  );
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

// ── Weather Details grid (wind/gusts/humidity/visibility/pressure/UV/dew
// point/soil moisture for the current hour) ─────────────────────────────────
// Mirrors the `Stat` grid in the web dashboard's WeatherForecast.jsx —
// same 8 fields, same /api/forecast payload, just laid out for a phone
// screen (2 columns instead of a wide row).
class _WeatherDetailsGrid extends StatelessWidget {
  final Map<String, dynamic>? current;
  const _WeatherDetailsGrid({required this.current});

  @override
  Widget build(BuildContext context) {
    String fmt(String key, {String suffix = '', int? round}) {
      final v = current?[key];
      if (v == null) return '—';
      if (v is num) {
        final n = round != null ? v.toStringAsFixed(round) : v.toString();
        return '$n$suffix';
      }
      return '$v$suffix';
    }

    final stats = <({String icon, String label, String value})>[
      (icon: '💨', label: 'WIND', value: fmt('wind_speed_kph', suffix: ' km/h')),
      (icon: '🌬', label: 'WIND GUSTS', value: fmt('wind_gusts_kph', suffix: ' km/h')),
      (icon: '💧', label: 'HUMIDITY', value: fmt('humidity', suffix: '%')),
      (icon: '👁', label: 'VISIBILITY', value: fmt('visibility_km', suffix: ' km')),
      (icon: '🧭', label: 'PRESSURE', value: fmt('pressure_msl_hpa', suffix: ' hPa')),
      (icon: '☀️', label: 'UV INDEX', value: fmt('uv_index')),
      (icon: '🌡', label: 'DEW POINT', value: fmt('dew_point_c', suffix: '°C')),
      (icon: '🥵', label: 'FEELS LIKE', value: fmt('feels_like_c', suffix: '°C')),
      (
        icon: '🌱',
        label: 'SOIL MOISTURE',
        value: current?['soil_moisture_vwc'] != null
            ? '${((current!['soil_moisture_vwc'] as num) * 100).toStringAsFixed(1)}%'
            : '—',
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(icon: '📊', text: 'Weather Details', muted: true),
        const SizedBox(height: 2),
        const Text('Current conditions · Open-Meteo',
            style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
        const SizedBox(height: 10),
        // Rounded-square icon chip per stat — mirrors the reference app's
        // "Detail" grid (purple icon square + big value + small label
        // stacked below it) rather than a plain icon/label/value row.
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 2.35,
          children: stats.map((s) => Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF0d1f3c),
              border: Border.all(color: const Color(0xFF1e3a5f)),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Container(
                  width: 38, height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Text(s.icon, style: const TextStyle(fontSize: 16)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(s.value, style: const TextStyle(
                          color: Color(0xFFe2eaf5), fontSize: 14.5, fontWeight: FontWeight.w800),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 1),
                      Text(s.label, style: const TextStyle(
                          color: Color(0xFF4a6080), fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.3),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          )).toList(),
        ),
      ],
    );
  }
}

// ── Flood Risk Trend (next 7 days, from the same 14-day model outlook) ───────
// The flood-forecasting equivalent of a weather app's "temperature over the
// next week" trend graph — except every bar is a flood-probability reading,
// colored by alert level, so the shape of the week's flood risk is visible
// at a glance before anyone reads the day-by-day list below it. This is
// deliberately the first thing under the hero/guidance, ahead of any
// weather content, since a trend chart is one of the strongest visual
// signals that this is a flood-forecasting app rather than a weather app
// with a flood banner bolted on.
class _FloodRiskTrendChart extends StatelessWidget {
  final List<_DailyFloodForecast> days;
  final bool loading;
  const _FloodRiskTrendChart({required this.days, required this.loading});

  String _shortDay(_DailyFloodForecast d) {
    if (d.dayAhead == 0) return 'Today';
    if (d.dayAhead == 1) return 'Tmrw';
    const wdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return wdays[d.date.weekday - 1];
  }

  @override
  Widget build(BuildContext context) {
    if (loading || days.isEmpty) {
      return Container(
        height: 132, alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFF0a1828),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF1e3a5f)),
        ),
        child: Text(
          loading ? 'Loading flood risk trend...' : 'Flood risk trend unavailable',
          style: const TextStyle(color: Color(0xFF4a6080), fontSize: 12),
        ),
      );
    }

    final week = days.take(7).toList();
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0d1f3c),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF1e3a5f)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('7-Day Flood Risk Trend', style: TextStyle(
              color: AppColors.textPri, fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          const Text('Model probability of flooding, by day',
              style: TextStyle(color: Color(0xFF4a6080), fontSize: 10)),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: week.map((d) {
              final color = _alertColors[d.alertLevel] ?? _alertColors['NORMAL']!;
              final pct = d.probabilityPct.clamp(0, 100).toDouble();
              // Minimum bar height so a 0-2% day still reads as a visible
              // bar rather than a sliver — same trick weather apps use so
              // a calm day doesn't look like missing data. Deliberately no
              // fixed-height wrapper around this Row: the % and day labels
              // above/below the bar scale with the user's Text Size
              // accessibility setting (see main_shell.dart), so any fixed
              // pixel budget for "label + bar + label" would eventually
              // overflow at a large enough text scale. Letting the Row
              // size to its own content instead means it can never
              // overflow, at any font size.
              final barHeight = 6 + (pct / 100) * 56;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${pct.toStringAsFixed(0)}%', style: TextStyle(
                          color: color, fontSize: 9.5, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Container(
                        height: barHeight,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(_shortDay(d), style: const TextStyle(
                          color: Color(0xFF8da4be), fontSize: 9.5, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ── Rainfall Outlook row (next 6h / 12h / 24h) ────────────────────────────────
// Mirrors the `outlook` block in web's WeatherForecast.jsx — accumulated
// mm and peak rain-probability for each window, straight from
// /api/forecast's `outlook` object (previously computed on the backend
// but never read by this screen).
class _RainfallOutlookRow extends StatelessWidget {
  final Map<String, dynamic> outlook;
  const _RainfallOutlookRow({required this.outlook});

  @override
  Widget build(BuildContext context) {
    final windows = [
      ('Next 6 Hours', outlook['next_6h_rain_mm'], outlook['next_6h_rain_probability_pct']),
      ('Next 12 Hours', outlook['next_12h_rain_mm'], outlook['next_12h_rain_probability_pct']),
      ('Next 24 Hours', outlook['next_24h_rain_mm'], outlook['next_24h_rain_probability_pct']),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(icon: '☔', text: 'Rainfall Outlook'),
        const SizedBox(height: 10),
        Row(
          children: windows.map((w) {
            final (label, mm, pct) = w;
            final isLast = w == windows.last;
            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: isLast ? 0 : 8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0d1f3c),
                    border: Border.all(color: const Color(0xFF1e3a5f)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: const TextStyle(
                          color: Color(0xFF4a6080), fontSize: 8.5, fontWeight: FontWeight.w800, letterSpacing: 0.3)),
                      const SizedBox(height: 6),
                      Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                        Text(mm != null ? '$mm' : '—', style: const TextStyle(
                            color: Color(0xFF38bdf8), fontSize: 16, fontWeight: FontWeight.w900)),
                        const SizedBox(width: 3),
                        const Text('mm', style: TextStyle(color: Color(0xFF4a6080), fontSize: 9)),
                      ]),
                      if (pct != null) ...[
                        const SizedBox(height: 3),
                        Text('☔ $pct% chance', style: const TextStyle(
                            color: Color(0xFF8da4be), fontSize: 9)),
                      ],
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

// ── Daily Flood Forecast list (GET /api/forecast-flood → "forecast") ─────────
// Row-per-day, styled after a classic "5-Day Forecast" list: an icon, the
// day label, a plain-language risk description, and a value pill — but
// driven by the model's own forward flood-probability outlook rather than
// temperature. Each row is tappable — see _showFloodDriversSheet — to
// break that day's probability down into what actually fed the model.
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

            return InkWell(
              onTap: () => _showFloodDriversSheet(context, d, _dayLabel(d)),
              child: Container(
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
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right_rounded, color: Color(0xFF4a6080), size: 18),
                ]),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ── Flood Drivers Sheet ───────────────────────────────────────────────────────
// Opened by tapping a day in _DailyFloodForecastList. Breaks that day's
// flood-probability reading down into the actual model inputs behind it —
// rainfall and wind get dedicated, bigger callouts since they're the two
// primary drivers the app already surfaces elsewhere; anything else the
// backend sends for that day (humidity, soil moisture, temperature, etc.)
// is read straight from _DailyFloodForecast.raw, so a new field the model
// starts using later shows up here automatically rather than needing an
// app update to surface it.
void _showFloodDriversSheet(BuildContext context, _DailyFloodForecast d, String dayLabel) {
  final color = _alertColors[d.alertLevel] ?? _alertColors['NORMAL']!;

  // Any raw field beyond the ones already parsed onto dedicated properties
  // or excluded as pure metadata — these render as the "Other Factors" grid
  // below the primary rainfall/wind callouts.
  final otherEntries = d.raw.entries.where((e) {
    if (_driverExcludedKeys.contains(e.key)) return false;
    final v = e.value;
    return v is num || (v is String && num.tryParse(v) != null);
  }).toList();

  showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.bgDark,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20, 16, 20, 28 + MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 36, height: 4, margin: const EdgeInsets.only(bottom: 18),
                decoration: BoxDecoration(
                  color: AppColors.bgBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // ── Header: day, risk word, probability pill ──────────────────
            Row(children: [
              Text(_riskEmoji(d.probabilityPct), style: const TextStyle(fontSize: 30)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(dayLabel, style: const TextStyle(
                      color: AppColors.textPri, fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 1),
                  Text(_riskWordFromPct(d.probabilityPct), style: const TextStyle(
                      color: AppColors.textSec, fontSize: 12.5, fontWeight: FontWeight.w600)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color.withValues(alpha: 0.45)),
                ),
                child: Text('${d.probabilityPct.toStringAsFixed(0)}%',
                    style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w900)),
              ),
            ]),
            const SizedBox(height: 14),

            // ── Confidence note ────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.25)),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.info_outline_rounded, color: AppColors.accent, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_confidenceLabels[d.confidenceBand] ?? 'Outlook only', style: const TextStyle(
                        color: AppColors.accent, fontSize: 12, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                      _confidenceExplainers[d.confidenceBand] ??
                          'Forecast confidence decreases the further out the day is.',
                      style: const TextStyle(color: AppColors.textSec, fontSize: 11.5, height: 1.4),
                    ),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 20),

            const Text('WHAT DROVE THIS FORECAST', style: TextStyle(
                color: AppColors.textMuted, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 1.0)),
            const SizedBox(height: 10),

            // ── Primary drivers: rainfall + wind ──────────────────────────
            Row(children: [
              Expanded(
                child: _DriverCallout(
                  icon: '☔', label: 'Rainfall',
                  value: d.rainfallMm != null ? '${d.rainfallMm!.toStringAsFixed(1)}' : '—',
                  suffix: 'mm',
                  note: 'Forecast total for the day',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _DriverCallout(
                  icon: '💨', label: 'Wind',
                  value: d.windSpeedMaxKph != null ? d.windSpeedMaxKph!.toStringAsFixed(0) : '—',
                  suffix: 'km/h',
                  note: 'Forecast max for the day',
                ),
              ),
            ]),

            // ── Any other model inputs the backend sent for this day ─────
            if (otherEntries.isNotEmpty) ...[
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 2.5,
                children: otherEntries.map((entry) {
                  final meta = _driverMeta[entry.key];
                  final v = entry.value;
                  final n = v is num ? v : num.tryParse(v.toString());
                  final display = n == null
                      ? v.toString()
                      : n.toStringAsFixed(meta?.round ?? 1);
                  return Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0d1f3c),
                      border: Border.all(color: const Color(0xFF1e3a5f)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(children: [
                      Container(
                        width: 32, height: 32,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Text(meta?.icon ?? '📊', style: const TextStyle(fontSize: 14)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('$display${meta?.suffix ?? ''}', style: const TextStyle(
                                color: Color(0xFFe2eaf5), fontSize: 13, fontWeight: FontWeight.w800),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(meta?.label ?? _titleCase(entry.key), style: const TextStyle(
                                color: Color(0xFF4a6080), fontSize: 9, fontWeight: FontWeight.w700),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                    ]),
                  );
                }).toList(),
              ),
            ] else ...[
              const SizedBox(height: 12),
              const Text(
                'Rainfall and wind are the main inputs the model uses for this day.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 11, height: 1.4),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

// Single big driver readout (rainfall / wind) at the top of the drivers
// sheet — same visual language as the app's other stat callouts, just
// sized up since these two are the headline inputs.
class _DriverCallout extends StatelessWidget {
  final String icon, label, value, suffix, note;
  const _DriverCallout({
    required this.icon, required this.label, required this.value,
    required this.suffix, required this.note,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFF0d1f3c),
      border: Border.all(color: const Color(0xFF1e3a5f)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(icon, style: const TextStyle(fontSize: 15)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(
            color: Color(0xFF8da4be), fontSize: 11, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 6),
      Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
        Text(value, style: const TextStyle(
            color: Color(0xFFe2eaf5), fontSize: 20, fontWeight: FontWeight.w900)),
        const SizedBox(width: 3),
        Text(suffix, style: const TextStyle(color: Color(0xFF4a6080), fontSize: 11)),
      ]),
      const SizedBox(height: 2),
      Text(note, style: const TextStyle(color: Color(0xFF4a6080), fontSize: 9.5)),
    ]),
  );
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
            Text('See the barangay boundary and rain visualization',
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
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:provider/provider.dart';
import '../main.dart';
import '../data/critical_facilities.dart';
import '../models/alert_level.dart';
import '../theme/panahon_ui.dart';
import '../services/cached_api.dart';
import '../services/connectivity_service.dart';
import '../services/flood_status_service.dart';
import '../services/tile_cache.dart';
import '../widgets/rain_overlay.dart';
import '../widgets/wind_direction_arrow.dart';

// ─── URL (no fallback for a missing/misspelled .env key — see
// dashboard_screen.dart for that rationale) ─────────────────────────────────
String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

// Hourly weather forecast — same endpoint dashboard_screen.dart already
// polls for its hourly strip. Powers the radar-style timeline scrubber
// below (rain probability / intensity + the RainOverlay animation at
// whichever hour is currently scrubbed to).
String get _forecastUrl => _requireEnv('FORECAST_API_URL');
// Daily flood outlook — same endpoint dashboard_screen.dart's "Next 7 days"
// list already polls. Backs the (default) flood-probability radar layer.
String get _forecastFloodUrl => _requireEnv('FORECAST_FLOOD_API_URL');

// ─── Alert colors / labels ──────────────────────────────────────────────────────
const _alertColors = {
  'NORMAL':   Color(0xFF22c55e),
  'ADVISORY': Color(0xFFeab308),
  'WARNING':  Color(0xFFf97316),
  'CRITICAL': Color(0xFFef4444),
};

const _alertLevelKeys = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL'];

// ─── Radar-style intensity color scale ─────────────────────────────────────
// Blue → green → yellow → orange → red, the same "cool-to-hot" ramp radar
// apps use for rain intensity. Used to color both the boundary polygon and
// the vertical legend bar at whatever timeline hour is currently selected —
// distinct from _alertColors above, which always reflects the *live*
// model alert level shown in the status pill.
const _scaleStops = [
  Color(0xFF3B82F6), // blue    — none/light
  Color(0xFF22C55E), // green   — light
  Color(0xFFEAB308), // yellow  — moderate
  Color(0xFFF97316), // orange  — heavy
  Color(0xFFEF4444), // red     — storm/extreme
];

Color _scaleColor(double t) {
  final clamped = t.clamp(0.0, 1.0);
  final scaled = clamped * (_scaleStops.length - 1);
  final i = scaled.floor().clamp(0, _scaleStops.length - 2);
  final frac = scaled - i;
  return Color.lerp(_scaleStops[i], _scaleStops[i + 1], frac)!;
}

// What drives the timeline's coloring. `probability` and `intensity` are
// hourly-resolution views over the same /api/forecast data (kept to the
// same time grid so switching between *those two* doesn't jump the
// timeline). `flood` is different on purpose: the flood model only
// forecasts daily, so that layer gets its own 7-day timeline (see
// _dailyFlood / _floodDayIndex) instead of reusing the hourly grid.
enum _RadarLayer { flood, probability, intensity }

// Same shape-coded icon set as dashboard_screen.dart / alert_screen.dart
// (see models/alert_level.dart) — so the map's status pill and legend
// don't rely on color alone to distinguish NORMAL/ADVISORY/WARNING/
// CRITICAL, which matters since red/orange (WARNING vs CRITICAL) are
// hard to tell apart for red-green colorblind users.
IconData _iconForAlertKey(String key) {
  switch (key) {
    case 'CRITICAL': return AlertLevelType.critical.icon;
    case 'WARNING':  return AlertLevelType.warning.icon;
    case 'ADVISORY': return AlertLevelType.advisory.icon;
    default:         return AlertLevelType.normal.icon;
  }
}

// ─── Basemap options ──────────────────────────────────────────────────────────
// Free, no-API-key raster sources. `monochrome` controls whether we apply
// the app's grayscale filter — that only makes sense for the plain street
// map; satellite/terrain need their real colors to be legible.
//
// NOTE: verify `RichAttributionWidget` / `TextSourceAttribution` / the
// `subdomains` param against the flutter_map version pinned in pubspec.yaml
// if this doesn't compile as-is — same caveat this file already carried for
// third-party map package APIs.
class _BaseStyleDef {
  final String label;
  final IconData icon;
  final String urlTemplate;
  final List<String> subdomains;
  final String attribution;
  final bool monochrome;

  const _BaseStyleDef({
    required this.label,
    required this.icon,
    required this.urlTemplate,
    this.subdomains = const [],
    required this.attribution,
    required this.monochrome,
  });
}

const _baseStyles = {
  'standard': _BaseStyleDef(
    label: 'Standard',
    icon: Icons.map_rounded,
    urlTemplate: kTileUrlStandard,
    attribution: '© OpenStreetMap contributors',
    monochrome: true,
  ),
  'satellite': _BaseStyleDef(
    label: 'Satellite',
    icon: Icons.satellite_alt_rounded,
    urlTemplate: kTileUrlSatellite,
    attribution: '© Esri, Maxar, Earthstar Geographics',
    monochrome: false,
  ),
  'terrain': _BaseStyleDef(
    label: 'Terrain',
    icon: Icons.terrain_rounded,
    urlTemplate: kTileUrlTerrain,
    subdomains: ['a', 'b', 'c'],
    attribution: '© OpenTopoMap contributors (CC-BY-SA) · SRTM',
    monochrome: false,
  ),
};

// ─── Barangay Triangulo boundary ──────────────────────────────────────────────
const _trianguloPolygon = [
  LatLng(13.622162, 123.193368), LatLng(13.621778, 123.195934),
  LatLng(13.621222, 123.195882), LatLng(13.621053, 123.196923),
  LatLng(13.620874, 123.197226), LatLng(13.619826, 123.196902),
  LatLng(13.619792, 123.197160), LatLng(13.619419, 123.197081),
  LatLng(13.619310, 123.197670), LatLng(13.617688, 123.197134),
  LatLng(13.613977, 123.197774), LatLng(13.611311, 123.195202),
  LatLng(13.607139, 123.197145), LatLng(13.602733, 123.187140),
  LatLng(13.611057, 123.185706), LatLng(13.611714, 123.186500),
  LatLng(13.611770, 123.186722), LatLng(13.611529, 123.187289),
  LatLng(13.611511, 123.187524), LatLng(13.611704, 123.187806),
  LatLng(13.611891, 123.187920), LatLng(13.612091, 123.187856),
  LatLng(13.612502, 123.187898), LatLng(13.612609, 123.187964),
  LatLng(13.612574, 123.188154), LatLng(13.612936, 123.188138),
  LatLng(13.613193, 123.187934), LatLng(13.613532, 123.188201),
  LatLng(13.613921, 123.187954), LatLng(13.613929, 123.187798),
  LatLng(13.614044, 123.187740), LatLng(13.614219, 123.187710),
  LatLng(13.614300, 123.187333), LatLng(13.616435, 123.187325),
  LatLng(13.616637, 123.184921), LatLng(13.617106, 123.184082),
  LatLng(13.618525, 123.185204), LatLng(13.618746, 123.185162),
  LatLng(13.619016, 123.185245), LatLng(13.619187, 123.185523),
  LatLng(13.619383, 123.185558), LatLng(13.620149, 123.186123),
  LatLng(13.620387, 123.186049), LatLng(13.620389, 123.186138),
  LatLng(13.621316, 123.187165), LatLng(13.621189, 123.187267),
  LatLng(13.622423, 123.189744), LatLng(13.622633, 123.189794),
];

const _trianguloCenter = LatLng(13.6140, 123.1915);

// ─── Screen ───────────────────────────────────────────────────────────────────
class FloodMapScreen extends StatefulWidget {
  const FloodMapScreen({super.key});

  @override
  State<FloodMapScreen> createState() => _FloodMapScreenState();
}

class _FloodMapScreenState extends State<FloodMapScreen> {
  String _alertKey = 'NORMAL';
  double? _probability;
  bool _loading = true;
  Timer? _timer;

  bool _liveDataStale = false;
  DateTime? _lastUpdated;

  bool _showLegend = false;
  // Critical facilities (hospitals/clinics, schools, police, fire) overlay --
  // off by default, same as the web dashboard's `showFacilities` toggle, so
  // the map isn't cluttered until the resident asks for it.
  bool _showFacilities = false;
  bool _isFullscreen = false;

  // ── "Where am I?" — the user's own position on the map (blue dot) and
  // whether it falls inside the Brgy. Triangulo boundary. HazardHunterPH and
  // Google Flood Hub both lead with "your location"; a flood map you can't
  // find yourself on is just a picture.
  LatLng? _userLatLng;
  bool _locating = false;
  String? _locationNote; // shown in the status pill
  String _baseStyleKey = 'standard';
  double _zoom = 14.5;
  final MapController _mapController = MapController();

  // ── Live weather signal, for the rain overlay + wind arrow ──────────────
  // Pulled out of the same predict-flood poll _fetchStatus already runs —
  // live_metrics comes back on that response, so this doesn't cost a
  // separate request.
  double _liveRainfallMm = 0;
  int _liveWindSignal = 0;
  double? _liveWindDirectionDeg;

  // ── Radar-style hourly timeline ──────────────────────────────────────────
  List<Map<String, dynamic>> _hourly = [];
  int _timelineIndex = 0;
  bool _isPlaying = false;
  Timer? _playTimer;
  _RadarLayer _radarLayer = _RadarLayer.flood;

  // Daily flood outlook for the flood-probability layer's own timeline —
  // the model only forecasts flood risk per day (see /api/forecast-flood),
  // so this layer animates one frame per day instead of riding the hourly
  // grid the other two layers use. Fetched once; a multi-day outlook
  // doesn't need the 30s refresh cadence the live status pill uses.
  List<Map<String, dynamic>> _dailyFlood = [];
  int _floodDayIndex = 0;

  static const _timelineHours = 24; // next 24h — matches the reference UI's single-evening span
  static const _timelineDays = 7;   // flood-probability layer: next 7 days

  @override
  void initState() {
    super.initState();
    // Live status comes from the app-wide FloodStatusService (one shared
    // poller, saved to disk, honors the Settings refresh interval) instead
    // of this screen running its own 30 s timer against the same endpoint.
    final svc = context.read<FloodStatusService>();
    _statusService = svc;
    svc.addListener(_onStatusUpdate);
    _onStatusUpdate();
    _fetchHourly();
    _fetchDailyFlood();
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) {
      _fetchHourly();
      _fetchDailyFlood();
    });
  }

  FloodStatusService? _statusService;
  StreamSubscription<void>? _reconnectSub;

  @override
  void dispose() {
    _statusService?.removeListener(_onStatusUpdate);
    _reconnectSub?.cancel();
    _timer?.cancel();
    _timer = null;
    _playTimer?.cancel();
    _playTimer = null;
    super.dispose();
  }

  void _applyDaily(Cached<Map<String, dynamic>> c) {
    if (!mounted) return;
    var list = (c.data['forecast'] as List? ?? []).cast<Map<String, dynamic>>();
    if (c.fromCache) {
      // Saved outlook: don't show days that have already passed.
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      list = list.where((d) {
        final t = DateTime.tryParse(d['date']?.toString() ?? '');
        return t != null && !t.isBefore(today);
      }).toList();
    }
    final daily = list
        .where((d) => d['date'] != null && d['flood_probability'] is num)
        .take(_timelineDays)
        .toList();
    setState(() {
      _dailyFlood = daily;
      if (_floodDayIndex >= _dailyFlood.length) _floodDayIndex = 0;
    });
  }

  Future<void> _fetchDailyFlood() async {
    if (!mounted) return;
    try {
      final result = await fetchJsonCached(
        _forecastFloodUrl,
        cacheKey: 'forecast_flood_daily', // shared with the dashboard
        maxCacheAge: const Duration(hours: 72),
        onSaved: _applyDaily,
      );
      _applyDaily(result);
    } catch (e) {
      debugPrint('AGOS: daily flood forecast fetch failed: $e');
    }
  }

  void _applyHourly(Cached<Map<String, dynamic>> c) {
    if (!mounted) return;
    var list = (c.data['hourly'] as List? ?? []).cast<Map<String, dynamic>>();
    if (c.fromCache) {
      final cutoff = DateTime.now().subtract(const Duration(minutes: 59));
      list = list.where((h) {
        final t = DateTime.tryParse(h['time']?.toString() ?? '');
        return t != null && t.isAfter(cutoff);
      }).toList();
    }
    setState(() {
      _hourly = list.take(_timelineHours).toList();
      if (_timelineIndex >= _hourly.length) _timelineIndex = 0;
    });
  }

  Future<void> _fetchHourly() async {
    if (!mounted) return;
    try {
      final result = await fetchJsonCached(
        _forecastUrl,
        cacheKey: 'forecast_hourly', // shared with the dashboard
        maxCacheAge: const Duration(hours: 6),
        onSaved: _applyHourly,
      );
      _applyHourly(result);
    } catch (e) {
      debugPrint('AGOS: hourly forecast fetch failed: $e');
    }
  }

  // The flood-probability layer steps through _dailyFlood (one frame per
  // day); probability/intensity step through _hourly (one frame per hour).
  // These two helpers are the single place that decides which list/index
  // is "live" so play/scrub/build don't each re-derive it.
  bool get _isFloodLayer => _radarLayer == _RadarLayer.flood;
  List<Map<String, dynamic>> get _activeTimelineList => _isFloodLayer ? _dailyFlood : _hourly;
  int get _activeTimelineIndex => _isFloodLayer ? _floodDayIndex : _timelineIndex;
  set _activeTimelineIndex(int i) {
    if (_isFloodLayer) {
      _floodDayIndex = i;
    } else {
      _timelineIndex = i;
    }
  }

  void _togglePlay() {
    if (_activeTimelineList.isEmpty) return;
    setState(() => _isPlaying = !_isPlaying);
    if (_isPlaying) {
      _playTimer?.cancel();
      // The 7-day flood outlook gets a slower cadence than the hourly
      // layers — each frame is a whole day, so it needs a beat longer to
      // actually read before advancing.
      final interval = _isFloodLayer
          ? const Duration(milliseconds: 1400)
          : const Duration(milliseconds: 900);
      _playTimer = Timer.periodic(interval, (_) {
        final list = _activeTimelineList;
        if (!mounted || list.isEmpty) return;
        setState(() => _activeTimelineIndex = (_activeTimelineIndex + 1) % list.length);
      });
    } else {
      _playTimer?.cancel();
      _playTimer = null;
    }
  }

  void _scrubTo(int index) {
    final list = _activeTimelineList;
    if (list.isEmpty) return;
    if (_isPlaying) _togglePlay(); // dragging the scrubber pauses playback
    setState(() => _activeTimelineIndex = index.clamp(0, list.length - 1));
  }

  Map<String, dynamic>? get _selectedHour =>
      (_hourly.isNotEmpty && _timelineIndex < _hourly.length) ? _hourly[_timelineIndex] : null;

  Map<String, dynamic>? get _selectedFloodDay =>
      (_dailyFlood.isNotEmpty && _floodDayIndex < _dailyFlood.length)
          ? _dailyFlood[_floodDayIndex]
          : null;

  // The flood-probability layer is colored from the same NORMAL/ADVISORY/
  // WARNING/CRITICAL set as the status pill and legend — each day already
  // comes back from the backend with its own alert_level (see
  // probability_to_alert_level() in backend/app/utils/alerts.py), so this
  // reuses that instead of computing a color off the raw probability.
  // Falls back to NORMAL for a missing/unrecognized value rather than
  // guessing a probability threshold that might not match the backend's.
  Color _dailyAlertColor(Map<String, dynamic> day) {
    final raw = day['alert_level']?.toString().toUpperCase();
    final key = (raw != null && _alertLevelKeys.contains(raw)) ? raw : 'NORMAL';
    return _alertColors[key]!;
  }

  // 0..1 read of the selected hour for whichever *hourly* layer is active
  // (probability/intensity only — the flood layer reads its own daily
  // value directly in build(), since it isn't on this hourly grid).
  double _hourValue01(Map<String, dynamic> h) {
    num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    if (_radarLayer == _RadarLayer.probability) {
      final pct = n(h['rain_probability_pct'])?.toDouble() ?? 0;
      return (pct / 100).clamp(0.0, 1.0);
    }
    final mm = n(h['precipitation'])?.toDouble() ?? 0;
    return (mm / 20).clamp(0.0, 1.0); // 20mm/hr ≈ top of the scale
  }

  void _onStatusUpdate() {
    final svc = _statusService;
    if (svc == null || !mounted) return;
    final j = svc.rawJson;
    num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    setState(() {
      _loading = svc.loading && j == null;
      // "Stale" = the most recent refresh failed; what's shown is then the
      // last good (possibly saved-to-disk) reading, labeled with its age.
      _liveDataStale = svc.error != null;
      if (svc.lastUpdated != null) _lastUpdated = svc.lastUpdated;
      if (j == null) return;
      // alert_level is a string enum from the backend ("NORMAL" /
      // "ADVISORY" / "WARNING" / "CRITICAL"), never a number.
      final rawLevel = j['alert_level']?.toString().toUpperCase();
      _alertKey = _alertLevelKeys.contains(rawLevel) ? rawLevel! : 'NORMAL';
      _probability = (j['probability'] as num?)?.toDouble();
      final m = j['live_metrics'] as Map<String, dynamic>? ?? {};
      _liveRainfallMm = n(m['rainfall_mm'])?.toDouble() ?? 0;
      _liveWindSignal = n(m['wind_signal'])?.toInt() ?? 0;
      _liveWindDirectionDeg = n(m['wind_direction_deg'])?.toDouble();
    });
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 45) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }

  String _tickLabel(DateTime d) {
    final now = DateTime.now();
    final diff = DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tmrw';
    const w = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return w[d.weekday - 1];
  }

  // Ray-casting point-in-polygon (same approach the evacuation screen uses).
  bool _insideBoundary(LatLng p) {
    const poly = _trianguloPolygon;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      final yi = poly[i].latitude, xi = poly[i].longitude;
      final yj = poly[j].latitude, xj = poly[j].longitude;
      final crosses = ((yi > p.latitude) != (yj > p.latitude)) &&
          (p.longitude < (xj - xi) * (p.latitude - yi) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  Future<void> _locateMe() async {
    if (_locating) return;
    setState(() => _locating = true);
    String? note;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        note = 'Location permission is off';
      } else if (!await Geolocator.isLocationServiceEnabled()) {
        note = 'Turn on GPS to see your location';
      } else {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
        final here = LatLng(pos.latitude, pos.longitude);
        final inside = _insideBoundary(here);
        HapticFeedback.lightImpact();
        if (!mounted) return;
        setState(() {
          _userLatLng = here;
          _locationNote = inside ? 'You are inside this flood zone' : 'You are outside Brgy. Triangulo';
        });
        try {
          if (inside) {
            _mapController.move(here, _zoom < 15.5 ? 15.5 : _zoom);
          } else {
            // Outside: frame the barangay AND the user so you can see how far
            // away you are, instead of zooming into an empty street.
            _mapController.fitCamera(CameraFit.bounds(
              bounds: LatLngBounds.fromPoints([..._trianguloPolygon, here]),
              padding: const EdgeInsets.all(56),
              maxZoom: 16,
            ));
          }
        } catch (_) {}
      }
    } catch (_) {
      note = "Couldn't get your location";
    }
    if (!mounted) return;
    setState(() {
      _locating = false;
      if (note != null) {
        _locationNote = note;
        _userLatLng = null;
      }
    });
  }

  void _recenter() {
    if (!mounted) return;
    setState(() => _zoom = 14.5);
    try {
      _mapController.move(_trianguloCenter, _zoom);
    } catch (_) {
      // Map not currently attached — safe to ignore.
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _alertColors[_alertKey] ?? _alertColors['NORMAL']!;
    final activeStyle = _baseStyles[_baseStyleKey]!;

    // Radar timeline: only once the user actually scrubs away from "now"
    // (index 0) does the boundary follow the selected frame's color via the
    // continuous gradient — matches the timeline's own intent (browsing a
    // forecasted hour/day) without hijacking the default view. At rest, on
    // index 0, the boundary still shows the plain ADVISORY/WARNING/CRITICAL
    // color the status pill shows. The status pill up top is untouched
    // either way and always shows the live model alert level.
    //
    // The flood-probability layer reads its own daily frame (_dailyFlood /
    // _floodDayIndex) instead of the hourly grid the other two layers use
    // — see _activeTimelineList. It's also colored differently on purpose:
    // each day already comes back from the backend with its own
    // NORMAL/ADVISORY/WARNING/CRITICAL alert_level (the same field the
    // status pill and legend use), so the flood layer is colored from that
    // same 4-color set via _dailyAlertColor — never the blue-green-yellow-
    // orange-red radar ramp _scaleColor uses for the other two layers. That
    // ramp starts at blue, a color that doesn't exist anywhere else in the
    // app's flood-risk vocabulary, so using it for the flood layer misread
    // as "the flood animation is stuck on blue" — this keeps every flood
    // color on screen (boundary, status pill, legend, timeline) drawn from
    // the exact same 4 colors.
    Color? frameColor;
    if (_isFloodLayer) {
      final day = _selectedFloodDay;
      if (day != null) frameColor = _dailyAlertColor(day);
    } else {
      final hour = _selectedHour;
      if (hour != null) frameColor = _scaleColor(_hourValue01(hour));
    }
    final timelineColor = frameColor ?? color;
    final boundaryColor = (_activeTimelineList.isNotEmpty && _activeTimelineIndex != 0) ? timelineColor : color;

    // The rain overlay (streaks/clouds/fog animation) rides the hourly
    // grid's per-hour precipitation, which doesn't mean anything for the
    // flood layer's daily risk frames — so it's simply switched off while
    // that layer is active, rather than falling back to a live reading
    // that has nothing to do with what the timeline is showing.
    final selectedHour = _isFloodLayer ? null : _selectedHour;
    num? numOf(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    final showRainOverlay = !_isFloodLayer;
    final overlayRainfallMm = selectedHour != null
        ? (numOf(selectedHour['precipitation'])?.toDouble() ?? 0)
        : _liveRainfallMm;
    final overlayCondition = selectedHour?['condition']?.toString();

    // Chrome (legend scale, "radar layers" button, timeline bar itself)
    // stays visible as long as *either* forecast has loaded, even if the
    // one backing the currently selected layer is still in flight — avoids
    // the toolbar jumping around as the two independent fetches resolve.
    final anyTimelineData = _hourly.isNotEmpty || _dailyFlood.isNotEmpty;


    // Everything is wrapped in one outer SafeArea (top only — the bottom
    // nav chrome, if any, is handled by whatever hosts this screen) so
    // fullscreen mode still clears the status bar/notch even with the
    // header row hidden.
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          // (The shared header in MainShell already says "Flood Map" — a second
          // title row here only took vertical space away from the map.)
          if (!_isFullscreen) const SizedBox(height: 10),

          // ── Map area ─────────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: _isFullscreen ? EdgeInsets.zero : const EdgeInsets.symmetric(horizontal: 14),
              child: ClipRRect(
                borderRadius: _isFullscreen ? BorderRadius.zero : BorderRadius.circular(14),
                child: Container(
                  decoration: BoxDecoration(
                    border: _isFullscreen ? null : Border.all(color: AppColors.bgBorder),
                  ),
                  child: Stack(children: [
                    Positioned.fill(
                      child: _build2DMap(boundaryColor, activeStyle),
                    ),

                    // ── Radar animation (rain streaks / clouds / fog /
                    // lightning) — sits above the basemap, below markers
                    // and chrome. Hidden for the flood-probability layer,
                    // since it has no rainfall/condition data of its own
                    // to animate (see showRainOverlay above).
                    if (showRainOverlay)
                      Positioned.fill(
                        child: RainOverlay(
                          rainfallMm: overlayRainfallMm,
                          condition: overlayCondition,
                          windSignal: _liveWindSignal.toDouble(),
                        ),
                      ),

                    // ── Top-left stack: status card (it now carries the 4-level
                    // scale, so the always-on left legend is gone), wind
                    // readout, and — only when asked for — the legend panel.
                    // One Column means nothing can overlap, whatever the
                    // text size.
                    Positioned(
                      top: 10,
                      left: 10,
                      right: 58,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: () => setState(() => _showLegend = !_showLegend),
                            child: _statusPill(color),
                          ),
                          if (_liveWindDirectionDeg != null) ...[
                            const SizedBox(height: 8),
                            _windPill(),
                          ],
                          if (_showLegend) ...[
                            const SizedBox(height: 8),
                            _legendPanel(),
                          ],
                        ],
                      ),
                    ),

                    // Rain layers still need their continuous colour scale.
                    if (anyTimelineData && !_isFloodLayer)
                      Positioned(top: 170, bottom: 78, left: 10, child: _intensityScaleBar()),

                    // ── Tool stack: 4 buttons instead of 7. Zoom +/- are gone
                    // (pinch and double-tap zoom, like every phone map); basemap
                    // and facilities moved into the Layers sheet.
                    Positioned(
                      top: 10,
                      right: 10,
                      child: MapToolStack(children: [
                        Tooltip(
                          message: 'Show my location',
                          child: MapToolButton(
                            icon: _locating
                                ? Icons.hourglass_top_rounded
                                : (_userLatLng != null
                                    ? Icons.my_location_rounded
                                    : Icons.location_searching_rounded),
                            active: _userLatLng != null,
                            onTap: _locateMe,
                          ),
                        ),
                        Tooltip(
                          message: 'Layers & map style',
                          child: MapToolButton(
                            icon: Icons.layers_rounded,
                            active: _showFacilities || _baseStyleKey != 'standard',
                            onTap: _openLayersSheet,
                          ),
                        ),
                        Tooltip(
                          message: 'Recenter on Barangay Triangulo',
                          child: MapToolButton(
                            icon: Icons.center_focus_strong_rounded,
                            onTap: _recenter,
                          ),
                        ),
                        Tooltip(
                          message: _isFullscreen ? 'Exit fullscreen' : 'Fullscreen',
                          child: MapToolButton(
                            icon: _isFullscreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                            active: _isFullscreen,
                            onTap: () => setState(() => _isFullscreen = !_isFullscreen),
                          ),
                        ),
                      ]),
                    ),

                    // ── Radar timeline scrubber (bottom) ────────────────────
                    if (anyTimelineData)
                      Positioned(left: 0, right: 0, bottom: 0, child: _timelineBar()),
                  ]),
                ),
              ),
            ),
          ),

          if (!_isFullscreen) const SizedBox(height: 14),
        ],
      ),
    );
  }

  // ── 2D flat interactive map ──────────────────────────────────────────────
  Widget _build2DMap(Color color, _BaseStyleDef style) {
    return ColoredBox(
      color: AppColors.bgDark,
      child: FlutterMap(
        // Kept as one stable key across basemap switches (unlike the old 3D
        // style switch, which had to fully remount) — swapping `style` just
        // changes which tiles the same map instance loads, so position/zoom
        // survive switching between Standard/Satellite/Terrain.
        key: const ValueKey('agos_flood_map_2d'),
        mapController: _mapController,
        options: MapOptions(
          initialCenter: _trianguloCenter,
          initialZoom: _zoom,
          interactionOptions: const InteractionOptions(
            flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag | InteractiveFlag.doubleTapZoom,
          ),
          onPositionChanged: (position, hasGesture) {
            final z = position.zoom;
            if (hasGesture && mounted && z != _zoom) {
              setState(() => _zoom = z);
            }
          },
        ),
        children: [
          TileLayer(
            urlTemplate: style.urlTemplate,
            subdomains: style.subdomains,
            userAgentPackageName: 'com.agos.floodmonitoring',
            // Saves every tile viewed to disk (and serves saved tiles with
            // no signal); shares its cache with the evacuation map.
            tileProvider: TileCache.provider,
            // The inverted (dark) basemap suits dark mode only; light mode gets the
            // normal light tiles instead of a black map on a pale screen.
            tileBuilder: (style.monochrome && !AppColors.isLight)
                ? (context, tileWidget, tile) => ColorFiltered(
                      colorFilter: const ColorFilter.matrix([
                        -0.2126, -0.7152, -0.0722, 0, 255,
                        -0.2126, -0.7152, -0.0722, 0, 255,
                        -0.2126, -0.7152, -0.0722, 0, 255,
                         0,       0,       0,       1,   0,
                      ]),
                      child: tileWidget,
                    )
                : null,
          ),
          PolygonLayer(polygons: [
            Polygon(
              points: _trianguloPolygon,
              color: color.withValues(alpha: 0.28),
              borderColor: color,
              borderStrokeWidth: 2.0,
            ),
          ]),

          // ── Critical facilities (hospitals, schools, police, fire) --
          // a fixed, small set, same dataset/colors/icons as the web
          // dashboard's "Critical Facilities" layer.
          if (_showFacilities)
            MarkerLayer(
              markers: kCriticalFacilities.map((facility) {
                final style = kFacilityStyles[facility.type]!;
                return Marker(
                  point: LatLng(facility.lat, facility.lng),
                  width: 30,
                  height: 30,
                  child: GestureDetector(
                    onTap: () => _showFacilityInfo(facility, style),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.bgDark,
                        border: Border.all(color: style.color, width: 2),
                        boxShadow: [
                          BoxShadow(color: AppColors.shadow(0.35), blurRadius: 4),
                        ],
                      ),
                      child: Icon(style.icon, color: AppColors.ink(style.color), size: 15),
                    ),
                  ),
                );
              }).toList(),
            ),

          if (_userLatLng != null)
            MarkerLayer(markers: [
              Marker(
                point: _userLatLng!,
                width: 34,
                height: 34,
                child: Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF2563EB).withValues(alpha: 0.18),
                  ),
                  child: Center(
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF2563EB),
                        border: Border.all(color: Colors.white, width: 2.5),
                        boxShadow: [BoxShadow(color: AppColors.shadow(0.4), blurRadius: 5)],
                      ),
                    ),
                  ),
                ),
              ),
            ]),

          RichAttributionWidget(
            alignment: AttributionAlignment.bottomRight,
            attributions: [TextSourceAttribution(style.attribution)],
          ),
        ],
      ),
    );
  }

  // ── Critical facility tap info ───────────────────────────────────────────
  void _showFacilityInfo(CriticalFacility facility, FacilityStyle style) {
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(children: [
          Icon(style.icon, color: AppColors.ink(style.color), size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(facility.name,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                Text(style.label,
                    style: TextStyle(color: AppColors.ink(style.color), fontSize: 10.5, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ]),
        backgroundColor: AppColors.surface,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }

  // ── Shared UI pieces ────────────────────────────────────────────────────
  Widget _statusPill(Color color) {
    final pillColor = _liveDataStale ? AppColors.textMuted : color;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: pillColor.withValues(alpha: 0.5)),
        boxShadow: [BoxShadow(color: AppColors.shadow(0.35), blurRadius: 10)],
      ),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 24, height: 24,
            decoration: BoxDecoration(shape: BoxShape.circle, color: pillColor.withValues(alpha: 0.18)),
            child: Icon(_iconForAlertKey(_alertKey), color: AppColors.ink(pillColor), size: 14),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Brgy. Triangulo · $_alertKey', style: TextStyle(
                  color: AppColors.ink(pillColor), fontSize: 12, fontWeight: FontWeight.w800)),
              if (_liveDataStale)
                Text(
                  _lastUpdated != null
                      ? 'Live data unavailable · last update ${_timeAgo(_lastUpdated!)}'
                      : 'Live data unavailable',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 9.5),
                )
              else if (_probability != null)
                Text('${(_probability! * 100).toStringAsFixed(0)}% chance of flooding',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
              if (_locationNote != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(_locationNote!,
                      style: TextStyle(
                          color: AppColors.accent, fontSize: 9.5, fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
          if (_loading)
            SizedBox(
              width: 12, height: 12,
              child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 1.5),
            )
          else if (_liveDataStale)
            Icon(Icons.cloud_off_rounded, color: AppColors.textMuted, size: 14)
          else
            Icon(_showLegend ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                color: AppColors.textMuted, size: 18),
        ]),
        if (_probability != null && !_liveDataStale) ...[
          const SizedBox(height: 10),
          _riskScaleBar(_probability!.clamp(0.0, 1.0).toDouble()),
        ],
      ]),
    );
  }

  // 4-segment Normal→Critical scale with a marker at the current probability.
  // Replaces the old always-visible left legend: same information, drawn where
  // the number is, so you can see how close the next level is.
  Widget _riskScaleBar(double p) {
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      return Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          height: 12,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(
              top: 4, bottom: 4,
              child: Row(children: [
                for (var i = 0; i < _alertLevelKeys.length; i++)
                  Expanded(
                    child: Container(
                      margin: EdgeInsets.only(right: i == _alertLevelKeys.length - 1 ? 0 : 2),
                      decoration: BoxDecoration(
                        color: _alertColors[_alertLevelKeys[i]]!.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
              ]),
            ),
            Positioned(
              left: (w * p - 6).clamp(0.0, (w - 12).clamp(0.0, double.infinity)).toDouble(),
              top: 0,
              child: Container(
                width: 12, height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: AppColors.bgDark, width: 2),
                  boxShadow: [BoxShadow(color: AppColors.shadow(0.5), blurRadius: 3)],
                ),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 3),
        Row(children: [
          for (final k in _alertLevelKeys)
            Expanded(
              child: Text(_labelForAlertKey(k),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  style: TextStyle(
                    color: k == _alertKey ? AppColors.ink(_alertColors[k]!) : AppColors.textMuted,
                    fontSize: 8.5,
                    fontWeight: k == _alertKey ? FontWeight.w800 : FontWeight.w500,
                  )),
            ),
        ]),
      ]);
    });
  }

  Widget _legendPanel() {
    return Container(
      width: 180,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.bgBorder),
        boxShadow: [BoxShadow(color: AppColors.shadow(0.4), blurRadius: 10)],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('WATER CODE LEGEND', style: TextStyle(
            color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
        const SizedBox(height: 8),
        ..._alertLevelKeys.map((key) {
          final c = _alertColors[key]!;
          final isCur = key == _alertKey;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Icon(_iconForAlertKey(key), color: AppColors.ink(c), size: 13),
              const SizedBox(width: 7),
              Expanded(child: Text(key, style: TextStyle(
                  color: isCur ? AppColors.ink(c) : AppColors.textSec,
                  fontSize: 10.5,
                  fontWeight: isCur ? FontWeight.w800 : FontWeight.w500))),
              if (isCur)
                Icon(Icons.check_circle_rounded, color: AppColors.textSec, size: 12),
            ]),
          );
        }),
        const SizedBox(height: 2),
        Text('Barangay boundary shaded by current level',
            style: TextStyle(color: AppColors.textMuted, fontSize: 9)),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: () {
            setState(() => _showLegend = false);
            _openHelpSheet();
          },
          child: Row(children: [
            Icon(Icons.help_outline_rounded, color: AppColors.accent, size: 13),
            const SizedBox(width: 5),
            Text('How to use this map',
                style: TextStyle(
                    color: AppColors.accent, fontSize: 10.5, fontWeight: FontWeight.w800)),
          ]),
        ),
        if (_showFacilities) ...[
          const SizedBox(height: 10),
          Container(height: 1, color: AppColors.bgBorder),
          const SizedBox(height: 10),
          Text('CRITICAL FACILITIES', style: TextStyle(
              color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
          const SizedBox(height: 8),
          ...kFacilityTypeOrder.map((type) {
            final style = kFacilityStyles[type]!;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(children: [
                Icon(style.icon, color: AppColors.ink(style.color), size: 13),
                const SizedBox(width: 7),
                Expanded(child: Text(style.label, style: TextStyle(
                    color: AppColors.textSec, fontSize: 10.5, fontWeight: FontWeight.w500))),
              ]),
            );
          }),
        ],
      ]),
    );
  }

  // ── Wind direction pill ───────────────────────────────────────────────────
  Widget _windPill() {
    final deg = _liveWindDirectionDeg;
    if (deg == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        WindDirectionArrow(deg: deg, size: 15, color: AppColors.textPri),
        const SizedBox(width: 6),
        Text(
          '${degToCardinal(deg) ?? ''} · ${deg.round()}°',
          style: TextStyle(color: AppColors.textPri, fontSize: 10.5, fontWeight: FontWeight.w600),
        ),
      ]),
    );
  }

  // ── Vertical legend (radar-style scale, or a flood color key) ─────────────
  // Rain probability / intensity: a gradient strip + numeric ticks, same
  // idea as the reference radar app's left-edge color scale — maps the
  // blue→red ramp used to color the boundary polygon to a value.
  // Flood probability: a compact 4-swatch key using the exact same
  // NORMAL/ADVISORY/WARNING/CRITICAL colors as the status pill and legend
  // panel, since that's what actually colors this layer (see
  // _dailyAlertColor) — a numeric gradient scale would just be wrong here.
  Widget _intensityScaleBar() {
    if (_isFloodLayer) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 9),
        decoration: BoxDecoration(
          color: AppColors.bgDark.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (int i = 0; i < _alertLevelKeys.length; i++) ...[
              if (i != 0) const SizedBox(height: 5),
              _floodLegendRow(_alertLevelKeys[i]),
            ],
          ],
        ),
      );
    }

    final isMm = _radarLayer == _RadarLayer.intensity;
    final topLabel = isMm ? '20mm' : '100%';
    final midLabel = isMm ? '10mm' : '50%';
    final bottomLabel = isMm ? '0mm' : '0%';

    return Container(
      width: 30,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.bgBorder),
      ),
      child: Column(children: [
        Text(topLabel, style: TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Expanded(
          child: Container(
            width: 8,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: _scaleStops.reversed.toList(),
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(midLabel, style: TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(bottomLabel, style: TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  // Plain-language label for an alert key ("ADVISORY" -> "Advisory"),
  // reusing AlertLevelType's copy (see models/alert_level.dart) so this
  // reads the same way the rest of the app describes these levels to
  // residents, rather than shouting the raw backend key.
  String _labelForAlertKey(String key) {
    switch (key) {
      case 'CRITICAL': return AlertLevelType.critical.label;
      case 'WARNING':  return AlertLevelType.warning.label;
      case 'ADVISORY': return AlertLevelType.advisory.label;
      default:         return AlertLevelType.normal.label;
    }
  }

  // One "● Normal" / "● Advisory" / ... row of the flood color key.
  Widget _floodLegendRow(String key) {
    final c = _alertColors[key]!;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
      const SizedBox(width: 6),
      Text(_labelForAlertKey(key), style: TextStyle(color: AppColors.ink(c), fontSize: 9, fontWeight: FontWeight.w700)),
    ]);
  }

  // ── Radar timeline scrubber ────────────────────────────────────────────────
  String _hourLabel(DateTime t) {
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final ampm = t.hour < 12 ? 'AM' : 'PM';
    return '$h$ampm';
  }

  // "Today" / "Tomorrow" / weekday abbreviation for the flood layer's
  // 7-day timeline — mirrors _hourLabel's role for the hourly layers.
  String _dayLabel(DateTime t) {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);
    final diff = DateTime(t.year, t.month, t.day).difference(startOfDay).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return weekdays[t.weekday - 1];
  }

  Widget _timelineBar() => _isFloodLayer ? _floodTimelineBar() : _hourlyTimelineBar();

  // Flood-probability layer: one frame per day, next 7 days.
  Widget _floodTimelineBar() {
    final days = _dailyFlood;
    if (days.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.bgDark.withValues(alpha: 0.92),
          border: Border(top: BorderSide(color: AppColors.bgBorder)),
        ),
        child: Text('Loading 7-day flood outlook…',
            style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
      );
    }

    final index = _floodDayIndex.clamp(0, days.length - 1);
    final day = days[index];
    final date = DateTime.tryParse(day['date']?.toString() ?? '');
    final prob = (day['flood_probability'] as num?)?.toDouble();
    final dayColor = _dailyAlertColor(day);
    // Leads with the plain-language level ("Advisory") ahead of the raw
    // percentage — a resident checking this doesn't need to do the mental
    // math of "42% means what, exactly?" themselves.
    final raw = day['alert_level']?.toString().toUpperCase();
    final alertKey = (raw != null && _alertLevelKeys.contains(raw)) ? raw : 'NORMAL';
    final readout = prob != null
        ? '${_labelForAlertKey(alertKey)} · ${(prob * 100).toStringAsFixed(0)}% flood risk'
        : '—';

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.92),
        border: Border(top: BorderSide(color: AppColors.bgBorder)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (date != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: dayColor, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              // Flexible + ellipsis: the readout now reads "Today ·
              // Advisory · 42% flood risk", which is long enough to
              // overflow this Row on narrow screens or larger accessibility
              // text sizes — this caps it at the available width instead
              // of forcing the Row wider than its container.
              Flexible(
                child: Text(
                  '${_dayLabel(date)} · $readout',
                  style: TextStyle(color: AppColors.textPri, fontSize: 11, fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
            ]),
          ),
        Row(children: [
          GestureDetector(
            onTap: _togglePlay,
            child: Container(
              width: 30, height: 30,
              decoration: BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
              child: Icon(_isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 18),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 3,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                activeTrackColor: AppColors.accent,
                inactiveTrackColor: AppColors.bgBorder,
                thumbColor: Colors.white,
              ),
              child: Slider(
                min: 0,
                max: (days.length - 1).toDouble(),
                value: index.toDouble(),
                // Whole-day steps only — unlike the continuous hourly
                // slider, dragging between two days should snap to a day
                // rather than land on a value with no matching forecast.
                divisions: days.length > 1 ? days.length - 1 : null,
                onChanged: (v) => _scrubTo(v.round()),
              ),
            ),
          ),
        ]),
        // One tick per day, each with a dot in that day's alert colour — the
        // whole week's risk pattern is visible without scrubbing, and tapping a
        // day jumps straight to it. Short labels ("Tmrw") so nothing wraps.
        Row(
          children: List.generate(days.length, (i) {
            final t = DateTime.tryParse(days[i]['date']?.toString() ?? '');
            final sel = i == index;
            return Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _scrubTo(i),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: sel ? 10 : 6,
                    height: sel ? 10 : 6,
                    decoration: BoxDecoration(color: _dailyAlertColor(days[i]), shape: BoxShape.circle),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    t != null ? _tickLabel(t) : '',
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: TextStyle(
                      color: sel ? AppColors.textPri : AppColors.textMuted,
                      fontSize: 9,
                      fontWeight: sel ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                ]),
              ),
            );
          }),
        ),
      ]),
    );
  }

  // Rain-probability / rainfall-intensity layers: one frame per hour, next
  // 24h — this is the screen's original timeline bar, unchanged apart from
  // dropping the flood case (flood now has its own bar above).
  Widget _hourlyTimelineBar() {
    if (_hourly.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.bgDark.withValues(alpha: 0.92),
          border: Border(top: BorderSide(color: AppColors.bgBorder)),
        ),
        child: Text('Loading hourly forecast…',
            style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
      );
    }

    final hour = _selectedHour;
    final time = hour != null ? DateTime.tryParse(hour['time']?.toString() ?? '') : null;
    String readout = '';
    if (hour != null) {
      switch (_radarLayer) {
        case _RadarLayer.probability:
          readout = '${(hour['rain_probability_pct'] ?? '—')}% rain chance';
          break;
        case _RadarLayer.intensity:
          readout = '${(hour['precipitation'] ?? '—')}mm/hr';
          break;
        case _RadarLayer.flood:
          break; // unreachable — flood layer renders via _floodTimelineBar
      }
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.92),
        border: Border(top: BorderSide(color: AppColors.bgBorder)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // ── Selected-hour readout chip ────────────────────────────────────
        if (time != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              '${_hourLabel(time)} · $readout',
              style: TextStyle(color: AppColors.textPri, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        Row(children: [
          GestureDetector(
            onTap: _togglePlay,
            child: Container(
              width: 30, height: 30,
              decoration: BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
              child: Icon(_isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 18),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 3,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                activeTrackColor: AppColors.accent,
                inactiveTrackColor: AppColors.bgBorder,
                thumbColor: Colors.white,
              ),
              child: Slider(
                min: 0,
                // Guarded by the _hourly.isEmpty check above, so
                // length - 1 is always >= 0 here.
                max: (_hourly.length - 1).toDouble(),
                value: _timelineIndex.clamp(0, _hourly.length - 1).toDouble(),
                onChanged: (v) => _scrubTo(v.round()),
              ),
            ),
          ),
        ]),
        // ── Tick labels every ~4 hours, like the reference UI's 3p/4p/5p row ──
        if (_hourly.length > 1)
          Row(
            children: List.generate(_hourly.length, (i) => i)
                .where((i) => i % 4 == 0 || i == _hourly.length - 1)
                .map((i) {
              final t = DateTime.tryParse(_hourly[i]['time']?.toString() ?? '');
              return Expanded(
                child: Text(
                  t != null ? _hourLabel(t) : '',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 9),
                ),
              );
            }).toList(),
          ),
      ]),
    );
  }

  // ── Help sheet ───────────────────────────────────────────────────────────
  // Plain-language explainer for the icon-only tool stack — for a resident
  // who's never used a radar-style map app before and doesn't know what
  // "toggle legend" or "radar layers" mean just from a picture. One row per
  // button, in the same top-to-bottom order they appear in the stack.
  void _openHelpSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Map controls', style: TextStyle(
                color: AppColors.textPri, fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text("What each button on the map's right edge does.",
                style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
            const SizedBox(height: 16),
            _helpRow(Icons.fullscreen_rounded, 'Fullscreen',
                'Makes the map fill the whole screen so it\'s easier to see.'),
            _helpRow(Icons.info_outline_rounded, 'What do the colors mean?',
                'Shows what green, yellow, orange, and red mean for your barangay.'),
            _helpRow(Icons.local_hospital_rounded, 'Hospitals & evacuation help',
                'Shows nearby hospitals, schools, police, and fire stations on the map.'),
            if (_hourly.isNotEmpty || _dailyFlood.isNotEmpty)
              _helpRow(Icons.layers_rounded, 'Choose what the map shows',
                  'Switch between flood risk, chance of rain, and how much rain is expected — and play back the forecast on the timeline at the bottom.'),
            _helpRow(Icons.center_focus_strong_rounded, 'Recenter',
                'Brings the map back to Barangay Triangulo if you\'ve scrolled away.'),
            _helpRow(Icons.add_rounded, 'Zoom in / out',
                'Makes the map bigger or smaller. You can also pinch the map with two fingers.'),
          ]),
        ),
      ),
    );
  }

  Widget _helpRow(IconData icon, String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 30, height: 30,
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: AppColors.accent, size: 16),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(
                color: AppColors.textPri, fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(description, style: TextStyle(
                color: AppColors.textMuted, fontSize: 11, height: 1.3)),
          ]),
        ),
      ]),
    );
  }

  // ── Radar layers sheet ──────────────────────────────────────────────────
  // Mobile equivalent of the reference UI's "Radar layers" panel — a short
  // list of which data drives the timeline's coloring, each with a radio
  // dot and a one-line description of what it shows.
  void _openLayersSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Choose what the map shows', style: TextStyle(
                  color: AppColors.textPri, fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('Pick what the barangay is colored by, and what plays on the timeline below.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
              const SizedBox(height: 16),
              _layerOption(
                title: 'Flood risk',
                subtitle: 'Animates the flood forecast for the next 7 days (default)',
                icon: Icons.warning_amber_rounded,
                value: _RadarLayer.flood,
                setSheetState: setSheetState,
              ),
              const SizedBox(height: 8),
              _layerOption(
                title: 'Chance of rain',
                subtitle: 'How likely it is to rain each hour, next 24 hours',
                icon: Icons.water_drop_outlined,
                value: _RadarLayer.probability,
                setSheetState: setSheetState,
              ),
              const SizedBox(height: 8),
              _layerOption(
                title: 'Amount of rain',
                subtitle: 'How much rain is expected each hour, next 24 hours',
                icon: Icons.grain_rounded,
                value: _RadarLayer.intensity,
                setSheetState: setSheetState,
              ),
              const SizedBox(height: 20),
              Text('Base map', style: TextStyle(
                  color: AppColors.textPri, fontSize: 14, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Row(children: [
                for (final e in _baseStyles.entries)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () {
                          setState(() => _baseStyleKey = e.key);
                          setSheetState(() {});
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: e.key == _baseStyleKey
                                ? AppColors.accent.withValues(alpha: 0.12)
                                : AppColors.bgMid,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: e.key == _baseStyleKey ? AppColors.accent : AppColors.bgBorder),
                          ),
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(e.value.icon,
                                size: 18,
                                color: e.key == _baseStyleKey ? AppColors.accent : AppColors.textMuted),
                            const SizedBox(height: 4),
                            Text(e.value.label,
                                style: TextStyle(
                                    color: e.key == _baseStyleKey ? AppColors.textPri : AppColors.textSec,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700)),
                          ]),
                        ),
                      ),
                    ),
                  ),
              ]),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _showFacilities,
                onChanged: (v) {
                  setState(() => _showFacilities = v);
                  setSheetState(() {});
                },
                secondary: Icon(Icons.local_hospital_rounded, color: AppColors.accent),
                title: Text('Hospitals, schools, fire & police',
                    style: TextStyle(color: AppColors.textPri, fontSize: 13, fontWeight: FontWeight.w700)),
                subtitle: Text('Show critical facilities on the map',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _layerOption({
    required String title,
    required String subtitle,
    required IconData icon,
    required _RadarLayer value,
    required StateSetter setSheetState,
  }) {
    final selected = _radarLayer == value;
    return GestureDetector(
      onTap: () {
        if (_radarLayer != value) {
          // Switching layers switches timeline grids too (daily <-> hourly)
          // — stop any playback so it doesn't keep animating the layer you
          // just left. Each layer remembers its own scrub position
          // (_floodDayIndex vs _timelineIndex) independently.
          _playTimer?.cancel();
          _playTimer = null;
          setState(() {
            _radarLayer = value;
            _isPlaying = false;
          });
        }
        setSheetState(() {}); // repaint the sheet's radio dots immediately
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withValues(alpha: 0.12) : AppColors.bgMid,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? AppColors.accent : AppColors.bgBorder),
        ),
        child: Row(children: [
          Icon(icon, color: selected ? AppColors.accent : AppColors.textMuted, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(
                  color: selected ? AppColors.textPri : AppColors.textSec,
                  fontSize: 13, fontWeight: FontWeight.w700)),
              Text(subtitle, style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
            ]),
          ),
          Icon(
            selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
            color: selected ? AppColors.accent : AppColors.textMuted,
            size: 18,
          ),
        ]),
      ),
    );
  }
}
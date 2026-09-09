import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:http/http.dart' as http;
import '../main.dart';
import '../models/alert_level.dart';
import '../theme/panahon_ui.dart';
import '../services/model_api_client.dart';
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

String get _modelUrl => _requireEnv('MODEL_API_URL');
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

// What drives the timeline's coloring — two hourly-resolution views over
// the same /api/forecast data (kept to the same time resolution so
// switching layers doesn't also jump the timeline to a different grid).
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
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    monochrome: true,
  ),
  'satellite': _BaseStyleDef(
    label: 'Satellite',
    icon: Icons.satellite_alt_rounded,
    urlTemplate:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    monochrome: false,
  ),
  'terrain': _BaseStyleDef(
    label: 'Terrain',
    icon: Icons.terrain_rounded,
    urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
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
  bool _isFullscreen = false;
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
  bool _hourlyLoading = true;
  int _timelineIndex = 0;
  bool _isPlaying = false;
  Timer? _playTimer;
  _RadarLayer _radarLayer = _RadarLayer.flood;

  // Daily flood outlook, keyed by "yyyy-MM-dd", for the flood-probability
  // layer — the model only forecasts flood risk per day (see
  // /api/forecast-flood), so every hour within the same calendar day
  // shows that day's probability. Fetched once; a 14-day outlook doesn't
  // need the 30s refresh cadence the live status pill uses.
  Map<String, double> _floodProbByDate = {};

  static const _timelineHours = 24; // next 24h — matches the reference UI's single-evening span

  @override
  void initState() {
    super.initState();
    _fetchStatus();
    _fetchHourly();
    _fetchDailyFlood();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchStatus());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timer = null;
    _playTimer?.cancel();
    _playTimer = null;
    super.dispose();
  }

  Future<void> _fetchDailyFlood() async {
    if (!mounted) return;
    try {
      final res = await getWithFallback(_forecastFloodUrl);
      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (body['forecast'] as List? ?? []).cast<Map<String, dynamic>>();
        final byDate = <String, double>{};
        for (final d in list) {
          final date = d['date']?.toString();
          final prob = d['flood_probability'];
          if (date == null || prob is! num) continue;
          byDate[date] = prob.toDouble();
        }
        setState(() => _floodProbByDate = byDate);
      }
    } catch (e) {
      debugPrint('AGOS: daily flood forecast fetch failed: $e');
    }
  }

  Future<void> _fetchHourly() async {
    if (!mounted) return;
    try {
      final res = await getWithFallback(_forecastUrl);
      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (body['hourly'] as List? ?? []).cast<Map<String, dynamic>>();
        setState(() {
          _hourly = list.take(_timelineHours).toList();
          _hourlyLoading = false;
          if (_timelineIndex >= _hourly.length) _timelineIndex = 0;
        });
      } else {
        if (mounted) setState(() => _hourlyLoading = false);
      }
    } catch (e) {
      debugPrint('AGOS: hourly forecast fetch failed: $e');
      if (mounted) setState(() => _hourlyLoading = false);
    }
  }

  void _togglePlay() {
    if (_hourly.isEmpty) return;
    setState(() => _isPlaying = !_isPlaying);
    if (_isPlaying) {
      _playTimer?.cancel();
      _playTimer = Timer.periodic(const Duration(milliseconds: 900), (_) {
        if (!mounted || _hourly.isEmpty) return;
        setState(() => _timelineIndex = (_timelineIndex + 1) % _hourly.length);
      });
    } else {
      _playTimer?.cancel();
      _playTimer = null;
    }
  }

  void _scrubTo(int index) {
    if (_hourly.isEmpty) return;
    if (_isPlaying) _togglePlay(); // dragging the scrubber pauses playback
    setState(() => _timelineIndex = index.clamp(0, _hourly.length - 1));
  }

  Map<String, dynamic>? get _selectedHour =>
      (_hourly.isNotEmpty && _timelineIndex < _hourly.length) ? _hourly[_timelineIndex] : null;

  // 0..1 read of the selected hour under whichever layer is active, for
  // both the boundary/legend color and the RainOverlay's strength.
  double _hourValue01(Map<String, dynamic> h) {
    num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    if (_radarLayer == _RadarLayer.flood) {
      final prob = _floodProbForHour(h);
      return prob?.clamp(0.0, 1.0) ?? (_probability ?? 0).clamp(0.0, 1.0);
    }
    if (_radarLayer == _RadarLayer.probability) {
      final pct = n(h['rain_probability_pct'])?.toDouble() ?? 0;
      return (pct / 100).clamp(0.0, 1.0);
    }
    final mm = n(h['precipitation'])?.toDouble() ?? 0;
    return (mm / 20).clamp(0.0, 1.0); // 20mm/hr ≈ top of the scale
  }

  // The daily flood model has no per-hour resolution, so every hour within
  // the same calendar day reads that day's forecasted probability — falls
  // back to the live predict-flood probability if the daily outlook hasn't
  // loaded yet or doesn't cover that date.
  double? _floodProbForHour(Map<String, dynamic> h) {
    final t = DateTime.tryParse(h['time']?.toString() ?? '');
    if (t == null) return null;
    final key = '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
    return _floodProbByDate[key];
  }

  Future<void> _fetchStatus() async {
    if (!mounted) return;
    var url = '(unresolved)';
    try {
      url = _modelUrl;
      final res = await getWithFallback(url);
      if (!mounted) return;
      if (res.statusCode == 200) {
        final j = jsonDecode(res.body) as Map<String, dynamic>;
        // alert_level is a string enum from the backend ("NORMAL" /
        // "ADVISORY" / "WARNING" / "CRITICAL" — see
        // probability_to_alert_level() in backend/app/utils/alerts.py),
        // never a number. The old `as num?` cast threw
        // "type 'String' is not a subtype of type 'num?'" on every single
        // successful response, which is why this screen kept falling
        // back to "live data unavailable" even when the backend was
        // perfectly healthy.
        final rawLevel = j['alert_level']?.toString().toUpperCase();
        final level = _alertLevelKeys.contains(rawLevel) ? rawLevel! : 'NORMAL';
        final prob  = (j['probability'] as num?)?.toDouble();
        final m = j['live_metrics'] as Map<String, dynamic>? ?? {};
        num? n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
        if (!mounted) return;
        setState(() {
          _alertKey            = level;
          _probability         = prob;
          _loading             = false;
          _liveDataStale       = false;
          _lastUpdated         = DateTime.now();
          _liveRainfallMm      = n(m['rainfall_mm'])?.toDouble() ?? 0;
          _liveWindSignal      = n(m['wind_signal'])?.toInt() ?? 0;
          _liveWindDirectionDeg = n(m['wind_direction_deg'])?.toDouble();
        });
      } else {
        debugPrint('AGOS: _fetchStatus failed ($url): HTTP ${res.statusCode}');
        if (mounted) setState(() { _loading = false; _liveDataStale = true; });
      }
    } catch (e) {
      debugPrint('AGOS: _fetchStatus failed ($url): $e');
      if (mounted) setState(() { _loading = false; _liveDataStale = true; });
    }
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 45) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }

  bool get _canZoomIn => _zoom < 19.0;
  bool get _canZoomOut => _zoom > 12.0;

  void _zoomBy(double delta) {
    if (!mounted) return;
    final target = (_zoom + delta).clamp(12.0, 19.0);
    if (target == _zoom) return; // already at limit
    setState(() => _zoom = target);
    try {
      _mapController.move(_mapController.camera.center, target);
    } catch (_) {
      // Map not currently attached — safe to ignore.
    }
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
    // (index 0) does the boundary follow that hour's probability via the
    // continuous gradient — matches the timeline's own intent (browsing a
    // forecasted hour) without hijacking the default view. Previously this
    // checked `_hourly.isNotEmpty` instead of the timeline position, which
    // meant the boundary used the continuous gradient the moment the hourly
    // forecast finished loading (near-instant) — even at rest, on index 0 —
    // so it never showed the plain ADVISORY/WARNING/CRITICAL color the
    // status pill shows, only wherever that day's probability happened to
    // fall on the gradient (e.g. a yellow-green blend instead of solid
    // yellow for an ADVISORY-range probability). The status pill up top is
    // untouched either way and always shows the live model alert level.
    final selectedHour = _selectedHour;
    final timelineColor = selectedHour != null ? _scaleColor(_hourValue01(selectedHour)) : color;
    final boundaryColor = (_hourly.isNotEmpty && _timelineIndex != 0) ? timelineColor : color;
    num? numOf(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '');
    final overlayRainfallMm = selectedHour != null
        ? (numOf(selectedHour['precipitation'])?.toDouble() ?? 0)
        : _liveRainfallMm;
    final overlayCondition = selectedHour?['condition']?.toString();

    // Everything is wrapped in one outer SafeArea (top only — the bottom
    // nav chrome, if any, is handled by whatever hosts this screen) so
    // fullscreen mode still clears the status bar/notch even with the
    // header row hidden.
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          if (!_isFullscreen)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.map_rounded, color: AppColors.accent, size: 15),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Flood Map',
                    style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
              ]),
            ),

          // ── Map area ─────────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: _isFullscreen ? EdgeInsets.zero : const EdgeInsets.symmetric(horizontal: 14),
              child: ClipRRect(
                borderRadius: _isFullscreen ? BorderRadius.zero : BorderRadius.circular(14),
                child: Container(
                  decoration: BoxDecoration(
                    border: _isFullscreen ? null : Border.all(color: const Color(0xFF1e3a5f)),
                  ),
                  child: Stack(children: [
                    Positioned.fill(
                      child: _build2DMap(boundaryColor, activeStyle),
                    ),

                    // ── Radar animation (rain streaks / clouds / fog /
                    // lightning) — sits above the basemap, below markers
                    // and chrome.
                    Positioned.fill(
                      child: RainOverlay(
                        rainfallMm: overlayRainfallMm,
                        condition: overlayCondition,
                        windSignal: _liveWindSignal.toDouble(),
                      ),
                    ),

                    // ── Status bar ─────────────────────────────────────────
                    Positioned(top: 10, left: 10, right: 58, child: _statusPill(color)),

                    // ── Wind direction pill (top-left, under the status
                    // bar) — mirrors the web dashboard's map wind readout.
                    if (_liveWindDirectionDeg != null)
                      Positioned(top: 62, left: 10, child: _windPill()),

                    // ── Vertical intensity legend (left edge, like the
                    // reference radar app's color scale) — starts below
                    // the wind pill so the two never overlap.
                    if (_hourly.isNotEmpty)
                      Positioned(
                        top: _liveWindDirectionDeg != null ? 104 : 62,
                        bottom: 78,
                        left: 10,
                        child: _intensityScaleBar(),
                      ),

                    // ── Legend panel ───────────────────────────────────────
                    if (_showLegend) Positioned(top: 62, right: 56, child: _legendPanel()),

                    // ── Vertical map tool stack ────────────────────────────
                    Positioned(
                      top: 62,
                      right: 10,
                      child: MapToolStack(children: [
                        Tooltip(
                          message: _isFullscreen ? 'Exit fullscreen' : 'Fullscreen',
                          child: MapToolButton(
                            icon: _isFullscreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                            active: _isFullscreen,
                            onTap: () => setState(() => _isFullscreen = !_isFullscreen),
                          ),
                        ),
                        Tooltip(
                          message: 'Toggle legend',
                          child: MapToolButton(
                            icon: Icons.layers_rounded,
                            active: _showLegend,
                            onTap: () => setState(() => _showLegend = !_showLegend),
                          ),
                        ),
                        if (_hourly.isNotEmpty)
                          Tooltip(
                            message: 'Radar layers',
                            child: MapToolButton(
                              icon: Icons.tune_rounded,
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
                          message: _canZoomIn ? 'Zoom in' : 'Maximum zoom reached',
                          child: Opacity(
                            opacity: _canZoomIn ? 1.0 : 0.4,
                            child: MapToolButton(
                              icon: Icons.add_rounded,
                              onTap: _canZoomIn ? () => _zoomBy(1) : () {},
                            ),
                          ),
                        ),
                        Tooltip(
                          message: _canZoomOut ? 'Zoom out' : 'Minimum zoom reached',
                          child: Opacity(
                            opacity: _canZoomOut ? 1.0 : 0.4,
                            child: MapToolButton(
                              icon: Icons.remove_rounded,
                              onTap: _canZoomOut ? () => _zoomBy(-1) : () {},
                            ),
                          ),
                        ),
                      ]),
                    ),

                    // ── Basemap style switcher — pushed up above the
                    // timeline bar when it's showing, instead of the two
                    // overlapping at the bottom-left corner.
                    Positioned(
                      bottom: _hourly.isNotEmpty ? 66 : 10,
                      left: 10,
                      child: _styleSwitcher(),
                    ),

                    // ── Radar timeline scrubber (bottom) ────────────────────
                    if (_hourly.isNotEmpty)
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
            flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
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
            tileBuilder: style.monochrome
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
          RichAttributionWidget(
            alignment: AttributionAlignment.bottomRight,
            attributions: [TextSourceAttribution(style.attribution)],
          ),
        ],
      ),
    );
  }

  // ── Shared UI pieces ────────────────────────────────────────────────────
  Widget _statusPill(Color color) {
    final pillColor = _liveDataStale ? AppColors.textMuted : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: pillColor.withValues(alpha: 0.5)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10)],
      ),
      child: Row(children: [
        Container(
          width: 22, height: 22,
          decoration: BoxDecoration(shape: BoxShape.circle, color: pillColor.withValues(alpha: 0.18)),
          child: Icon(_iconForAlertKey(_alertKey), color: pillColor, size: 13),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Brgy. Triangulo · $_alertKey', style: TextStyle(
                color: pillColor, fontSize: 11.5, fontWeight: FontWeight.w800)),
            if (_liveDataStale)
              Text(
                _lastUpdated != null
                    ? 'Live data unavailable · last update ${_timeAgo(_lastUpdated!)}'
                    : 'Live data unavailable',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 9.5),
              )
            else if (_probability != null)
              Text('${(_probability! * 100).toStringAsFixed(0)}% flood probability',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 9.5)),
          ]),
        ),
        if (_loading)
          const SizedBox(
            width: 12, height: 12,
            child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 1.5),
          )
        else if (_liveDataStale)
          const Icon(Icons.cloud_off_rounded, color: AppColors.textMuted, size: 14),
      ]),
    );
  }

  Widget _legendPanel() {
    return Container(
      width: 168,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.bgBorder),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10)],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('WATER CODE LEGEND', style: TextStyle(
            color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
        const SizedBox(height: 8),
        ..._alertLevelKeys.map((key) {
          final c = _alertColors[key]!;
          final isCur = key == _alertKey;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Icon(_iconForAlertKey(key), color: c, size: 13),
              const SizedBox(width: 7),
              Expanded(child: Text(key, style: TextStyle(
                  color: isCur ? c : AppColors.textSec,
                  fontSize: 10.5,
                  fontWeight: isCur ? FontWeight.w800 : FontWeight.w500))),
              if (isCur)
                const Icon(Icons.check_circle_rounded, color: AppColors.textSec, size: 12),
            ]),
          );
        }),
        const SizedBox(height: 2),
        const Text('Barangay boundary shaded by current level',
            style: TextStyle(color: AppColors.textMuted, fontSize: 9)),
      ]),
    );
  }

  Widget _styleSwitcher() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgDark.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.bgBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(mainAxisSize: MainAxisSize.min, children: _baseStyles.entries.map((entry) {
        final key = entry.key;
        final def = entry.value;
        final selected = key == _baseStyleKey;
        return Tooltip(
          message: def.label,
          child: GestureDetector(
            onTap: () => setState(() => _baseStyleKey = key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              color: selected ? AppColors.accent : Colors.transparent,
              child: Icon(def.icon, size: 15, color: selected ? Colors.white : AppColors.textMuted),
            ),
          ),
        );
      }).toList()),
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
          style: const TextStyle(color: AppColors.textPri, fontSize: 10.5, fontWeight: FontWeight.w600),
        ),
      ]),
    );
  }

  // ── Vertical intensity scale bar (radar-style legend) ─────────────────────
  // A gradient strip + numeric ticks, same idea as the reference radar app's
  // left-edge color scale — maps the same blue→red ramp used to color the
  // boundary polygon to a value: rain probability (%) or rainfall intensity
  // (mm/hr), depending on which layer is selected in the layers sheet.
  Widget _intensityScaleBar() {
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
        Text(topLabel, style: const TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
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
        Text(midLabel, style: const TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(bottomLabel, style: const TextStyle(color: AppColors.textMuted, fontSize: 7.5, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  // ── Radar timeline scrubber ────────────────────────────────────────────────
  String _hourLabel(DateTime t) {
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final ampm = t.hour < 12 ? 'AM' : 'PM';
    return '$h$ampm';
  }

  Widget _timelineBar() {
    final hour = _selectedHour;
    final time = hour != null ? DateTime.tryParse(hour['time']?.toString() ?? '') : null;
    String readout = '';
    if (hour != null) {
      switch (_radarLayer) {
        case _RadarLayer.flood:
          {
            final prob = _floodProbForHour(hour) ?? _probability;
            readout = prob != null ? '${(prob * 100).toStringAsFixed(0)}% flood risk' : '—';
          }
          break;
        case _RadarLayer.probability:
          readout = '${(hour['rain_probability_pct'] ?? '—')}% rain chance';
          break;
        case _RadarLayer.intensity:
          readout = '${(hour['precipitation'] ?? '—')}mm/hr';
          break;
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
              style: const TextStyle(color: AppColors.textPri, fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        Row(children: [
          GestureDetector(
            onTap: _togglePlay,
            child: Container(
              width: 30, height: 30,
              decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
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
                // This bar is only ever built when _hourly.isNotEmpty (see
                // the Positioned guard in build()), so length - 1 is always >= 0.
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
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 9),
                ),
              );
            }).toList(),
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
      backgroundColor: AppColors.bgDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Radar layers', style: TextStyle(
                  color: AppColors.textPri, fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('Choose what the timeline colors the barangay by.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
              const SizedBox(height: 16),
              _layerOption(
                title: 'Flood probability',
                subtitle: "This day's forecasted flood risk (default)",
                icon: Icons.warning_amber_rounded,
                value: _RadarLayer.flood,
                setSheetState: setSheetState,
              ),
              const SizedBox(height: 8),
              _layerOption(
                title: 'Rain probability',
                subtitle: 'Chance of rain each hour, next 24h',
                icon: Icons.water_drop_outlined,
                value: _RadarLayer.probability,
                setSheetState: setSheetState,
              ),
              const SizedBox(height: 8),
              _layerOption(
                title: 'Rainfall intensity',
                subtitle: 'Forecast mm/hr, next 24h',
                icon: Icons.grain_rounded,
                value: _RadarLayer.intensity,
                setSheetState: setSheetState,
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
        setState(() => _radarLayer = value);
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
              Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
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
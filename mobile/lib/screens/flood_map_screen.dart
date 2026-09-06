import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:http/http.dart' as http;
import '../main.dart';
import '../theme/panahon_ui.dart';
import '../services/model_api_client.dart';

// ─── URL (no fallback for a missing/misspelled .env key — see
// dashboard_screen.dart for that rationale; a network-level fallback to the
// backup deployment is still applied at the fetch call site below) ─────────
String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

String get _modelUrl => _requireEnv('MODEL_API_URL');

// ─── Alert colors / labels ──────────────────────────────────────────────────────
const _alertColors = {
  'NORMAL':   Color(0xFF22c55e),
  'ADVISORY': Color(0xFFeab308),
  'WARNING':  Color(0xFFf97316),
  'CRITICAL': Color(0xFFef4444),
};

const _alertLevelKeys = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL'];

String _alertKeyFromInt(int level) {
  switch (level) {
    case 3:  return 'CRITICAL';
    case 2:  return 'WARNING';
    case 1:  return 'ADVISORY';
    default: return 'NORMAL';
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

  @override
  void initState() {
    super.initState();
    _fetchStatus();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchStatus());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timer = null;
    super.dispose();
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
        final level = (j['alert_level'] as num?)?.toInt() ?? 0;
        final prob  = (j['probability'] as num?)?.toDouble();
        if (!mounted) return;
        setState(() {
          _alertKey      = _alertKeyFromInt(level);
          _probability   = prob;
          _loading       = false;
          _liveDataStale = false;
          _lastUpdated   = DateTime.now();
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
                    Positioned.fill(child: _build2DMap(color, activeStyle)),

                    // ── Status bar ─────────────────────────────────────────
                    Positioned(top: 10, left: 10, right: 58, child: _statusPill(color)),

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

                    // ── Basemap style switcher ──────────────────────────────
                    Positioned(bottom: 10, left: 10, child: _styleSwitcher()),
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
          width: 9, height: 9,
          decoration: BoxDecoration(shape: BoxShape.circle, color: pillColor),
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
              Container(width: 10, height: 10,
                  decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
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
}
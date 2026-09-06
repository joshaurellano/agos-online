import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../main.dart';
import '../theme/panahon_ui.dart';

// ─── Evacuation Centers ────────────────────────────────────────────────────────
class _EvacCenter {
  final String id, name, type, note;
  final double lat, lng;
  final Color color;
  const _EvacCenter({
    required this.id,    required this.name,  required this.type,
    required this.note,  required this.lat,   required this.lng,
    required this.color,
  });
}

// Colors mirror the web dashboard: Primary = red, School = blue, so the
// marker/card color itself communicates the center's role at a glance
// instead of every pin looking identical.
const _colorPrimary = Color(0xFFDC143C);
const _colorSchool  = Color(0xFF3B82F6);

const _centers = [
  _EvacCenter(
    id: 'jesse-robredo',
    name: 'Jesse M. Robredo Coliseum',
    type: 'Primary Evacuation Center',
    note: 'Ninoy and Cory Avenue, corner Carnation Street, Barangay Triangulo, Naga City',
    lat: 13.620122, lng: 123.188095,
    color: _colorPrimary,
  ),
  _EvacCenter(
    id: 'triangulo-elem',
    name: 'Triangulo Elementary School',
    type: 'School Evacuation Center',
    note: 'Roxas Ave. Diversion Rd. Barangay Triangulo, Naga City',
    lat: 13.6165193, lng: 123.1878926,
    color: _colorSchool,
  ),
  _EvacCenter(
    id: 'jose-rizal-elem',
    name: 'Jose Rizal Elementary School',
    type: 'School Evacuation Center',
    note: 'Ilang Ilang St., Naga City Subd., Zone 1, Brgy. Triangulo, Naga City',
    lat: 13.6194395, lng: 123.1933071,
    color: _colorSchool,
  ),
];

const _trianguloCenter = LatLng(13.6150, 123.1910);

const _boundary = [
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

// ─── Haversine distance (in meters) ──────────────────────────────────────────
double _haversine(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  final dLat = _deg2rad(lat2 - lat1);
  final dLng = _deg2rad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_deg2rad(lat1)) *
          math.cos(_deg2rad(lat2)) *
          math.sin(dLng / 2) *
          math.sin(dLng / 2);
  return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double _deg2rad(double deg) => deg * (math.pi / 180);

// ── Walking time estimate ──────────────────────────────────────────────────────
String _formatDistance(double meters) {
  final walkMins = (meters / 80).ceil();
  final distStr = meters < 1000
      ? '${meters.round()} m'
      : '${(meters / 1000).toStringAsFixed(2)} km';
  return '$distStr · ~$walkMins min walk';
}

// ── Ray-casting point-in-polygon ──────────────────────────────────────────────
bool _pointInPolygon(double lat, double lng, List<LatLng> polygon) {
  bool inside = false;
  int j = polygon.length - 1;
  for (int i = 0; i < polygon.length; i++) {
    final xi = polygon[i].longitude, yi = polygon[i].latitude;
    final xj = polygon[j].longitude, yj = polygon[j].latitude;
    final intersect = ((yi > lat) != (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
class EvacuationScreen extends StatefulWidget {
  const EvacuationScreen({super.key});
  @override
  State<EvacuationScreen> createState() => _EvacuationScreenState();
}

class _EvacuationScreenState extends State<EvacuationScreen> {
  String? _selectedCenterId; // drives highlight in list, NOT a map overlay

  // Location state
  LatLng? _userLocation;
  bool _locating = false;
  String? _locError;

  // Nearest center
  _EvacCenter? _nearest;
  double? _nearestDist;

  final MapController _mapController = MapController();
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchCtrl = TextEditingController();

  bool _showLegend = false;
  double _zoom = 14.5;
  String? _searchError;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Search: find an evacuation center by name and fly to it ────────────────
  void _search(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return;
    final match = _centers.where((c) => c.name.toLowerCase().contains(q)).toList();
    if (match.isEmpty) {
      setState(() => _searchError = 'No evacuation center matches "$query"');
      return;
    }
    final c = match.first;
    setState(() {
      _searchError = null;
      _selectedCenterId = c.id;
    });
    _mapController.move(LatLng(c.lat, c.lng), 16.5);
    HapticFeedback.selectionClick();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(0,
            duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  void _zoomBy(double delta) {
    final target = (_zoom + delta).clamp(12.0, 19.0);
    setState(() => _zoom = target);
    _mapController.move(_mapController.camera.center, target);
  }

  // ── Location fetching ──────────────────────────────────────────────────────
  Future<void> _locateUser() async {
    setState(() { _locating = true; _locError = null; });

    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        setState(() {
          _locError = 'Location permission denied. Please enable it in Settings.';
          _locating = false;
        });
        return;
      }

      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locError = 'Location services are off. Please enable GPS.';
          _locating = false;
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final userLatLng = LatLng(pos.latitude, pos.longitude);
      final inZone = _pointInPolygon(pos.latitude, pos.longitude, _boundary);

      _EvacCenter? nearest;
      double nearestDist = double.infinity;
      for (final c in _centers) {
        final d = _haversine(pos.latitude, pos.longitude, c.lat, c.lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = c;
        }
      }

      if (inZone) {
        HapticFeedback.heavyImpact();
      } else {
        HapticFeedback.lightImpact();
      }

      setState(() {
        _userLocation = userLatLng;
        _nearest = nearest;
        _nearestDist = nearestDist;
        _locating = false;
        _selectedCenterId = nearest?.id;
      });

      if (nearest != null) {
        final midLat = (pos.latitude + nearest.lat) / 2;
        final midLng = (pos.longitude + nearest.lng) / 2;
        _zoom = 14.8;
        _mapController.move(LatLng(midLat, midLng), _zoom);
      }

      // Scroll list to top so the highlighted card is visible
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            0,
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (e) {
      setState(() {
        _locError = 'Could not get location: $e';
        _locating = false;
      });
    }
  }

  // Search bar sits at top=10, height=42 → banners start right below it.
  static const double _searchBarBottom = 60;
  double get _bannerTop => _searchBarBottom;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // ── Map ───────────────────────────────────────────────────────────────
        Expanded(
          flex: 11,
          child: Stack(children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _trianguloCenter,
                initialZoom: 14.5,
                // Tapping the map clears the selection highlight
                onTap: (_, __) => setState(() => _selectedCenterId = null),
                onPositionChanged: (pos, _) => _zoom = pos.zoom,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate:
                      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                  subdomains: const ['a', 'b', 'c', 'd'],
                  userAgentPackageName: 'com.agos.app',
                ),

                // Barangay boundary
                PolygonLayer(polygons: [
                  Polygon(
                    points: _boundary,
                    color: const Color(0xFF38bdf8).withValues(alpha: 0.08),
                    borderColor: const Color(0xFF38bdf8).withValues(alpha: 0.7),
                    borderStrokeWidth: 2,
                  ),
                ]),

                // Route line: user → nearest center
                if (_userLocation != null && _nearest != null)
                  PolylineLayer(polylines: [
                    Polyline(
                      points: [
                        _userLocation!,
                        LatLng(_nearest!.lat, _nearest!.lng),
                      ],
                      color: const Color(0xFF22C55E),
                      strokeWidth: 3.5,
                      pattern: StrokePattern.dashed(segments: [12, 6]),
                    ),
                  ]),

                // Markers
                MarkerLayer(
                  markers: [
                    // User location
                    if (_userLocation != null)
                      Marker(
                        point: _userLocation!,
                        width: 60,
                        height: 60,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFF22C55E),
                                borderRadius: BorderRadius.circular(4),
                                boxShadow: [
                                  BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 4),
                                ],
                              ),
                              child: const Text('You',
                                  style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w800)),
                            ),
                            const SizedBox(height: 2),
                            Container(
                              width: 18, height: 18,
                              decoration: BoxDecoration(
                                color: const Color(0xFF22C55E),
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2.5),
                                boxShadow: [
                                  BoxShadow(
                                      color: const Color(0xFF22C55E).withValues(alpha: 0.5),
                                      blurRadius: 8, spreadRadius: 2),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                    // Evacuation center markers
                    ..._centers.map((c) {
                      final isNearest = _nearest != null && _nearest!.id == c.id;
                      return Marker(
                        point: LatLng(c.lat, c.lng),
                        width: 60,
                        height: 60,
                        child: GestureDetector(
                          onTap: () {
                            setState(() => _selectedCenterId =
                                _selectedCenterId == c.id ? null : c.id);
                            // Scroll list so the tapped card is visible at top
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (_scrollController.hasClients) {
                                _scrollController.animateTo(
                                  0,
                                  duration: const Duration(milliseconds: 300),
                                  curve: Curves.easeOut,
                                );
                              }
                            });
                          },
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isNearest ? const Color(0xFF22C55E) : c.color,
                                  borderRadius: BorderRadius.circular(4),
                                  boxShadow: [
                                    BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 4),
                                  ],
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (isNearest)
                                      const Padding(
                                        padding: EdgeInsets.only(right: 3),
                                        child: Icon(Icons.navigation_rounded, color: Colors.white, size: 8),
                                      ),
                                    Flexible(
                                      child: Text(
                                        c.name.split(' ').take(2).join(' '),
                                        style: const TextStyle(
                                            color: Colors.white, fontSize: 7, fontWeight: FontWeight.w700),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 2),
                              CustomPaint(
                                size: const Size(20, 26),
                                painter: _PinPainter(
                                    color: isNearest ? const Color(0xFF22C55E) : c.color),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ],
            ),

            // ── Search bar (PANaHON-style) ───────────────────────────────
            Positioned(
              top: 10, left: 10, right: 58,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PanahonSearchBar(
                    hint: 'Search evacuation center…',
                    controller: _searchCtrl,
                    onSubmitted: _search,
                    trailing: GestureDetector(
                      onTap: () => _search(_searchCtrl.text),
                      child: const Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.accent),
                    ),
                  ),
                  if (_searchError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6, left: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.bgDark.withValues(alpha: 0.95),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.red.withValues(alpha: 0.4)),
                        ),
                        child: Text(_searchError!,
                            style: const TextStyle(color: AppColors.red, fontSize: 10.5)),
                      ),
                    ),
                ],
              ),
            ),

            // ── Nearest center info (name/distance + address) ───────────────
            // Both banners live in one Column now instead of two separately
            // Positioned widgets at fixed offsets — a long center name used
            // to wrap to 2 lines and get clipped by the address banner below
            // it, since that banner assumed the first one was always 60px
            // tall. Stacking them in a Column sizes each to its real content
            // height, so nothing overlaps regardless of name length.
            if (_nearest != null)
              Positioned(
                top: _bannerTop, left: 12, right: 60,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_nearestDist != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                          color: const Color(0xFF052e16).withValues(alpha: 0.95),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFF22C55E).withValues(alpha: 0.6)),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 12)],
                        ),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.navigation_rounded, color: Color(0xFF22C55E), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              const Text('NEAREST EVACUATION CENTER',
                                  style: TextStyle(color: Color(0xFF22C55E), fontSize: 8,
                                      fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                              const SizedBox(height: 2),
                              Text(_nearest!.name,
                                  style: const TextStyle(color: Color(0xFFe2eaf5), fontSize: 12, fontWeight: FontWeight.w700)),
                            ]),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                            decoration: BoxDecoration(
                              color: const Color(0xFF22C55E).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: const Color(0xFF22C55E).withValues(alpha: 0.4)),
                            ),
                            child: Text(
                              _formatDistance(_nearestDist!),
                              style: const TextStyle(color: Color(0xFF22C55E), fontSize: 11, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ]),
                      ),
                    const SizedBox(height: 8),
                    // Address of the nearest center — replaces the old "flood
                    // zone" banner, since that polygon is just the barangay
                    // boundary, not an actual flood zone, so labeling it that
                    // way was misleading. This is more useful in that slot.
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0d1f3c).withValues(alpha: 0.97),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF1e3a5f)),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 12)],
                      ),
                      child: Row(children: [
                        const Icon(Icons.location_on_outlined, color: Color(0xFF4a6080), size: 14),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _nearest!.note,
                            style: const TextStyle(
                              color: Color(0xFF8da4be),
                              fontSize: 10.5,
                              fontWeight: FontWeight.w500,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                    ),
                  ],
                ),
              ),

            // ── Legend panel (toggled via the layers icon below) ────────────
            if (_showLegend)
              Positioned(
                top: 56, right: 56,
                child: Container(
                  width: 170,
                  padding: const EdgeInsets.all(11),
                  decoration: BoxDecoration(
                    color: AppColors.bgDark.withValues(alpha: 0.96),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.bgBorder),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10)],
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('MAP LEGEND',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 9,
                            fontWeight: FontWeight.w800, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    Row(children: [
                      Container(width: 10, height: 10,
                          decoration: const BoxDecoration(color: _colorPrimary, shape: BoxShape.circle)),
                      const SizedBox(width: 7),
                      const Expanded(child: Text('Primary Center',
                          style: TextStyle(color: AppColors.textSec, fontSize: 10.5))),
                    ]),
                    const SizedBox(height: 6),
                    Row(children: [
                      Container(width: 10, height: 10,
                          decoration: const BoxDecoration(color: _colorSchool, shape: BoxShape.circle)),
                      const SizedBox(width: 7),
                      const Expanded(child: Text('School Center',
                          style: TextStyle(color: AppColors.textSec, fontSize: 10.5))),
                    ]),
                    const SizedBox(height: 6),
                    Row(children: [
                      Container(width: 10, height: 10,
                          decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle)),
                      const SizedBox(width: 7),
                      const Expanded(child: Text('Nearest / You',
                          style: TextStyle(color: AppColors.textSec, fontSize: 10.5))),
                    ]),
                    const SizedBox(height: 6),
                    Row(children: [
                      Container(
                          width: 18, height: 2,
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.7),
                            borderRadius: BorderRadius.circular(1),
                          )),
                      const SizedBox(width: 7),
                      const Expanded(child: Text('Brgy. Boundary',
                          style: TextStyle(color: AppColors.textSec, fontSize: 10.5))),
                    ]),
                    const SizedBox(height: 6),
                    Row(children: [
                      Container(
                          width: 18, height: 2,
                          decoration: BoxDecoration(
                            color: const Color(0xFF22C55E),
                            borderRadius: BorderRadius.circular(1),
                          )),
                      const SizedBox(width: 7),
                      const Expanded(child: Text('Route to Center',
                          style: TextStyle(color: AppColors.textSec, fontSize: 10.5))),
                    ]),
                  ]),
                ),
              ),

            // ── Vertical map tool stack (PANaHON-style) ──────────────────────
            Positioned(
              top: 56,
              right: 10,
              child: MapToolStack(children: [
                MapToolButton(
                  icon: Icons.layers_rounded,
                  active: _showLegend,
                  onTap: () => setState(() => _showLegend = !_showLegend),
                ),
                MapToolButton(
                  icon: _userLocation != null ? Icons.my_location_rounded : Icons.location_searching_rounded,
                  active: _userLocation != null,
                  activeColor: const Color(0xFF22C55E),
                  onTap: _locating ? null : _locateUser,
                  child: _locating
                      ? const SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2),
                        )
                      : null,
                ),
                MapToolButton(icon: Icons.add_rounded, onTap: () => _zoomBy(1)),
                MapToolButton(icon: Icons.remove_rounded, onTap: () => _zoomBy(-1)),
              ]),
            ),

            // ── Error overlay ──────────────────────────────────────────────
            if (_locError != null)
              Positioned(
                bottom: 12, left: 12, right: 12,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF450a0a),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFef4444).withValues(alpha: 0.5)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: Color(0xFFef4444), size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_locError!,
                        style: const TextStyle(color: Color(0xFFfca5a5), fontSize: 11))),
                    GestureDetector(
                      onTap: () => setState(() => _locError = null),
                      child: const Icon(Icons.close, color: Color(0xFF4a6080), size: 14),
                    ),
                  ]),
                ),
              ),

            // ── Tap hint (no location yet) ─────────────────────────────────
            if (_nearest == null && _locError == null)
              Positioned(
                bottom: 12, left: 12, right: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0d1f3c).withValues(alpha: 0.9),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF1e3a5f)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.info_outline_rounded, color: Color(0xFF38bdf8), size: 14),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Tap the locate button to find the nearest evacuation center.',
                        style: TextStyle(color: Color(0xFF8da4be), fontSize: 11),
                      ),
                    ),
                    GestureDetector(
                      onTap: _locating ? null : _locateUser,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFF38bdf8).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFF38bdf8).withValues(alpha: 0.4)),
                        ),
                        child: const Text('Locate Me',
                            style: TextStyle(color: Color(0xFF38bdf8),
                                fontSize: 10, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ]),
                ),
              ),
          ]),
        ),

        // ── Detail cards ───────────────────────────────────────────────────────
        Expanded(
          flex: 13,
          child: SingleChildScrollView(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const _SectionLabel(icon: '🚨', text: 'Evacuation Route Map — Barangay Triangulo'),
              const SizedBox(height: 4),
              const Text('Tap a marker on the map, or a card below, for details.',
                  style: TextStyle(color: Color(0xFF4a6080), fontSize: 10.5)),
              const SizedBox(height: 12),

              // ── Selected center detail card (replaces map popup) ──────────
              if (_selectedCenterId != null) ...[
                _buildDetailCard(context),
                const SizedBox(height: 12),
              ],

              ..._centers.map((c) {
                final isNearest = _nearest?.id == c.id;
                final isSelected = _selectedCenterId == c.id;
                final dist = _userLocation != null
                    ? _haversine(_userLocation!.latitude, _userLocation!.longitude, c.lat, c.lng)
                    : null;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GestureDetector(
                    onTap: () => setState(() =>
                        _selectedCenterId = isSelected ? null : c.id),
                    child: _CenterCard(
                      center: c,
                      isNearest: isNearest,
                      isSelected: isSelected,
                      distanceMeters: dist,
                    ),
                  ),
                );
              }),

              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFf97316).withValues(alpha: 0.07),
                    border: Border(
                      left: const BorderSide(color: Color(0xFFf97316), width: 3),
                      top: BorderSide(color: const Color(0xFFf97316).withValues(alpha: 0.25)),
                      right: BorderSide(color: const Color(0xFFf97316).withValues(alpha: 0.25)),
                      bottom: BorderSide(color: const Color(0xFFf97316).withValues(alpha: 0.25)),
                    ),
                  ),
                  child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('⚠️  DURING A FLOOD EVENT',
                        style: TextStyle(color: Color(0xFFf97316), fontSize: 9.5,
                            fontWeight: FontWeight.w800, letterSpacing: 1.0)),
                    SizedBox(height: 6),
                    Text(
                      'Proceed immediately to the nearest designated evacuation center. '
                      'Bring essential documents, medicines, and supplies. '
                      'Follow instructions from Barangay Officials.',
                      style: TextStyle(color: Color(0xFF8da4be), fontSize: 11.5, height: 1.5),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  // ── Expanded detail card shown at top of list when a center is selected ─────
  Widget _buildDetailCard(BuildContext context) {
    final c = _centers.firstWhere((c) => c.id == _selectedCenterId);
    final isNearest = _nearest?.id == c.id;
    final dist = _userLocation != null
        ? _haversine(_userLocation!.latitude, _userLocation!.longitude, c.lat, c.lng)
        : null;

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF0d1f3c),
          border: Border(
            left: BorderSide(
                color: isNearest ? const Color(0xFF22C55E) : c.color, width: 3),
            top: BorderSide(
                color: (isNearest ? const Color(0xFF22C55E) : c.color)
                    .withValues(alpha: 0.4)),
            right: BorderSide(
                color: (isNearest ? const Color(0xFF22C55E) : c.color)
                    .withValues(alpha: 0.4)),
            bottom: BorderSide(
                color: (isNearest ? const Color(0xFF22C55E) : c.color)
                    .withValues(alpha: 0.4)),
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 16)
          ],
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: (isNearest ? const Color(0xFF22C55E) : c.color)
                  .withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(
                  color: (isNearest ? const Color(0xFF22C55E) : c.color)
                      .withValues(alpha: 0.4)),
            ),
            child: Icon(
              isNearest ? Icons.navigation_rounded : Icons.location_on_rounded,
              color: isNearest ? const Color(0xFF22C55E) : c.color,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (isNearest)
                Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFF22C55E).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                        color: const Color(0xFF22C55E).withValues(alpha: 0.4)),
                  ),
                  child: const Text('⚡ NEAREST TO YOU',
                      style: TextStyle(color: Color(0xFF22C55E), fontSize: 8,
                          fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                ),
              Text(c.name,
                  style: const TextStyle(color: Color(0xFFe2eaf5),
                      fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: c.color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: c.color.withValues(alpha: 0.35)),
                ),
                child: Text(c.type,
                    style: TextStyle(
                        color: c.color, fontSize: 9, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 8),
              // Address + coordinates, as labeled rows in one info box
              // (mirrors the web dashboard's detail-card layout).
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                decoration: BoxDecoration(
                  color: const Color(0xFF0a1828),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: const Color(0xFF1e3a5f)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('ADDRESS',
                      style: TextStyle(color: Color(0xFF4a6080), fontSize: 8.5,
                          fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                  const SizedBox(height: 3),
                  Text(c.note,
                      style: const TextStyle(
                          color: Color(0xFF8da4be), fontSize: 11.5, height: 1.5)),
                  const SizedBox(height: 9),
                  Container(height: 1, color: const Color(0xFF1e3a5f)),
                  const SizedBox(height: 9),
                  const Text('COORDINATES',
                      style: TextStyle(color: Color(0xFF4a6080), fontSize: 8.5,
                          fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                  const SizedBox(height: 3),
                  Row(children: [
                    Expanded(
                      child: Text(
                        '${c.lat.toStringAsFixed(4)}, ${c.lng.toStringAsFixed(4)}',
                        style: const TextStyle(
                            color: Color(0xFF8da4be),
                            fontSize: 11,
                            fontFamily: 'monospace'),
                      ),
                    ),
                    GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(
                            text:
                                '${c.lat.toStringAsFixed(6)}, ${c.lng.toStringAsFixed(6)}'));
                        HapticFeedback.lightImpact();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Coordinates copied — ${c.name}',
                                style: const TextStyle(fontSize: 12)),
                            backgroundColor: const Color(0xFF0d1f3c),
                            behavior: SnackBarBehavior.floating,
                            duration: const Duration(seconds: 2),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8)),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF38bdf8).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(
                              color:
                                  const Color(0xFF38bdf8).withValues(alpha: 0.3)),
                        ),
                        child: const Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.copy_rounded,
                              color: Color(0xFF38bdf8), size: 10),
                          SizedBox(width: 3),
                          Text('Copy',
                              style: TextStyle(
                                  color: Color(0xFF38bdf8),
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700)),
                        ]),
                      ),
                    ),
                  ]),
                ]),
              ),
              if (dist != null) ...[
                const SizedBox(height: 6),
                Row(children: [
                  const Icon(Icons.directions_walk_rounded,
                      color: Color(0xFF22C55E), size: 13),
                  const SizedBox(width: 4),
                  Text(
                    '${_formatDistance(dist)} away',
                    style: const TextStyle(
                        color: Color(0xFF22C55E),
                        fontSize: 11,
                        fontWeight: FontWeight.w600),
                  ),
                ]),
              ],
            ]),
          ),
          // Dismiss button
          GestureDetector(
            onTap: () => setState(() => _selectedCenterId = null),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child:
                  Icon(Icons.close, color: Color(0xFF4a6080), size: 16),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Center Summary Card (in the list) ─────────────────────────────────────────
class _CenterCard extends StatelessWidget {
  final _EvacCenter center;
  final bool isNearest;
  final bool isSelected;
  final double? distanceMeters;
  const _CenterCard({
    required this.center,
    this.isNearest = false,
    this.isSelected = false,
    this.distanceMeters,
  });

  @override
  Widget build(BuildContext context) {
    final accentColor = isNearest ? const Color(0xFF22C55E) : center.color;
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF0d1f3c).withValues(alpha: 1.0)
              : const Color(0xFF0d1f3c),
          border: Border(
            left: BorderSide(color: accentColor, width: isSelected ? 4 : 3),
            top: BorderSide(
                color: isSelected
                    ? accentColor.withValues(alpha: 0.4)
                    : const Color(0xFF1e3a5f)),
            right: BorderSide(
                color: isSelected
                    ? accentColor.withValues(alpha: 0.4)
                    : const Color(0xFF1e3a5f)),
            bottom: BorderSide(
                color: isSelected
                    ? accentColor.withValues(alpha: 0.4)
                    : const Color(0xFF1e3a5f)),
          ),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text('🏫 ${center.name}',
                  style: const TextStyle(
                      color: Color(0xFFe2eaf5),
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5)),
            ),
            if (isNearest)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF22C55E).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(5),
                  border: Border.all(
                      color: const Color(0xFF22C55E).withValues(alpha: 0.4)),
                ),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.navigation_rounded,
                      color: Color(0xFF22C55E), size: 10),
                  SizedBox(width: 3),
                  Text('NEAREST',
                      style: TextStyle(
                          color: Color(0xFF22C55E),
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5)),
                ]),
              ),
          ]),
          const SizedBox(height: 7),
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: center.color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: center.color.withValues(alpha: 0.35)),
              ),
              child: Text(center.type,
                  style: TextStyle(
                      color: center.color,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700)),
            ),
          ]),
          const SizedBox(height: 10),
          // Address + coordinates, as labeled rows in one info box
          // (mirrors the web dashboard's card layout).
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFF0a1828),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0xFF1e3a5f)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('ADDRESS',
                  style: TextStyle(color: Color(0xFF4a6080), fontSize: 8.5,
                      fontWeight: FontWeight.w800, letterSpacing: 0.8)),
              const SizedBox(height: 3),
              Text(center.note,
                  style: const TextStyle(
                      color: Color(0xFF8da4be), fontSize: 12, height: 1.5)),
              const SizedBox(height: 9),
              Container(height: 1, color: const Color(0xFF1e3a5f)),
              const SizedBox(height: 9),
              const Text('COORDINATES',
                  style: TextStyle(color: Color(0xFF4a6080), fontSize: 8.5,
                      fontWeight: FontWeight.w800, letterSpacing: 0.8)),
              const SizedBox(height: 3),
              Row(children: [
                Expanded(
                  child: Text(
                    '${center.lat.toStringAsFixed(4)}, ${center.lng.toStringAsFixed(4)}',
                    style: const TextStyle(
                        color: Color(0xFF8da4be),
                        fontSize: 11,
                        fontFamily: 'monospace'),
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(
                        text:
                            '${center.lat.toStringAsFixed(6)}, ${center.lng.toStringAsFixed(6)}'));
                    HapticFeedback.lightImpact();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Coordinates copied — ${center.name}',
                            style: const TextStyle(fontSize: 12)),
                        backgroundColor: const Color(0xFF0d1f3c),
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 2),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF38bdf8).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                          color: const Color(0xFF38bdf8).withValues(alpha: 0.3)),
                    ),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.copy_rounded,
                          color: Color(0xFF38bdf8), size: 10),
                      SizedBox(width: 3),
                      Text('Copy',
                          style: TextStyle(
                              color: Color(0xFF38bdf8),
                              fontSize: 9,
                              fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ]),
            ]),
          ),
          if (distanceMeters != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              Icon(Icons.directions_walk_rounded,
                  color: isNearest ? const Color(0xFF22C55E) : const Color(0xFF8da4be),
                  size: 13),
              const SizedBox(width: 5),
              Text(
                '${_formatDistance(distanceMeters!)} away',
                style: TextStyle(
                    color: isNearest
                        ? const Color(0xFF22C55E)
                        : const Color(0xFF8da4be),
                    fontSize: 11,
                    fontWeight: FontWeight.w700),
              ),
            ]),
          ],
        ]),
      ),
    );
  }
}

// ── Section Label ──────────────────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String icon, text;
  const _SectionLabel({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Row(children: [
        Text(icon, style: const TextStyle(fontSize: 12)),
        const SizedBox(width: 6),
        Flexible(
          child: Text(text.toUpperCase(),
              style: const TextStyle(
                  color: Color(0xFF4a6080),
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2)),
        ),
        const SizedBox(width: 8),
        Expanded(child: Container(height: 1, color: const Color(0xFF1e3a5f))),
      ]);
}

// ── Custom Pin Painter ─────────────────────────────────────────────────────────
class _PinPainter extends CustomPainter {
  final Color color;
  const _PinPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color..style = PaintingStyle.fill;
    final strokePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final path = ui.Path()
      ..moveTo(size.width / 2, size.height)
      ..cubicTo(size.width / 2 - 2, size.height * 0.8, 0, size.height * 0.6,
          0, size.height * 0.42)
      ..arcToPoint(Offset(size.width, size.height * 0.42),
          radius: Radius.circular(size.width / 2), clockwise: false)
      ..cubicTo(size.width, size.height * 0.6, size.width / 2 + 2,
          size.height * 0.8, size.width / 2, size.height)
      ..close();

    canvas.drawPath(path, paint);
    canvas.drawPath(path, strokePaint);
    canvas.drawCircle(
      Offset(size.width / 2, size.height * 0.38),
      size.width * 0.22,
      Paint()..color = Colors.white..style = PaintingStyle.fill,
    );
  }

  @override
  bool shouldRepaint(_PinPainter old) => old.color != color;
}
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../main.dart';
import '../services/flood_status_service.dart';
import '../theme/panahon_ui.dart';
import '../services/routing_service.dart';
import '../services/tile_cache.dart';

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

  // Real street-following route to whichever center is currently "the
  // one" (the selected center if any, otherwise the nearest). Was already
  // built (services/routing_service.dart, OSRM-backed) but never actually
  // called anywhere — the map was drawing a straight haversine line
  // regardless. null routePoints means "no route fetched yet, or the
  // fetch failed" — the map falls back to the straight line in that case,
  // same behavior as before this existed.
  List<LatLng>? _routePoints;
  double? _routeDistanceMeters;
  int? _routeDurationSeconds;
  bool _routing = false;

  final MapController _mapController = MapController();
  // Swipeable cards along the bottom of the map (Google Maps / Uber style):
  // one card per center, nearest first once we know where the user is.
  final PageController _pageController = PageController(viewportFraction: 0.9);

  bool _showLegend = false; // legend + "during a flood" tips panel

  @override
  void initState() {
    super.initState();
    _selectedCenterId = _centers.first.id;
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // ── Street-following route to a center ─────────────────────────────────────
  // Fetches once per selection change, not on every rebuild — call sites are
  // the handful of places _selectedCenterId or _nearest actually change.
  Future<void> _fetchRoute(_EvacCenter? to) async {
    if (_userLocation == null || to == null) {
      setState(() {
        _routePoints = null;
        _routeDistanceMeters = null;
        _routeDurationSeconds = null;
      });
      return;
    }
    setState(() => _routing = true);
    final result = await RoutingService.fetchWalkingRoute(
      _userLocation!,
      LatLng(to.lat, to.lng),
    );
    if (!mounted) return;
    setState(() {
      _routing = false;
      _routePoints = result?.points;
      _routeDistanceMeters = result?.distanceMeters;
      _routeDurationSeconds = result?.durationSeconds;
      // result == null (offline, OSRM demo server unreachable, etc.) —
      // all three go back to null, and the map falls back to the plain
      // haversine straight line further down, same as before this feature
      // existed. Never leaves a stale route from a previous center on
      // screen after a failed fetch for a new one.
    });
  }

  // Central place that changes which center is "selected" — every tap
  // target (marker, list card, search) routes through this so the fetched
  // walking route always matches what's highlighted, instead of the route
  // staying stuck on whichever center was nearest at locate-time.
  void _selectCenter(String? id) {
    setState(() => _selectedCenterId = id);
    _EvacCenter? target = _nearest;
    if (id != null) {
      for (final c in _centers) {
        if (c.id == id) { target = c; break; }
      }
    }
    _fetchRoute(target);
  }

  String _formatDuration(int seconds) {
    final minutes = (seconds / 60).round();
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return '$minutes min';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}m';
  }

  // Whichever center the route line/banners currently point at — the
  // selected one if the user picked one, otherwise the nearest.
  _EvacCenter? get _routeTarget {
    if (_selectedCenterId == null) return _nearest;
    for (final c in _centers) {
      if (c.id == _selectedCenterId) return c;
    }
    return _nearest;
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
        _fitPoints([userLatLng, LatLng(nearest.lat, nearest.lng)]);
      }
      _fetchRoute(nearest);

      // Nearest is now first in the card strip — bring it into view.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_pageController.hasClients) _pageController.jumpToPage(0);
      });
    } catch (e) {
      setState(() {
        _locError = 'Could not get location: $e';
        _locating = false;
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  static const _green = Color(0xFF22C55E);

  List<_EvacCenter> get _sortedCenters {
    final list = List<_EvacCenter>.from(_centers);
    final u = _userLocation;
    if (u != null) {
      list.sort((a, b) => _haversine(u.latitude, u.longitude, a.lat, a.lng)
          .compareTo(_haversine(u.latitude, u.longitude, b.lat, b.lng)));
    }
    return list;
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  // Frames the given points above the card strip (which covers the bottom
  // ~230 px of the map) and below the status strip at the top.
  void _fitPoints(List<LatLng> pts) {
    if (pts.isEmpty) return;
    try {
      if (pts.length < 2) {
        _mapController.move(pts.first, 16.2);
        return;
      }
      _mapController.fitCamera(CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(pts),
        padding: const EdgeInsets.fromLTRB(48, 110, 48, 240),
        maxZoom: 17,
      ));
    } catch (_) {}
  }

  void _fitAll() {
    HapticFeedback.selectionClick();
    _fitPoints([
      ..._centers.map((c) => LatLng(c.lat, c.lng)),
      if (_userLocation != null) _userLocation!,
    ]);
  }

  // Swiping the card strip selects that center and flies the map to it.
  void _onPageChanged(int i) {
    final list = _sortedCenters;
    if (i < 0 || i >= list.length) return;
    final c = list[i];
    if (c.id == _selectedCenterId) return;
    HapticFeedback.selectionClick();
    _selectCenter(c.id);
    _fitPoints(_userLocation != null
        ? [_userLocation!, LatLng(c.lat, c.lng)]
        : [LatLng(c.lat, c.lng)]);
  }

  // Tapping a marker selects it and brings its card into view.
  void _focusCenter(_EvacCenter c) {
    HapticFeedback.selectionClick();
    _selectCenter(c.id);
    final i = _sortedCenters.indexWhere((x) => x.id == c.id);
    if (i >= 0 && _pageController.hasClients) _pageController.jumpToPage(i);
  }

  // Real turn-by-turn: hands off to Google Maps (or whatever maps app the
  // phone uses) with the center as the walking destination. The in-app route
  // line is an overview; this is what you actually follow while walking.
  Future<void> _openDirections(_EvacCenter c) async {
    HapticFeedback.mediumImpact();
    final uri = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) _toast("Couldn't open a maps app.");
    } catch (_) {
      _toast("Couldn't open a maps app.");
    }
  }

  // Opens the SMS app with a ready-made message (no recipient chosen, so the
  // resident picks who to tell) — where I'm going, and where I am now.
  Future<void> _shareTrip(_EvacCenter c) async {
    HapticFeedback.selectionClick();
    final u = _userLocation;
    final msg = StringBuffer("I'm heading to ${c.name} (${c.note}). ")
      ..write('Map: https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}');
    if (u != null) {
      msg.write(' My location now: https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}');
    }
    msg.write(' — sent from AGOS');
    try {
      final ok = await launchUrl(Uri.parse('sms:?body=${Uri.encodeComponent(msg.toString())}'));
      if (!ok) _toast("Couldn't open your messaging app.");
    } catch (_) {
      _toast("Couldn't open your messaging app.");
    }
  }

  String _fmtMeters(double m) =>
      m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(2)} km';

  // ── Map marker for one center ──────────────────────────────────────────────
  // The name label only shows on the selected center — the old always-on 7 px
  // labels were unreadable and overlapped when centers sat close together.
  Marker _centerMarker(_EvacCenter c) {
    final isNearest = _nearest?.id == c.id;
    final isSelected = _selectedCenterId == c.id;
    final tint = isNearest ? _green : c.color;
    final halo = isSelected ? 46.0 : 34.0;
    return Marker(
      point: LatLng(c.lat, c.lng),
      width: 56,
      height: 56,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => _focusCenter(c),
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            if (isSelected)
              Positioned(
                top: -20,
                left: -60,
                right: -60,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: tint,
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: [BoxShadow(color: AppColors.shadow(0.35), blurRadius: 5)],
                    ),
                    child: Text(c.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: halo,
              height: halo,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: tint.withValues(alpha: isSelected ? 0.28 : 0.18),
                border: Border.all(color: tint, width: isSelected ? 2.5 : 2),
              ),
            ),
            CustomPaint(size: const Size(20, 26), painter: _PinPainter(color: tint)),
          ],
        ),
      ),
    );
  }

  // ── Top strip: what the flood level means for EVACUATION right now ─────────
  Widget _statusStrip(String alertKey) {
    final urgent = alertKey == 'WARNING' || alertKey == 'CRITICAL';
    final target = _routeTarget ?? _centers.first;
    late final Color tint;
    late final IconData icon;
    late final String title;
    late final String sub;
    switch (alertKey) {
      case 'CRITICAL':
        tint = AppColors.red;
        icon = Icons.crisis_alert_rounded;
        title = 'Evacuate now';
        sub = 'Go to ${target.name}';
        break;
      case 'WARNING':
        tint = AppColors.orange;
        icon = Icons.warning_amber_rounded;
        title = 'Be ready to evacuate';
        sub = 'Nearest: ${target.name}';
        break;
      case 'ADVISORY':
        tint = AppColors.yellow;
        icon = Icons.info_outline_rounded;
        title = 'Advisory · know your route';
        sub = 'Pick a center and save the route now';
        break;
      default:
        tint = AppColors.green;
        icon = Icons.check_circle_outline_rounded;
        title = 'No evacuation needed';
        sub = 'Good time to learn where the centers are';
    }
    return GestureDetector(
      onTap: urgent ? () => _openDirections(target) : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: urgent ? tint : AppColors.bgDark.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: tint.withValues(alpha: urgent ? 1 : 0.5)),
          boxShadow: [BoxShadow(color: AppColors.shadow(0.35), blurRadius: 10)],
        ),
        child: Row(children: [
          Icon(icon, size: 20, color: urgent ? Colors.white : AppColors.ink(tint)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: urgent ? Colors.white : AppColors.textPri,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800)),
              Text(sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: urgent ? Colors.white.withValues(alpha: 0.9) : AppColors.textMuted,
                      fontSize: 10.5)),
            ]),
          ),
          if (urgent) const Icon(Icons.directions_walk_rounded, color: Colors.white, size: 20),
        ]),
      ),
    );
  }

  // ── Legend + tips panel ────────────────────────────────────────────────────
  Widget _legendRow(Widget swatch, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          swatch,
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: TextStyle(color: AppColors.textSec, fontSize: 11))),
        ]),
      );

  Widget _dot(Color c) => Container(width: 10, height: 10, decoration: BoxDecoration(color: c, shape: BoxShape.circle));
  Widget _line(Color c) => Container(width: 18, height: 3, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2)));

  Widget _infoPanel() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.bgDark.withValues(alpha: 0.97),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.bgBorder),
          boxShadow: [BoxShadow(color: AppColors.shadow(0.4), blurRadius: 12)],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('MAP KEY',
              style: TextStyle(color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1)),
          const SizedBox(height: 8),
          _legendRow(_dot(_colorPrimary), 'Primary center'),
          _legendRow(_dot(_colorSchool), 'School center'),
          _legendRow(_dot(_green), 'Nearest to you / your position'),
          _legendRow(_line(AppColors.accent.withValues(alpha: 0.8)), 'Barangay boundary'),
          _legendRow(_line(_green), 'Walking route (overview)'),
          const SizedBox(height: 4),
          Divider(height: 1, color: AppColors.divider),
          const SizedBox(height: 10),
          Text('IF YOU HAVE TO EVACUATE',
              style: TextStyle(color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1)),
          const SizedBox(height: 6),
          Text(
            '• Go early, before water rises\n'
            '• Bring IDs, medicines, phone + power bank\n'
            '• Avoid walking through floodwater\n'
            '• Follow barangay officials\u2019 instructions',
            style: TextStyle(color: AppColors.textSec, fontSize: 11, height: 1.5),
          ),
        ]),
      );

  // ── One card in the bottom strip ───────────────────────────────────────────
  Widget _centerCard(_EvacCenter c) {
    final isNearest = _nearest?.id == c.id;
    final isSel = _selectedCenterId == c.id;
    final u = _userLocation;
    final straight = u == null ? null : _haversine(u.latitude, u.longitude, c.lat, c.lng);
    final tint = isNearest ? _green : c.color;

    late final String metric;
    if (u == null) {
      metric = 'Tap “Find nearest” to see your distance';
    } else if (isSel && _routing) {
      metric = 'Finding walking route…';
    } else if (isSel && _routeDistanceMeters != null && _routeDurationSeconds != null) {
      metric = '${_formatDuration(_routeDurationSeconds!)} walk · ${_fmtMeters(_routeDistanceMeters!)}';
    } else {
      metric = _formatDistance(straight!);
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isSel ? tint : AppColors.bgBorder, width: isSel ? 1.8 : 1),
        boxShadow: [BoxShadow(color: AppColors.shadow(0.4), blurRadius: 14, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Container(
            width: 34, height: 34,
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.16), shape: BoxShape.circle),
            child: Icon(isNearest ? Icons.navigation_rounded : Icons.location_on_rounded,
                color: AppColors.ink(tint), size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.textPri, fontSize: 13.5, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Row(children: [
                Flexible(
                  child: Text(c.type,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.ink(c.color), fontSize: 10.5, fontWeight: FontWeight.w700)),
                ),
                if (isNearest) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                    decoration: BoxDecoration(color: _green.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(4)),
                    child: Text('NEAREST',
                        style: TextStyle(color: AppColors.greenText, fontSize: 8.5, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                  ),
                ],
              ]),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Icon(Icons.directions_walk_rounded, size: 14, color: AppColors.greenText),
          const SizedBox(width: 5),
          Expanded(
            child: Text(metric,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: AppColors.greenText, fontSize: 11.5, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 3),
        Text(c.note,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: AppColors.textMuted, fontSize: 10.5, height: 1.3)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () => _openDirections(c),
              icon: const Icon(Icons.directions_rounded, size: 16),
              label: const Text('Directions', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
              style: FilledButton.styleFrom(
                backgroundColor: _green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 8),
                minimumSize: const Size(0, 36),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            onPressed: () => _shareTrip(c),
            icon: const Icon(Icons.sms_rounded, size: 15),
            label: const Text('Tell family', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accent,
              side: BorderSide(color: AppColors.accent.withValues(alpha: 0.5)),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              minimumSize: const Size(0, 36),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ]),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Flood level drives the top strip (calm → "know your route", severe →
    // a big red "Evacuate now" button straight to directions).
    final alertKey =
        (context.watch<FloodStatusService>().rawJson?['alert_level']?.toString() ?? 'NORMAL').toUpperCase();
    final centers = _sortedCenters;

    // The map now fills the whole tab; the old half-screen list of long cards
    // is replaced by a swipeable card strip over the map.
    return Stack(children: [
      Positioned.fill(
        child: Stack(children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _trianguloCenter,
                initialZoom: 14.5,
                // Tapping the map clears the selection highlight
                onTap: (_, __) {
                  if (_showLegend) setState(() => _showLegend = false);
                },
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag | InteractiveFlag.doubleTapZoom,
                ),
              ),
              children: [
                TileLayer(
                  // CARTO's free raster basemap tiles (basemaps.cartocdn.com)
                  // started requiring an API key in late August 2026 —
                  // unauthenticated requests now render with an "API KEY
                  // REQUIRED" watermark baked into every tile instead of
                  // failing outright, which is why the map looked "broken"
                  // rather than just blank. Switched to the same keyless
                  // OpenStreetMap standard tiles already used as the
                  // "Standard" basemap in flood_map_screen.dart, for
                  // consistency and so this doesn't silently break again
                  // the same way.
                  urlTemplate: kTileUrlStandard,
                  // Same package name as the flood map (this used to differ,
                  // so OSM saw two different apps).
                  userAgentPackageName: 'com.agos.floodmonitoring',
                  // Saves viewed tiles to disk and serves them with no
                  // signal — shared with the flood map and the Settings →
                  // Offline map download.
                  tileProvider: TileCache.provider,
                ),
                const RichAttributionWidget(
                  alignment: AttributionAlignment.bottomRight,
                  attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
                ),

                // Barangay boundary
                PolygonLayer(polygons: [
                  Polygon(
                    points: _boundary,
                    color: AppColors.accent.withValues(alpha: 0.08),
                    borderColor: AppColors.accent.withValues(alpha: 0.7),
                    borderStrokeWidth: 2,
                  ),
                ]),

                // Route line: user → whichever center is selected (or the
                // nearest one, if none is). Real street-following path
                // when OSRM returned one (_routePoints); falls back to the
                // old straight haversine line if the fetch is still in
                // flight or failed (offline, demo server unreachable).
                if (_userLocation != null && _routeTarget != null)
                  PolylineLayer(polylines: [
                    Polyline(
                      points: _routePoints ??
                          [
                            _userLocation!,
                            LatLng(_routeTarget!.lat, _routeTarget!.lng),
                          ],
                      color: const Color(0xFF22C55E),
                      strokeWidth: 3.5,
                      pattern: _routePoints == null
                          ? StrokePattern.dashed(segments: [12, 6])
                          : const StrokePattern.solid(),
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
                                  BoxShadow(color: AppColors.shadow(0.4), blurRadius: 4),
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

                    // Evacuation centers
                    ..._centers.map(_centerMarker),
                  ],
                ),
              ],
            ),

        ]),
      ),

      // ── Status strip (top) ───────────────────────────────────────────────
      Positioned(top: 10, left: 10, right: 58, child: _statusStrip(alertKey)),

      // ── Tool stack: locate, show-all, key ───────────────────────────────
      Positioned(
        top: 10,
        right: 10,
        child: MapToolStack(children: [
          MapToolButton(
            icon: _userLocation != null ? Icons.my_location_rounded : Icons.location_searching_rounded,
            active: _userLocation != null,
            activeColor: _green,
            onTap: _locating ? null : _locateUser,
            child: _locating
                ? SizedBox(
                    width: 16, height: 16,
                    child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2),
                  )
                : null,
          ),
          MapToolButton(icon: Icons.zoom_out_map_rounded, onTap: _fitAll),
          MapToolButton(
            icon: Icons.info_outline_rounded,
            active: _showLegend,
            onTap: () => setState(() => _showLegend = !_showLegend),
          ),
        ]),
      ),

      if (_showLegend) Positioned(top: 70, left: 10, right: 58, child: _infoPanel()),

      // ── "Find nearest" call-to-action until we know where the user is ────
      if (_userLocation == null && !_locating)
        Positioned(
          left: 14,
          bottom: 200,
          child: Material(
            color: AppColors.accent,
            borderRadius: BorderRadius.circular(22),
            elevation: 4,
            child: InkWell(
              borderRadius: BorderRadius.circular(22),
              onTap: _locateUser,
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.my_location_rounded, color: Colors.white, size: 16),
                  SizedBox(width: 6),
                  Text('Find nearest to me',
                      style: TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800)),
                ]),
              ),
            ),
          ),
        ),

      // ── Location error ───────────────────────────────────────────────────
      if (_locError != null)
        Positioned(
          left: 12,
          right: 12,
          bottom: 200,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.errorBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.red.withValues(alpha: 0.5)),
            ),
            child: Row(children: [
              Icon(Icons.error_outline_rounded, color: AppColors.ink(AppColors.red), size: 16),
              const SizedBox(width: 8),
              Expanded(child: Text(_locError!, style: TextStyle(color: AppColors.redTextSoft, fontSize: 11))),
              GestureDetector(
                onTap: () => setState(() => _locError = null),
                child: Icon(Icons.close, color: AppColors.textMuted, size: 14),
              ),
            ]),
          ),
        ),

      // ── Swipeable center cards (bottom) ──────────────────────────────────
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        height: 190,
        child: PageView.builder(
          controller: _pageController,
          onPageChanged: _onPageChanged,
          itemCount: centers.length,
          itemBuilder: (context, i) => Padding(
            padding: const EdgeInsets.fromLTRB(5, 0, 5, 10),
            child: _centerCard(centers[i]),
          ),
        ),
      ),
    ]);
  }
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
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'offline_cache.dart';

/// A real, street-following walking route between two points, computed
/// against OSRM's free public demo router — no API key needed. Replaces
/// the straight-line haversine guess (which ignores actual roads, bridges,
/// and — during a flood — which streets are even passable) with an actual
/// path and a distance/duration OSRM derives from it.
///
/// NOTE: router.project-osrm.org is a shared public demo instance with no
/// uptime guarantee and rate limits. Fine for a barangay-scale app; for
/// heavier production traffic, self-host OSRM or switch to Mapbox/Google
/// Directions (same request shape, just a different URL + API key).
class WalkingRoute {
  final List<LatLng> points;
  final double distanceMeters;
  final int durationSeconds;
  const WalkingRoute({
    required this.points,
    required this.distanceMeters,
    required this.durationSeconds,
  });
}

class RoutingService {
  // Only the LAST route per destination is kept (three evacuation centers →
  // three small files), not one per starting position — otherwise walking
  // around would fill the disk with near-identical routes.
  static String _cacheKey(LatLng to) =>
      'route_${to.latitude.toStringAsFixed(5)}_${to.longitude.toStringAsFixed(5)}';

  // A saved route is only reused offline if the person is still within this
  // distance of where it was computed. Beyond that it would point them along
  // the wrong streets, and the straight-line fallback is more honest.
  static const double _maxReuseMeters = 150;

  static Future<WalkingRoute?> fetchWalkingRoute(LatLng from, LatLng to) async {
    final url = Uri.parse(
      'https://router.project-osrm.org/route/v1/foot/'
      '${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
      '?overview=full&geometries=geojson',
    );
    try {
      final res = await http.get(url).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return _savedRoute(from, to);
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      if (json['code'] != 'Ok') return _savedRoute(from, to);
      final route = (json['routes'] as List).first as Map<String, dynamic>;
      final coords = (route['geometry']['coordinates'] as List)
          .map((c) => LatLng((c as List)[1] as double, c[0] as double))
          .toList();
      final result = WalkingRoute(
        points: coords,
        distanceMeters: (route['distance'] as num).toDouble(),
        durationSeconds: (route['duration'] as num).round(),
      );
      await _saveRoute(from, to, result);
      return result;
    } catch (_) {
      // Offline, demo server unreachable, or malformed response — reuse the
      // last route to this destination if we're still near where it started;
      // otherwise the caller falls back to the straight-line estimate, which
      // is always available.
      return _savedRoute(from, to);
    }
  }

  static Future<void> _saveRoute(LatLng from, LatLng to, WalkingRoute r) =>
      OfflineCache.writeJson(_cacheKey(to), {
        'fromLat': from.latitude,
        'fromLng': from.longitude,
        'distance': r.distanceMeters,
        'duration': r.durationSeconds,
        'points': [for (final p in r.points) [p.latitude, p.longitude]],
      });

  static Future<WalkingRoute?> _savedRoute(LatLng from, LatLng to) async {
    try {
      final entry = await OfflineCache.readJson(_cacheKey(to));
      if (entry == null || entry.data is! Map) return null;
      final m = entry.data as Map;
      final origin = LatLng((m['fromLat'] as num).toDouble(), (m['fromLng'] as num).toDouble());
      final drift = const Distance().as(LengthUnit.Meter, origin, from);
      if (drift > _maxReuseMeters) return null;
      final points = (m['points'] as List)
          .map((p) => LatLng((p as List)[0] as double, p[1] as double))
          .toList();
      if (points.length < 2) return null;
      return WalkingRoute(
        points: points,
        distanceMeters: (m['distance'] as num).toDouble(),
        durationSeconds: (m['duration'] as num).toInt(),
      );
    } catch (_) {
      return null;
    }
  }
}

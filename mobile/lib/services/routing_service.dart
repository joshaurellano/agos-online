import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

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
  static Future<WalkingRoute?> fetchWalkingRoute(LatLng from, LatLng to) async {
    final url = Uri.parse(
      'https://router.project-osrm.org/route/v1/foot/'
      '${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
      '?overview=full&geometries=geojson',
    );
    try {
      final res = await http.get(url).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      if (json['code'] != 'Ok') return null;
      final route = (json['routes'] as List).first as Map<String, dynamic>;
      final coords = (route['geometry']['coordinates'] as List)
          .map((c) => LatLng((c as List)[1] as double, c[0] as double))
          .toList();
      return WalkingRoute(
        points: coords,
        distanceMeters: (route['distance'] as num).toDouble(),
        durationSeconds: (route['duration'] as num).round(),
      );
    } catch (_) {
      // Offline, demo server unreachable, or malformed response — caller
      // falls back to the straight-line estimate, which is always available.
      return null;
    }
  }
}

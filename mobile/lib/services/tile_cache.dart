// tile_cache.dart
//
// Offline maps, in two layers:
//
//  1. PASSIVE — [CachedTileProvider] is a drop-in replacement for
//     flutter_map's default tile provider. Every tile you look at is saved to
//     disk, so anywhere you've already scrolled the map keeps working with no
//     signal (and reloads instantly next time).
//
//  2. ACTIVE — [OfflineMapService] pre-downloads every street-map tile
//     covering Barangay Triangulo (plus a margin) so the map and evacuation
//     routes work even in areas you've never opened. Triggered from
//     Settings → Offline map.
//
// Only the OpenStreetMap street map is pre-downloaded; the satellite and
// terrain layers still cache passively as you browse them. The area is a
// barangay-sized box (~150 tiles, a couple of MB), fetched with 2 parallel
// connections and a proper User-Agent to stay within OpenStreetMap's tile
// usage policy, which prohibits bulk scraping. If AGOS ever needs to cover
// a larger area, point kTileUrlStandard at a tile provider you have an
// agreement with instead.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ─── Tile sources (shared with flood_map_screen.dart / evacuation_screen.dart
// so cache keys always line up) ───────────────────────────────────────────────
const kTileUrlStandard = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const kTileUrlSatellite =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const kTileUrlTerrain = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

class _TileSource {
  final String urlTemplate;
  final String subdomain; // used only to build a concrete URL for downloading
  const _TileSource(this.urlTemplate, [this.subdomain = '']);
}

// Street map only — see the header comment for why the other two basemaps
// are left to cache passively.
const _downloadSources = <_TileSource>[
  _TileSource(kTileUrlStandard),
];

// Barangay Triangulo's boundary (see _trianguloPolygon in flood_map_screen)
// spans lat 13.6027–13.6226, lng 123.1841–123.1978; padded by ~450 m so the
// nearest streets and neighbouring barangay edges are covered too.
const double kOfflineNorth = 13.6266;
const double kOfflineSouth = 13.5987;
const double kOfflineWest = 123.1801;
const double kOfflineEast = 123.2018;
const int kOfflineMinZoom = 12;
const int kOfflineMaxZoom = 17;

/// Cache key for a tile. Independent of the `{s}` subdomain, because
/// flutter_map rotates through a/b/c for OpenTopoMap — the same tile fetched
/// via a different subdomain must still hit the same cache entry.
String tileCacheKey(String urlTemplate, int z, int x, int y) => urlTemplate
    .replaceAll('{s}', '')
    .replaceAll('{z}', '$z')
    .replaceAll('{x}', '$x')
    .replaceAll('{y}', '$y');

class TileCache {
  TileCache._();

  // Identifies the app to the tile servers (OSM's usage policy requires a
  // meaningful User-Agent).
  static const Map<String, String> headers = {
    'User-Agent': 'AGOS-FloodApp/1.0 (com.agos.floodmonitoring)',
  };

  static final CacheManager manager = CacheManager(
    Config(
      'agosMapTiles',
      stalePeriod: const Duration(days: 30),
      maxNrOfCacheObjects: 8000,
    ),
  );

  /// One shared instance: flutter_map reloads every tile if a TileLayer is
  /// handed a *different* provider object on rebuild, so this must not be
  /// re-created inside build().
  static final CachedTileProvider provider = CachedTileProvider();
}

/// Serves tiles from disk when present (even if past their freshness date —
/// an old road map beats a grey square), and saves whatever it downloads.
class CachedTileProvider extends TileProvider {
  // A fresh, mutable map: flutter_map may add its own User-Agent entry to it.
  CachedTileProvider() : super(headers: {...TileCache.headers});

  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    return CachedNetworkImageProvider(
      getTileUrl(coordinates, options),
      cacheKey: tileCacheKey(
        options.urlTemplate ?? '',
        coordinates.z,
        coordinates.x,
        coordinates.y,
      ),
      cacheManager: TileCache.manager,
      headers: headers,
    );
  }
}

// ─── Active downloader ───────────────────────────────────────────────────────

class _TileJob {
  final String url;
  final String key;
  const _TileJob(this.url, this.key);
}

int _lonToX(double lon, int z) => ((lon + 180.0) / 360.0 * (1 << z)).floor();

int _latToY(double lat, int z) {
  final r = lat * math.pi / 180.0;
  final n = math.log(math.tan(r) + 1.0 / math.cos(r));
  return ((1.0 - n / math.pi) / 2.0 * (1 << z)).floor();
}

List<_TileJob> _buildJobs() {
  final jobs = <_TileJob>[];
  for (final src in _downloadSources) {
    for (var z = kOfflineMinZoom; z <= kOfflineMaxZoom; z++) {
      final x0 = _lonToX(kOfflineWest, z);
      final x1 = _lonToX(kOfflineEast, z);
      final y0 = _latToY(kOfflineNorth, z); // north edge = smaller y
      final y1 = _latToY(kOfflineSouth, z);
      for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) {
          final url = src.urlTemplate
              .replaceAll('{s}', src.subdomain)
              .replaceAll('{z}', '$z')
              .replaceAll('{x}', '$x')
              .replaceAll('{y}', '$y');
          jobs.add(_TileJob(url, tileCacheKey(src.urlTemplate, z, x, y)));
        }
      }
    }
  }
  return jobs;
}

/// State + actions behind Settings → Offline maps.
class OfflineMapService extends ChangeNotifier {
  static const _metaKey = 'agos_offline_maps_meta';
  // OSM's tile usage policy asks for no more than 2 parallel connections.
  static const _workers = 2;

  bool _busy = false;
  bool _cancel = false;
  int _done = 0;
  int _total = 0;
  int _failed = 0;
  String? _message;

  int? _savedTiles;
  int? _savedBytes;
  DateTime? _savedAt;

  bool get isDownloading => _busy;
  int get done => _done;
  int get total => _total;
  double get progress => _total == 0 ? 0 : _done / _total;
  String? get message => _message;

  /// Tiles fetched by the last completed download (null = never downloaded).
  int? get savedTiles => _savedTiles;
  int? get savedBytes => _savedBytes;
  DateTime? get savedAt => _savedAt;
  bool get hasDownload => _savedAt != null;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_metaKey);
      if (raw != null) {
        final m = jsonDecode(raw) as Map<String, dynamic>;
        _savedTiles = (m['tiles'] as num?)?.toInt();
        _savedBytes = (m['bytes'] as num?)?.toInt();
        _savedAt = DateTime.tryParse(m['at'] as String? ?? '');
        notifyListeners();
      }
    } catch (e) {
      debugPrint('AGOS: OfflineMapService load failed: $e');
    }
  }

  Future<void> download() async {
    if (_busy) return;
    // No isOffline pre-check on purpose: ConnectivityService's verdict is a
    // heuristic, and a false "offline" shouldn't be able to refuse a manual
    // download. If the network really is down every tile fails fast and the
    // "Couldn't download any map tiles" message below covers it.

    final jobs = _buildJobs();
    _busy = true;
    _cancel = false;
    _done = 0;
    _failed = 0;
    _total = jobs.length;
    _message = null;
    notifyListeners();

    var ok = 0;
    var bytes = 0;
    var next = 0;

    Future<void> worker() async {
      while (!_cancel) {
        final i = next++;
        if (i >= jobs.length) return;
        final job = jobs[i];
        try {
          final file = await TileCache.manager
              .getSingleFile(job.url, key: job.key, headers: TileCache.headers);
          bytes += await file.length();
          ok++;
        } catch (_) {
          _failed++;
        }
        _done++;
        if (_done % 6 == 0 || _done == _total) notifyListeners();
      }
    }

    await Future.wait(List.generate(_workers, (_) => worker()));

    _busy = false;
    if (_cancel) {
      _message = 'Download cancelled — tiles already saved are kept.';
    } else if (ok == 0) {
      _message = "Couldn't download any map tiles. Check your connection and try again.";
    } else {
      _savedTiles = ok;
      _savedBytes = bytes;
      _savedAt = DateTime.now();
      _message = _failed > 0
          ? 'Saved $ok tiles; $_failed couldn\'t be downloaded. You can run it again to fill the gaps.'
          : null;
      await _persist();
    }
    notifyListeners();
  }

  void cancel() {
    if (_busy) _cancel = true;
  }

  /// Removes every saved tile (offline download + anything cached while
  /// browsing).
  Future<void> deleteAll() async {
    try {
      await TileCache.manager.emptyCache();
    } catch (e) {
      debugPrint('AGOS: OfflineMapService delete failed: $e');
    }
    _savedTiles = null;
    _savedBytes = null;
    _savedAt = null;
    _message = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_metaKey);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _metaKey,
        jsonEncode({
          'tiles': _savedTiles,
          'bytes': _savedBytes,
          'at': _savedAt?.toIso8601String(),
        }),
      );
    } catch (e) {
      debugPrint('AGOS: OfflineMapService persist failed: $e');
    }
  }
}

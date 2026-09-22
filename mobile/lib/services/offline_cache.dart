// offline_cache.dart
//
// A tiny on-disk JSON cache. Every network read that should still work with
// no signal (forecasts, rainfall history, alerts, community reports) writes
// its last good response here, and falls back to it when the network fails.
//
// Files (not SharedPreferences) on purpose: SharedPreferences is loaded into
// memory in one piece at startup, so stuffing 14-day forecasts and report
// lists into it slows down every cold start. One small file per key keeps
// startup cheap and lets us measure/clear the cache from Settings.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// A value plus where it came from — lets a screen say "showing saved data
/// from 3h ago" instead of pretending a cached reading is live.
class Cached<T> {
  final T data;
  final bool fromCache;
  final DateTime? savedAt;
  const Cached(this.data, {this.fromCache = false, this.savedAt});
}

class CacheEntry {
  final dynamic data;
  final DateTime savedAt;
  const CacheEntry(this.data, this.savedAt);
}

class OfflineCache {
  OfflineCache._();

  static Directory? _dir;

  static Future<Directory> _cacheDir() async {
    final existing = _dir;
    if (existing != null) return existing;
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}${Platform.pathSeparator}agos_cache');
    if (!await dir.exists()) await dir.create(recursive: true);
    return _dir = dir;
  }

  // Keys are things like "api:https://host/api/forecast" — not filename-safe
  // and potentially long. Sanitize a readable prefix and append a hash of the
  // full key so two different keys can never share a file.
  static String _fileName(String key) {
    final safe = key.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
    final head = safe.length > 48 ? safe.substring(0, 48) : safe;
    return '${head}_${_fnv1a(key)}.json';
  }

  static String _fnv1a(String s) {
    var h = 0x811c9dc5;
    for (final unit in s.codeUnits) {
      h ^= unit;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    return h.toRadixString(16).padLeft(8, '0');
  }

  /// Saves [data] (anything jsonEncode can handle) under [key].
  /// Never throws — a failed cache write must not break a screen that just
  /// successfully loaded live data.
  static Future<void> writeJson(String key, Object? data) async {
    try {
      final dir = await _cacheDir();
      final file = File('${dir.path}${Platform.pathSeparator}${_fileName(key)}');
      // Write to a temp file, then rename: a crash or a killed app mid-write
      // can't leave a half-written (unparseable) cache file behind.
      // Unique temp name so two overlapping writes to the same key (e.g. a
      // poll and a pull-to-refresh) can't rename each other's file away.
      final tmp = File('${file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp');
      await tmp.writeAsString(
        jsonEncode({'savedAt': DateTime.now().toIso8601String(), 'data': data}),
        flush: true,
      );
      await tmp.rename(file.path);
    } catch (e) {
      debugPrint('AGOS: OfflineCache write failed for "$key": $e');
    }
  }

  /// Returns the saved value + save time, or null if nothing (valid) is cached.
  static Future<CacheEntry?> readJson(String key) async {
    try {
      final dir = await _cacheDir();
      final file = File('${dir.path}${Platform.pathSeparator}${_fileName(key)}');
      if (!await file.exists()) return null;
      final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final savedAt = DateTime.tryParse(decoded['savedAt'] as String? ?? '');
      if (savedAt == null || !decoded.containsKey('data')) return null;
      return CacheEntry(decoded['data'], savedAt);
    } catch (e) {
      debugPrint('AGOS: OfflineCache read failed for "$key": $e');
      return null;
    }
  }

  /// Total size of everything cached, in bytes.
  static Future<int> totalBytes() async {
    try {
      final dir = await _cacheDir();
      var total = 0;
      await for (final entity in dir.list()) {
        if (entity is File) total += await entity.length();
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  /// Deletes every cached response.
  static Future<void> clear() async {
    try {
      final dir = await _cacheDir();
      await for (final entity in dir.list()) {
        if (entity is File) await entity.delete();
      }
    } catch (e) {
      debugPrint('AGOS: OfflineCache clear failed: $e');
    }
  }
}

/// "just now" / "5 min ago" / "3 h ago" / "2 d ago".
String agoLabel(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 45) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} h ago';
  return '${diff.inDays} d ago';
}

/// "812 B" / "34 KB" / "1.2 MB".
String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

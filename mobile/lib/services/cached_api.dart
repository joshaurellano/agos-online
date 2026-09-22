// cached_api.dart
//
// The one way screens load forecast-style JSON so it keeps working offline:
//
//   * Live response  → returned, and saved to disk under [cacheKey].
//   * Request fails  → the last saved response is returned instead
//                      (flagged `fromCache`, with the time it was saved,
//                      so the UI can say "saved 3 h ago" honestly).
//   * Nothing saved  → the original error is rethrown, so each screen's
//                      existing error/empty state still applies.
//
// Two safety rules are deliberate:
//
//   1. It NEVER skips the network just because ConnectivityService thinks
//      we're offline. That flag comes from a heuristic probe, and a
//      false "offline" must not be able to lock someone out of live flood
//      data. While offline it only shortens the timeout, so the fallback
//      to saved data happens in seconds rather than after a 15 s hang.
//
//   2. [maxCacheAge] lets a screen refuse data that's too old to be
//      meaningful (e.g. an hourly forecast from two days ago) — better an
//      honest "unavailable" than a stale reading dressed up as current.
import 'dart:async';
import 'dart:convert';
import 'connectivity_service.dart';
import 'model_api_client.dart';
import 'offline_cache.dart';

// Screens that call fetchJsonCached need the `Cached` result type too.
export 'offline_cache.dart' show Cached;

Future<Cached<Map<String, dynamic>>?> _readSaved(String cacheKey, Duration? maxAge) async {
  final entry = await OfflineCache.readJson(cacheKey);
  if (entry == null || entry.data is! Map) return null;
  if (maxAge != null && DateTime.now().difference(entry.savedAt) > maxAge) return null;
  return Cached<Map<String, dynamic>>(
    Map<String, dynamic>.from(entry.data as Map),
    fromCache: true,
    savedAt: entry.savedAt,
  );
}

/// Returns the saved copy of [cacheKey] without touching the network, or
/// null if there isn't one (or it's older than [maxCacheAge]).
Future<Cached<Map<String, dynamic>>?> readSavedJson(
  String cacheKey, {
  Duration? maxCacheAge,
}) =>
    _readSaved(cacheKey, maxCacheAge);

/// Fetches [url] and keeps a saved copy. See the file header for the
/// fallback behavior.
///
/// If [onSaved] is given and a usable saved copy exists, it's called right
/// away — before the network request finishes — so a screen can paint the
/// last-known data instantly instead of showing a spinner while a slow or
/// dead connection times out. The returned future then completes with live
/// data (or the same saved copy, if the request fails).
Future<Cached<Map<String, dynamic>>> fetchJsonCached(
  String url, {
  required String cacheKey,
  Duration timeout = const Duration(seconds: 15),
  Duration? maxCacheAge,
  void Function(Cached<Map<String, dynamic>> saved)? onSaved,
}) async {
  final saved = await _readSaved(cacheKey, maxCacheAge);
  if (saved != null && onSaved != null) onSaved(saved);

  final effectiveTimeout = ConnectivityService.instance.isOffline
      ? const Duration(seconds: 5)
      : timeout;

  try {
    final res = await getWithFallback(url, timeout: effectiveTimeout);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    unawaited(OfflineCache.writeJson(cacheKey, body));
    return Cached<Map<String, dynamic>>(body, fromCache: false, savedAt: DateTime.now());
  } catch (_) {
    if (saved != null) return saved;
    rethrow;
  }
}

// flood_status_service.dart
//
// Single shared poller for the flood-prediction endpoint (GET /api/predict-flood).
//
// DashboardScreen, FloodMapScreen and anything else that needs the current
// alert level reads from this one service via Provider instead of each
// running its own timer against the same endpoint.
//
// Offline behavior
//   * Every successful response is saved to disk (OfflineCache), so a
//     resident who opens the app with no signal — the exact moment they most
//     need it — still sees the last known alert level instead of a blank
//     screen. `lastUpdated` / `isFromCache` / `isStale` let the UI be honest
//     about how fresh that reading actually is.
//   * A failed poll never blanks the last good reading; it just sets
//     `error`.
//   * It refreshes immediately when connectivity returns, and when the app
//     comes back to the foreground.
//
// Battery / data
//   * The refresh interval is user-configurable (Settings → Data & refresh)
//     and persisted. Polling pauses entirely while the app is in the
//     background — push notifications, not a background timer, are what
//     wake a resident up for a warning.
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter/widgets.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'cached_api.dart';
import 'connectivity_service.dart';
import 'model_api_client.dart';
import 'offline_cache.dart';

String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

/// jsonDecode that returns null (instead of throwing a cast error) when the
/// payload isn't a JSON object.
Map<String, dynamic>? _decodeMap(String source) {
  final decoded = jsonDecode(source);
  return decoded is Map<String, dynamic> ? decoded : null;
}

const _cacheKey = 'flood_status';
const _intervalPrefKey = 'agos_refresh_interval_s';

// Where this service used to keep its cache (SharedPreferences). Read once
// so an existing install doesn't lose its last-known reading on update.
const _legacyCacheKeyJson = 'agos_last_flood_status_json';
const _legacyCacheKeyTime = 'agos_last_flood_status_time';

class FloodStatusService extends ChangeNotifier with WidgetsBindingObserver {
  /// The choices offered in Settings. [Duration.zero] means "manual only".
  static const List<Duration> intervalChoices = [
    Duration(seconds: 30),
    Duration(minutes: 1),
    Duration(minutes: 5),
    Duration.zero,
  ];
  static const Duration defaultInterval = Duration(seconds: 30);

  Map<String, dynamic>? _rawJson;
  DateTime? _lastUpdated;
  bool _loading = true;
  String? _error;
  bool _isFromCache = false;

  Timer? _timer;
  Duration _interval = defaultInterval;
  bool _started = false;
  bool _paused = false;
  bool _disposed = false;
  Future<void>? _inFlight;
  StreamSubscription<void>? _reconnectSub;

  /// The most recent successful /predict-flood response, or the last saved
  /// one if every refresh since app launch has failed. Null only if we've
  /// never once had a successful response (fresh install, no connectivity).
  Map<String, dynamic>? get rawJson => _rawJson;
  DateTime? get lastUpdated => _lastUpdated;
  bool get loading => _loading;
  String? get error => _error;

  /// True until the first real network response of this session arrives.
  bool get isFromCache => _isFromCache;
  bool get isStale =>
      _lastUpdated == null ||
      DateTime.now().difference(_lastUpdated!) > const Duration(minutes: 10);

  Duration get refreshInterval => _interval;
  bool get autoRefresh => _interval > Duration.zero;

  String get _url => _requireEnv('MODEL_API_URL');

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// Starts the shared poller. Call once — main.dart does
  /// `FloodStatusService()..start()`. Later calls are no-ops.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _reconnectSub =
        ConnectivityService.instance.onReconnected.listen((_) => refresh());
    await _loadInterval();
    await _loadFromCache();
    await refresh();
    _restartTimer();
  }

  // ── Refresh interval ──────────────────────────────────────────────────────
  Future<void> _loadInterval() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final secs = prefs.getInt(_intervalPrefKey);
      if (secs != null) {
        final d = Duration(seconds: secs);
        if (intervalChoices.contains(d)) _interval = d;
      }
    } catch (e) {
      debugPrint('AGOS: FloodStatusService could not load refresh interval: $e');
    }
  }

  Future<void> setRefreshInterval(Duration d) async {
    if (!intervalChoices.contains(d) || d == _interval) return;
    _interval = d;
    _notify();
    _restartTimer();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_intervalPrefKey, d.inSeconds);
    } catch (e) {
      debugPrint('AGOS: FloodStatusService could not save refresh interval: $e');
    }
  }

  void _restartTimer() {
    _timer?.cancel();
    _timer = null;
    if (_disposed || !_started || _paused || !autoRefresh) return;
    _timer = Timer.periodic(_interval, (_) => refresh());
  }

  // ── App lifecycle ─────────────────────────────────────────────────────────
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        _paused = true;
        _timer?.cancel();
        _timer = null;
      case AppLifecycleState.resumed:
        if (_paused) {
          _paused = false;
          refresh();
          _restartTimer();
        }
      // `inactive` fires briefly for things like permission dialogs and the
      // notification shade — not worth stopping the poller for.
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  // ── Saved copy ────────────────────────────────────────────────────────────
  Future<void> _loadFromCache() async {
    try {
      final saved = await readSavedJson(_cacheKey);
      if (saved != null) {
        _rawJson = saved.data;
        _lastUpdated = saved.savedAt;
        _isFromCache = true;
      } else {
        await _loadLegacyCache();
      }
      _notify();
    } catch (e) {
      debugPrint('AGOS: FloodStatusService cache load failed: $e');
    }
  }

  Future<void> _loadLegacyCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString(_legacyCacheKeyJson);
      if (jsonStr == null) return;
      final decoded = _decodeMap(jsonStr);
      if (decoded == null) return;
      _rawJson = decoded;
      _isFromCache = true;
      final timeStr = prefs.getString(_legacyCacheKeyTime);
      if (timeStr != null) _lastUpdated = DateTime.tryParse(timeStr);
    } catch (_) {
      // Nothing usable saved by an older version — start fresh.
    }
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  /// Fetches the latest prediction. Screens call this directly for
  /// pull-to-refresh. Safe to call concurrently with the timer — overlapping
  /// calls share one in-flight request.
  Future<void> refresh() {
    final running = _inFlight;
    if (running != null) return running;
    final future = _doRefresh().whenComplete(() => _inFlight = null);
    _inFlight = future;
    return future;
  }

  Future<void> _doRefresh() async {
    var url = '(unresolved)';
    try {
      url = _url;
      final res = await getWithFallback(
        url,
        timeout: ConnectivityService.instance.isOffline
            ? const Duration(seconds: 5)
            : const Duration(seconds: 15),
      );
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final body = _decodeMap(res.body);
      if (body == null) throw const FormatException('Unexpected response shape');
      final now = DateTime.now();
      _buzzIfRaised(_rawJson, body);
      _rawJson = body;
      _lastUpdated = now;
      _loading = false;
      _error = null;
      _isFromCache = false;
      unawaited(OfflineCache.writeJson(_cacheKey, body));
      _notify();
    } catch (e) {
      debugPrint('AGOS: FloodStatusService refresh failed ($url): $e');
      // Deliberately leave _rawJson/_lastUpdated as they were — a failed
      // poll shouldn't blank out the last good reading, just flag the
      // error so the UI can say "couldn't refresh, showing saved data".
      _loading = false;
      _error = e.toString();
      _notify();
    }
  }

  // Haptic cue when the alert level goes UP while the app is open, so a
  // rise is felt even if the person isn't looking at the screen. (Polling
  // only runs in the foreground; background alerts are the push
  // notification's job.)
  static int _rank(Object? level) {
    switch (level?.toString().toUpperCase()) {
      case 'ADVISORY': return 1;
      case 'WARNING':  return 2;
      case 'CRITICAL': return 3;
      default:         return 0;
    }
  }

  void _buzzIfRaised(Map<String, dynamic>? before, Map<String, dynamic> after) {
    if (before == null) return;
    final from = _rank(before['alert_level']);
    final to = _rank(after['alert_level']);
    if (to <= from) return;
    if (to >= 2) {
      HapticFeedback.heavyImpact();
    } else {
      HapticFeedback.mediumImpact();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _reconnectSub?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}

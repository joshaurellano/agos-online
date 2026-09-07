// flood_status_service.dart
//
// Single shared poller for the flood-prediction endpoint (GET /api/predict-flood).
//
// Before this, DashboardScreen and AlertScreen each ran their own independent
// 30-second Timer hitting the same endpoint — double the load on the backend,
// two polling clocks that could drift out of sync with each other, and (in
// AlertScreen's case specifically) a hardcoded URL that had quietly fallen
// out of sync with the current backend while every other screen had moved
// on to reading it from .env. Both screens now read from this one service
// instead, via Provider.
//
// It also persists the last successful response to disk (SharedPreferences),
// so a resident who opens the app with no signal — the exact moment they
// most need it — still sees the last known alert level instead of a blank
// screen, with `lastUpdated`/`isStale` so the UI can be honest about how
// fresh that data actually is.
//
// Requires the shared_preferences package. If it isn't already in
// pubspec.yaml, add:
//   dependencies:
//     shared_preferences: ^2.3.2
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'model_api_client.dart';

String _requireEnv(String key) {
  final v = dotenv.env[key];
  if (v == null || v.isEmpty) {
    throw StateError(
        'Missing "$key" in .env — check the key name and that .env is loaded/bundled.');
  }
  return v;
}

const _cacheKeyJson = 'agos_last_flood_status_json';
const _cacheKeyTime = 'agos_last_flood_status_time';

class FloodStatusService extends ChangeNotifier {
  Map<String, dynamic>? _rawJson;
  DateTime? _lastUpdated;
  bool _loading = true;
  String? _error;
  bool _isFromCache = false;
  Timer? _timer;

  /// The most recent successful /predict-flood response, or the last
  /// cached one if every refresh since app launch has failed. Null only
  /// if we've never once had a successful response (fresh install, no
  /// connectivity yet).
  Map<String, dynamic>? get rawJson => _rawJson;
  DateTime? get lastUpdated => _lastUpdated;
  bool get loading => _loading;
  String? get error => _error;
  // True until the first real network response of this session arrives —
  // screens can use this to show a small "showing saved data" note rather
  // than presenting a cached reading as if it were live.
  bool get isFromCache => _isFromCache;
  bool get isStale =>
      _lastUpdated == null ||
      DateTime.now().difference(_lastUpdated!) > const Duration(minutes: 10);

  String get _url => _requireEnv('MODEL_API_URL');

  /// Starts the shared poller. Call once — e.g. from main.dart's
  /// `ChangeNotifierProvider(create: (_) => FloodStatusService()..start())`.
  /// Safe to call again from elsewhere; later calls are no-ops while a
  /// poll loop is already running.
  Future<void> start() async {
    if (_timer != null) return;
    await _loadFromCache();
    await refresh();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
  }

  Future<void> _loadFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString(_cacheKeyJson);
      final timeStr = prefs.getString(_cacheKeyTime);
      if (jsonStr != null) {
        _rawJson = jsonDecode(jsonStr) as Map<String, dynamic>;
        _isFromCache = true;
      }
      if (timeStr != null) {
        _lastUpdated = DateTime.tryParse(timeStr);
      }
      notifyListeners();
    } catch (e) {
      debugPrint('AGOS: FloodStatusService cache load failed: $e');
    }
  }

  Future<void> _saveToCache(Map<String, dynamic> json, DateTime time) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKeyJson, jsonEncode(json));
      await prefs.setString(_cacheKeyTime, time.toIso8601String());
    } catch (e) {
      debugPrint('AGOS: FloodStatusService cache save failed: $e');
    }
  }

  /// Fetches the latest prediction. Screens can also call this directly
  /// for pull-to-refresh — it's safe to call concurrently with the
  /// background timer.
  Future<void> refresh() async {
    try {
      final res = await getWithFallback(_url);
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final now = DateTime.now();
      _rawJson = body;
      _lastUpdated = now;
      _loading = false;
      _error = null;
      _isFromCache = false;
      await _saveToCache(body, now);
      notifyListeners();
    } catch (e) {
      debugPrint('AGOS: FloodStatusService refresh failed ($_url): $e');
      // Deliberately leave _rawJson/_lastUpdated as they were — a failed
      // poll shouldn't blank out the last good reading, just flag the
      // error so the UI can say "couldn't refresh, showing saved data"
      // instead of going blank.
      _loading = false;
      _error = e.toString();
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

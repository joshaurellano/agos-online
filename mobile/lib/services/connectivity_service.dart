// connectivity_service.dart
//
// Tracks whether the device can actually reach the internet — not just
// whether it's joined to Wi-Fi/cellular. A phone on a dead hotspot, or on
// a cell tower that's fallen over mid-storm, reports "connected" to the OS
// while nothing loads, which is exactly the situation a flood app has to
// handle. So this combines two signals:
//
//   1. connectivity_plus — instant "the radio changed" events (airplane
//      mode, Wi-Fi dropped, etc.).
//   2. A cheap reachability probe (TCP connect, then DNS) whenever that
//      event says we're up, and whenever a real API request fails.
//
// The data layer also feeds it: a successful API call proves we're online;
// a failed one triggers a probe. While offline it re-probes every 15s so
// the app recovers on its own, and fires [onReconnected] so screens can
// refresh and the report outbox can flush.
//
// Deliberately a singleton (`ConnectivityService.instance`) so plain
// static helpers like getWithFallback() can consult it without a
// BuildContext; main.dart also exposes it via Provider for the UI.
import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class ConnectivityService extends ChangeNotifier {
  ConnectivityService._();
  static final ConnectivityService instance = ConnectivityService._();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<dynamic>? _sub;
  Timer? _retryTimer;
  Timer? _justReconnectedTimer;
  final StreamController<void> _reconnected = StreamController<void>.broadcast();

  bool _started = false;
  // Optimistic until proven otherwise: assuming "offline" at launch would
  // make the very first requests skip the network for no reason.
  bool _online = true;
  bool _probing = false;
  bool _justReconnected = false;
  DateTime _lastProbeAt = DateTime.fromMillisecondsSinceEpoch(0);

  bool get isOnline => _online;
  bool get isOffline => !_online;

  /// True for a few seconds right after coming back online, so the UI can
  /// flash a "Back online" confirmation.
  bool get justReconnected => _justReconnected;

  /// Fires once every time we go from offline to online.
  Stream<void> get onReconnected => _reconnected.stream;

  /// Idempotent. Returns quickly (after only the fast interface check) — the
  /// slower reachability probe continues in the background.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    _sub = _connectivity.onConnectivityChanged.listen(_onInterfaceChange);
    final up = await _interfaceUp();
    if (!up) {
      _setOnline(false);
    } else {
      unawaited(checkNow());
    }
  }

  // connectivity_plus v6 reports a List<ConnectivityResult>; older majors
  // report a single value. Handling both keeps this working across an
  // upgrade instead of breaking at compile time.
  bool _anyUp(dynamic result) {
    final list = result is Iterable ? result.toList() : <dynamic>[result];
    return list.any((r) => r != ConnectivityResult.none);
  }

  Future<bool> _interfaceUp() async {
    try {
      final dynamic result = await _connectivity.checkConnectivity();
      return _anyUp(result);
    } catch (_) {
      return true; // can't tell — let the reachability probe decide
    }
  }

  void _onInterfaceChange(dynamic event) {
    if (!_anyUp(event)) {
      _setOnline(false);
    } else {
      checkNow();
    }
  }

  /// Actively checks reachability. Safe to call any time (e.g. a "Retry"
  /// button); concurrent calls collapse into one.
  Future<bool> checkNow() async {
    if (_probing) return _online;
    _probing = true;
    _lastProbeAt = DateTime.now();
    try {
      var up = await _interfaceUp();
      if (up) up = await _reachable();
      _setOnline(up);
      return up;
    } finally {
      _probing = false;
    }
  }

  Future<bool> _reachable() async {
    // Raw TCP first: no DNS involved, so a cached DNS answer can't make a
    // dead connection look alive.
    try {
      final socket = await Socket.connect(
        InternetAddress('1.1.1.1'),
        443,
        timeout: const Duration(seconds: 3),
      );
      socket.destroy();
      return true;
    } catch (_) {}
    // Some networks block direct IP connections but resolve names fine.
    try {
      final r = await InternetAddress.lookup('google.com')
          .timeout(const Duration(seconds: 4));
      return r.isNotEmpty;
    } catch (_) {}
    return false;
  }

  /// Called by the data layer after any successful API response.
  void reportSuccess() => _setOnline(true);

  /// Called by the data layer after a failed API request. Doesn't flip to
  /// offline by itself (the failure may just be the backend), but triggers a
  /// probe to find out — rate-limited so a burst of failures probes once.
  void reportFailure() {
    if (!_online) return;
    if (DateTime.now().difference(_lastProbeAt) < const Duration(seconds: 5)) return;
    unawaited(checkNow());
  }

  void _setOnline(bool value) {
    if (value == _online) return;
    _online = value;
    if (value) {
      _retryTimer?.cancel();
      _retryTimer = null;
      _justReconnected = true;
      _justReconnectedTimer?.cancel();
      _justReconnectedTimer = Timer(const Duration(seconds: 4), () {
        _justReconnected = false;
        notifyListeners();
      });
      _reconnected.add(null);
    } else {
      _justReconnected = false;
      _retryTimer ??= Timer.periodic(const Duration(seconds: 15), (_) => checkNow());
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _retryTimer?.cancel();
    _justReconnectedTimer?.cancel();
    _reconnected.close();
    super.dispose();
  }
}

/// Runs [onReconnect] every time the device comes back online. Screens
/// create one in initState and call [dispose] in their own dispose().
class ReconnectListener {
  ReconnectListener(VoidCallback onReconnect) {
    _sub = ConnectivityService.instance.onReconnected.listen((_) => onReconnect());
  }

  late final StreamSubscription<void> _sub;

  void dispose() => _sub.cancel();
}

/// True when [e] means "couldn't reach the network" (worth queueing and
/// retrying later), as opposed to "the server understood and refused"
/// (a retry won't help, so the person should see the error).
///
/// Matches on the type *name* and message text rather than importing
/// dart:io / package:http types, because Supabase wraps the underlying
/// socket error in its own exception classes (StorageException,
/// AuthRetryableFetchException, ...) whose messages still carry it.
bool isNetworkError(Object e) {
  if (e is TimeoutException) return true;
  final type = e.runtimeType.toString();
  if (type == 'SocketException' ||
      type == 'ClientException' ||
      type == 'HandshakeException' ||
      type == 'TlsException' ||
      type == 'AuthRetryableFetchException') {
    return true;
  }
  final msg = e.toString().toLowerCase();
  return msg.contains('socketexception') ||
      msg.contains('failed host lookup') ||
      msg.contains('network is unreachable') ||
      msg.contains('connection refused') ||
      msg.contains('connection closed') ||
      msg.contains('connection reset') ||
      msg.contains('connection timed out') ||
      msg.contains('software caused connection abort');
}

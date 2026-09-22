// app_settings.dart
//
// User preferences that aren't accessibility (those live in
// accessibility_settings.dart) and aren't data-refresh (that lives on
// FloodStatusService, next to the timer it controls): right now, which push
// notification topics this device wants.
//
// Toggling a topic while offline is safe. The *desired* state is saved
// locally right away; the FCM subscribe/unsubscribe call is retried at
// startup and whenever connectivity returns, until it goes through. The
// last state actually applied to FCM is remembered separately so we never
// re-send a call that's already been made.
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'connectivity_service.dart';
import 'notification_service.dart';

class AppSettings extends ChangeNotifier {
  static const _kFloodAlerts = 'agos_pref_flood_alerts';
  static const _kCommunity = 'agos_pref_community_updates';
  static const _kAppliedFlood = 'agos_applied_flood_alerts';
  static const _kAppliedCommunity = 'agos_applied_community_updates';

  bool _floodAlerts = true;
  bool _communityUpdates = true;
  bool? _appliedFlood;
  bool? _appliedCommunity;

  bool _messagingReady = false;
  bool _syncing = false;
  bool _syncAgain = false;
  StreamSubscription<void>? _reconnectSub;

  bool get floodAlerts => _floodAlerts;
  bool get communityUpdates => _communityUpdates;

  /// True while the saved preference hasn't reached FCM yet (e.g. toggled
  /// while offline) — Settings shows a small "will apply when online" note.
  bool get hasPendingSync =>
      _appliedFlood != _floodAlerts || _appliedCommunity != _communityUpdates;

  // A shared future, not a bool guard: a second caller must wait for the
  // FIRST load to finish, not return instantly while it's still reading
  // prefs. Otherwise markMessagingReady() could sync topics from the
  // defaults before the saved choices were read, and quietly re-subscribe
  // someone who had turned alerts off.
  Future<void>? _loadFuture;
  Future<void> load() => _loadFuture ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _floodAlerts = prefs.getBool(_kFloodAlerts) ?? true;
      _communityUpdates = prefs.getBool(_kCommunity) ?? true;
      _appliedFlood = prefs.getBool(_kAppliedFlood);
      _appliedCommunity = prefs.getBool(_kAppliedCommunity);
      notifyListeners();
    } catch (e) {
      debugPrint('AGOS: AppSettings load failed, using defaults: $e');
    }
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) {
      if (!_messagingReady) return;
      syncNotificationTopics();
      NotificationService.instance.retryTokenRegistration();
    });
  }

  /// Called by the splash screen once Firebase Messaging is initialized —
  /// FCM calls before that would throw. Applies whatever is pending.
  Future<void> markMessagingReady() async {
    _messagingReady = true;
    await syncNotificationTopics();
  }

  Future<void> setFloodAlerts(bool value) async {
    _floodAlerts = value;
    notifyListeners();
    await _save(_kFloodAlerts, value);
    unawaited(syncNotificationTopics());
  }

  Future<void> setCommunityUpdates(bool value) async {
    _communityUpdates = value;
    notifyListeners();
    await _save(_kCommunity, value);
    unawaited(syncNotificationTopics());
  }

  Future<void> _save(String key, bool value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(key, value);
    } catch (e) {
      debugPrint('AGOS: AppSettings could not save $key: $e');
    }
  }

  /// Makes FCM match the saved preferences. Safe to call repeatedly; calls
  /// made while a sync is running are folded into one follow-up pass.
  Future<void> syncNotificationTopics() async {
    if (!_messagingReady) return;
    if (_syncing) {
      _syncAgain = true;
      return;
    }
    _syncing = true;
    try {
      do {
        _syncAgain = false;
        final flood = _floodAlerts;
        if (_appliedFlood != flood) {
          final ok = await NotificationService.instance
              .setTopicSubscribed(NotificationService.topicFloodAlerts, flood);
          if (ok) {
            _appliedFlood = flood;
            await _save(_kAppliedFlood, flood);
          }
        }
        final community = _communityUpdates;
        if (_appliedCommunity != community) {
          final ok = await NotificationService.instance
              .setTopicSubscribed(NotificationService.topicCommunityReports, community);
          if (ok) {
            _appliedCommunity = community;
            await _save(_kAppliedCommunity, community);
          }
        }
        notifyListeners();
      } while (_syncAgain);
    } finally {
      _syncing = false;
    }
  }

  @override
  void dispose() {
    _reconnectSub?.cancel();
    super.dispose();
  }
}

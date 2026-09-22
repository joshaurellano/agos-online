// crash_reporting.dart
//
// Firebase Crashlytics wiring.
//
//   * Collection is OFF in debug builds, so development noise never reaches
//     the dashboard.
//   * People can opt out in Settings → Privacy & support. The choice is
//     remembered and applied at every launch.
//   * Everything is wrapped so a missing/misconfigured Crashlytics can never
//     crash the app itself — worst case, reports just aren't sent.
//
// Android also needs the Crashlytics Gradle plugin for readable native
// stack traces — see docs/RELEASE_CHECKLIST.md.
import 'dart:ui';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CrashReporting {
  CrashReporting._();

  static const _prefKey = 'agos_crash_reports_enabled';
  static bool _enabled = true;

  /// Whether the person has crash reporting switched on (default: yes).
  static bool get enabled => _enabled;

  /// Call once, right after Firebase.initializeApp().
  static Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _enabled = prefs.getBool(_prefKey) ?? true;
      await FirebaseCrashlytics.instance
          .setCrashlyticsCollectionEnabled(!kDebugMode && _enabled);

      // Chain onto the existing handler so errors still print to the
      // console during development.
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        previous?.call(details);
        FirebaseCrashlytics.instance.recordFlutterFatalError(details);
      };

      // Errors from outside the Flutter framework (async code, isolates).
      PlatformDispatcher.instance.onError = (error, stack) {
        if (kDebugMode) debugPrint('Uncaught error: $error\n$stack');
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } catch (e) {
      debugPrint('AGOS: crash reporting unavailable: $e');
    }
  }

  static Future<void> setEnabled(bool value) async {
    _enabled = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, value);
      await FirebaseCrashlytics.instance
          .setCrashlyticsCollectionEnabled(!kDebugMode && value);
    } catch (e) {
      debugPrint('AGOS: could not update crash reporting setting: $e');
    }
  }
}

// theme_settings.dart
//
// Light / dark / follow-the-phone appearance, persisted locally (no account
// needed — same as the other settings). Surfaced in Settings → Display,
// applied app-wide from main.dart.
//
// How a switch takes effect: AppColors (theme/app_theme.dart) is a set of
// getters keyed off one flag. This class flips that flag, then marks every
// element in the tree dirty so each widget re-reads its colors. State
// (scroll positions, the selected tab, typed text) is untouched — it's a
// rebuild, not a restart.
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';

enum AppThemeMode { system, light, dark }

class ThemeSettings extends ChangeNotifier with WidgetsBindingObserver {
  static const _kKey = 'agos_theme_mode';

  ThemeSettings() {
    // So "Match phone" can react when the OS flips to/from dark mode.
    WidgetsBinding.instance.addObserver(this);
  }

  // Dark is the default — it's how AGOS has always looked, and matches the
  // web dashboard's default (frontend/src/hooks/useTheme.jsx).
  AppThemeMode _mode = AppThemeMode.dark;
  AppThemeMode get mode => _mode;

  /// Whether the light palette is currently showing (after resolving
  /// "Match phone" against the OS setting).
  bool get isLight => _resolveLight();

  bool _resolveLight() {
    switch (_mode) {
      case AppThemeMode.light:
        return true;
      case AppThemeMode.dark:
        return false;
      case AppThemeMode.system:
        return WidgetsBinding.instance.platformDispatcher.platformBrightness ==
            Brightness.light;
    }
  }

  /// Reads the saved choice and applies it. Awaited in main() before
  /// runApp, so the first frame already uses the right palette.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_kKey);
      _mode = AppThemeMode.values.firstWhere(
        (m) => m.name == saved,
        orElse: () => AppThemeMode.dark,
      );
    } catch (e) {
      debugPrint('AGOS: could not load theme setting, using dark: $e');
    }
    AppColors.setLight(_resolveLight());
    notifyListeners();
  }

  Future<void> setMode(AppThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    _applyAndRepaint();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kKey, mode.name);
    } catch (e) {
      debugPrint('AGOS: could not save theme setting: $e');
    }
  }

  @override
  void didChangePlatformBrightness() {
    // Only "Match phone" cares what the OS is doing.
    if (_mode == AppThemeMode.system) _applyAndRepaint();
  }

  void _applyAndRepaint() {
    AppColors.setLight(_resolveLight());
    notifyListeners();
    _rebuildEverything();
  }

  /// Marks every element dirty so all widgets — including `const` ones and
  /// tabs that are offstage in the IndexedStack — rebuild and re-read
  /// AppColors. Keeps State objects, so nothing resets.
  static void _rebuildEverything() {
    void run() {
      void visit(Element e) {
        e.markNeedsBuild();
        e.visitChildren(visit);
      }

      WidgetsBinding.instance.rootElement?.visitChildren(visit);
    }

    // markNeedsBuild is not allowed while a frame is mid-build.
    if (SchedulerBinding.instance.schedulerPhase == SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) => run());
    } else {
      run();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}

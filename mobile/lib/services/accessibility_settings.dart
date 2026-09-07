// accessibility_settings.dart
//
// Two settings, both persisted locally (no account needed — matches the
// rest of AGOS being login-free): a text-size multiplier and a
// high-contrast toggle. Surfaced from the device/about sheet in
// main_shell.dart, applied app-wide from main.dart's MaterialApp.builder.
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AccessibilitySettings extends ChangeNotifier {
  static const _kTextScaleKey = 'agos_text_scale';
  static const _kHighContrastKey = 'agos_high_contrast';

  // Kept fairly conservative on purpose: several fixed-size elements in
  // this app (circular icon badges, the hourly-forecast strip's 62px-wide
  // cards, map legend rows) weren't built with very large scale factors
  // in mind. 1.3 gives a real readability boost without the layout
  // breaking as easily as, say, the OS-level max of ~2.0 would. If you
  // want to support the full OS accessibility range, each of those fixed-
  // size widgets needs to be checked individually first.
  static const double minScale = 0.85;
  static const double maxScale = 1.3;

  double _textScale = 1.0;
  bool _highContrast = false;

  double get textScale => _textScale;
  bool get highContrast => _highContrast;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _textScale = (prefs.getDouble(_kTextScaleKey) ?? 1.0).clamp(minScale, maxScale);
      _highContrast = prefs.getBool(_kHighContrastKey) ?? false;
      notifyListeners();
    } catch (e) {
      debugPrint('AGOS: could not load accessibility settings, using defaults: $e');
    }
  }

  Future<void> setTextScale(double value) async {
    _textScale = value.clamp(minScale, maxScale);
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_kTextScaleKey, _textScale);
    } catch (e) {
      debugPrint('AGOS: could not save text scale: $e');
    }
  }

  Future<void> setHighContrast(bool value) async {
    _highContrast = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kHighContrastKey, value);
    } catch (e) {
      debugPrint('AGOS: could not save high-contrast setting: $e');
    }
  }

  // Applied via ColorFiltered around the whole app (see main.dart) rather
  // than by swapping AppColors — AppColors is used as a `const` in
  // dozens of widgets across the app (e.g. `const TextStyle(color:
  // AppColors.textMuted, ...)`), and making it a runtime-swappable value
  // would mean touching every one of those `const` constructors. A global
  // contrast-boost filter is the safe, non-invasive way to get a real
  // improvement today; a fully hand-tuned high-contrast palette is a
  // bigger follow-up if this isn't enough on its own.
  static const double contrastFactor = 1.28;
  static final List<double> highContrastMatrix = [
    contrastFactor, 0, 0, 0, 127.5 * (1 - contrastFactor),
    0, contrastFactor, 0, 0, 127.5 * (1 - contrastFactor),
    0, 0, contrastFactor, 0, 127.5 * (1 - contrastFactor),
    0, 0, 0, 1, 0,
  ];
}

// privacy_consent.dart
//
// Remembers that this person has read and agreed to the privacy notice
// (screens/privacy_notice_screen.dart), and which version of it.
//
// SplashScreen checks this BEFORE it starts Firebase, Supabase or push
// registration, so nothing is sent anywhere until the person has agreed.
//
// Raise [noticeVersion] whenever data/privacy_content.dart changes in a way
// that matters (new kind of data, new outside service, new purpose): everyone
// is then asked again on their next launch.
import 'package:shared_preferences/shared_preferences.dart';

class PrivacyConsent {
  PrivacyConsent._();

  static const int noticeVersion = 1;
  static const _versionKey = 'agos_privacy_consent_version';
  static const _atKey = 'agos_privacy_consent_at';

  /// True once the person agreed to this (or a newer) version of the notice.
  /// If saved preferences can't be read we say "no": asking again is safe,
  /// silently assuming consent is not.
  static Future<bool> isGiven() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return (prefs.getInt(_versionKey) ?? 0) >= noticeVersion;
    } catch (_) {
      return false;
    }
  }

  static Future<void> record() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_versionKey, noticeVersion);
      await prefs.setString(_atKey, DateTime.now().toIso8601String());
    } catch (_) {}
  }

  /// When consent was given, for display. Null if never / unreadable.
  static Future<DateTime?> givenAt() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final s = prefs.getString(_atKey);
      return s == null ? null : DateTime.tryParse(s);
    } catch (_) {
      return null;
    }
  }

  static Future<void> withdraw() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_versionKey);
      await prefs.remove(_atKey);
    } catch (_) {}
  }
}

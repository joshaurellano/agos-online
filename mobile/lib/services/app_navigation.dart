// app_navigation.dart
//
// Lets screens that sit on top of MainShell (Help Center, ...) ask it to
// switch bottom-bar tabs without holding a reference to it. MainShell
// listens to [tabRequest]; see main_shell.dart.
import 'package:flutter/foundation.dart';

class AppNavigation {
  AppNavigation._();

  // Tab positions inside MainShell's IndexedStack (see main_shell.dart).
  static const int tabDashboard = 0;
  static const int tabFloodMap = 1;
  static const int tabRainfall = 2; // reached from the Dashboard shortcut
  static const int tabEvacuation = 3;
  static const int tabReports = 4;

  /// The tab MainShell should show next. Reset to null after it has been
  /// handled, so asking for the same tab twice still fires a change.
  static final ValueNotifier<int?> tabRequest = ValueNotifier<int?>(null);

  static void goToTab(int index) {
    tabRequest.value = null;
    tabRequest.value = index;
  }
}

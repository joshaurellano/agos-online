// app_env.dart
//
// Which environment this build is: "dev" (test Firebase + test Supabase) or
// "prod" (the real thing). It comes from the Android product flavor, i.e.
//   flutter run --flavor dev     ->  dev
//   flutter run --flavor prod    ->  prod
// Android builds now require --flavor (existing build scripts need it added).
// If no flavor is set at all, for example in unit tests, the code falls back
// to prod.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/services.dart' show appFlavor;

import '../firebase_options.dart' as prod;
import '../firebase_options_dev.dart' as dev;

class AppEnvironment {
  AppEnvironment._();

  static bool get isDev => appFlavor == 'dev';
  static bool get isProd => !isDev;

  /// Short label for logs and the on-screen DEV ribbon.
  static String get name => isDev ? 'dev' : 'prod';

  /// Firebase project this build talks to (push notifications, Crashlytics).
  static FirebaseOptions get firebaseOptions => isDev
      ? dev.DefaultFirebaseOptions.currentPlatform
      : prod.DefaultFirebaseOptions.currentPlatform;

  /// Which .env file holds this environment's Supabase URL / key / API URLs.
  /// Prod keeps using the existing ".env" file.
  static String get envFile => isDev ? '.env.dev' : '.env';
}

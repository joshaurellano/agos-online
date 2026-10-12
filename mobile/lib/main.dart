import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'services/accessibility_settings.dart';
import 'services/app_settings.dart';
import 'services/auth_service.dart';
import 'services/connectivity_service.dart';
import 'services/flood_status_service.dart';
import 'services/notification_service.dart' show navigatorKey;
import 'services/pending_reports_service.dart';
import 'services/theme_settings.dart';
import 'services/tile_cache.dart' show OfflineMapService;
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';
import 'screens/main_shell.dart';

// AppColors / AgosTheme moved to theme/app_theme.dart (now with a light
// palette). Re-exported here so every `import '../main.dart'` keeps working.
export 'theme/app_theme.dart' show AppColors, AgosTheme;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  // Start watching the network right away (fire-and-forget: it only needs
  // to be running by the time the first screen asks "am I online?", and it
  // never throws). Everything that reacts to going offline/online —
  // FloodStatusService, the report outbox, push registration, the offline
  // banner — hangs off this one service.
  unawaited(ConnectivityService.instance.start());

  // Light / dark / system preference. Loaded before runApp so the very first
  // frame is already painted in the saved theme (no dark→light flash).
  final themeSettings = ThemeSettings();
  await themeSettings.load();

  // Firebase, .env, Supabase, the anonymous session, and FCM registration
  // all used to be awaited right here, before runApp() — meaning nothing
  // rendered but the OS's static launch image until every one of those
  // finished. That work now happens inside SplashScreen (AgosApp's
  // `home`), which shows real progress while it runs. The providers below
  // are still created up front, but ChangeNotifierProvider is lazy by
  // default: none of them actually construct their service (and touch
  // Supabase/Firebase) until something in MainShell first reads them,
  // which can't happen until SplashScreen has already handed off to it.
  runApp(
    MultiProvider(
      providers: [
        // Light / dark / follow-system — see services/theme_settings.dart.
        // `.value` because it was created (and loaded) above.
        ChangeNotifierProvider<ThemeSettings>.value(value: themeSettings),
        // Kept around for optional profile display (see dashboard's
        // greeting), but no longer gates access to the app — see AgosApp
        // below, whose `home` is SplashScreen -> MainShell unconditionally.
        ChangeNotifierProvider(create: (_) => AuthService()),
        // Single shared poller for /predict-flood — DashboardScreen and
        // AlertScreen both read from this instead of each running their
        // own independent timer against the same endpoint.
        ChangeNotifierProvider(create: (_) => FloodStatusService()..start()),
        // Text size + high contrast — loaded async (SharedPreferences),
        // defaults (scale 1.0, contrast off) apply instantly so there's
        // no blank/loading frame at startup.
        ChangeNotifierProvider(create: (_) => AccessibilitySettings()..load()),
        // Online/offline state — a singleton (so plain static helpers like
        // getWithFallback can report into it without a BuildContext),
        // exposed here so widgets can rebuild when it changes. `.value`
        // because the provider must not dispose a singleton.
        ChangeNotifierProvider<ConnectivityService>.value(
          value: ConnectivityService.instance,
        ),
        // Notification preferences (flood alerts / community updates) and
        // their offline-safe sync to FCM — see services/app_settings.dart.
        ChangeNotifierProvider(create: (_) => AppSettings()..load()),
        // Reports written while offline, waiting to be sent — see
        // services/pending_reports_service.dart. init() loads the saved
        // queue from disk.
        ChangeNotifierProvider(create: (_) => PendingReportsService()..init()),
        // Offline map download state (Settings → Offline map).
        ChangeNotifierProvider(create: (_) => OfflineMapService()..load()),
      ],
      child: const AgosApp(),
    ),
  );
}

class AgosApp extends StatelessWidget {
  const AgosApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Rebuilds MaterialApp when the theme mode changes (AgosTheme.build()
    // reads AppColors' current light/dark flag).
    context.watch<ThemeSettings>();
    return MaterialApp(
      title: 'AGOS',
      debugShowCheckedModeBanner: false,

      // Required so NotificationService can navigate to /alert
      // from a background or terminated state without a BuildContext.
      navigatorKey: navigatorKey,

      theme: AgosTheme.build(),
      routes: {
        // NotificationService pushes this route when the user taps a notification.
        // MainShell handles showing the Alert tab — see note below if you need
        // to deep-link to a specific tab index.
        '/alert': (_) => const MainShell(openAlertsOnStart: true),
        // Tapped from a "your report was verified" / community-report push —
        // opens straight into the Reports tab (index 4, see main_shell.dart).
        '/community-reports': (_) => const MainShell(initialTabIndex: 4),
      },
      // Applies the text-size + high-contrast accessibility settings
      // (see services/accessibility_settings.dart) to every screen,
      // regardless of which one is currently showing.
      builder: (context, child) {
        final safeChild = child ?? const SizedBox.shrink();
        return Consumer<AccessibilitySettings>(
          builder: (context, a11y, _) {
            Widget wrapped = MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(a11y.textScale),
              ),
              child: safeChild,
            );
            if (a11y.highContrast) {
              wrapped = ColorFiltered(
                colorFilter: ColorFilter.matrix(AccessibilitySettings.highContrastMatrix),
                child: wrapped,
              );
            }
            // Status/navigation bar icon colors follow the theme.
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: AppColors.systemOverlay,
              child: wrapped,
            );
          },
        );
      },
      // Splash screen runs the app's startup sequence (Firebase, .env,
      // Supabase, anonymous session, FCM) and hands off to MainShell —
      // see screens/splash_screen.dart. AGOS still has no login gate;
      // the splash is purely a "getting things ready" step.
      home: const SplashScreen(),
    );
  }
}

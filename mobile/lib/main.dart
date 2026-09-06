import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_core/firebase_core.dart';

import './firebase_options.dart';
import 'services/auth_service.dart';
import 'services/flood_status_service.dart';
import 'services/notification_service.dart';
import 'screens/main_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  await dotenv.load(fileName: '.env');

  await Supabase.initialize(
    url:     dotenv.env['SUPABASE_URL']      ?? '',
    anonKey: dotenv.env['SUPABASE_ANON_KEY'] ?? '',
  );

  // AGOS has no login screen — all flood/rainfall/map/evacuation data is
  // public. The one thing that still needs *some* identity behind it is
  // incident reporting (RLS on `incident_reports`/`incident-photos` keys
  // off auth.uid()), so every device silently gets a Supabase anonymous
  // session instead of a visible sign-in flow. supabase_flutter persists
  // this session locally, so a given device keeps the same identity (and
  // can see its own past reports) across restarts without ever seeing a
  // login form.
  //
  // Requires "Allow anonymous sign-ins" to be turned on in the Supabase
  // project's Auth settings. If it's off (or the call fails for any other
  // reason), we don't block startup — the resident still gets the full
  // public dashboard; only submitting a report would fail until this is
  // enabled server-side.
  if (Supabase.instance.client.auth.currentUser == null) {
    try {
      await Supabase.instance.client.auth.signInAnonymously();
    } catch (e) {
      debugPrint('AGOS: anonymous sign-in failed (is it enabled in Supabase Auth settings?): $e');
    }
  }

  // Initialize FCM — registers token, sets up background handler,
  // and subscribes to the flood_alerts topic.
  await NotificationService.instance.initialize();
  await NotificationService.instance.subscribeToAlerts();

  runApp(
    MultiProvider(
      providers: [
        // Kept around for optional profile display (see dashboard's
        // greeting), but no longer gates access to the app — see AgosApp
        // below, whose `home` is MainShell unconditionally.
        ChangeNotifierProvider(create: (_) => AuthService()),
        // Single shared poller for /predict-flood — DashboardScreen and
        // AlertScreen both read from this instead of each running their
        // own independent timer against the same endpoint. Starts once,
        // here, so it's already running (and loading any cached last-known
        // reading) before either screen even mounts.
        ChangeNotifierProvider(create: (_) => FloodStatusService()..start()),
      ],
      child: const AgosApp(),
    ),
  );
}

class AgosApp extends StatelessWidget {
  const AgosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AGOS',
      debugShowCheckedModeBanner: false,

      // Required so NotificationService can navigate to /alert
      // from a background or terminated state without a BuildContext.
      navigatorKey: navigatorKey,

      theme: ThemeData(
        scaffoldBackgroundColor: AppColors.bgDeep,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.accent,
          surface: AppColors.bgCard,
        ),
        useMaterial3: true,
      ),
      routes: {
        // NotificationService pushes this route when the user taps a notification.
        // MainShell handles showing the Alert tab — see note below if you need
        // to deep-link to a specific tab index.
        '/alert': (_) => const MainShell(openAlertsOnStart: true),
        // Tapped from a "your report was verified" / community-report push —
        // opens straight into the Reports tab (index 4, see main_shell.dart).
        '/community-reports': (_) => const MainShell(initialTabIndex: 4),
      },
      // No login gate — AGOS's data is public. Straight into the app.
      home: const MainShell(),
    );
  }
}

class AppColors {
  static const bgDeep    = Color(0xFF091729);
  static const bgDark    = Color(0xFF0D1F3C);
  static const bgMid     = Color(0xFF112240);
  static const bgCard    = Color(0xFF0F1E38);
  static const bgBorder  = Color(0xFF1E3A5F);
  static const accent    = Color(0xFF38BDF8);
  static const green     = Color(0xFF22C55E);
  static const yellow    = Color(0xFFEAB308);
  static const orange    = Color(0xFFF97316);
  static const red       = Color(0xFFEF4444);
  static const textPri   = Color(0xFFE2EAF5);
  static const textSec   = Color(0xFF8DA4BE);
  static const textMuted = Color(0xFF4A6080);
}
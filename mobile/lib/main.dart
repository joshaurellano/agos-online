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
import 'screens/login_screen.dart';
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

  // Initialize FCM — registers token, sets up background handler,
  // and subscribes to the flood_alerts topic. Works even before login.
  await NotificationService.instance.initialize();
  await NotificationService.instance.subscribeToAlerts();

  runApp(
    MultiProvider(
      providers: [
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
      home: Consumer<AuthService>(
        builder: (_, auth, __) {
          if (auth.isLoading) {
            return const Scaffold(
              backgroundColor: AppColors.bgDeep,
              body: Center(
                child: CircularProgressIndicator(color: AppColors.accent),
              ),
            );
          }
          return auth.currentUser != null
              ? const MainShell()
              : const LoginScreen();
        },
      ),
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
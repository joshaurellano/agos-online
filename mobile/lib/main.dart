import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_fonts/google_fonts.dart';

import './firebase_options.dart';
import 'services/accessibility_settings.dart';
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
        // Text size + high contrast — loaded async (SharedPreferences),
        // defaults (scale 1.0, contrast off) apply instantly so there's
        // no blank/loading frame at startup.
        ChangeNotifierProvider(create: (_) => AccessibilitySettings()..load()),
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
            return wrapped;
          },
        );
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
  // A touch lighter than bgCard — for layering a second surface on top of
  // a card (nested rows, inputs) so depth reads without a harsh border.
  static const bgCard2   = Color(0xFF15274A);
  static const bgBorder  = Color(0xFF1E3A5F);
  static const accent    = Color(0xFF38BDF8);
  // Deeper companion to accent, used as the second stop in accent
  // gradients (buttons, active nav pill, hero glows) so flat accent
  // fills gain a bit of dimension instead of looking like a solid chip.
  static const accentDeep = Color(0xFF0EA5E9);
  static const violet    = Color(0xFF818CF8);
  static const green     = Color(0xFF22C55E);
  static const yellow    = Color(0xFFEAB308);
  static const orange    = Color(0xFFF97316);
  static const red       = Color(0xFFEF4444);
  static const textPri   = Color(0xFFE2EAF5);
  static const textSec   = Color(0xFF8DA4BE);
  static const textMuted = Color(0xFF4A6080);

  /// Two-stop gradient used for primary accents (buttons, active pills,
  /// selected nav indicator) — gives flat accent fills a bit of depth.
  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accent, accentDeep],
  );

  /// Subtle diagonal sheen laid over cards to break up otherwise flat
  /// bgCard fills — kept faint enough to read as "glass" rather than a
  /// visible stripe.
  static const cardSheen = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [bgCard2, bgCard],
  );
}

/// Centralizes AGOS's ThemeData so the look of every screen — typography,
/// default splash/highlight behavior, slider/switch colors, page
/// transitions — comes from one place instead of being re-declared
/// per-widget. Screens still hand-roll most of their own containers
/// (this app predates a Card/Surface-based layout system), but anything
/// that *does* read from Theme.of(context) (Text widgets without an
/// explicit fontFamily, Switch, Slider, TextField cursors, etc.) now
/// picks up a consistent, more considered look for free.
class AgosTheme {
  static ThemeData build() {
    final base = ThemeData.dark(useMaterial3: true);
    // Plus Jakarta Sans reads as friendly-but-technical — geometric enough
    // for the big data-forward numbers (flood %, rainfall mm) while still
    // warm in body copy. Falls back to the platform default automatically
    // if the font can't be fetched (e.g. offline first launch), since
    // google_fonts degrades gracefully.
    final textTheme = GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(
      bodyColor: AppColors.textPri,
      displayColor: AppColors.textPri,
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bgDeep,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.accent,
        secondary: AppColors.violet,
        surface: AppColors.bgCard,
        error: AppColors.red,
      ),
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      highlightColor: AppColors.accent.withValues(alpha: 0.06),
      splashColor: AppColors.accent.withValues(alpha: 0.10),
      dividerColor: AppColors.bgBorder,
      dividerTheme: const DividerThemeData(color: AppColors.bgBorder, thickness: 1),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? AppColors.accent : AppColors.textMuted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.accent.withValues(alpha: 0.35)
              : AppColors.bgBorder,
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: AppColors.accent,
        inactiveTrackColor: AppColors.bgBorder,
        thumbColor: AppColors.accent,
        overlayColor: AppColors.accent.withValues(alpha: 0.15),
        trackHeight: 3,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
        circularTrackColor: AppColors.bgBorder,
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: AppColors.accent,
        selectionColor: AppColors.accent.withValues(alpha: 0.3),
        selectionHandleColor: AppColors.accent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.bgCard2,
        contentTextStyle: const TextStyle(color: AppColors.textPri, fontSize: 13.5),
        actionTextColor: AppColors.accent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
      // A gentle fade+scale instead of Android's default abrupt slide,
      // matching the softer, weather-app feel of the rest of the UI.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: _FadeThroughTransitionsBuilder(),
          TargetPlatform.iOS: _FadeThroughTransitionsBuilder(),
        },
      ),
    );
  }
}

class _FadeThroughTransitionsBuilder extends PageTransitionsBuilder {
  const _FadeThroughTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return FadeTransition(
      opacity: curved,
      child: ScaleTransition(
        scale: Tween(begin: 0.98, end: 1.0).animate(curved),
        child: child,
      ),
    );
  }
}
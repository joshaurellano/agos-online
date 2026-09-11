// splash_screen.dart
//
// AGOS's cold-start screen. Previously all of the app's async setup
// (Firebase, .env, Supabase, anonymous sign-in, FCM registration) ran
// inside main() *before* runApp() — so the person just stared at the OS's
// static launch image with no feedback until everything finished. This
// screen instead becomes the first thing Flutter renders, runs that same
// setup itself (see _bootstrap/_runInit below), and shows real progress
// (a status line that updates per step) plus a themed animation — a
// sonar/radar ping around the AGOS mark, which doubles as a nod to the
// flood-monitoring/radar framing used elsewhere in the app (see
// MapToolStack, PanahonHeader) — while it works. Once setup finishes it
// fades into MainShell.
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_core/firebase_core.dart';

import '../firebase_options.dart';
import '../main.dart';
import '../services/notification_service.dart';
import 'main_shell.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  // One-shot entrance: mark scales/fades in, then the wordmark and status
  // line follow half a beat behind it.
  late final AnimationController _intro;
  late final Animation<double> _markScale;
  late final Animation<double> _markFade;
  late final Animation<double> _textFade;
  late final Animation<Offset> _textSlide;

  // Continuous loop for as long as we're on screen: the outward radar
  // pings and the three status dots.
  late final AnimationController _loop;

  String _status = 'Starting up…';
  bool _failed = false;

  @override
  void initState() {
    super.initState();

    _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();
    _markScale = Tween(begin: 0.72, end: 1.0).animate(
      CurvedAnimation(parent: _intro, curve: const Interval(0.0, 0.65, curve: Curves.easeOutBack)),
    );
    _markFade = CurvedAnimation(parent: _intro, curve: const Interval(0.0, 0.45, curve: Curves.easeOut));
    _textFade = CurvedAnimation(parent: _intro, curve: const Interval(0.35, 0.85, curve: Curves.easeOut));
    _textSlide = Tween(begin: const Offset(0, 0.35), end: Offset.zero).animate(
      CurvedAnimation(parent: _intro, curve: const Interval(0.35, 0.85, curve: Curves.easeOutCubic)),
    );

    _loop = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600))..repeat();

    _bootstrap();
  }

  @override
  void dispose() {
    _intro.dispose();
    _loop.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    // Real work and a floor on how long the splash stays up race against
    // each other via Future.wait — on a fast connection the animation
    // still gets its ~1.6s to actually be seen instead of flashing by;
    // on a slow one, we simply wait for setup to genuinely finish.
    final minDisplay = Future.delayed(const Duration(milliseconds: 1600));
    await Future.wait([_runInit(), minDisplay]);
    if (!mounted) return;

    // If a notification tap already navigated us away mid-init (see
    // NotificationService._routeForType, which can fire from inside
    // NotificationService.initialize() below for a terminated-state
    // launch), don't also push MainShell — that would leave a redundant
    // copy of it under the alert screen.
    final stillOnSplash = ModalRoute.of(context)?.isCurrent ?? true;
    if (!stillOnSplash) return;

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 550),
        pageBuilder: (_, __, ___) => const MainShell(),
        transitionsBuilder: (_, anim, __, child) => FadeTransition(
          opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
          child: child,
        ),
      ),
    );
  }

  Future<void> _runInit() async {
    try {
      _setStatus('Connecting to Firebase…');
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

      _setStatus('Loading configuration…');
      await dotenv.load(fileName: '.env');

      _setStatus('Connecting to AGOS…');
      await Supabase.initialize(
        url:     dotenv.env['SUPABASE_URL']      ?? '',
        anonKey: dotenv.env['SUPABASE_ANON_KEY'] ?? '',
      );

      // Silent anonymous session — see main.dart's original comment.
      // AGOS has no visible login; this just gives incident reports
      // something to key off.
      if (Supabase.instance.client.auth.currentUser == null) {
        try {
          await Supabase.instance.client.auth.signInAnonymously();
        } catch (e) {
          debugPrint('AGOS: anonymous sign-in failed (is it enabled in Supabase Auth settings?): $e');
        }
      }

      _setStatus('Setting up alerts…');
      await NotificationService.instance.initialize();
      await NotificationService.instance.subscribeToAlerts();

      _setStatus('Ready');
    } catch (e) {
      // Don't strand the person on the splash screen forever if one step
      // throws (e.g. no network on first launch) — log it, show a
      // friendlier line for the last moment they'll see this screen, and
      // still continue into the app; individual screens already handle
      // their own data-loading failures.
      debugPrint('AGOS: startup init error: $e');
      if (mounted) setState(() => _failed = true);
      _setStatus('Continuing offline…');
    }
  }

  void _setStatus(String s) {
    if (mounted) setState(() => _status = s);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.bgDeep, AppColors.bgDark, AppColors.bgMid],
              ),
            ),
          ),
          // Faint drifting glow, echoing WeatherBackdrop's ambient layer so
          // the very first frame already feels like the same app.
          Positioned(
            right: -80, top: -60,
            child: _staticGlow(240, AppColors.accent.withValues(alpha: 0.10)),
          ),
          Positioned(
            left: -70, bottom: -50,
            child: _staticGlow(200, AppColors.violet.withValues(alpha: 0.07)),
          ),

          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 168, height: 168,
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_intro, _loop]),
                    builder: (context, _) => Stack(
                      alignment: Alignment.center,
                      children: [
                        // Outward-expanding radar pings, staggered 3-way.
                        CustomPaint(
                          size: const Size.square(168),
                          painter: _RadarPingPainter(
                            t: _loop.value,
                            color: AppColors.accent,
                            fade: _markFade.value,
                          ),
                        ),
                        FadeTransition(
                          opacity: _markFade,
                          child: ScaleTransition(
                            scale: _markScale,
                            child: Container(
                              width: 84, height: 84,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    AppColors.accent.withValues(alpha: 0.32),
                                    AppColors.accent.withValues(alpha: 0.10),
                                  ],
                                ),
                                border: Border.all(color: AppColors.accent.withValues(alpha: 0.5), width: 1.5),
                                boxShadow: [
                                  BoxShadow(color: AppColors.accent.withValues(alpha: 0.28), blurRadius: 28, spreadRadius: -2),
                                ],
                              ),
                              child: const Center(
                                child: Text('🌊', style: TextStyle(fontSize: 36)),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 22),
                FadeTransition(
                  opacity: _textFade,
                  child: SlideTransition(
                    position: _textSlide,
                    child: Column(
                      children: [
                        ShaderMask(
                          shaderCallback: (bounds) => const LinearGradient(
                            colors: [Colors.white, AppColors.accent],
                          ).createShader(bounds),
                          child: const Text(
                            'AGOS',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: 34,
                              letterSpacing: 2,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'FLOOD EARLY WARNING SYSTEM',
                          style: TextStyle(
                            color: AppColors.textSec.withValues(alpha: 0.9),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 2.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Status line + progress dots, pinned near the bottom so they
          // read like a loading footer rather than competing with the mark.
          Positioned(
            left: 0, right: 0,
            bottom: 64,
            child: FadeTransition(
              opacity: _textFade,
              child: Column(
                children: [
                  _LoadingDots(animation: _loop, color: _failed ? AppColors.orange : AppColors.accent),
                  const SizedBox(height: 14),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: Text(
                      _status,
                      key: ValueKey(_status),
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _staticGlow(double size, Color color) => Container(
        width: size, height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      );
}

/// Three concentric rings that expand outward from the AGOS mark and fade
/// as they grow, looping continuously — a sonar/radar "scanning" motif
/// that ties the splash to the app's flood-radar framing rather than
/// using a generic spinner.
class _RadarPingPainter extends CustomPainter {
  final double t; // 0..1, loops
  final Color color;
  final double fade; // overall entrance opacity multiplier

  _RadarPingPainter({required this.t, required this.color, required this.fade});

  @override
  void paint(Canvas canvas, Size size) {
    if (fade <= 0) return;
    final center = size.center(Offset.zero);
    final maxRadius = size.width / 2;
    const ringCount = 3;
    for (int i = 0; i < ringCount; i++) {
      final phase = (t + i / ringCount) % 1.0;
      final radius = maxRadius * (0.42 + 0.58 * phase);
      final opacity = (1 - phase) * 0.45 * fade;
      if (opacity <= 0.01) continue;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = color.withValues(alpha: opacity);
      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPingPainter old) =>
      old.t != t || old.color != color || old.fade != fade;
}

/// Three dots that pulse in sequence, driven off the same looping
/// controller as the radar pings so nothing needs its own timer.
class _LoadingDots extends StatelessWidget {
  final Animation<double> animation;
  final Color color;
  const _LoadingDots({required this.animation, required this.color});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            double dist = (animation.value * 3 - i) % 3.0;
            if (dist > 1.0) dist = 1.0;
            final pulse = 1.0 - dist; // 1 at peak, 0 while idle
            final scale = 0.6 + 0.5 * pulse;
            final opacity = 0.35 + 0.65 * pulse;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Transform.scale(
                scale: scale,
                child: Container(
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withValues(alpha: opacity),
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

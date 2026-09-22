// onboarding_screen.dart
//
// Shown once, on first launch (after the splash). Three short pages: what
// AGOS does, what the four alert levels mean, and — last — the request for
// notification permission, at the moment the person can see why it matters.
//
// Location permission is intentionally NOT asked here. It's requested in
// context instead (when someone taps for walking directions or attaches
// their location to a report), where the reason is obvious.
//
// "Seen" state is a single SharedPreferences flag. Existing installs that
// update to this version will see it once.
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/notification_service.dart';
import 'main_shell.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  static const _prefKey = 'agos_onboarding_v1_done';

  static Future<bool> isDone() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_prefKey) ?? false;
    } catch (_) {
      // If prefs can't be read, don't trap someone in onboarding.
      return true;
    }
  }

  static Future<void> markDone() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, true);
    } catch (_) {}
  }

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;
  bool _busy = false;

  static const _lastPage = 2;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    _controller.nextPage(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _finish({required bool askForAlerts}) async {
    if (_busy) return;
    setState(() => _busy = true);
    if (askForAlerts) {
      // Whatever they answer, they continue into the app; Settings →
      // Notifications shows the state and lets them change their mind.
      await NotificationService.instance.requestPermission();
    }
    await OnboardingScreen.markDone();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 450),
        pageBuilder: (_, __, ___) => const MainShell(),
        transitionsBuilder: (_, anim, __, child) => FadeTransition(
          opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
          child: child,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _lastPage;
    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.bgDeep, AppColors.bgDark, AppColors.bgMid],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Skip (hidden on the last page, which has its own choices)
              SizedBox(
                height: 48,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: isLast
                      ? null
                      : TextButton(
                          onPressed: _busy ? null : () => _finish(askForAlerts: false),
                          child: const Text('Skip', style: TextStyle(color: AppColors.textSec)),
                        ),
                ),
              ),
              Expanded(
                child: PageView(
                  controller: _controller,
                  onPageChanged: (i) => setState(() => _page = i),
                  children: const [
                    _IntroPage(),
                    _LevelsPage(),
                    _AlertsPage(),
                  ],
                ),
              ),
              // Page dots
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i <= _lastPage; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: i == _page ? 22 : 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: i == _page ? AppColors.accent : AppColors.bgBorder,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
                child: isLast
                    ? Column(children: [
                        _PrimaryButton(
                          label: 'Turn on alerts',
                          busy: _busy,
                          onPressed: () => _finish(askForAlerts: true),
                        ),
                        TextButton(
                          onPressed: _busy ? null : () => _finish(askForAlerts: false),
                          child: const Text('Maybe later', style: TextStyle(color: AppColors.textSec)),
                        ),
                      ])
                    : _PrimaryButton(label: 'Next', onPressed: _next),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Pages ─────────────────────────────────────────────────────────────────────
class _PageFrame extends StatelessWidget {
  final Widget hero;
  final String title;
  final String body;
  final Widget? extra;
  const _PageFrame({required this.hero, required this.title, required this.body, this.extra});

  @override
  Widget build(BuildContext context) {
    // Scrollable so large text sizes and short screens can't overflow.
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        children: [
          const SizedBox(height: 12),
          hero,
          const SizedBox(height: 28),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: AppColors.textPri, fontSize: 24, fontWeight: FontWeight.w800, height: 1.2)),
          const SizedBox(height: 12),
          Text(body,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSec, fontSize: 14.5, height: 1.5)),
          if (extra != null) ...[const SizedBox(height: 22), extra!],
        ],
      ),
    );
  }
}

class _IntroPage extends StatelessWidget {
  const _IntroPage();

  @override
  Widget build(BuildContext context) => _PageFrame(
        hero: Image.asset('lib/assets/agos_icon.png', width: 150, height: 150),
        title: 'Know before the water rises',
        body: 'AGOS watches rainfall and weather for Barangay Triangulo and predicts '
            'flood risk, so you have time to act.',
      );
}

class _LevelsPage extends StatelessWidget {
  const _LevelsPage();

  @override
  Widget build(BuildContext context) => _PageFrame(
        hero: Container(
          width: 96,
          height: 96,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.accent.withValues(alpha: 0.12),
            border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
          ),
          child: const Icon(Icons.speed_rounded, color: AppColors.accent, size: 44),
        ),
        title: 'Four levels, one glance',
        body: 'The color and icon always tell you how serious it is.',
        extra: const Column(children: [
          _LevelChip(AlertLevelType.normal, 'No significant risk'),
          _LevelChip(AlertLevelType.advisory, 'Minor flooding possible'),
          _LevelChip(AlertLevelType.warning, 'Get ready to evacuate'),
          _LevelChip(AlertLevelType.critical, 'Evacuate now'),
        ]),
      );
}

class _LevelChip extends StatelessWidget {
  final AlertLevelType type;
  final String text;
  const _LevelChip(this.type, this.text);

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: type.color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: type.color.withValues(alpha: 0.35)),
        ),
        child: Row(children: [
          Icon(type.icon, color: type.color, size: 20),
          const SizedBox(width: 12),
          Text(type.label,
              style: TextStyle(color: type.color, fontSize: 14, fontWeight: FontWeight.w800)),
          const Spacer(),
          Flexible(
            child: Text(text,
                textAlign: TextAlign.right,
                style: const TextStyle(color: AppColors.textSec, fontSize: 12.5)),
          ),
        ]),
      );
}

class _AlertsPage extends StatelessWidget {
  const _AlertsPage();

  @override
  Widget build(BuildContext context) => _PageFrame(
        hero: Container(
          width: 96,
          height: 96,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.orange.withValues(alpha: 0.12),
            border: Border.all(color: AppColors.orange.withValues(alpha: 0.35)),
          ),
          child: const Icon(Icons.notifications_active_rounded, color: AppColors.orange, size: 44),
        ),
        title: "Alerts you won't miss",
        body: 'Turn on notifications so AGOS can warn you the moment flood risk rises — '
            'even when the app is closed.',
        extra: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _Point(Icons.directions_run_rounded, 'Find the nearest evacuation center and a walking route.'),
          _Point(Icons.cloud_off_rounded, 'Works offline with the last information saved on your phone.'),
          _Point(Icons.location_on_outlined,
              'Location is only used if you ask for directions or add it to a report.'),
        ]),
      );
}

class _Point extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Point(this.icon, this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: AppColors.accent, size: 19),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text,
                style: const TextStyle(color: AppColors.textSec, fontSize: 13, height: 1.4)),
          ),
        ]),
      );
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;
  final bool busy;
  const _PrimaryButton({required this.label, required this.onPressed, this.busy = false});

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 50,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: AppColors.accentGradient,
            borderRadius: BorderRadius.circular(14),
          ),
          child: TextButton(
            onPressed: busy ? null : onPressed,
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ),
        ),
      );
}

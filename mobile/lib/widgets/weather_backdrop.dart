// weather_backdrop.dart
//
// Base "mood" layer for the dashboard, meant to sit *beneath*
// RainOverlay (see rain_overlay.dart) in a Stack. RainOverlay is great at
// active weather (rain, fog, overcast clouds) but by design draws nothing
// for a plain clear/sunny/fair sky (see resolveIntensity()'s 'none' tier)
// — which is the common case on this dashboard. This widget's job is
// just to make sure the background always reads as "this weather" even
// then: a slow condition-tinted gradient, a soft pulsing sun glow on
// clear days, and a sprinkle of twinkling stars at night. It never draws
// rain/fog/clouds itself — that's RainOverlay's job — so the two layers
// don't compete.

import 'dart:math' as math;
import 'package:flutter/material.dart';

class WeatherBackdrop extends StatefulWidget {
  final String? condition;
  final bool isNight;

  const WeatherBackdrop({super.key, required this.condition, this.isNight = false});

  @override
  State<WeatherBackdrop> createState() => _WeatherBackdropState();
}

class _WeatherBackdropState extends State<WeatherBackdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 20))
      ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<Color> _gradient() {
    if (widget.isNight) {
      return const [Color(0xFF060B18), Color(0xFF0B1730), Color(0xFF0F2044)];
    }
    final c = (widget.condition ?? '').toLowerCase();
    if (RegExp(r'(thunder|storm|squall)').hasMatch(c)) {
      return const [Color(0xFF05070D), Color(0xFF0A0F1C), Color(0xFF10162A)];
    }
    if (RegExp(r'(rain|drizzle|shower)').hasMatch(c)) {
      return const [Color(0xFF071018), Color(0xFF0D1D2E), Color(0xFF13293D)];
    }
    if (c.contains('fog') || c.contains('haze')) {
      return const [Color(0xFF10161F), Color(0xFF1B222D), Color(0xFF262E3A)];
    }
    if (c.contains('overcast') || c.contains('cloud')) {
      return const [Color(0xFF0A1424), Color(0xFF16263D), Color(0xFF223452)];
    }
    // Clear / sunny / fair / unknown — the majority case.
    return const [Color(0xFF0A1B3D), Color(0xFF12305E), Color(0xFF1E4A7A)];
  }

  @override
  Widget build(BuildContext context) {
    final c = (widget.condition ?? '').toLowerCase();
    final isClear = !widget.isNight &&
        !RegExp(r'(rain|cloud|fog|haze|overcast|storm|drizzle|shower)').hasMatch(c);

    return Stack(
      children: [
        // Eases over 2s on a condition change (rather than cutting
        // instantly) so a ~30s poll-driven update doesn't flash.
        AnimatedContainer(
          duration: const Duration(seconds: 2),
          curve: Curves.easeInOut,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: _gradient(),
            ),
          ),
        ),
        if (widget.isNight || isClear)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => CustomPaint(
                  painter: _AmbientPainter(t: _controller.value, isNight: widget.isNight),
                  size: Size.infinite,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _AmbientPainter extends CustomPainter {
  final double t; // 0..1, loops every 20s
  final bool isNight;

  _AmbientPainter({required this.t, required this.isNight});

  @override
  void paint(Canvas canvas, Size size) {
    if (isNight) {
      _paintStars(canvas, size);
    } else {
      _paintSunGlow(canvas, size);
    }
  }

  void _paintSunGlow(Canvas canvas, Size size) {
    final center = Offset(size.width * 0.82, size.height * 0.1);
    final pulse = 0.85 + 0.15 * math.sin(t * 2 * math.pi);
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          Colors.amber.withValues(alpha: 0.16 * pulse),
          Colors.amber.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: 150));
    canvas.drawCircle(center, 150, paint);
  }

  void _paintStars(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;
    final rnd = math.Random(99); // fixed seed -> stable star positions, only twinkle animates
    for (int i = 0; i < 40; i++) {
      final x = rnd.nextDouble() * size.width;
      final y = rnd.nextDouble() * size.height * 0.5;
      final twinkle = 0.3 + 0.7 * ((math.sin(t * 2 * math.pi * 3 + i) + 1) / 2);
      paint.color = Colors.white.withValues(alpha: twinkle * 0.6);
      canvas.drawCircle(Offset(x, y), 1.2, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _AmbientPainter old) =>
      old.t != t || old.isNight != isNight;
}

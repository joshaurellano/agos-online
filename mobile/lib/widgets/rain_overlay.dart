// rain_overlay.dart
//
// Port of the web frontend's src/components/RainOverlay.jsx. Same visual
// language (rain streaks, drifting cumulus clouds for "Overcast", soft fog
// bands, occasional lightning flash for storm-tier conditions), reimplemented
// with a CustomPainter + AnimationController instead of a raw <canvas> +
// requestAnimationFrame loop -- Flutter handles device-pixel-ratio scaling
// and resize itself, so this version skips the web original's manual DPR/
// resize bookkeeping entirely.
//
// Deliberately does NOT reproduce the web version's rewritten "sprite baked
// once to an offscreen canvas" perf trick -- with at most 5 clouds on
// screen, drawing each cloud's puffs directly every frame is cheap enough,
// and it's a simpler port to keep in sync with the original's shape logic.

import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

// ─── Backend signal -> visual intensity ────────────────────────────────────
// Mirrors RainOverlay.jsx's resolveIntensity() field-for-field. `condition`
// (e.g. "Heavy Rain", "Thunderstorm", "Cloudy") is the primary signal when
// present; `rainfallMm` (mm/hr) is the fallback (same tiering as the
// Rainfall Intensity badges elsewhere in the app) and also continuously
// scales animation strength within whatever tier is landed on.
class RainIntensity {
  final String tier; // 'none' | 'light' | 'moderate' | 'heavy' | 'storm'
  final double strength; // 0..1
  final bool isStorm;
  final bool isOvercast;
  final bool isFog;

  const RainIntensity({
    required this.tier,
    required this.strength,
    required this.isStorm,
    required this.isOvercast,
    required this.isFog,
  });

  static const none = RainIntensity(
      tier: 'none', strength: 0, isStorm: false, isOvercast: false, isFog: false);
}

RainIntensity resolveIntensity(double? rainfallMm, String? condition) {
  final mm = math.max(rainfallMm ?? 0.0, 0.0);
  final c = (condition ?? '').toLowerCase();

  String? tier;
  if (c.isNotEmpty) {
    // Matched against the backend's actual WMO_LABELS strings
    // (app/utils/alerts.py) -- "Violent showers" needs "violent" called
    // out explicitly or it falls through to the light/"shower" bucket.
    if (RegExp(r'(thunder|storm|squall)').hasMatch(c)) {
      tier = 'storm';
    } else if (RegExp(r'(heavy|violent)').hasMatch(c)) {
      tier = 'heavy';
    } else if (RegExp(r'moderate').hasMatch(c)) {
      tier = 'moderate';
    } else if (RegExp(r'(light|drizzle|shower)').hasMatch(c)) {
      tier = 'light';
    } else if (RegExp(r'(clear|sunny|cloud|fair|fog|haze|partly|overcast)').hasMatch(c)) {
      tier = 'none';
    }
  }
  tier ??= mm > 10 ? 'heavy' : mm > 2 ? 'moderate' : mm > 0 ? 'light' : 'none';

  const tierFloor = {'none': 0.0, 'light': 0.18, 'moderate': 0.42, 'heavy': 0.7, 'storm': 0.85};
  // .clamp() on num/double returns `num`, not `double` -- .toDouble() keeps
  // everything downstream (RainIntensity.strength etc.) cleanly typed.
  final mmStrength = (mm / 30).clamp(0.0, 1.0).toDouble();
  final strength = tier == 'none' ? 0.0 : math.max(tierFloor[tier]!, mmStrength);

  // "Overcast" is its own signal, separate from the rain tier above -- it's
  // not precipitation, so it never adds raindrops, but a flat gray sky
  // still deserves *some* visual read instead of looking identical to
  // "Clear". Only fires when there's no active rain tier.
  final isOvercast = tier == 'none' && c.contains('overcast');

  // "Fog"/"Icy fog"/haze -- a visibility condition, not cloud cover, so it
  // gets its own thinner, faster-moving veil instead of reusing the cumulus
  // clouds. Same no-double-stacking rule as isOvercast above.
  final isFog = tier == 'none' && (c.contains('fog') || c.contains('haze'));

  return RainIntensity(
    tier: tier,
    strength: strength.clamp(0.0, 1.0).toDouble(),
    isStorm: tier == 'storm',
    isOvercast: isOvercast,
    isFog: isFog,
  );
}

const _maxDrops = 260;
const _maxClouds = 5;
const _maxFogBands = 4;

// Cumulus silhouette: overlapping puffs (fractions of `scale`, not pixels),
// same relative geometry as the web version's CLOUD_PUFFS.
class _CloudPuff {
  final double dx, dy, r;
  const _CloudPuff(this.dx, this.dy, this.r);
}

const _cloudPuffs = [
  _CloudPuff(-0.62, 0.16, 0.30),
  _CloudPuff(-0.34, -0.06, 0.40),
  _CloudPuff(-0.02, -0.18, 0.46),
  _CloudPuff(0.30, -0.08, 0.42),
  _CloudPuff(0.58, 0.10, 0.32),
  _CloudPuff(0.82, 0.22, 0.22),
  _CloudPuff(-0.86, 0.24, 0.20),
];

class _Drop {
  double x, y, len, speed, drift, opacity;
  _Drop({required this.x, required this.y, required this.len, required this.speed, required this.drift, required this.opacity});
}

class _Cloud {
  double x, y, w, speed, opacity;
  _Cloud({required this.x, required this.y, required this.w, required this.speed, required this.opacity});
}

class _FogBand {
  double x, y, w, h, speed, opacity;
  _FogBand({required this.x, required this.y, required this.w, required this.h, required this.speed, required this.opacity});
}

_Drop _spawnDrop(double width, double height, double strength, double windSignal, math.Random rng) {
  return _Drop(
    x: rng.nextDouble() * (width + 200) - 100,
    y: rng.nextDouble() * -height,
    len: 10 + strength * 22 + rng.nextDouble() * 8,
    speed: 6 + strength * 14 + rng.nextDouble() * 4,
    drift: windSignal * 0.5 + (rng.nextDouble() - 0.5) * 0.6,
    opacity: 0.15 + rng.nextDouble() * 0.25 + strength * 0.2,
  );
}

_Cloud _spawnCloud(double width, double height, math.Random rng, {double? startX}) {
  return _Cloud(
    x: startX ?? rng.nextDouble() * (width + 600) - 300,
    y: rng.nextDouble() * height * 0.85,
    w: 220 + rng.nextDouble() * 220,
    speed: 0.14 + rng.nextDouble() * 0.22,
    opacity: 0.45 + rng.nextDouble() * 0.3,
  );
}

_FogBand _spawnFogBand(double width, double height, math.Random rng, {double? startX}) {
  return _FogBand(
    x: startX ?? rng.nextDouble() * (width + 400) - 200,
    y: rng.nextDouble() * height,
    w: 260 + rng.nextDouble() * 220,
    h: 36 + rng.nextDouble() * 46,
    speed: 0.22 + rng.nextDouble() * 0.28,
    opacity: 0.07 + rng.nextDouble() * 0.06,
  );
}

// Mutable animation state, held once per widget instance and passed to the
// painter by reference every frame (a new painter is built each tick, but
// it mutates these same shared lists in place -- the Dart equivalent of the
// web version's module-scope `drops`/`clouds`/`fogBands` closure variables).
class _ParticleState {
  final List<_Drop> drops = [];
  final List<_Cloud> clouds = [];
  final List<_FogBand> fogBands = [];
  double lightningAlpha = 0;
  int lightningCooldown = 0;
}

/// Animated weather layer that sits on top of the flood map. Purely a
/// visual overlay -- wrapped in [IgnorePointer] so map panning/zooming
/// still works underneath it. Draws rain streaks (+ lightning for storms)
/// when there's active precipitation, drifting cumulus clouds for a plain
/// "Overcast" sky, soft fog bands for "Fog"/"Haze", and nothing otherwise --
/// safe to always mount alongside the map, even before live weather data
/// has loaded.
class RainOverlay extends StatefulWidget {
  final double? rainfallMm;
  final String? condition;
  final double windSignal;

  const RainOverlay({
    super.key,
    required this.rainfallMm,
    required this.condition,
    this.windSignal = 0,
  });

  @override
  State<RainOverlay> createState() => _RainOverlayState();
}

class _RainOverlayState extends State<RainOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final _particles = _ParticleState();
  final _rng = math.Random();
  RainIntensity _intensity = RainIntensity.none;

  @override
  void initState() {
    super.initState();
    _intensity = resolveIntensity(widget.rainfallMm, widget.condition);
    // Unbounded, repeating controller used purely as a per-frame ticker --
    // there's no start/end value here, just "keep firing so we can repaint".
    _controller = AnimationController(vsync: this, duration: const Duration(days: 1))..repeat();
  }

  @override
  void didUpdateWidget(covariant RainOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Intensity is recomputed on every prop change but the animation loop
    // itself never restarts -- particle lists persist across prop updates,
    // same as the web version reading a live ref each frame instead of
    // re-running its effect.
    _intensity = resolveIntensity(widget.rainfallMm, widget.condition);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => CustomPaint(
          size: Size.infinite,
          painter: _RainPainter(
            intensity: _intensity,
            windSignal: widget.windSignal,
            particles: _particles,
            rng: _rng,
          ),
        ),
      ),
    );
  }
}

class _RainPainter extends CustomPainter {
  final RainIntensity intensity;
  final double windSignal;
  final _ParticleState particles;
  final math.Random rng;

  _RainPainter({
    required this.intensity,
    required this.windSignal,
    required this.particles,
    required this.rng,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final width = size.width, height = size.height;
    if (width <= 0 || height <= 0) return;

    final strength = intensity.strength;

    // ── Overcast: flat wash + drifting cumulus clouds ─────────────────────
    if (intensity.isOvercast) {
      canvas.drawRect(Offset.zero & size, Paint()..color = const Color.fromRGBO(85, 95, 110, 0.08));
      while (particles.clouds.length < _maxClouds) {
        particles.clouds.add(_spawnCloud(width, height, rng));
      }
      for (final cl in particles.clouds) {
        _drawCloud(canvas, cl);
        cl.x += cl.speed;
        if (cl.x - cl.w / 2 > width) {
          final fresh = _spawnCloud(width, height, rng, startX: -cl.w);
          cl.x = fresh.x;
          cl.y = fresh.y;
          cl.w = fresh.w;
          cl.speed = fresh.speed;
          cl.opacity = fresh.opacity;
        }
      }
    } else if (particles.clouds.isNotEmpty) {
      particles.clouds.clear();
    }

    // ── Fog: pulsing pale wash + soft horizontal bands ────────────────────
    if (intensity.isFog) {
      final pulse = 0.09 + math.sin(DateTime.now().millisecondsSinceEpoch / 1600) * 0.025;
      canvas.drawRect(Offset.zero & size, Paint()..color = Color.fromRGBO(210, 214, 218, pulse));
      while (particles.fogBands.length < _maxFogBands) {
        particles.fogBands.add(_spawnFogBand(width, height, rng));
      }
      for (final band in particles.fogBands) {
        _drawFogBand(canvas, band);
        band.x += band.speed;
        if (band.x - band.w / 2 > width) {
          final fresh = _spawnFogBand(width, height, rng, startX: -band.w);
          band.x = fresh.x;
          band.y = fresh.y;
          band.w = fresh.w;
          band.h = fresh.h;
          band.speed = fresh.speed;
          band.opacity = fresh.opacity;
        }
      }
    } else if (particles.fogBands.isNotEmpty) {
      particles.fogBands.clear();
    }

    // ── Rain streaks ───────────────────────────────────────────────────────
    final targetCount = (_maxDrops * strength).round();
    while (particles.drops.length < targetCount) {
      particles.drops.add(_spawnDrop(width, height, strength, windSignal, rng));
    }
    if (particles.drops.length > targetCount) {
      particles.drops.removeRange(targetCount, particles.drops.length);
    }

    if (strength > 0) {
      // Faint overall haze that thickens with intensity, so heavy/storm
      // rain reads as "socked in" rather than just "more streaks".
      canvas.drawRect(Offset.zero & size, Paint()..color = Color.fromRGBO(120, 140, 160, (0.02 + strength * 0.06)));

      final darkBase = const Color(0xFF283B4B); // rgba(40,55,75,*)
      final lightBase = const Color(0xFFD2E4F5); // rgba(210,228,245,*)
      final darkPaint = Paint()
        ..strokeWidth = 1.1
        ..strokeCap = StrokeCap.round;
      final lightPaint = Paint()
        ..strokeWidth = 1.1
        ..strokeCap = StrokeCap.round;

      for (final d in particles.drops) {
        // Double-stroke each drop: a dark line for contrast against light
        // basemaps, plus a light line (offset -0.6,-0.6) for contrast
        // against dark basemaps -- together they read clearly regardless
        // of what's underneath.
        darkPaint.color = darkBase.withOpacity((0.55 * d.opacity).clamp(0.0, 1.0).toDouble());
        canvas.drawLine(Offset(d.x, d.y), Offset(d.x + d.drift * 4, d.y + d.len), darkPaint);

        lightPaint.color = lightBase.withOpacity((0.7 * d.opacity).clamp(0.0, 1.0).toDouble());
        canvas.drawLine(
          Offset(d.x - 0.6, d.y - 0.6),
          Offset(d.x + d.drift * 4 - 0.6, d.y + d.len - 0.6),
          lightPaint,
        );

        d.x += d.drift;
        d.y += d.speed;
        if (d.y > height) {
          final fresh = _spawnDrop(width, height, strength, windSignal, rng);
          d.x = fresh.x;
          d.y = -10;
          d.len = fresh.len;
          d.speed = fresh.speed;
          d.drift = fresh.drift;
          d.opacity = fresh.opacity;
        }
      }
    }

    // ── Occasional lightning flash for storm-tier conditions only ────────
    if (intensity.isStorm) {
      particles.lightningCooldown -= 1;
      if (particles.lightningCooldown <= 0 && rng.nextDouble() < 0.01) {
        particles.lightningAlpha = 0.5 + rng.nextDouble() * 0.3;
        particles.lightningCooldown = 90 + (rng.nextDouble() * 120).round();
      }
    }
    if (particles.lightningAlpha > 0.01) {
      canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white.withOpacity(particles.lightningAlpha));
      particles.lightningAlpha *= 0.85;
    } else {
      particles.lightningAlpha = 0;
    }
  }

  void _drawCloud(Canvas canvas, _Cloud cl) {
    final scale = cl.w * 0.42;
    final cx = cl.x, cy = cl.y;

    // Silhouette drawn into an offscreen layer, then shaded with a single
    // gradient rect composited via BlendMode.srcATop -- the Flutter
    // equivalent of the web version's
    // `ctx.globalCompositeOperation = 'source-atop'` masking trick, so the
    // shading never spills past the cloud's own puffy edge. The layer's own
    // paint color alpha applies cl.opacity to the whole composited cloud.
    canvas.saveLayer(null, Paint()..color = Colors.white.withOpacity(cl.opacity.clamp(0.0, 1.0).toDouble()));

    final silhouette = Paint()..color = Colors.white;
    for (final p in _cloudPuffs) {
      canvas.drawCircle(Offset(cx + p.dx * scale, cy + p.dy * scale), p.r * scale, silhouette);
    }
    // Rounded base so the puffs read as one cloud rather than a row of
    // circles.
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, cy + scale * 0.2), width: scale * 2.1, height: scale * 0.68),
      silhouette,
    );

    // Volume shading: pale/bright top, gray-blue underside -- the classic
    // top-lit cumulus read.
    final shadeRect = Rect.fromLTWH(cx - scale * 1.3, cy - scale * 0.6, scale * 2.6, scale * 1.15);
    final shader = ui.Gradient.linear(
      Offset(cx, cy - scale * 0.6),
      Offset(cx, cy + scale * 0.55),
      [
        Colors.white.withOpacity(0.98),
        const Color(0xFFE2E8F0).withOpacity(0.95),
        const Color(0xFF606B7D).withOpacity(0.92),
      ],
      const [0.0, 0.45, 1.0],
    );
    canvas.drawRect(shadeRect, Paint()..shader = shader..blendMode = BlendMode.srcATop);
    canvas.restore();
  }

  void _drawFogBand(Canvas canvas, _FogBand band) {
    final rect = Rect.fromLTWH(band.x - band.w / 2, band.y, band.w, band.h);
    final o = band.opacity.clamp(0.0, 1.0).toDouble();
    final shader = ui.Gradient.linear(
      Offset(band.x - band.w / 2, band.y),
      Offset(band.x + band.w / 2, band.y),
      [
        const Color(0xFFE1E4E8).withOpacity(0),
        const Color(0xFFE1E4E8).withOpacity(o),
        const Color(0xFFE1E4E8).withOpacity(0),
      ],
      const [0.0, 0.5, 1.0],
    );
    canvas.drawRect(rect, Paint()..shader = shader);
  }

  // Always true: this is a continuous animation, every tick genuinely
  // changes particle positions/lightning/fog pulse.
  @override
  bool shouldRepaint(covariant _RainPainter oldDelegate) => true;
}

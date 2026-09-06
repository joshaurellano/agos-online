// wind_direction_arrow.dart
//
// Port of the web frontend's src/components/WindDirectionArrow.jsx. Kept as
// its own small widget (not folded into theme/panahon_ui.dart) for the same
// reason the web keeps it as a standalone component: it's map-weather
// specific, not a generic design-system atom like MapToolButton.

import 'package:flutter/material.dart';

const _cardinals16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/// Converts a compass bearing (0-360, meteorological "wind FROM" convention)
/// to its nearest 16-point cardinal label. Null if direction is unknown.
String? degToCardinal(double? deg) {
  if (deg == null || deg.isNaN) return null;
  final idx = (((deg % 360) / 22.5).round()) % 16;
  return _cardinals16[idx];
}

/// Rotating arrow icon for wind direction. `deg` is Open-Meteo's
/// wind_direction_10m — meteorological convention, i.e. the direction the
/// wind is blowing FROM, measured clockwise from true north. Drawn pointing
/// along `deg` with no offset, matching the web version's "weather vane"
/// read. Renders nothing if direction is unknown, so it's safe to always
/// mount even before live weather data has loaded.
class WindDirectionArrow extends StatelessWidget {
  final double? deg;
  final double size;
  final Color color;

  const WindDirectionArrow({
    super.key,
    required this.deg,
    this.size = 16,
    this.color = const Color(0xFFE2EAF5),
  });

  @override
  Widget build(BuildContext context) {
    if (deg == null || deg!.isNaN) return const SizedBox.shrink();
    return AnimatedRotation(
      // Fractional turns, not degrees -- matches the web's CSS
      // `rotate(${deg}deg)` + 0.6s transition, including the same
      // "spins the long way around" behavior when crossing 0°/360°
      // (neither version tries to shortest-path the rotation).
      turns: deg! / 360.0,
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeInOut,
      child: CustomPaint(
        size: Size(size, size),
        painter: _ArrowPainter(color: color),
      ),
    );
  }
}

class _ArrowPainter extends CustomPainter {
  final Color color;
  const _ArrowPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    // Original path is drawn in a 24x24 viewBox -- scale proportionally.
    final s = size.width / 24;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.4 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(12 * s, 2 * s)
      ..lineTo(12 * s, 20 * s)
      ..moveTo(12 * s, 2 * s)
      ..lineTo(6.5 * s, 9.5 * s)
      ..moveTo(12 * s, 2 * s)
      ..lineTo(17.5 * s, 9.5 * s);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _ArrowPainter oldDelegate) =>
      oldDelegate.color != color;
}

// agos_hero.dart
//
// Collapsing hero for the Dashboard.
//
// WHY: the old hero was a fixed 296 px banner, so on a normal phone almost
// half the screen was permanently taken up and the real content scrolled in
// a tiny window underneath. Weather and flood apps that people actually keep
// (Apple Weather, Google Flood Hub, PANaHON) all do the same thing instead:
// a big, glanceable "how bad is it" header that shrinks to a slim status bar
// as you scroll, so the whole screen is available for content.
//
// WHAT'S NEW vs FloodHeroBanner:
//   • A risk gauge: the flood probability drawn on a 4-zone dial
//     (Normal / Advisory / Warning / Critical), so "32%" means something at a
//     glance — you can SEE you're in the yellow zone and how far the red is.
//   • Collapses to a compact bar (mini gauge + level + %) when scrolled.
//   • Uses a SliverPersistentHeader, so scrolling stays smooth and there is
//     no layout feedback loop (the old plan of resizing a Column on scroll
//     would jitter).
//
// Used from dashboard_screen.dart:
//   CustomScrollView(slivers: [
//     SliverPersistentHeader(pinned: true, delegate: AgosHeroDelegate(...)),
//     SliverToBoxAdapter(child: ...content...),
//   ])
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../main.dart';

/// One small stat shown under the headline (icon + value + label).
typedef AgosHeroStat = ({IconData icon, String value, String label});

class AgosHeroDelegate extends SliverPersistentHeaderDelegate {
  /// Status-bar height (MediaQuery.of(context).padding.top).
  final double topPadding;

  /// Painted beneath the colored gradient: WeatherBackdrop + RainOverlay, so
  /// the rain/mood animation still shows through the hero like before.
  final Widget? background;
  final List<Color> gradientColors;

  final String location;
  final String statusLine;
  final List<Widget> actions;

  /// 0..1, or null while loading.
  final double? probability;
  final Color levelColor;
  final String levelLabel; // "Advisory"
  final IconData levelIcon;
  final String headline; // "Stay Alert"
  final String tagline;
  final List<AgosHeroStat> stats;

  /// Optional urgent banner (Warning / Critical).
  final String? bannerText;
  final VoidCallback? onBannerTap;

  const AgosHeroDelegate({
    required this.topPadding,
    required this.gradientColors,
    required this.location,
    required this.statusLine,
    required this.probability,
    required this.levelColor,
    required this.levelLabel,
    required this.levelIcon,
    required this.headline,
    required this.tagline,
    this.background,
    this.actions = const [],
    this.stats = const [],
    this.bannerText,
    this.onBannerTap,
  });

  static const double _sheetStrip = 22; // rounded "sheet" lip at the bottom
  static const double _compactBar = 58; // collapsed content height
  static const double _expandedBody = 322; // expanded content height (no banner)
  static const double _bannerExtra = 66;

  bool get _hasBanner => bannerText != null;

  @override
  double get maxExtent =>
      topPadding + _expandedBody + (_hasBanner ? _bannerExtra : 0) + _sheetStrip;

  @override
  double get minExtent => topPadding + _compactBar + _sheetStrip;

  @override
  bool shouldRebuild(covariant AgosHeroDelegate old) => true;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final range = (maxExtent - minExtent).clamp(1.0, double.infinity);
    final t = (shrinkOffset / range).clamp(0.0, 1.0);
    final expandedOpacity = (1 - t * 1.7).clamp(0.0, 1.0);
    final compactOpacity = ((t - 0.55) / 0.45).clamp(0.0, 1.0);
    final pct = probability == null ? null : (probability! * 100).round();

    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Solid base so scrolling content never shows through the pinned header.
          const ColoredBox(color: Color(0xFF0A1830)),
          if (background != null) Positioned.fill(child: background!),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: gradientColors,
                ),
              ),
            ),
          ),

          // ── Expanded layer ────────────────────────────────────────────
          // Fixed-height + non-scrollable SingleChildScrollView: if a large
          // accessibility text size makes the content taller than planned it
          // is clipped instead of throwing an overflow error.
          Positioned(
            left: 0,
            right: 0,
            top: topPadding - shrinkOffset * 0.35,
            height: _expandedBody + (_hasBanner ? _bannerExtra : 0),
            child: IgnorePointer(
              ignoring: t > 0.5,
              child: Opacity(
                opacity: expandedOpacity,
                child: SingleChildScrollView(
                  physics: const NeverScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(18, 4, 18, 0),
                  child: _expandedContent(pct),
                ),
              ),
            ),
          ),

          // ── Compact layer ─────────────────────────────────────────────
          Positioned(
            left: 0,
            right: 0,
            top: topPadding,
            height: _compactBar,
            child: IgnorePointer(
              ignoring: compactOpacity < 0.5,
              child: Opacity(
                opacity: compactOpacity,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 14, 0),
                  child: _compactContent(pct),
                ),
              ),
            ),
          ),

          // Rounded "sheet" lip — the content below starts in this colour.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: _sheetStrip,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.bgDeep,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Expanded content ────────────────────────────────────────────────────
  Widget _expandedContent(int? pct) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.location_on_rounded, color: Colors.white, size: 15),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14.5)),
                    ),
                  ]),
                  const SizedBox(height: 1),
                  Padding(
                    padding: const EdgeInsets.only(left: 19),
                    child: Text(statusLine,
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75), fontSize: 10.5)),
                  ),
                ],
              ),
            ),
            ...actions,
          ],
        ),
        if (bannerText != null) ...[
          const SizedBox(height: 10),
          GestureDetector(
            onTap: onBannerTap,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
              ),
              child: Row(children: [
                const Icon(Icons.warning_rounded, color: Colors.white, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(bannerText!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
                const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 16),
              ]),
            ),
          ),
        ],
        const SizedBox(height: 6),
        Center(
          child: RiskGauge(
            probability: probability,
            size: 176,
            stroke: 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 420),
                      transitionBuilder: (c, a) => FadeTransition(opacity: a, child: c),
                      child: Text(
                        pct == null ? '—' : '$pct',
                        key: ValueKey(pct),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 54,
                            fontWeight: FontWeight.w900,
                            height: 1.0,
                            letterSpacing: -2),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 8, left: 1),
                      child: Text('%',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.85),
                              fontSize: 20,
                              fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text('chance of flooding',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(levelIcon, color: Colors.white, size: 20),
            const SizedBox(width: 7),
            Text(headline,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2)),
          ]),
        ),
        const SizedBox(height: 3),
        Center(
          child: Text(tagline,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5, height: 1.3)),
        ),
        if (stats.isNotEmpty) ...[
          const SizedBox(height: 10),
          Center(
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              alignment: WrapAlignment.center,
              children: [
                for (final s in stats)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(s.icon, color: Colors.white.withValues(alpha: 0.9), size: 13),
                      const SizedBox(width: 5),
                      Text(s.value,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 4),
                      Text(s.label,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72), fontSize: 10.5)),
                    ]),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ── Compact content ─────────────────────────────────────────────────────
  Widget _compactContent(int? pct) {
    return Row(children: [
      RiskGauge(
        probability: probability,
        size: 42,
        stroke: 5,
        child: Text(pct == null ? '—' : '$pct',
            style: const TextStyle(
                color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w900)),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(headline,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
            Text('$levelLabel · $location',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 10.5)),
          ],
        ),
      ),
      ...actions,
    ]);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RiskGauge — flood probability on a 270° dial split into the four alert
// zones (cut-offs match the backend: 25 / 50 / 75 %).
// ═════════════════════════════════════════════════════════════════════════
class RiskGauge extends StatelessWidget {
  final double? probability; // 0..1
  final double size;
  final double stroke;
  final Widget? child;

  const RiskGauge({
    super.key,
    required this.probability,
    this.size = 160,
    this.stroke = 12,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    final v = (probability ?? 0).clamp(0.0, 1.0).toDouble();
    return Semantics(
      label: probability == null
          ? 'Flood risk loading'
          : 'Flood risk ${(v * 100).round()} percent',
      child: SizedBox(
        width: size,
        height: size,
        child: TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: 0, end: v),
          duration: const Duration(milliseconds: 900),
          curve: Curves.easeOutCubic,
          builder: (context, value, _) => CustomPaint(
            painter: _GaugePainter(value: value, stroke: stroke, showKnob: size > 80),
            child: Center(child: child),
          ),
        ),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  final double value;
  final double stroke;
  final bool showKnob;
  const _GaugePainter({required this.value, required this.stroke, required this.showKnob});

  static const _start = 135 * math.pi / 180; // bottom-left
  static const _sweep = 270 * math.pi / 180;

  // Zone colours — same semantic palette as the rest of the app.
  static const _zones = [
    AppColors.green,
    AppColors.yellow,
    AppColors.orange,
    AppColors.red,
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide - stroke) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    // 1. Four faint zone segments with tiny gaps (the "scale").
    final gap = 0.035; // radians
    for (var i = 0; i < 4; i++) {
      final a0 = _start + _sweep * (i / 4) + (i == 0 ? 0 : gap / 2);
      final a1 = _sweep / 4 - (i == 0 || i == 3 ? gap / 2 : gap);
      canvas.drawArc(
        rect,
        a0,
        a1,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.butt
          ..color = _zones[i].withValues(alpha: 0.38),
      );
    }

    // 2. Bright progress arc up to the current probability.
    if (value > 0.004) {
      canvas.drawArc(
        rect,
        _start,
        _sweep * value,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke * 0.55
          ..strokeCap = StrokeCap.round
          ..color = Colors.white,
      );
    }

    // 3. Knob at the current value.
    if (showKnob) {
      final ang = _start + _sweep * value;
      final p = Offset(center.dx + radius * math.cos(ang), center.dy + radius * math.sin(ang));
      canvas.drawCircle(p, stroke * 0.62, Paint()..color = Colors.black.withValues(alpha: 0.25));
      canvas.drawCircle(p, stroke * 0.5, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.value != value || old.stroke != stroke || old.showKnob != showKnob;
}

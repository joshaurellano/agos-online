// panahon_ui.dart
//
// Shared design-system widgets for AGOS, styled after the DOST PANaHON app
// (curved gradient header, floating rounded search bar, vertical map
// toolbar, pill-style bottom navigation) but built entirely from AGOS's own
// palette (AppColors in main.dart) — no PANaHON colors are used.
import 'package:flutter/material.dart';
import '../main.dart';

/// Curved-bottom gradient header, the AGOS equivalent of PANaHON's blue
/// "Location Forecast" header. Place a [PanahonHeroCard] (or any widget)
/// as [overlap] to have it float over the curved bottom edge, mirroring
/// the "30° Quezon City" card in the reference design.
class PanahonHeader extends StatelessWidget {
  final String appName;
  final String tagline;
  final Widget? trailing;
  final Widget? leading;
  final Widget? overlap;
  final double overlapOffset;
  final double height;

  const PanahonHeader({
    super.key,
    required this.appName,
    required this.tagline,
    this.trailing,
    this.leading,
    this.overlap,
    this.overlapOffset = 34,
    this.height = 108,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipPath(
          clipper: _CurvedBottomClipper(),
          child: Container(
            height: height,
            width: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.bgMid, AppColors.bgDark],
              ),
            ),
            child: Stack(
              children: [
                // Faint decorative rings, echoing PANaHON's sun motif but
                // rendered in the AGOS accent color.
                Positioned(
                  right: -30, top: -40,
                  child: _fadedRing(140),
                ),
                Positioned(
                  right: 10, top: 10,
                  child: _fadedRing(70),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                    child: Row(
                      children: [
                        if (leading != null) leading!,
                        if (leading == null)
                          Container(
                            width: 34, height: 34,
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                            ),
                            child: const Center(
                              child: Text('🌊', style: TextStyle(fontSize: 16)),
                            ),
                          ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                appName,
                                style: const TextStyle(
                                  color: AppColors.textPri,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 17,
                                  letterSpacing: -0.3,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                tagline,
                                style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        if (trailing != null) trailing!,
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (overlap != null)
          Positioned(
            left: 14, right: 14,
            top: height - overlapOffset,
            child: overlap!,
          ),
      ],
    );
  }

  Widget _fadedRing(double size) => Container(
        width: size, height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.accent.withValues(alpha: 0.08), width: 18),
        ),
      );
}

class _CurvedBottomClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 22);
    path.quadraticBezierTo(
      size.width / 2, size.height + 18,
      size.width, size.height - 22,
    );
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Round icon button used in the header (bell, avatar, back, etc).
class PanahonHeaderIcon extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final Color? color;
  final bool showDot;
  final Color dotColor;

  const PanahonHeaderIcon({
    super.key,
    required this.icon,
    this.onTap,
    this.color,
    this.showDot = false,
    this.dotColor = AppColors.red,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 34, height: 34,
          margin: const EdgeInsets.only(left: 8),
          decoration: BoxDecoration(
            color: AppColors.bgCard.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.bgBorder),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Center(child: Icon(icon, size: 17, color: color ?? AppColors.textSec)),
              if (showDot)
                Positioned(
                  top: -2, right: -2,
                  child: Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.bgDark, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

/// The rounded "hero" card that floats over the curved header — the AGOS
/// equivalent of PANaHON's big "30° Quezon City" temperature card.
class PanahonHeroCard extends StatelessWidget {
  final Widget child;
  final Color? accentColor;
  const PanahonHeroCard({super.key, required this.child, this.accentColor});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: (accentColor ?? AppColors.bgBorder).withValues(alpha: accentColor != null ? 0.5 : 1)),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 8)),
          ],
        ),
        child: child,
      );
}

/// Pill-style bottom navigation bar, mirroring PANaHON's docked bottom bar
/// (Location Forecast / Radar / Satellite / Synoptic) but in AGOS colors.
class PanahonBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<PanahonNavItem> items;

  const PanahonBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.bgBorder),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 6)),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(items.length, (i) {
            final selected = i == currentIndex;
            final item = items[i];
            return Expanded(
              child: GestureDetector(
                onTap: () => onTap(i),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.accent.withValues(alpha: 0.14) : Colors.transparent,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        item.icon,
                        size: 21,
                        color: selected ? AppColors.accent : AppColors.textMuted,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        item.label,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                          color: selected ? AppColors.accent : AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class PanahonNavItem {
  final IconData icon;
  final String label;
  const PanahonNavItem({required this.icon, required this.label});
}

/// A single stat shown in [FloodHeroBanner]'s bottom row (rain now,
/// humidity, etc.) — icon + value + short label, all in one line.
typedef HeroStatEntry = ({IconData icon, String label, String value});

/// Full-bleed curved gradient hero for AGOS's home screen — the flood
/// equivalent of a weather app's big "condition + temperature" banner.
/// The gradient and icon track the current flood alert level rather than
/// weather condition, and the big number is a flood-risk reading (e.g.
/// probability %) instead of a temperature. Deliberately semi-transparent
/// at the edges so the animated rain/cloud backdrop underneath can bleed
/// through, the same way the reference app's storm gradient lets
/// lightning show through behind it.
class FloodHeroBanner extends StatelessWidget {
  final List<Color> gradientColors;
  final String location;
  final String statusLine;
  final List<Widget> actions;
  final String bigValue;
  final String bigUnit;
  final IconData icon;
  final String headline;
  final String tagline;
  final String? bannerText;
  final VoidCallback? onBannerTap;
  final List<HeroStatEntry> stats;
  final double height;

  const FloodHeroBanner({
    super.key,
    required this.gradientColors,
    required this.location,
    required this.statusLine,
    this.actions = const [],
    required this.bigValue,
    required this.bigUnit,
    required this.icon,
    required this.headline,
    required this.tagline,
    this.bannerText,
    this.onBannerTap,
    this.stats = const [],
    this.height = 300,
  });

  @override
  Widget build(BuildContext context) {
    return ClipPath(
      clipper: _HeroBottomClipper(),
      child: Container(
        width: double.infinity,
        height: height,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradientColors,
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            location,
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14.5),
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 1),
                          Text(
                            statusLine,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 10.5),
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
                      child: Row(
                        children: [
                          const Icon(Icons.warning_rounded, color: Colors.white, size: 16),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(bannerText!,
                                style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                                maxLines: 2, overflow: TextOverflow.ellipsis),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 16),
                        ],
                      ),
                    ),
                  ),
                ],
                const Spacer(),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Icon(icon, color: Colors.white, size: 34),
                    const SizedBox(width: 10),
                    Text(
                      bigValue,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 62, fontWeight: FontWeight.w900,
                          height: 1.0, letterSpacing: -2),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 12, left: 2),
                      child: Text(bigUnit,
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 22, fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(headline,
                    style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.2)),
                const SizedBox(height: 3),
                Text(tagline,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5, height: 1.35)),
                if (stats.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      for (final s in stats) ...[
                        Icon(s.icon, color: Colors.white.withValues(alpha: 0.85), size: 14),
                        const SizedBox(width: 5),
                        Text(s.value, style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800)),
                        const SizedBox(width: 4),
                        Text(s.label, style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 10.5)),
                        const SizedBox(width: 16),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HeroBottomClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 34);
    path.quadraticBezierTo(size.width / 2, size.height + 26, size.width, size.height - 34);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Round glass-style icon button for use on top of [FloodHeroBanner]
/// (white-on-translucent, since it sits on a colored gradient rather than
/// AGOS's usual dark card background).
class HeroIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool showDot;
  final Color dotColor;

  const HeroIconButton({
    super.key,
    required this.icon,
    this.onTap,
    this.showDot = false,
    this.dotColor = Colors.white,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 34, height: 34,
          margin: const EdgeInsets.only(left: 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Center(child: Icon(icon, size: 17, color: Colors.white)),
              if (showDot)
                Positioned(
                  top: -2, right: -2,
                  child: Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

/// Small rounded pill used next to a section header (e.g. "48 hours",
/// "14 days") — mirrors the reference weather app's "168 hours >" /
/// "45 days >" buttons beside "Weather forecast" / "Daily forecast".
class SectionPill extends StatelessWidget {
  final String text;
  final VoidCallback? onTap;
  const SectionPill({super.key, required this.text, this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(text, style: const TextStyle(
                  color: AppColors.accent, fontSize: 10.5, fontWeight: FontWeight.w800)),
              const SizedBox(width: 2),
              const Icon(Icons.chevron_right_rounded, color: AppColors.accent, size: 14),
            ],
          ),
        ),
      );
}

/// Floating pill search bar used on map-style screens (Evacuation), styled
/// after PANaHON's "Search station" bar on the Radar/Satellite screens.
class PanahonSearchBar extends StatelessWidget {
  final String hint;
  final TextEditingController controller;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onLeadingTap;
  final IconData leadingIcon;
  final Widget? trailing;

  const PanahonSearchBar({
    super.key,
    required this.hint,
    required this.controller,
    this.onChanged,
    this.onSubmitted,
    this.onLeadingTap,
    this.leadingIcon = Icons.search_rounded,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) => Container(
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: AppColors.bgCard.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(21),
          border: Border.all(color: AppColors.bgBorder),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 3)),
          ],
        ),
        child: Row(
          children: [
            GestureDetector(
              onTap: onLeadingTap,
              child: Icon(leadingIcon, size: 18, color: AppColors.textMuted),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: controller,
                onChanged: onChanged,
                onSubmitted: onSubmitted,
                style: const TextStyle(color: AppColors.textPri, fontSize: 13),
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  hintText: hint,
                  hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      );
}

/// A single button in the vertical map-side toolbar (info / layers / locate
/// / zoom), matching the stacked rounded-square icon buttons seen on
/// PANaHON's Radar/Satellite screens.
class MapToolButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool active;
  final Color? activeColor;
  final Widget? child;

  const MapToolButton({
    super.key,
    required this.icon,
    this.onTap,
    this.active = false,
    this.activeColor,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    final color = activeColor ?? AppColors.accent;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38, height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? color.withValues(alpha: 0.18) : AppColors.bgCard.withValues(alpha: 0.94),
        ),
        child: child ?? Icon(icon, size: 18, color: active ? color : AppColors.textSec),
      ),
    );
  }
}

/// Groups [MapToolButton]s into a single rounded, elevated card with
/// thin dividers — the vertical control stack on the right edge of
/// PANaHON's map screens.
class MapToolStack extends StatelessWidget {
  final List<Widget> children;
  const MapToolStack({super.key, required this.children});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.bgBorder),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 3)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (int i = 0; i < children.length; i++) ...[
                if (i != 0) Container(height: 1, color: AppColors.bgBorder),
                children[i],
              ],
            ],
          ),
        ),
      );
}

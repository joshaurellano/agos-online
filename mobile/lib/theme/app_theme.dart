// app_theme.dart
//
// AGOS's palette and ThemeData, for both dark and light mode.
//
// These used to live in main.dart. main.dart now re-exports this file, so
// every existing `import '../main.dart'` still sees AppColors / AgosTheme.
//
// ── How light/dark switching works ──────────────────────────────────────────
// The neutral colors (backgrounds, borders, text, accent) are static
// *getters* that return the dark or the light value depending on one flag,
// which ThemeSettings (services/theme_settings.dart) flips. Widgets simply
// read `AppColors.bgCard` when they build, so a theme change only needs a
// rebuild — ThemeSettings triggers one for the whole tree.
//
// Consequence for widget code: a neutral token is NOT a compile-time
// constant, so it can't sit inside a `const` widget/TextStyle. Write
// `Text('x', style: TextStyle(color: AppColors.textPri))` (no `const`).
// The semantic alert colors — green, yellow, orange, red, violet — are the
// same in both themes and stay `const`.
//
// ── Light palette ───────────────────────────────────────────────────────────
// Taken from the web frontend (frontend/src/index.css, `:root.light`) so the
// two apps read as one product:
//   --blue-deep #dbe6f4 · --blue-mid #eef3fa · --blue-panel #f4f8fc
//   --blue-card #ffffff · --blue-border #bccfe6 · --accent #0284c7
//   --accent2 #0369a1 · --text-primary #14283f · --text-secondary #40597a
//   --text-muted #5c7699
// The frontend keeps its sidebar deep navy in light mode for contrast; the
// mobile equivalent is the header / hero "chrome" (chrome* tokens below).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  AppColors._();

  static bool _light = false;

  /// True while the light palette is active.
  static bool get isLight => _light;
  static Brightness get brightness => _light ? Brightness.light : Brightness.dark;

  /// Called by ThemeSettings. Only flips the flag — the caller is
  /// responsible for rebuilding the widget tree afterwards.
  static void setLight(bool value) => _light = value;

  static Color _pick(int dark, int light) => Color(_light ? light : dark);

  // ── Surfaces ──────────────────────────────────────────────────────────────
  /// App canvas (Scaffold background).
  static Color get bgDeep    => _pick(0xFF091729, 0xFFDBE6F4);
  /// Panels: app bars, bottom sheets, floating map chrome.
  static Color get bgDark    => _pick(0xFF0D1F3C, 0xFFF4F8FC);
  /// Secondary / nested panels, dialogs.
  static Color get bgMid     => _pick(0xFF112240, 0xFFEEF3FA);
  static Color get bgCard    => _pick(0xFF0F1E38, 0xFFFFFFFF);
  // A touch different from bgCard — for layering a second surface on top of
  // a card (nested rows, inputs) so depth reads without a harsh border.
  // (Lighter than the card in dark mode, slightly darker in light mode.)
  static Color get bgCard2   => _pick(0xFF15274A, 0xFFEEF3FA);
  static Color get bgBorder  => _pick(0xFF1E3A5F, 0xFFBCCFE6);

  /// Card surface for the many hand-rolled content cards (was a hardcoded
  /// 0xFF0D1F3C). Crisp white in light mode so cards pop off the canvas.
  static Color get surface    => _pick(0xFF0D1F3C, 0xFFFFFFFF);
  /// Sunken surface: loading / empty placeholders, unselected chips
  /// (was a hardcoded 0xFF0A1828).
  static Color get surfaceDim => _pick(0xFF0A1828, 0xFFEEF3FA);
  /// Hairline between rows inside a card (was 0xFF13284A).
  static Color get divider    => _pick(0xFF13284A, 0xFFE3ECF7);

  // ── Accent ────────────────────────────────────────────────────────────────
  static Color get accent     => _pick(0xFF38BDF8, 0xFF0284C7);
  // Deeper companion to accent, used as the second stop in accent
  // gradients (buttons, active nav pill, hero glows) so flat accent
  // fills gain a bit of dimension instead of looking like a solid chip.
  static Color get accentDeep => _pick(0xFF0EA5E9, 0xFF0369A1);

  // ── Text ──────────────────────────────────────────────────────────────────
  static Color get textPri   => _pick(0xFFE2EAF5, 0xFF14283F);
  static Color get textSec   => _pick(0xFF8DA4BE, 0xFF40597A);
  static Color get textMuted => _pick(0xFF4A6080, 0xFF5C7699);
  /// Between textSec and textMuted (was a hardcoded 0xFF5F7A9C).
  static Color get textSoft  => _pick(0xFF5F7A9C, 0xFF5C7699);

  // ── Semantic colors — identical in both themes, so still `const` ─────────
  static const violet = Color(0xFF818CF8);
  static const green  = Color(0xFF22C55E);
  static const yellow = Color(0xFFEAB308);
  static const orange = Color(0xFFF97316);
  static const red    = Color(0xFFEF4444);

  // Text/icon-safe variants of the semantic colors. The bright tones above
  // are tuned for dark backgrounds; as *text* on a white card they're too
  // faint, so light mode swaps in darker shades of the same hue.
  static Color get redText     => _pick(0xFFF87171, 0xFFB91C1C);
  static Color get redTextSoft => _pick(0xFFFCA5A5, 0xFFB91C1C);
  static Color get errorBg     => _pick(0xFF450A0A, 0xFFFEE2E2);
  static Color get greenText   => _pick(0xFF22C55E, 0xFF15803D);
  static Color get greenSoft   => _pick(0xFF7FD9A0, 0xFF166534);
  static Color get greenBg     => _pick(0xFF052E16, 0xFFDCFCE7);

  /// A semantic color, made readable as *text or an icon* on the current
  /// surface. Dark mode: unchanged. Light mode: the same hue, darkened
  /// until it clears contrast on white (e.g. yellow → dark amber).
  /// Use for text/icons only — fills and borders keep the bright color.
  static Color ink(Color c) {
    if (!_light) return c;
    final hsl = HSLColor.fromColor(c);
    if (hsl.lightness <= 0.36) return c;
    return hsl.withLightness(0.36).toColor();
  }

  // ── Header / hero "chrome" ───────────────────────────────────────────────
  // The curved header keeps a deep navy look in light mode — like the web
  // sidebar (#123a66) — so its white title, icons and rings stay legible.
  static Color get chromeTop    => _pick(0xFF112240, 0xFF1D4F86);
  static Color get chromeMid    => _pick(0xFF0D1F3C, 0xFF154076);
  static Color get chromeBottom => _pick(0xFF091729, 0xFF123A66);
  static Color get chromeText   => _pick(0xFFE2EAF5, 0xFFEEF5FF);
  static Color get chromeTextSec   => _pick(0xFF8DA4BE, 0xFFB9D1EF);
  static Color get chromeTextMuted => _pick(0xFF4A6080, 0xFF9DBBDD);
  static Color get chromeAccent => _pick(0xFF38BDF8, 0xFF5EC8FA);
  /// Translucent chip behind header icons.
  static Color get chromeChip   => _light
      ? const Color(0x1FFFFFFF)                          // white @ 12%
      : const Color(0x990F1E38);                         // bgCard @ 60%
  static Color get chromeBorder => _pick(0xFF1E3A5F, 0xFF2A5680);

  // ── Shadows ───────────────────────────────────────────────────────────────
  /// Drop-shadow color. Black in dark mode; a soft blue-tinted shadow in
  /// light mode (mirrors the frontend's rgba(15,45,90,…) shadow) — pure
  /// black at the dark-mode alphas looks like a smudge on a light canvas.
  static Color shadow(double alpha) => _light
      ? const Color(0xFF0F2D5A).withValues(alpha: (alpha * 0.32).clamp(0.0, 1.0))
      : Colors.black.withValues(alpha: alpha);

  // ── Gradients (depend on the tokens above, so getters, not consts) ──────
  /// Two-stop gradient used for primary accents (buttons, active pills,
  /// selected nav indicator) — gives flat accent fills a bit of depth.
  static LinearGradient get accentGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [accent, accentDeep],
      );

  /// Subtle diagonal sheen laid over cards to break up otherwise flat
  /// bgCard fills — kept faint enough to read as "glass" rather than a
  /// visible stripe.
  static LinearGradient get cardSheen => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [bgCard2, bgCard],
      );

  // ── System bars ───────────────────────────────────────────────────────────
  /// Status bar icons stay light in both themes because the top of every
  /// tab is the navy header / hero. Pushed screens with an AppBar override
  /// this themselves (AppBar picks icon color from its own background).
  static SystemUiOverlayStyle get systemOverlay => SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: bgDeep,
        systemNavigationBarIconBrightness: _light ? Brightness.dark : Brightness.light,
      );

  /// For screens whose top edge is the plain canvas (splash, onboarding,
  /// alerts) rather than the navy header: status bar icons must contrast
  /// with the canvas, so they go dark in light mode.
  static SystemUiOverlayStyle get systemOverlayOnCanvas => systemOverlay.copyWith(
        statusBarIconBrightness: _light ? Brightness.dark : Brightness.light,
        statusBarBrightness: _light ? Brightness.light : Brightness.dark,
      );
}

/// Centralizes AGOS's ThemeData so the look of every screen — typography,
/// default splash/highlight behavior, slider/switch colors, page
/// transitions — comes from one place instead of being re-declared
/// per-widget. Screens still hand-roll most of their own containers
/// (this app predates a Card/Surface-based layout system), but anything
/// that *does* read from Theme.of(context) (Text widgets without an
/// explicit fontFamily, Switch, Slider, TextField cursors, etc.) picks up
/// a consistent look for free.
///
/// Builds the light or the dark theme depending on [AppColors.isLight].
class AgosTheme {
  static ThemeData build() {
    final light = AppColors.isLight;
    final base = light ? ThemeData.light(useMaterial3: true) : ThemeData.dark(useMaterial3: true);
    // Plus Jakarta Sans reads as friendly-but-technical — geometric enough
    // for the big data-forward numbers (flood %, rainfall mm) while still
    // warm in body copy. Falls back to the platform default automatically
    // if the font can't be fetched (e.g. offline first launch), since
    // google_fonts degrades gracefully.
    final textTheme = GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(
      bodyColor: AppColors.textPri,
      displayColor: AppColors.textPri,
    );

    final colorScheme = light
        ? ColorScheme.light(
            primary: AppColors.accent,
            onPrimary: Colors.white,
            secondary: AppColors.violet,
            surface: AppColors.bgCard,
            onSurface: AppColors.textPri,
            error: AppColors.red,
            outline: const Color(0xFF8FA9C9),
            // Selected ChoiceChip / segmented-button fill.
            secondaryContainer: AppColors.accent.withValues(alpha: 0.16),
            onSecondaryContainer: AppColors.textPri,
          )
        : ColorScheme.dark(
            primary: AppColors.accent,
            secondary: AppColors.violet,
            surface: AppColors.bgCard,
            error: AppColors.red,
          );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bgDeep,
      colorScheme: colorScheme,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      highlightColor: AppColors.accent.withValues(alpha: 0.06),
      splashColor: AppColors.accent.withValues(alpha: 0.10),
      dividerColor: AppColors.bgBorder,
      dividerTheme: DividerThemeData(color: AppColors.bgBorder, thickness: 1),
      // Dark keeps Flutter's own chip styling exactly as before; light gets
      // an explicit one so unselected chips aren't a grey blob.
      chipTheme: light
          ? ChipThemeData(
              backgroundColor: AppColors.bgMid,
              selectedColor: AppColors.accent.withValues(alpha: 0.16),
              side: BorderSide(color: AppColors.bgBorder),
              labelStyle: TextStyle(color: AppColors.textPri, fontSize: 13),
              checkmarkColor: AppColors.accent,
            )
          : base.chipTheme,
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
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: AppColors.accent,
        circularTrackColor: AppColors.bgBorder,
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: AppColors.accent,
        selectionColor: AppColors.accent.withValues(alpha: 0.3),
        selectionHandleColor: AppColors.accent,
      ),
      snackBarTheme: SnackBarThemeData(
        // Light mode: a navy toast (like the web sidebar) reads better on a
        // pale canvas than another pale card.
        backgroundColor: light ? const Color(0xFF123A66) : AppColors.bgCard2,
        contentTextStyle: TextStyle(
          color: light ? const Color(0xFFEEF5FF) : AppColors.textPri,
          fontSize: 13.5,
        ),
        actionTextColor: light ? const Color(0xFF5EC8FA) : AppColors.accent,
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

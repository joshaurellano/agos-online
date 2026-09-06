import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../services/auth_service.dart';

// ─── Animated grid painter ────────────────────────────────────────────────────

class _GridPainter extends CustomPainter {
  final double offset; // 0..1, drives the drift animation
  _GridPainter(this.offset);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF00B4FF).withOpacity(0.04)
      ..strokeWidth = 1;

    const step = 48.0;
    final dy = offset * step;

    // Horizontal lines
    for (double y = -step + dy; y < size.height + step; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
    // Vertical lines
    for (double x = 0; x < size.width + step; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => old.offset != offset;
}

// ─── Spinning dashed ring painter ────────────────────────────────────────────

class _RingPainter extends CustomPainter {
  final double angle;
  _RingPainter(this.angle);

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r  = cx - 2;

    canvas.save();
    canvas.translate(cx, cy);
    canvas.rotate(angle);
    canvas.translate(-cx, -cy);

    const dashCount = 18;
    const dashAngle = (2 * math.pi) / dashCount;
    const gapFraction = 0.35;

    for (int i = 0; i < dashCount; i++) {
      final startAngle = i * dashAngle;
      final sweepAngle = dashAngle * (1 - gapFraction);

      // Fade segments so it looks like the gradient on web
      final t = i / dashCount;
      final opacity = (0.2 + 0.6 * math.sin(t * math.pi)).clamp(0.0, 1.0);

      final paint = Paint()
        ..color = const Color(0xFF38BDF8).withOpacity(opacity * 0.85)
        ..strokeWidth = 1.5
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;

      canvas.drawArc(
        Rect.fromCircle(center: Offset(cx, cy), radius: r),
        startAngle,
        sweepAngle,
        false,
        paint,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.angle != angle;
}

// ─── Gradient text widget ─────────────────────────────────────────────────────

class _GradientText extends StatelessWidget {
  final String text;
  final TextStyle style;
  final Gradient gradient;
  const _GradientText(this.text, {required this.style, required this.gradient});

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (bounds) => gradient.createShader(
        Rect.fromLTWH(0, 0, bounds.width, bounds.height),
      ),
      child: Text(text, style: style),
    );
  }
}

// ─── Main Login Screen ────────────────────────────────────────────────────────

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  // Controllers
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPassword  = false;
  bool _loading       = false;

  // Animation controllers
  late final AnimationController _gridCtrl;   // grid drift
  late final AnimationController _ringCtrl;   // logo ring spin
  late final AnimationController _orbCtrl;    // orb float
  late final AnimationController _fadeCtrl;   // card fade-up

  late final Animation<double> _fadeAnim;
  late final Animation<double> _slideAnim;

  @override
  void initState() {
    super.initState();

    _gridCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 20),
    )..repeat();

    _ringCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
    )..repeat();

    _orbCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat(reverse: true);

    _fadeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..forward();

    _fadeAnim  = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _slideAnim = Tween<double>(begin: 24, end: 0).animate(
      CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _gridCtrl.dispose();
    _ringCtrl.dispose();
    _orbCtrl.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    final auth = context.read<AuthService>();
    await auth.login(_usernameCtrl.text.trim(), _passwordCtrl.text);
    if (mounted) setState(() => _loading = false);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return Scaffold(
      backgroundColor: const Color(0xFF050D1A),
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // Animated grid
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _gridCtrl,
              builder: (_, __) => CustomPaint(
                painter: _GridPainter(_gridCtrl.value),
              ),
            ),
          ),

          // Glowing orb — top-left
          AnimatedBuilder(
            animation: _orbCtrl,
            builder: (_, __) {
              final dy = -20 * _orbCtrl.value;
              return Positioned(
                top: -150 + dy,
                left: -100,
                child: Container(
                  width: 420,
                  height: 420,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF00A0FF).withOpacity(0.12),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              );
            },
          ),

          // Glowing orb — bottom-right
          AnimatedBuilder(
            animation: _orbCtrl,
            builder: (_, __) {
              final dy = 20 * _orbCtrl.value;
              return Positioned(
                bottom: -100 + dy,
                right: -80,
                child: Container(
                  width: 340,
                  height: 340,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF0050C8).withOpacity(0.10),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              );
            },
          ),

          // Glowing orb — center
          AnimatedBuilder(
            animation: _orbCtrl,
            builder: (_, __) {
              final dy = -10 * _orbCtrl.value;
              return Positioned(
                top: MediaQuery.of(context).size.height * 0.35 + dy,
                left: MediaQuery.of(context).size.width * 0.45,
                child: Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF00DCFF).withOpacity(0.07),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              );
            },
          ),

          // Main scrollable content
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: AnimatedBuilder(
                  animation: _fadeCtrl,
                  builder: (_, child) => Opacity(
                    opacity: _fadeAnim.value,
                    child: Transform.translate(
                      offset: Offset(0, _slideAnim.value),
                      child: child,
                    ),
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // ── Logo ring ──────────────────────────
                        SizedBox(
                          width: 80,
                          height: 80,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Spinning dashed ring
                              AnimatedBuilder(
                                animation: _ringCtrl,
                                builder: (_, __) => CustomPaint(
                                  size: const Size(80, 80),
                                  painter: _RingPainter(
                                    _ringCtrl.value * 2 * math.pi,
                                  ),
                                ),
                              ),
                              // Inner circle
                              Container(
                                width: 60,
                                height: 60,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xFF0284C7),
                                      Color(0xFF0EA5E9),
                                    ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF0EA5E9)
                                          .withOpacity(0.4),
                                      blurRadius: 24,
                                    ),
                                  ],
                                ),
                                child: const Center(
                                  child: Text('🌊',
                                      style: TextStyle(fontSize: 26)),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // ── AGOS gradient title ────────────────
                        _GradientText(
                          'AGOS',
                          style: const TextStyle(
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 6,
                            height: 1,
                          ),
                          gradient: const LinearGradient(
                            colors: [
                              Color(0xFFE0F2FE),
                              Color(0xFF38BDF8),
                              Color(0xFF0EA5E9),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                        ),
                        const SizedBox(height: 6),

                        // ── Subtitle ───────────────────────────
                        const Text(
                          'FLOOD EARLY WARNING SYSTEM',
                          style: TextStyle(
                            color: Color(0xFF94C3F0),
                            fontSize: 11,
                            fontWeight: FontWeight.w300,
                            letterSpacing: 2.5,
                          ),
                        ),
                        const SizedBox(height: 8),

                        // ── Location pill with pulsing dot ─────
                        _PulsingLocationTag(),
                        const SizedBox(height: 36),

                        // ── Card ───────────────────────────────
                        _LoginCard(
                          usernameCtrl: _usernameCtrl,
                          passwordCtrl: _passwordCtrl,
                          showPassword: _showPassword,
                          onTogglePassword: () =>
                              setState(() => _showPassword = !_showPassword),
                          loading: _loading,
                          error: auth.error,
                          onSubmit: _handleLogin,
                        ),
                        const SizedBox(height: 24),

                        // ── Footer ─────────────────────────────
                        const Text(
                          'AGOS v1.0  ·  Capstone Prototype  ·  Data from PAGASA / DOST-ASTI',
                          style: TextStyle(
                            color: Color(0xFF4A6080),
                            fontSize: 10.5,
                            letterSpacing: 0.3,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Pulsing location tag ─────────────────────────────────────────────────────

class _PulsingLocationTag extends StatefulWidget {
  @override
  State<_PulsingLocationTag> createState() => _PulsingLocationTagState();
}

class _PulsingLocationTagState extends State<_PulsingLocationTag>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _pulse = Tween<double>(begin: 1.0, end: 0.5).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _pulse,
          builder: (_, __) => Opacity(
            opacity: _pulse.value,
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF0EA5E9),
                boxShadow: [
                  BoxShadow(color: Color(0xFF0EA5E9), blurRadius: 6),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 5),
        const Text(
          'Barangay Triangulo, Naga City',
          style: TextStyle(
            color: Color(0xFF94C3F0),
            fontSize: 11.5,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}

// ─── Login Card ───────────────────────────────────────────────────────────────

class _LoginCard extends StatelessWidget {
  final TextEditingController usernameCtrl;
  final TextEditingController passwordCtrl;
  final bool showPassword;
  final VoidCallback onTogglePassword;
  final bool loading;
  final String? error;
  final VoidCallback onSubmit;

  const _LoginCard({
    required this.usernameCtrl,
    required this.passwordCtrl,
    required this.showPassword,
    required this.onTogglePassword,
    required this.loading,
    required this.error,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xCC08162A), // rgba(8,22,42,0.80)
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFF00A0FF).withOpacity(0.15),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 64,
            offset: Offset(0, 32),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            // Top shimmer line (::before equivalent)
            Positioned(
              top: 0, left: 0, right: 0,
              child: Container(
                height: 1,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      Color(0x800EA5E9),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Card title
                  const Text(
                    'Sign In to Dashboard',
                    style: TextStyle(
                      color: Color(0xE6BAE1FF),
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Username field
                  _AgosInput(
                    controller: usernameCtrl,
                    hint: 'Username',
                    prefixIcon: Icons.person_outline_rounded,
                    onSubmitted: (_) => onSubmit(),
                  ),
                  const SizedBox(height: 20),

                  // Password field
                  _AgosInput(
                    controller: passwordCtrl,
                    hint: 'Password',
                    prefixIcon: Icons.lock_outline_rounded,
                    obscure: !showPassword,
                    suffixIcon: IconButton(
                      icon: Icon(
                        showPassword
                            ? Icons.visibility_rounded
                            : Icons.visibility_off_rounded,
                        color: const Color(0xFF64A0DC).withOpacity(0.5),
                        size: 18,
                      ),
                      onPressed: onTogglePassword,
                    ),
                    onSubmitted: (_) => onSubmit(),
                  ),

                  // Error banner
                  if (error != null) ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withOpacity(0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: const Color(0xFFEF4444).withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Text('⚠️ ',
                              style: TextStyle(fontSize: 13)),
                          Expanded(
                            child: Text(
                              error!,
                              style: const TextStyle(
                                color: Color(0xFFFCA5A5),
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  // Submit button
                  _AgosButton(
                    loading: loading,
                    onPressed: loading ? null : onSubmit,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Input field ──────────────────────────────────────────────────────────────

class _AgosInput extends StatefulWidget {
  final TextEditingController controller;
  final String hint;
  final IconData prefixIcon;
  final bool obscure;
  final Widget? suffixIcon;
  final ValueChanged<String>? onSubmitted;

  const _AgosInput({
    required this.controller,
    required this.hint,
    required this.prefixIcon,
    this.obscure = false,
    this.suffixIcon,
    this.onSubmitted,
  });

  @override
  State<_AgosInput> createState() => _AgosInputState();
}

class _AgosInputState extends State<_AgosInput> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: (v) => setState(() => _focused = v),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          boxShadow: _focused
              ? [
                  BoxShadow(
                    color: const Color(0xFF0EA5E9).withOpacity(0.08),
                    blurRadius: 20,
                    spreadRadius: 3,
                  ),
                ]
              : [],
        ),
        child: TextField(
          controller: widget.controller,
          obscureText: widget.obscure,
          onSubmitted: widget.onSubmitted,
          style: const TextStyle(
            color: Color(0xFFE0F2FE),
            fontSize: 15,
          ),
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: const TextStyle(
              color: Color(0xFF64A0DC),
              fontSize: 14,
            ),
            prefixIcon: Icon(
              widget.prefixIcon,
              color: const Color(0xFF64A0DC).withOpacity(0.4),
              size: 17,
            ),
            suffixIcon: widget.suffixIcon,
            filled: true,
            fillColor: _focused
                ? const Color(0xB3002850)
                : const Color(0x99001E3C),
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                color: const Color(0xFF0078C8).withOpacity(0.2),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                color: const Color(0xFF0078C8).withOpacity(0.2),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(
                color: Color(0x800EA5E9),
                width: 1.5,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Submit button ────────────────────────────────────────────────────────────

class _AgosButton extends StatefulWidget {
  final bool loading;
  final VoidCallback? onPressed;

  const _AgosButton({required this.loading, this.onPressed});

  @override
  State<_AgosButton> createState() => _AgosButtonState();
}

class _AgosButtonState extends State<_AgosButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
    );
    _scale = Tween<double>(begin: 1.0, end: 0.98).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _ctrl.forward(),
      onTapUp: (_) {
        _ctrl.reverse();
        widget.onPressed?.call();
      },
      onTapCancel: () => _ctrl.reverse(),
      child: ScaleTransition(
        scale: _scale,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 150),
          opacity: widget.loading ? 0.6 : 1.0,
          child: Container(
            width: double.infinity,
            height: 50,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(
                colors: [Color(0xFF0284C7), Color(0xFF0EA5E9)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF0EA5E9).withOpacity(0.25),
                  blurRadius: 24,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Subtle inner sheen (::after overlay)
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      gradient: LinearGradient(
                        colors: [
                          Colors.white.withOpacity(0.10),
                          Colors.transparent,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                  ),
                ),
                widget.loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        '🔐  Sign In',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                        ),
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
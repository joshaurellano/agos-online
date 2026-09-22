// skeleton.dart
//
// Pulsing placeholder shapes shown while content loads, instead of a lone
// spinner in an empty screen. They hint at the layout that's about to
// appear, which makes loading feel faster and steadier. No extra package:
// one gentle opacity pulse per block.
//
// Announced to screen readers as a single "Loading" region rather than a
// dozen unlabeled boxes.
import 'package:flutter/material.dart';
import '../main.dart';

/// A single rounded placeholder block.
class Skeleton extends StatefulWidget {
  final double? width;
  final double height;
  final double radius;
  const Skeleton({super.key, this.width, required this.height, this.radius = 8});

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Color.lerp(AppColors.bgCard2, AppColors.bgBorder, _c.value),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        ),
      );
}

/// Placeholder for a list of card-shaped items (alerts, reports).
class SkeletonCardList extends StatelessWidget {
  final int count;
  final EdgeInsets padding;
  const SkeletonCardList({
    super.key,
    this.count = 4,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 0),
  });

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading',
        excludeSemantics: true,
        child: Padding(
          padding: padding,
          child: Column(
            children: [
              for (var i = 0; i < count; i++)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.bgCard,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.bgBorder),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Skeleton(width: 28, height: 28, radius: 14),
                        SizedBox(width: 10),
                        Skeleton(width: 110, height: 12),
                        Spacer(),
                        Skeleton(width: 46, height: 10),
                      ]),
                      SizedBox(height: 14),
                      Skeleton(height: 11),
                      SizedBox(height: 8),
                      Skeleton(width: 220, height: 11),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
}

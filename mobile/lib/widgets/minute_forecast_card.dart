// minute_forecast_card.dart
//
// Short-range ("MinuteCast"-style) precipitation card: a narrative line
// ("Rain to stop in 45 min") plus a small bar timeline, backed by
// /api/forecast's "minutely" field (Open-Meteo's minutely_15 block, 15-min
// steps -- see backend/app/api/routes_weather.py). Ports the web
// dashboard's MinuteForecastStrip.jsx to a full card for mobile, with the
// narrative line added on top (the web version doesn't have one).
//
// Coarser than a true 1-minute-resolution MinuteCast (Open-Meteo has no
// per-minute precipitation field), so this reads as "Now / 15 / 30 / 45 /
// 60 min" rather than 60 individual ticks -- inspired by that layout, not
// a literal per-minute reproduction.

import 'package:flutter/material.dart';

class _RateBand {
  final String label;
  final double max;
  final Color color;
  final String range;
  const _RateBand(this.label, this.max, this.color, this.range);
}

// Mirrors the web version's RATE_BANDS so a given rate reads the same way
// in both places.
const _rateBands = [
  _RateBand('Light', 2.5, Color(0xFF22c55e), '< 2.5 mm/h'),
  _RateBand('Moderate', 7.5, Color(0xFFeab308), '2.5–7.5 mm/h'),
  _RateBand('Heavy', 15, Color(0xFFf97316), '7.5–15 mm/h'),
  _RateBand('Intense', 30, Color(0xFFef4444), '15–30 mm/h'),
  _RateBand('Torrential', double.infinity, Color(0xFF7c3aed), '> 30 mm/h'),
];

_RateBand _bandFor(double rate) {
  for (final b in _rateBands) {
    if (rate < b.max) return b;
  }
  return _rateBands.last;
}

// Threshold below which a 15-min step counts as "not really raining" for
// narrative purposes (rounding/model noise) -- matches the "no rain right
// now" read the Hourly Forecast strip's emoji already uses at 0mm.
const _dryThreshold = 0.1;

class MinuteForecastCard extends StatelessWidget {
  final List<Map<String, dynamic>> minutely;
  const MinuteForecastCard({super.key, required this.minutely});

  @override
  Widget build(BuildContext context) {
    final points = minutely.take(8).toList(); // up to 2h at 15-min steps
    if (points.length < 2) return const SizedBox.shrink(); // not enough data yet

    final rates = points
        .map((p) => (p['precipitation_rate_mmhr'] as num? ?? 0).toDouble())
        .toList();
    final maxRate = rates.fold<double>(1.0, (m, r) => r > m ? r : m);

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF0d1f3c),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF1e3a5f)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('☔', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 6),
                const Text('MinuteCast · Next 2 Hours', style: TextStyle(
                    color: Color(0xFF8da4be), fontSize: 10.5,
                    fontWeight: FontWeight.w800, letterSpacing: 0.4)),
              ],
            ),
            const SizedBox(height: 8),
            Text(_narrative(rates), style: const TextStyle(
                color: Color(0xFFe2eaf5), fontSize: 14, fontWeight: FontWeight.w700, height: 1.3)),
            const SizedBox(height: 14),

            // Time labels
            Row(
              children: List.generate(points.length, (i) {
                final t = DateTime.tryParse(points[i]['time'] as String? ?? '');
                final label = i == 0
                    ? 'Now'
                    : t != null
                        ? '${t.hour % 12 == 0 ? 12 : t.hour % 12}:${t.minute.toString().padLeft(2, '0')}'
                        : '${i * 15}m';
                return Expanded(
                  child: Text(label, textAlign: TextAlign.center, style: const TextStyle(
                      color: Color(0xFF5f7a9c), fontSize: 9.5, fontWeight: FontWeight.w600)),
                );
              }),
            ),
            const SizedBox(height: 6),

            // Bar timeline — height proportional to rate within this window
            SizedBox(
              height: 40,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: List.generate(points.length, (i) {
                  final rate = rates[i];
                  final band = _bandFor(rate);
                  final h = rate > _dryThreshold
                      ? (6 + (rate / maxRate) * 34).clamp(6.0, 40.0)
                      : 3.0;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Container(
                        height: h,
                        decoration: BoxDecoration(
                          color: rate > _dryThreshold
                              ? band.color
                              : const Color(0xFF1e3a5f),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
            const SizedBox(height: 12),
            const Divider(color: Color(0xFF1e3a5f), height: 1),
            const SizedBox(height: 10),

            // Band legend, wrapped so it fits narrow phones without overflow
            Wrap(
              spacing: 10,
              runSpacing: 6,
              children: _rateBands.map((b) => Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(
                      color: b.color, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 5),
                  Text('${b.label} · ${b.range}', style: const TextStyle(
                      color: Color(0xFF8da4be), fontSize: 9.5)),
                ],
              )).toList(),
            ),
          ],
        ),
      ),
    );
  }

  // "Rain to stop in 45 minutes" / "Rain expected to start in 30 minutes" /
  // "No rain expected in the next 2 hours" / "Rain continuing" — the
  // narrative line the reference MinuteCast UI leads with, which the web
  // version's strip doesn't have.
  String _narrative(List<double> rates) {
    final nowRaining = rates[0] > _dryThreshold;

    if (nowRaining) {
      final stopIdx = rates.indexWhere((r) => r <= _dryThreshold);
      if (stopIdx == -1) return 'Rain continuing for at least the next 2 hours';
      return 'Rain to stop in ${stopIdx * 15} minutes';
    }

    final startIdx = rates.indexWhere((r) => r > _dryThreshold);
    if (startIdx == -1) return 'No rain expected in the next 2 hours';
    return 'Rain expected to start in ${startIdx * 15} minutes';
  }
}

// Y axis for rainfall charts (mm/hr or mm/day).
//
// `minTop` is the smallest top of the axis. Pass the first threshold above
// "Light" (2.5 mm/hr, 10 mm/day) so trace rain reads as trace rain: a 0.1 mm/hr
// bar must not fill the whole chart just because it is the biggest value.
// Steps are "nice" numbers and ticks are explicit, so labels always match
// where they are drawn (no 0.03 / 0.07 ticks).
const NICE_STEPS = [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250];

export function rainfallAxis(maxValue, minTop = 10) {
  const target = Math.max(minTop, maxValue || 0);
  const step = NICE_STEPS.find((s) => target / s <= 5) ?? NICE_STEPS[NICE_STEPS.length - 1];
  const top = Math.ceil(target / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

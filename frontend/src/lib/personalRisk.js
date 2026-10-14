// Combines two things AGOS already knows into one answer for one place:
//   1. the live community alert level from the forecast model (NORMAL..CRITICAL)
//   2. the static flood-hazard class at the resident's spot (0 none, 1 low,
//      2 medium, 3 high; 25-year rainfall return period map)
//
// This is a transparent rule table, NOT a second machine-learning model. The
// model predicts how likely flooding is for the barangay; the hazard map says
// how exposed a given spot is when it does. Keeping the rule this simple lets
// us show it to residents ("How we worked this out") and defend it in the
// thesis. Revisit the offsets below with CDRRMO if they want different rules.

const ALERT_RANK = { NORMAL: 0, ADVISORY: 1, WARNING: 2, CRITICAL: 3 };

// Personal tiers reuse the alert vocabulary so colors and wording stay familiar.
export const TIER_KEYS = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL'];

// How far a hazard class shifts the community alert for that spot.
//   high zone   : one tier worse once the community is at WARNING or above
//                 (flooding reaches you first). At NORMAL/ADVISORY it matches
//                 the community alert so a quiet day never becomes an alarm.
//   medium zone : same as the community alert
//   low / none  : one tier calmer (still prepare when the whole barangay is
//                 at CRITICAL; Japan's guidance is "do not wait for the
//                 worst level before acting")
const HAZARD_OFFSET = { 0: -1, 1: -1, 2: 0, 3: +1 };

export function personalTier(alertKey, hazardClass) {
  const base = ALERT_RANK[alertKey] ?? 0;
  if (base === 0) return 0;
  let offset = HAZARD_OFFSET[hazardClass] ?? -1;
  if (offset > 0 && base < 2) offset = 0;
  const shifted = base + offset;
  return Math.max(0, Math.min(3, shifted));
}

// Plain wording for when the forecast model says flooding becomes likely.
// forecast14 is the model's day list: [{ date, flood_probability }, ...].
export function firstLikelyDay(forecast14, threshold = 0.5) {
  if (!Array.isArray(forecast14)) return null;
  const hit = forecast14.find((d) => (d.flood_probability ?? 0) >= threshold);
  return hit ? { date: hit.date, probability: hit.flood_probability } : null;
}

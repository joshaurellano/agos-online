// Shared vocabulary + helpers for resident-submitted incident_reports.
// Used by both CommunityReportsPage.jsx (the moderation list) and
// Dashboard.jsx (the map pins) so the two views can't quietly drift out
// of sync -- the same trap SEVERITY_COLORS/model-alert-thresholds fell
// into elsewhere in this app before they were unified around a single
// source (see ReportsPage.jsx / AnalyticsPage.jsx comments).

export const REPORT_CATEGORY_ICON = {
  Flood:               '🌊',
  Fire:                '🔥',
  Landslide:           '⛰️',
  'Road Accident':     '🚗',
  'Power Outage':      '💡',
  'Medical Emergency': '🚑',
  Other:               '📍',
};

export const REPORT_STATUS_COLORS = {
  pending:  '#eab308',
  verified: '#22c55e',
  rejected: '#ef4444',
};

export function reportTimeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Great-circle distance in meters between two lat/lng points.
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Reports within this radius/time window of each other, in the same
// category, are surfaced to the official as *possible* duplicates. This
// is a judgment aid, not an auto-reject: two residents legitimately
// reporting two separate incidents a couple blocks apart within the
// hour should still both show up, just flagged for a human look.
const DUPLICATE_RADIUS_METERS = 100;
const DUPLICATE_WINDOW_HOURS  = 12;

export function findNearbyDuplicates(report, allReports) {
  if (report.latitude == null || report.longitude == null) return [];
  const reportTime = new Date(report.created_at).getTime();

  return allReports.filter(other => {
    if (other.id === report.id) return false;
    if (other.status === 'rejected') return false;
    if (other.category !== report.category) return false;
    if (other.latitude == null || other.longitude == null) return false;

    const hoursApart = Math.abs(reportTime - new Date(other.created_at).getTime()) / 3.6e6;
    if (hoursApart > DUPLICATE_WINDOW_HOURS) return false;

    const meters = haversineMeters(report.latitude, report.longitude, other.latitude, other.longitude);
    return meters <= DUPLICATE_RADIUS_METERS;
  });
}

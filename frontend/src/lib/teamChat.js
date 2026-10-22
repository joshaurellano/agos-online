// Shared vocabulary + helpers for the staff Team Coordination page
// (pages/TeamChatPage.jsx) -- kept in one place the same way
// REPORT_STATUS_COLORS does for incident_reports (see lib/incidentReports.js),
// so the status board and any future page reading responder_status can't
// quietly drift out of sync on labels/colors.

export const RESPONDER_STATUSES = [
  { key: 'on_duty',  label: 'On Duty',  color: '#22c55e' },
  { key: 'deployed', label: 'Deployed', color: '#f97316' },
  { key: 'off_duty', label: 'Off Duty', color: '#7c93b8' },
];

export const RESPONDER_STATUS_COLORS = Object.fromEntries(
  RESPONDER_STATUSES.map(s => [s.key, s.color])
);

export const RESPONDER_STATUS_LABELS = Object.fromEntries(
  RESPONDER_STATUSES.map(s => [s.key, s.label])
);

export const DEFAULT_RESPONDER_STATUS = 'off_duty';

// Short display label for an incident_reports row, used on the "link to
// incident" chip in the composer and on linked messages in the feed.
// Falls back gracefully since location_label/description are both
// nullable on that table (see CommunityReportsPage.jsx).
export function incidentShortLabel(report) {
  if (!report) return '';
  return report.location_label || report.description?.slice(0, 40) || `Report #${report.id}`;
}

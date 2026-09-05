// Inline warning banner, most commonly shown when the model backend is
// unreachable and the page is falling back to simulated/cached data.
//
// This used to be two near-identical hand-rolled <div> blocks in
// Dashboard.jsx and AnalyticsPage.jsx (different border widths, different
// wording) -- centralized so both pages read the same way and a copy change
// only needs to happen once.
export default function ErrorBanner({ children, role = 'alert' }) {
  return (
    <div
      role={role}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
        borderLeft: '3px solid #ef4444', borderRadius: 'var(--radius-sm)',
        padding: '9px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#f87171',
      }}
    >
      <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠</span>
      <span>{children}</span>
    </div>
  );
}

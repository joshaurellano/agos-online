// Small uppercase heading used above cards/panels throughout the app
// (e.g. "🖥 SYSTEM STATUS", "📊 PREDICTION INPUT SUMMARY").
//
// This used to be copy-pasted as a local `function SectionLabel(...)` inside
// Dashboard.jsx, FloodMapPage.jsx, RainfallPage.jsx, RegistrationPage.jsx,
// and ReportsPage.jsx -- five separate copies of the same ~10 lines, one of
// which had already drifted (RegistrationPage used marginBottom: 12 instead
// of 10). Centralizing it here means a style tweak happens once, and the
// pages can't silently drift apart again.
export default function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--blue-border)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  );
}

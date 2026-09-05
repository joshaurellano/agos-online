// Small pulsing/static dot used to show a live-data indicator.
// status: 'live' | 'delayed' | 'simulated' (matches .status-dot.* in index.css)
export default function StatusDot({ status = 'live', label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className={`status-dot ${status}`} aria-hidden="true" />
      {label && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</span>}
    </span>
  );
}

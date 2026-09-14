// Floating button that resets a map back to its default center/zoom.
// Sits directly above ExpandableMapFrame's expand/collapse button in the
// bottom-right corner (bottom: 56 vs. the frame's bottom: 12), so the two
// stack neatly regardless of which map (Leaflet or MapLibre) renders it.
export default function MapRecenterButton({ onClick, bottom = 56 }) {
  return (
    <button
      onClick={onClick}
      title="Recenter map"
      aria-label="Recenter map"
      style={{
        position: 'absolute', bottom, right: 12, zIndex: 600,
        width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
        background: 'rgba(13, 31, 60, 0.82)', backdropFilter: 'blur(6px)',
        border: '1px solid rgba(56,189,248,0.3)', color: '#e2eaf5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    </button>
  );
}

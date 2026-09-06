// Dev-only preview strip -- lets you click through each rain intensity tier
// on the 3D map instead of waiting for real weather or hand-editing state.
// Only ever rendered when import.meta.env.DEV is true (see FloodMap3D.jsx),
// so it never ships to production.
const PRESETS = [
  { label: 'Live data', mm: null, condition: null },
  { label: 'Clear',        mm: 0,    condition: 'Clear sky' },
  { label: 'Overcast',     mm: 0,    condition: 'Overcast' },
  { label: 'Light rain',   mm: 1.5,  condition: 'Slight rain' },
  { label: 'Moderate rain',mm: 6,    condition: 'Moderate rain' },
  { label: 'Heavy rain',   mm: 14,   condition: 'Heavy rain' },
  { label: 'Thunderstorm', mm: 22,   condition: 'Thunderstorm' },
];

export default function RainDebugControls({ activeLabel, onSelect }) {
  return (
    <div style={{
      position: 'absolute', bottom: 12, right: 12, zIndex: 6,
      display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260,
      justifyContent: 'flex-end',
    }}>
      {PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => onSelect(p)}
          title="Dev-only rain preview -- not shown in production"
          style={{
            padding: '4px 8px', fontSize: '0.6rem', fontWeight: 700,
            letterSpacing: '0.03em', cursor: 'pointer',
            border: `1px solid ${activeLabel === p.label ? '#0ea5e9' : 'rgba(56,189,248,0.3)'}`,
            borderRadius: 5,
            background: activeLabel === p.label ? '#0ea5e9' : 'rgba(13, 31, 60, 0.82)',
            color: activeLabel === p.label ? '#fff' : '#8da4be',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

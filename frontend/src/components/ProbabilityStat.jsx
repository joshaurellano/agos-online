// The current flood probability as a plain readout above the trend chart.
// Neutral type with a small color key for the level, instead of a tinted box
// with a heavy colored number. Color is kept for meaning, not decoration.
const LEVELS = [
  { min: 75, color: '#ef4444', name: 'Critical', note: 'Immediate action may be required' },
  { min: 50, color: '#f97316', name: 'Warning',  note: 'High risk — monitor closely' },
  { min: 25, color: '#eab308', name: 'Advisory', note: 'Elevated risk — stay alert' },
  { min: 0,  color: '#22c55e', name: 'Normal',   note: 'Low risk' },
];

export default function ProbabilityStat({ value }) {
  const level = LEVELS.find((l) => value >= l.min) ?? LEVELS[LEVELS.length - 1];
  return (
    <div className="prob-stat">
      <div className="prob-stat-value">{Math.round(value)}<span>%</span></div>
      <div className="prob-stat-copy">
        <span className="prob-stat-label">Current flood probability</span>
        <span className="prob-stat-level">
          <i style={{ background: level.color }} aria-hidden="true" />
          {level.name} · {level.note}
        </span>
      </div>
    </div>
  );
}

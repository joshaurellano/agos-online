// Small colored pill, most commonly used to show the current alert level
// (NORMAL / ADVISORY / WARNING / CRITICAL) but usable for any short status.
//
// Usage:
//   <Badge color="#ef4444">CRITICAL</Badge>
//   <Badge level="WARNING" />   -- looks up label/color from ALERT_LEVELS
import { ALERT_LEVELS } from '../../data/mockData';

export default function Badge({ level, color, children, size = 'md' }) {
  const info = level ? ALERT_LEVELS[level] : null;
  const resolvedColor = color ?? info?.color ?? 'var(--text-secondary)';
  const label = children ?? info?.label ?? level ?? '';

  const sizes = {
    sm: { fontSize: '0.6rem', padding: '1px 6px' },
    md: { fontSize: '0.72rem', padding: '3px 10px' },
  };

  return (
    <span
      className="badge"
      style={{
        ...sizes[size],
        background: `${resolvedColor}30`,
        color: resolvedColor,
        border: `1px solid ${resolvedColor}50`,
      }}
    >
      {label}
    </span>
  );
}

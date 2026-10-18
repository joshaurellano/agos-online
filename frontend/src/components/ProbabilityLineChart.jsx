import { useId, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';

// One steady line over a faint fill, with a point on every reading. Used for
// flood probability (with the four alert zones shaded behind it) and for the
// rainfall trend (smoothed with a moving average, no zones).

export const ALERT_ZONES = [
  { y1: 0,  y2: 25,  color: '#22c55e' },
  { y1: 25, y2: 50,  color: '#eab308' },
  { y1: 50, y2: 75,  color: '#f97316' },
  { y1: 75, y2: 100, color: '#ef4444' },
];

function movingAverage(values, windowSize) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - windowSize + 1), i + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100;
  });
}

function Tip({ active, payload, label, colorFor, valueLabel, tipSuffix }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const color = colorFor(row.value);
  return (
    <div className="trend-tip">
      <div className="trend-tip-title">{label}</div>
      <div className="trend-tip-row">
        <span className="trend-tip-dot" style={{ background: color }} />
        <span>{valueLabel}</span>
        <strong style={{ color }}>{row.value}{tipSuffix}</strong>
      </div>
    </div>
  );
}

export default function ProbabilityLineChart({
  data,
  xKey = 'label',
  valueKey = 'floodRisk',
  valueLabel = 'Flood probability',
  colorFor,
  thresholds = [],
  zones = ALERT_ZONES,
  domain = [0, 100],
  ticks = [0, 25, 50, 75, 100],
  unit = '%',
  tipSuffix = '%',
  smoothWindow = 1,
  height = 280,
}) {
  const gid = useId().replace(/:/g, '');
  const rows = useMemo(() => {
    const raw = data.map((d) => Number(d[valueKey]) || 0);
    const vals = smoothWindow > 1 ? movingAverage(raw, smoothWindow) : raw;
    return data.map((d, i) => ({ ...d, value: vals[i] }));
  }, [data, valueKey, smoothWindow]);

  const interval = rows.length > 12 ? Math.ceil(rows.length / 8) - 1 : 0;
  const last = rows[rows.length - 1];
  const fmt = (v) => `${Number(Number(v).toFixed(2))}${unit}`;

  return (
    <div>
      <div className="trend-legend">
        <span><i className="trend-swatch line" style={{ background: 'var(--accent2)' }} /> {valueLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent2)', stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent2)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {zones.map((z) => (
            <ReferenceArea key={z.y1} y1={z.y1} y2={z.y2} fill={z.color} fillOpacity={0.045} stroke="none" />
          ))}
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--chart-axis)', fontSize: 10.5 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)', strokeOpacity: 0.35 }}
            tickMargin={8}
            interval={interval}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fill: 'var(--chart-axis)', fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeOpacity: 0.5, strokeDasharray: '3 3' }}
            content={<Tip colorFor={colorFor} valueLabel={valueLabel} tipSuffix={tipSuffix} />}
          />
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.label}
              y={t.y}
              stroke={t.color}
              strokeDasharray="3 5"
              strokeOpacity={0.4}
              label={{ value: t.label, position: 'insideTopLeft', fill: t.color, fontSize: 10 }}
            />
          ))}
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gid})`} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent2)"
            strokeWidth={2}
            dot={({ cx, cy, index }) => index === rows.length - 1
              ? <circle key={index} cx={cx} cy={cy} r={5} fill={colorFor(last.value)} stroke="var(--blue-card)" strokeWidth={2} />
              : <circle key={index} cx={cx} cy={cy} r={3.5} fill="var(--blue-card)" stroke="var(--accent2)" strokeWidth={2} />}
            activeDot={{ r: 5, fill: 'var(--accent2)', stroke: 'var(--blue-card)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

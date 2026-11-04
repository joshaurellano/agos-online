import { useId, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';

// One steady line over a faint fill. Used for flood probability and, with a
// moving average, for smoother series.
//
// Style notes (kept deliberately plain, like a hydrograph):
//  - No marker on every reading. Only the latest point is marked, in its level
//    color, so the eye lands on "now". Hover shows any other point.
//  - Alert thresholds are hairline dashed lines with their names in the right
//    margin, so labels never sit on top of the data.
//  - No animation: the chart refreshes every 30 s and should not redraw itself.

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
        <strong>{row.value}{tipSuffix}</strong>
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
  zones = [],            // optional shaded bands; off by default (pass ALERT_ZONES to use)
  domain = [0, 100],
  ticks = [0, 25, 50, 75, 100],
  unit = '%',
  tipSuffix = '%',
  smoothWindow = 1,
  height = 280,
  legend = false,        // one series: the card title already names it
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
      {legend && (
        <div className="trend-legend">
          <span><i className="trend-swatch line" style={{ background: 'var(--accent2)' }} /> {valueLabel}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: thresholds.length ? 66 : 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent2)', stopOpacity: 0.14 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent2)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {zones.map((z) => (
            <ReferenceArea key={z.y1} y1={z.y1} y2={z.y2} fill={z.color} fillOpacity={0.045} stroke="none" />
          ))}
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)', strokeOpacity: 0.35 }}
            tickMargin={8}
            interval={interval}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={46}
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
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{ value: t.label, position: 'right', fill: 'var(--chart-axis)', fontSize: 11 }}
            />
          ))}
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gid})`} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent2)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={({ cx, cy, index }) => index === rows.length - 1
              ? <circle key={index} cx={cx} cy={cy} r={4.5} fill={colorFor(last.value)} stroke="var(--blue-card)" strokeWidth={2} />
              : <g key={index} />}
            activeDot={{ r: 4, fill: 'var(--accent2)', stroke: 'var(--blue-card)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

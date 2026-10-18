import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Bars show each reading, colored by risk level. The line on top is a
// moving average, so the direction is readable at a glance.
function movingAverage(values, windowSize) {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

function ChartTooltip({ active, payload, label, unit, colorFor, valueLabel, lineLabel }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const color = colorFor(row);
  return (
    <div className="trend-tip">
      <div className="trend-tip-title">{label}</div>
      <div className="trend-tip-row">
        <span className="trend-tip-dot" style={{ background: color }} />
        <span>{valueLabel}</span>
        <strong style={{ color }}>{row.value}{unit}</strong>
      </div>
      <div className="trend-tip-row">
        <span className="trend-tip-line" />
        <span>{lineLabel}</span>
        <strong>{row.trend}{unit}</strong>
      </div>
    </div>
  );
}

export default function TrendChart({
  data,
  xKey = 'label',
  valueKey = 'value',
  unit = '',
  valueLabel = 'Value',
  colorFor,
  thresholds = [],
  domain,
  height = 280,
  tickEvery,
  trendWindow,
  lineMode = 'average',
  lineLabel,
}) {
  const cumulative = lineMode === 'cumulative';
  const lineName = lineLabel ?? (cumulative ? 'Total so far' : 'Trend');
  const rows = useMemo(() => {
    const values = data.map((d) => Number(d[valueKey]) || 0);
    const win = trendWindow ?? Math.max(2, Math.round(values.length / 8));
    let run = 0;
    const trend = cumulative
      ? values.map((v) => Math.round((run += v) * 10) / 10)
      : movingAverage(values, win);
    return data.map((d, i) => ({ ...d, value: values[i], trend: trend[i] }));
  }, [data, valueKey, trendWindow, cumulative]);

  const interval = tickEvery ?? (rows.length > 12 ? Math.ceil(rows.length / 8) - 1 : 0);

  return (
    <div>
      <div className="trend-legend">
        <span><i className="trend-swatch bar" /> {valueLabel}</span>
        <span><i className="trend-swatch line" /> {lineName}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            interval={interval}
          />
          <YAxis
            yAxisId="left"
            domain={domain}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}${unit}`}
            width={46}
          />
          {cumulative && (
            <YAxis
              yAxisId="right" orientation="right"
              tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
              tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v}${unit}`} width={46}
            />
          )}
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)' }}
            content={<ChartTooltip unit={unit} colorFor={colorFor} valueLabel={valueLabel} lineLabel={lineName} />}
          />
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.label}
              yAxisId="left"
              y={t.y}
              stroke={t.color}
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{ value: t.label, position: 'insideTopLeft', fill: t.color, fontSize: 10 }}
            />
          ))}
          <Bar yAxisId="left" dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={34}>
            {rows.map((row, i) => (
              <Cell key={i} fill={colorFor(row)} fillOpacity={i === rows.length - 1 ? 1 : 0.72} />
            ))}
          </Bar>
          <Line
            type="monotone"
            yAxisId={cumulative ? 'right' : 'left'}
            dataKey="trend"
            stroke="var(--chart-line)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: 'var(--chart-line)', stroke: 'var(--blue-card)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

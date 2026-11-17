import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Bars show each reading, colored by risk level. The line on top is a
// moving average, so the direction is readable at a glance.
//
// Style notes: no animation (the data refreshes on a timer and should not
// redraw itself), threshold names sit in the right margin instead of on top of
// the bars, and a series that is all zeros says so instead of drawing a flat line.
function movingAverage(values, windowSize) {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

function ChartTooltip({ active, payload, label, unit, colorFor, valueLabel, lineLabel, showTrend }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const color = colorFor(row);
  return (
    <div className="trend-tip">
      <div className="trend-tip-title">{label}</div>
      <div className="trend-tip-row">
        <span className="trend-tip-dot" style={{ background: color }} />
        <span>{valueLabel}</span>
        <strong>{row.value == null ? 'No reading' : `${row.value}${unit}`}</strong>
      </div>
      {showTrend && (
        <div className="trend-tip-row">
          <span className="trend-tip-line" />
          <span>{lineLabel}</span>
          <strong>{row.trend}{unit}</strong>
        </div>
      )}
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
  axisUnit,
  rightDomain,
  allowDecimals = true,
  ticks,
  emptyMessage,
  showTrend = true,   // moving-average / running-total line; off for sparse series
}) {
  const tickUnit = axisUnit ?? (unit === '%' ? '%' : '');
  const fmt = (v) => `${Number(Number(v).toFixed(2))}${tickUnit}`;
  const cumulative = lineMode === 'cumulative';
  const lineName = lineLabel ?? (cumulative ? 'Total so far' : 'Trend');
  const rows = useMemo(() => {
    // null/undefined means "no reading" for that slot: no bar is drawn and it
    // counts as 0 only inside the trend line.
    const shown = data.map((d) => (d[valueKey] == null ? null : Number(d[valueKey]) || 0));
    const values = shown.map((v) => v ?? 0);
    const win = trendWindow ?? Math.max(2, Math.round(values.length / 8));
    let run = 0;
    const trend = cumulative
      ? values.map((v) => Math.round((run += v) * 10) / 10)
      : movingAverage(values, win);
    return data.map((d, i) => ({ ...d, value: shown[i], trend: trend[i] }));
  }, [data, valueKey, trendWindow, cumulative]);

  const allZero = rows.every((r) => !r.value);
  const showEmpty = allZero && !!emptyMessage;
  const drawTrend = showTrend && !showEmpty;
  const interval = tickEvery ?? (rows.length > 12 ? Math.ceil(rows.length / 8) - 1 : 0);

  return (
    <div>
      {drawTrend && (
        <div className="trend-legend">
          <span><i className="trend-swatch bar" /> {valueLabel}</span>
          <span><i className="trend-swatch line" /> {lineName}</span>
        </div>
      )}
      <div className="trend-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} barCategoryGap="22%" margin={{ top: 10, right: thresholds.length ? 66 : 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)', strokeOpacity: 0.35 }}
            tickMargin={8}
            interval={interval}
            padding={{ left: 6, right: 6 }}
          />
          <YAxis
            yAxisId="left"
            domain={domain}
            ticks={ticks}
            allowDecimals={allowDecimals}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={46}
          />
          {cumulative && drawTrend && (
            <YAxis
              yAxisId="right" orientation="right"
              tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
              tickLine={false} axisLine={false}
              tickFormatter={fmt} width={44}
              domain={rightDomain}
            />
          )}
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)' }}
            content={<ChartTooltip unit={unit} colorFor={colorFor} valueLabel={valueLabel} lineLabel={lineName} showTrend={drawTrend} />}
          />
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.label}
              yAxisId="left"
              y={t.y}
              stroke={t.color}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{ value: t.label, position: 'right', fill: 'var(--chart-axis)', fontSize: 11 }}
            />
          ))}
          <Bar yAxisId="left" dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={40} isAnimationActive={false}>
            {rows.map((row, i) => (
              <Cell key={i} fill={colorFor(row)} fillOpacity={i === rows.length - 1 ? 1 : 0.72} />
            ))}
          </Bar>
          {drawTrend && <Line
            type="monotone"
            yAxisId={cumulative ? 'right' : 'left'}
            dataKey="trend"
            stroke="var(--chart-line)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={({ cx, cy, index }) => index === rows.length - 1
              ? <circle key="end" cx={cx} cy={cy} r={3.5} fill="var(--chart-line)" stroke="var(--blue-card)" strokeWidth={2} />
              : <g key={index} />}
            activeDot={{ r: 4, fill: 'var(--chart-line)', stroke: 'var(--blue-card)', strokeWidth: 2 }}
          />}
        </ComposedChart>
      </ResponsiveContainer>
      {showEmpty && <div className="chart-empty" role="status"><span>{emptyMessage}</span></div>}
      </div>
    </div>
  );
}

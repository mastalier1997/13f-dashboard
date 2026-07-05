import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { QuarterHoldings } from '../data';
import { fmtUsd } from '../format';

interface HoldingsChartProps {
  history: QuarterHoldings[];
}

// ≤ 6 series (categorical palette slots 1–6); more folds into the table below.
const MAX_SERIES = 6;

interface Series {
  key: string; // cusip (stable across quarters) or name fallback
  label: string;
  color: string;
}

const holdingKey = (h: { cusip: string | null; name: string | null }) =>
  h.cusip ?? h.name ?? '?';

// Top holdings of the latest quarter, traced back through every quarter.
function buildChart(history: QuarterHoldings[]) {
  const latest = history[history.length - 1];
  const series: Series[] = latest.holdings.slice(0, MAX_SERIES).map((h, i) => ({
    key: holdingKey(h),
    label: h.ticker ?? h.name ?? h.cusip ?? '?',
    color: `var(--series-${i + 1})`,
  }));

  const rows = history.map((q) => {
    const row: Record<string, string | number | null> = { quarter: q.quarter };
    for (const s of series) {
      const match = q.holdings.find((h) => holdingKey(h) === s.key);
      row[s.key] = match ? match.value : null; // null = not held → gap, not zero
    }
    return row;
  });

  return { series, rows };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; stroke: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="rounded-lg border border-neutral-200 bg-card-light px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-card-dark">
      <p className="mb-1.5 font-semibold">{label}</p>
      {sorted.map((entry) =>
        entry.value === null ? null : (
          <p key={entry.name} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.stroke }}
            />
            <span className="max-w-40 truncate text-neutral-600 dark:text-neutral-300">
              {entry.name}
            </span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{fmtUsd(entry.value)}</span>
          </p>
        )
      )}
    </div>
  );
}

export default function HoldingsChart({ history }: HoldingsChartProps) {
  if (history.length === 0) return null;
  const { series, rows } = buildChart(history);
  const singleQuarter = history.length === 1;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="quarter"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
          />
          <YAxis
            tickFormatter={fmtUsd}
            tickLine={false}
            axisLine={false}
            width={58}
            tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--viz-grid)' }} />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={singleQuarter ? { r: 4, fill: s.color, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={300}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="max-w-44 truncate">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

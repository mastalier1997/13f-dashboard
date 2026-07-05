import type { Holding, QuarterHoldings } from '../data';
import { fmtPct, fmtShares, fmtUsd } from '../format';

interface HoldingsTableProps {
  current: QuarterHoldings;
  previous: QuarterHoldings | null;
  totalValue: number; // exact per-quarter total from filing_summary
}

const holdingKey = (h: Holding) => h.cusip ?? h.name ?? '?';

function ShareChange({ holding, previous }: { holding: Holding; previous: QuarterHoldings | null }) {
  if (!previous) return <span className="text-neutral-400">—</span>;
  const before = previous.holdings.find((p) => holdingKey(p) === holdingKey(holding));
  if (!before) {
    return (
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        new
      </span>
    );
  }
  const delta = holding.shares - before.shares;
  if (delta === 0) return <span className="text-neutral-400">—</span>;
  const up = delta > 0;
  return (
    <span className={up ? 'text-[#006300] dark:text-[#0ca30c]' : 'text-[#d03b3b]'}>
      {up ? '▲' : '▼'} {fmtShares(Math.abs(delta))}
    </span>
  );
}

export default function HoldingsTable({ current, previous, totalValue }: HoldingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Holding</th>
            <th className="py-2 pr-3 text-right font-medium">Shares</th>
            <th className="py-2 pr-3 text-right font-medium">Δ shares</th>
            <th className="py-2 pr-3 text-right font-medium">Value</th>
            <th className="py-2 text-right font-medium">% of total</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {current.holdings.map((h, i) => (
            <tr
              key={holdingKey(h)}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
            >
              <td className="py-2 pr-3 text-neutral-400">{i + 1}</td>
              <td className="max-w-64 py-2 pr-3">
                <span className="block truncate font-medium">{h.name ?? h.ticker ?? h.cusip}</span>
                {h.cusip && <span className="text-xs text-neutral-400">{h.cusip}</span>}
              </td>
              <td className="py-2 pr-3 text-right">{fmtShares(h.shares)}</td>
              <td className="py-2 pr-3 text-right">
                <ShareChange holding={h} previous={previous} />
              </td>
              <td className="py-2 pr-3 text-right font-medium">{fmtUsd(h.value)}</td>
              <td className="py-2 text-right text-neutral-500 dark:text-neutral-400">
                {totalValue > 0 ? fmtPct(h.value / totalValue) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

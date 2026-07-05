import type { QuarterSummary } from '../data';
import { fmtPct, fmtUsd } from '../format';

interface StatTilesProps {
  summary: QuarterSummary;
  previous: QuarterSummary | null;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-card-light p-4 shadow-sm dark:border-neutral-800 dark:bg-card-dark">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{children}</p>
    </div>
  );
}

export default function StatTiles({ summary, previous }: StatTilesProps) {
  const qoq =
    previous && previous.totalValue > 0
      ? (summary.totalValue - previous.totalValue) / previous.totalValue
      : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile label={`Portfolio value · ${summary.quarter}`}>{fmtUsd(summary.totalValue)}</Tile>
      <Tile label="Change vs prior quarter">
        {qoq === null ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <span className={qoq >= 0 ? 'text-[#006300] dark:text-[#0ca30c]' : 'text-[#d03b3b]'}>
            {qoq >= 0 ? '+' : ''}
            {fmtPct(qoq)}
          </span>
        )}
      </Tile>
      <Tile label="Positions">{summary.positions.toLocaleString()}</Tile>
      <Tile label="Filed">{summary.filedDate ?? '—'}</Tile>
    </div>
  );
}

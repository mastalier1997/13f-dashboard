import AddFund from './AddFund';
import type { Fund, FundSuggestion } from '../data';

interface SidebarProps {
  funds: Fund[];
  selectedCik: string | null;
  onSelect: (cik: string) => void;
  canEdit: boolean;
  onRemove: (fund: Fund) => void;
  onAdd: (fund: FundSuggestion) => Promise<void>;
}

export default function Sidebar({ funds, selectedCik, onSelect, canEdit, onRemove, onAdd }: SidebarProps) {
  const existingCiks = new Set(funds.map((f) => f.cik));

  return (
    <aside className="space-y-5">
      <div className="rounded-xl border border-neutral-200 bg-card-light p-3 shadow-sm dark:border-neutral-800 dark:bg-card-dark">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Tracked funds
        </h2>
        {funds.length === 0 && (
          <p className="px-1 pb-1 text-sm text-neutral-500">No funds tracked yet.</p>
        )}
        <ul className="space-y-0.5">
          {funds.map((fund) => {
            const selected = fund.cik === selectedCik;
            return (
              <li key={fund.cik} className="group relative">
                <button
                  onClick={() => onSelect(fund.cik)}
                  className={`w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    selected
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="block truncate pr-5 font-medium">{fund.name}</span>
                  {fund.manager && (
                    <span
                      className={`block truncate pr-5 text-xs ${
                        selected ? 'text-neutral-300 dark:text-neutral-600' : 'text-neutral-500'
                      }`}
                    >
                      {fund.manager}
                    </span>
                  )}
                </button>
                {canEdit && (
                  <button
                    onClick={() => onRemove(fund)}
                    aria-label={`Remove ${fund.name}`}
                    title="Remove fund"
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-xs opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 ${
                      selected
                        ? 'text-neutral-300 hover:text-white dark:text-neutral-600 dark:hover:text-neutral-900'
                        : 'text-neutral-400 hover:text-red-600 dark:hover:text-red-400'
                    }`}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-card-light p-3 shadow-sm dark:border-neutral-800 dark:bg-card-dark">
        {canEdit ? (
          <AddFund existingCiks={existingCiks} onAdd={onAdd} />
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Sign in to add or remove funds.
          </p>
        )}
      </div>
    </aside>
  );
}

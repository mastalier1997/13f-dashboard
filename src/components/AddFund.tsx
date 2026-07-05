import { useEffect, useState } from 'react';
import { searchFunds } from '../data';
import type { FundSuggestion } from '../data';

interface AddFundProps {
  existingCiks: ReadonlySet<string>;
  onAdd: (fund: FundSuggestion) => Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// Live EDGAR search: type a manager name, pick a 13F filer. Nothing is
// persisted until a suggestion is actually added.
export default function AddFund({ existingCiks, onAdd }: AddFundProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FundSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setHits([]);
      setSearching(false);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchFunds(q);
        if (!stale) {
          setHits(results);
          setError(null);
        }
      } catch (err) {
        if (!stale) setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!stale) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handlePick(hit: FundSuggestion) {
    setAdding(hit.cik);
    setError(null);
    try {
      await onAdd(hit);
      setQuery('');
      setHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add fund');
    } finally {
      setAdding(null);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Add fund
      </h3>
      <input
        className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        placeholder="Search EDGAR — e.g. Berkshire"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && <p className="mt-2 text-xs text-neutral-500">Searching EDGAR…</p>}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {hits.length > 0 && (
        <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-neutral-200 p-1 dark:border-neutral-800">
          {hits.map((hit) => {
            const already = existingCiks.has(hit.cik);
            return (
              <li key={hit.cik}>
                <button
                  disabled={already || adding !== null}
                  onClick={() => handlePick(hit)}
                  className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800"
                >
                  <span className="min-w-0 truncate">{hit.name}</span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {already ? 'added' : adding === hit.cik ? 'adding…' : hit.cik.replace(/^0+/, '')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!searching && hits.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && !error && (
        <p className="mt-2 text-xs text-neutral-500">No 13F filers match.</p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
        Holdings for a new fund arrive with the next daily ingest run.
      </p>
    </div>
  );
}

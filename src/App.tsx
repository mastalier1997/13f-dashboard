import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  addFund,
  getFundHistory,
  getFunds,
  getFundSummaries,
  getSession,
  onAuthChange,
  removeFund,
} from './data';
import type { Fund, FundSuggestion, QuarterHoldings, QuarterSummary } from './data';
import AuthMenu from './components/AuthMenu';
import HoldingsChart from './components/HoldingsChart';
import HoldingsTable from './components/HoldingsTable';
import Sidebar from './components/Sidebar';
import StatTiles from './components/StatTiles';

const CARD =
  'rounded-xl border border-neutral-200 bg-card-light p-4 shadow-sm dark:border-neutral-800 dark:bg-card-dark';

export default function App() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [selectedCik, setSelectedCik] = useState<string | null>(null);
  const [history, setHistory] = useState<QuarterHoldings[]>([]);
  const [summaries, setSummaries] = useState<QuarterSummary[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    getFunds()
      .then((f) => {
        setFunds(f);
        if (f.length > 0) setSelectedCik((cik) => cik ?? f[0].cik);
      })
      .catch((e) => setError(e.message));
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (!selectedCik) {
      setHistory([]);
      setSummaries([]);
      setSelectedQuarter(null);
      return;
    }
    let stale = false;
    setLoading(true);
    Promise.all([getFundHistory(selectedCik), getFundSummaries(selectedCik)])
      .then(([hist, sums]) => {
        if (stale) return;
        setHistory(hist);
        setSummaries(sums);
        setSelectedQuarter(hist.length > 0 ? hist[hist.length - 1].quarter : null);
        setError(null);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [selectedCik]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  async function handleAdd(suggestion: FundSuggestion) {
    const fund = await addFund(suggestion);
    setFunds((prev) => [...prev, fund].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedCik(fund.cik);
  }

  async function handleRemove(fund: Fund) {
    if (!confirm(`Remove ${fund.name} and all its stored filings?`)) return;
    try {
      await removeFund(fund.cik);
      setFunds((prev) => {
        const rest = prev.filter((f) => f.cik !== fund.cik);
        if (selectedCik === fund.cik) setSelectedCik(rest.length > 0 ? rest[0].cik : null);
        return rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove fund');
    }
  }

  const selectedFund = funds.find((f) => f.cik === selectedCik) ?? null;
  const quarterIdx = history.findIndex((q) => q.quarter === selectedQuarter);
  const currentQuarter = quarterIdx >= 0 ? history[quarterIdx] : null;
  const previousQuarter = quarterIdx > 0 ? history[quarterIdx - 1] : null;
  const currentSummary = summaries.find((s) => s.quarter === selectedQuarter) ?? null;
  const summaryIdx = currentSummary ? summaries.indexOf(currentSummary) : -1;
  const previousSummary = summaryIdx > 0 ? summaries[summaryIdx - 1] : null;

  return (
    <div className="min-h-screen bg-page-light text-neutral-900 antialiased dark:bg-page-dark dark:text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-page-light/80 backdrop-blur dark:border-neutral-800 dark:bg-page-dark/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">13F Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
              className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {dark ? '☀' : '☾'}
            </button>
            <AuthMenu session={session} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          funds={funds}
          selectedCik={selectedCik}
          onSelect={setSelectedCik}
          canEdit={session !== null}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />

        <section className="min-w-0 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {!selectedFund && !error && (
            <div className={`${CARD} py-16 text-center text-neutral-500`}>
              {funds.length === 0
                ? 'No funds tracked yet — sign in and add one from EDGAR.'
                : 'Select a fund to see its holdings.'}
            </div>
          )}

          {selectedFund && (
            <>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{selectedFund.name}</h2>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedFund.manager ? `${selectedFund.manager} · ` : ''}
                  CIK {selectedFund.cik.replace(/^0+/, '')}
                </p>
              </div>

              {loading && <div className={`${CARD} py-12 text-center text-neutral-500`}>Loading…</div>}

              {!loading && history.length === 0 && (
                <div className={`${CARD} py-12 text-center text-sm text-neutral-500`}>
                  No filings stored yet. Holdings arrive with the next daily ingest run
                  (06:00 UTC) — or trigger “ingest-13f” manually in GitHub Actions.
                </div>
              )}

              {!loading && history.length > 0 && (
                <>
                  {currentSummary && (
                    <StatTiles summary={currentSummary} previous={previousSummary} />
                  )}

                  <div className={CARD}>
                    <h3 className="mb-3 text-sm font-semibold">Top holdings over time</h3>
                    <HoldingsChart history={history} />
                  </div>

                  <div className={CARD}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Holdings</h3>
                      <div className="flex flex-wrap gap-1">
                        {history.map((q) => (
                          <button
                            key={q.quarter}
                            onClick={() => setSelectedQuarter(q.quarter)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              q.quarter === selectedQuarter
                                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                            }`}
                          >
                            {q.quarter}
                          </button>
                        ))}
                      </div>
                    </div>
                    {currentQuarter && (
                      <HoldingsTable
                        current={currentQuarter}
                        previous={previousQuarter}
                        totalValue={currentSummary?.totalValue ?? 0}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8">
        <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
          13F data can be up to ~5 months stale, covers long US equity positions only, and is
          self-reported by managers — not audited by the SEC.
        </p>
      </footer>
    </div>
  );
}

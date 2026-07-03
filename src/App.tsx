import { useEffect, useState } from 'react';
import { getFunds, getFilings, getHoldings, addFund } from './data';
import type { Fund, Filing, Holding } from './data';

export default function App() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [selectedCik, setSelectedCik] = useState<string | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newFund, setNewFund] = useState({ cik: '', name: '', manager: '' });

  useEffect(() => {
    getFunds().then(setFunds).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedCik) return;
    setSelectedQuarter(null);
    setHoldings([]);
    getFilings(selectedCik).then(setFilings).catch((e) => setError(e.message));
  }, [selectedCik]);

  useEffect(() => {
    if (!selectedCik || !selectedQuarter) return;
    getHoldings(selectedCik, selectedQuarter).then(setHoldings).catch((e) => setError(e.message));
  }, [selectedCik, selectedQuarter]);

  async function handleAddFund(e: React.FormEvent) {
    e.preventDefault();
    try {
      const fund = await addFund(newFund);
      setFunds((prev) => [...prev, fund].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFund({ cik: '', name: '', manager: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 font-sans text-gray-900">
      <h1 className="mb-1 text-2xl font-bold">13F Dashboard</h1>
      <p className="mb-6 text-sm text-gray-500">
        13F data can be up to ~5 months stale, covers long US equities only, and is
        self-reported by managers (not audited by the SEC).
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section>
          <h2 className="mb-2 font-semibold">Funds</h2>
          <ul className="space-y-1">
            {funds.map((f) => (
              <li key={f.cik}>
                <button
                  className={`w-full rounded px-2 py-1 text-left hover:bg-gray-100 ${
                    selectedCik === f.cik ? 'bg-gray-200' : ''
                  }`}
                  onClick={() => setSelectedCik(f.cik)}
                >
                  {f.name}
                  {f.manager && <span className="text-gray-500"> — {f.manager}</span>}
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddFund} className="mt-4 space-y-2 border-t pt-4">
            <h3 className="font-semibold">Add fund</h3>
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="CIK"
              value={newFund.cik}
              onChange={(e) => setNewFund({ ...newFund, cik: e.target.value })}
              required
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Fund name"
              value={newFund.name}
              onChange={(e) => setNewFund({ ...newFund, name: e.target.value })}
              required
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Manager"
              value={newFund.manager}
              onChange={(e) => setNewFund({ ...newFund, manager: e.target.value })}
            />
            <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white">
              Add
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Filings</h2>
          {!selectedCik && <p className="text-sm text-gray-500">Select a fund.</p>}
          <ul className="space-y-1">
            {filings.map((f) => (
              <li key={f.quarter}>
                <button
                  className={`w-full rounded px-2 py-1 text-left hover:bg-gray-100 ${
                    selectedQuarter === f.quarter ? 'bg-gray-200' : ''
                  }`}
                  onClick={() => setSelectedQuarter(f.quarter)}
                >
                  {f.quarter}
                  {f.filedDate && <span className="text-gray-500"> (filed {f.filedDate})</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Holdings</h2>
          {!selectedQuarter && <p className="text-sm text-gray-500">Select a filing.</p>}
          <table className="w-full text-sm">
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1 pr-2">{h.ticker ?? h.name}</td>
                  <td className="py-1 text-right">{h.shares.toLocaleString()} sh</td>
                  <td className="py-1 pl-2 text-right">${h.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { getFunds, getFilings, getHoldings, addFund, USING_MOCK } from './api.js';

// ---- formatting -------------------------------------------------------------

const fmtUSD = (v) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v);

const fmtShares = (v) => new Intl.NumberFormat('en-US').format(v);

const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

const keyOf = (h) => h.cusip ?? h.ticker ?? h.name;

// ---- quarter-over-quarter diff ----------------------------------------------

function diffHoldings(current, previous) {
  const prev = new Map(previous.map((h) => [keyOf(h), h]));
  const seen = new Set();
  const added = [], increased = [], decreased = [], unchanged = [];
  for (const h of current) {
    const p = prev.get(keyOf(h));
    seen.add(keyOf(h));
    if (!p) added.push({ ...h, prevShares: 0 });
    else if (h.shares > p.shares) increased.push({ ...h, prevShares: p.shares });
    else if (h.shares < p.shares) decreased.push({ ...h, prevShares: p.shares });
    else unchanged.push(h);
  }
  const exited = previous.filter((h) => !seen.has(keyOf(h)));
  return { added, increased, decreased, exited, unchanged };
}

// ---- components ---------------------------------------------------------------

function Delta({ now, before, money }) {
  if (before === 0 || before == null) return null;
  const d = (now - before) / before;
  if (d === 0) return <span className="delta">unchanged</span>;
  const cls = d > 0 ? 'up' : 'down';
  const arrow = d > 0 ? '▲' : '▼';
  return (
    <span className={`delta ${cls}`}>
      {arrow} {fmtPct(d)}{money ? ` (${fmtUSD(now - before)})` : ''} vs prior qtr
    </span>
  );
}

function StatTiles({ holdings, prevHoldings, diff }) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const prevTotal = prevHoldings?.reduce((s, h) => s + h.value, 0);
  return (
    <div className="tiles">
      <div className="tile">
        <div className="label">Reported portfolio value</div>
        <div className="value">{fmtUSD(total)}</div>
        {prevTotal ? <Delta now={total} before={prevTotal} money /> : null}
      </div>
      <div className="tile">
        <div className="label">Positions</div>
        <div className="value">{holdings.length}</div>
        {prevHoldings ? (
          <span className="delta">
            {diff.added.length} new · {diff.exited.length} exited
          </span>
        ) : null}
      </div>
      <div className="tile">
        <div className="label">Top holding</div>
        <div className="value">{holdings[0]?.ticker ?? holdings[0]?.name ?? '—'}</div>
        {holdings[0] && total > 0 ? (
          <span className="delta">{((holdings[0].value / total) * 100).toFixed(1)}% of portfolio</span>
        ) : null}
      </div>
      <div className="tile">
        <div className="label">Changes this quarter</div>
        <div className="value">
          {prevHoldings ? diff.added.length + diff.increased.length + diff.decreased.length + diff.exited.length : '—'}
        </div>
        {prevHoldings ? (
          <span className="delta">
            {diff.increased.length} added to · {diff.decreased.length} trimmed
          </span>
        ) : (
          <span className="delta">no prior quarter loaded</span>
        )}
      </div>
    </div>
  );
}

function HoldingsTable({ holdings, prevHoldings }) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const prev = prevHoldings ? new Map(prevHoldings.map((h) => [keyOf(h), h])) : null;
  const maxValue = holdings[0]?.value ?? 1;
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Security</th>
          <th className="num">Shares</th>
          <th className="num">Δ shares</th>
          <th className="num">Value</th>
          <th className="bar-cell">% of portfolio</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h, i) => {
          const p = prev?.get(keyOf(h));
          const dShares = p ? h.shares - p.shares : null;
          return (
            <tr key={keyOf(h)}>
              <td className="num">{i + 1}</td>
              <td>
                <span className="ticker">{h.ticker ?? h.cusip}</span>
                <span className="sec-name">{h.name}</span>
              </td>
              <td className="num">{fmtShares(h.shares)}</td>
              <td className="num">
                {dShares == null ? (
                  <span className="delta up">new</span>
                ) : dShares === 0 ? (
                  '—'
                ) : (
                  <span className={dShares > 0 ? 'up' : 'down'}>
                    {dShares > 0 ? '+' : ''}
                    {fmtShares(dShares)}
                  </span>
                )}
              </td>
              <td className="num">{fmtUSD(h.value)}</td>
              <td className="bar-cell">
                <span className="bar-pct">{((h.value / total) * 100).toFixed(1)}%</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(h.value / maxValue) * 100}%` }} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChangeGroup({ title, kind, rows, render }) {
  return (
    <div className="change-group">
      <h3>
        <span className={`dot ${kind}`} /> {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <div className="empty-note">None this quarter.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Security</th>
              <th className="num">Shares before</th>
              <th className="num">Shares after</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>{rows.map(render)}</tbody>
        </table>
      )}
    </div>
  );
}

function ChangesView({ diff }) {
  if (!diff) {
    return (
      <div className="panel">
        No earlier filing to compare against — this is the oldest quarter on record here.
      </div>
    );
  }
  const row = (h) => (
    <tr key={keyOf(h)}>
      <td>
        <span className="ticker">{h.ticker ?? h.cusip}</span>
        <span className="sec-name">{h.name}</span>
      </td>
      <td className="num">{h.prevShares != null ? fmtShares(h.prevShares) : fmtShares(h.shares)}</td>
      <td className="num">{h.prevShares != null ? fmtShares(h.shares) : '0'}</td>
      <td className="num">{fmtUSD(h.value)}</td>
    </tr>
  );
  return (
    <>
      <ChangeGroup title="New positions" kind="add" rows={diff.added} render={row} />
      <ChangeGroup title="Added to" kind="add" rows={diff.increased} render={row} />
      <ChangeGroup title="Trimmed" kind="cut" rows={diff.decreased} render={row} />
      <ChangeGroup
        title="Exited"
        kind="cut"
        rows={diff.exited}
        render={(h) => (
          <tr key={keyOf(h)}>
            <td>
              <span className="ticker">{h.ticker ?? h.cusip}</span>
              <span className="sec-name">{h.name}</span>
            </td>
            <td className="num">{fmtShares(h.shares)}</td>
            <td className="num">0</td>
            <td className="num">{fmtUSD(h.value)} (prior qtr)</td>
          </tr>
        )}
      />
    </>
  );
}

function AddFundForm({ onAdded }) {
  const [cik, setCik] = useState('');
  const [name, setName] = useState('');
  const [manager, setManager] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fund = await addFund({ cik, name, manager });
      setCik(''); setName(''); setManager('');
      onAdded(fund);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-fund" onSubmit={submit}>
      <h2>Add fund by CIK</h2>
      <input placeholder="CIK (e.g. 1067983)" value={cik} onChange={(e) => setCik(e.target.value)} required />
      <input placeholder="Fund name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Manager (optional)" value={manager} onChange={(e) => setManager(e.target.value)} />
      <button disabled={busy || !cik || !name}>{busy ? 'Adding…' : 'Track fund'}</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

// ---- app ----------------------------------------------------------------------

export default function App() {
  const [funds, setFunds] = useState([]);
  const [search, setSearch] = useState('');
  const [cik, setCik] = useState(null);
  const [filings, setFilings] = useState(null); // null = loading
  const [quarter, setQuarter] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [prevHoldings, setPrevHoldings] = useState(null);
  const [tab, setTab] = useState('holdings');

  useEffect(() => {
    getFunds().then((f) => {
      setFunds(f);
      setCik((c) => c ?? f[0]?.cik ?? null);
    });
  }, []);

  useEffect(() => {
    if (!cik) return;
    let stale = false;
    setFilings(null);
    setQuarter(null);
    setHoldings(null);
    getFilings(cik).then((f) => {
      if (stale) return;
      setFilings(f);
      setQuarter(f[0]?.quarter ?? null);
    });
    return () => { stale = true; };
  }, [cik]);

  useEffect(() => {
    if (!cik || !quarter || !filings) return;
    let stale = false;
    setHoldings(null);
    setPrevHoldings(null);
    const idx = filings.findIndex((f) => f.quarter === quarter);
    const prevQuarter = filings[idx + 1]?.quarter;
    Promise.all([
      getHoldings(cik, quarter),
      prevQuarter ? getHoldings(cik, prevQuarter) : Promise.resolve(null),
    ]).then(([cur, prev]) => {
      if (stale) return;
      setHoldings(cur);
      setPrevHoldings(prev);
    });
    return () => { stale = true; };
  }, [cik, quarter, filings]);

  const fund = funds.find((f) => f.cik === cik);
  const filing = filings?.find((f) => f.quarter === quarter);
  const diff = useMemo(
    () => (holdings && prevHoldings ? diffHoldings(holdings, prevHoldings) : null),
    [holdings, prevHoldings]
  );
  const visibleFunds = funds.filter((f) =>
    (f.name + ' ' + (f.manager ?? '')).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <h1>
            13F Tracker
            {USING_MOCK && <span className="mock-pill">mock data</span>}
          </h1>
          <div className="sub">{funds.length} funds tracked</div>
        </div>
        <input
          className="search"
          placeholder="Search funds…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <nav className="fund-list">
          {visibleFunds.map((f) => (
            <button
              key={f.cik}
              className={`fund-item ${f.cik === cik ? 'active' : ''}`}
              onClick={() => setCik(f.cik)}
            >
              {f.name}
              {f.custom && <span className="badge">custom</span>}
              <span className="manager">{f.manager}</span>
            </button>
          ))}
        </nav>
        <AddFundForm
          onAdded={(f) => {
            setFunds((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name)));
            setCik(f.cik);
          }}
        />
      </aside>

      <main className="main">
        {!fund ? (
          <div className="loading">Loading funds…</div>
        ) : (
          <>
            <div className="fund-header">
              <h2>{fund.name}</h2>
              <span className="meta">
                {fund.manager} · CIK {fund.cik}
              </span>
            </div>

            {filings === null ? (
              <div className="loading">Loading filings…</div>
            ) : filings.length === 0 ? (
              <div className="panel" style={{ marginTop: 16 }}>
                <strong>Awaiting first sync.</strong>
                <br />
                This fund was just added — holdings appear after the next EDGAR
                ingestion run picks up its 13F filings.
              </div>
            ) : (
              <>
                <div className="quarter-row">
                  <select value={quarter ?? ''} onChange={(e) => setQuarter(e.target.value)}>
                    {filings.map((f) => (
                      <option key={f.quarter} value={f.quarter}>
                        {f.quarter}
                      </option>
                    ))}
                  </select>
                  {filing?.filedDate && <span className="filed">filed {filing.filedDate}</span>}
                </div>

                {holdings === null ? (
                  <div className="loading">Loading holdings…</div>
                ) : (
                  <>
                    <StatTiles holdings={holdings} prevHoldings={prevHoldings} diff={diff ?? { added: [], exited: [], increased: [], decreased: [] }} />
                    <div className="tabs">
                      <button className={`tab ${tab === 'holdings' ? 'active' : ''}`} onClick={() => setTab('holdings')}>
                        Holdings ({holdings.length})
                      </button>
                      <button className={`tab ${tab === 'changes' ? 'active' : ''}`} onClick={() => setTab('changes')}>
                        Changes vs prior quarter
                      </button>
                    </div>
                    {tab === 'holdings' ? (
                      <HoldingsTable holdings={holdings} prevHoldings={prevHoldings} />
                    ) : (
                      <ChangesView diff={diff} />
                    )}
                  </>
                )}
              </>
            )}

            <div className="caveats">
              13F filings arrive up to 45 days after quarter-end, so positions can be
              months stale. They cover long US equity positions only — no shorts,
              options detail, cash, bonds, or non-US holdings — and the SEC does not
              verify their accuracy: treat everything as reported, not audited.
            </div>
          </>
        )}
      </main>
    </div>
  );
}

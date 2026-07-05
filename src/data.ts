// Supabase data layer: reads, owner-gated writes, auth, and EDGAR fund search.

import { createClient, type Session } from '@supabase/supabase-js';

export interface Fund {
  cik: string;
  name: string;
  manager: string | null;
  custom: boolean;
}

export interface Holding {
  cusip: string | null;
  ticker: string | null;
  name: string | null;
  shares: number;
  value: number;
}

// One filed quarter with its top holdings (largest first, capped at TOP_HOLDINGS).
export interface QuarterHoldings {
  quarter: string;
  periodEnd: string;
  filedDate: string | null;
  holdings: Holding[];
}

// Exact per-quarter aggregates from the filing_summary view (the holdings list
// above is capped, so totals must come from here).
export interface QuarterSummary {
  quarter: string;
  periodEnd: string;
  filedDate: string | null;
  positions: number;
  totalValue: number;
}

export interface FundSuggestion {
  cik: string;
  name: string;
}

const TOP_HOLDINGS = 100;

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function getFunds(): Promise<Fund[]> {
  const { data, error } = await sb
    .from('funds')
    .select('cik,name,manager,custom')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getFundHistory(cik: string): Promise<QuarterHoldings[]> {
  const { data, error } = await sb
    .from('filings')
    .select('quarter, period_end, filed_date, holdings(cusip,ticker,name,shares,value)')
    .eq('cik', cik)
    .order('period_end', { ascending: true })
    .order('value', { referencedTable: 'holdings', ascending: false })
    .limit(TOP_HOLDINGS, { referencedTable: 'holdings' });
  if (error) throw error;
  return data.map((f) => ({
    quarter: f.quarter,
    periodEnd: f.period_end,
    filedDate: f.filed_date,
    holdings: f.holdings,
  }));
}

export async function getFundSummaries(cik: string): Promise<QuarterSummary[]> {
  const { data, error } = await sb
    .from('filing_summary')
    .select('quarter, period_end, filed_date, positions, total_value')
    .eq('cik', cik)
    .order('period_end', { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    quarter: r.quarter,
    periodEnd: r.period_end,
    filedDate: r.filed_date,
    positions: r.positions,
    totalValue: r.total_value,
  }));
}

export async function addFund({ cik, name }: FundSuggestion): Promise<Fund> {
  const clean = cik.replace(/\D/g, '').padStart(10, '0');
  const { data, error } = await sb
    .from('funds')
    .insert({ cik: clean, name, custom: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFund(cik: string): Promise<void> {
  const { error } = await sb.from('funds').delete().eq('cik', cik);
  if (error) throw error;
}

// EDGAR 13F-filer name search, proxied through the search-funds edge function
// (sec.gov sends no CORS headers). Results are never stored.
export async function searchFunds(q: string): Promise<FundSuggestion[]> {
  const { data, error } = await sb.functions.invoke('search-funds', { body: { q } });
  if (error) throw error;
  return data;
}

// --- auth (owner sign-in gates add/remove; reads are public) ---

export function getSession(): Promise<Session | null> {
  return sb.auth.getSession().then(({ data }) => data.session);
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

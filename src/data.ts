// Supabase data layer for the React app.
//
// App.tsx imports these four functions — see its DATA LAYER usage.

import { createClient } from '@supabase/supabase-js';

export interface Fund {
  cik: string;
  name: string;
  manager: string | null;
  custom: boolean;
}

export interface Filing {
  cik: string;
  quarter: string;
  filedDate: string | null;
}

export interface Holding {
  ticker: string | null;
  name: string | null;
  shares: number;
  value: number;
}

export interface NewFund {
  cik: string;
  name: string;
  manager: string;
}

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

export async function getFilings(cik: string): Promise<Filing[]> {
  const { data, error } = await sb
    .from('filings')
    .select('quarter,filed_date,period_end')
    .eq('cik', cik)
    .order('period_end', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({ cik, quarter: f.quarter, filedDate: f.filed_date }));
}

export async function getHoldings(cik: string, quarter: string): Promise<Holding[]> {
  const { data: filing, error: filingError } = await sb
    .from('filings')
    .select('id')
    .eq('cik', cik)
    .eq('quarter', quarter)
    .single();
  if (filingError) throw filingError;
  const { data, error } = await sb
    .from('holdings')
    .select('ticker,name,shares,value')
    .eq('filing_id', filing.id)
    .order('value', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFund({ cik, name, manager }: NewFund): Promise<Fund> {
  const clean = cik.replace(/\D/g, '').padStart(10, '0');
  const { data, error } = await sb
    .from('funds')
    .insert({ cik: clean, name, manager, custom: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

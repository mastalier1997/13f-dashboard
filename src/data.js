// Supabase data layer for the React app.
//
// App.jsx already awaits these four functions (see its DATA LAYER block) —
// import from here and delete the mock implementations; nothing else in the
// component changes.

import { createClient } from '@supabase/supabase-js';

// Lazy so this module can be imported without Supabase env vars
// (src/api.js falls back to the mock layer in that case).
let _sb;
function client() {
  _sb ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  return _sb;
}

export async function getFunds() {
  const { data, error } = await client()
    .from('funds')
    .select('cik,name,manager,custom')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getFilings(cik) {
  const { data, error } = await client()
    .from('filings')
    .select('quarter,filed_date,period_end')
    .eq('cik', cik)
    .order('period_end', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({ cik, quarter: f.quarter, filedDate: f.filed_date }));
}

export async function getHoldings(cik, quarter) {
  const { data: filing, error: filingError } = await client()
    .from('filings')
    .select('id')
    .eq('cik', cik)
    .eq('quarter', quarter)
    .single();
  if (filingError) throw filingError;
  const { data, error } = await client()
    .from('holdings')
    .select('ticker,name,shares,value')
    .eq('filing_id', filing.id)
    .order('value', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFund({ cik, name, manager }) {
  const clean = cik.replace(/\D/g, '').padStart(10, '0');
  const { data, error } = await client()
    .from('funds')
    .insert({ cik: clean, name, manager, custom: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

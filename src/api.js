// Data-source switch: with Supabase env vars set (.env.local), the app talks
// to the real backend; without them it runs on the mock layer so the UI is
// viewable with zero setup. Both modules expose the same four functions.
import * as mock from './mock.js';
import * as supabase from './data.js';

export const USING_MOCK = !import.meta.env.VITE_SUPABASE_URL;

const impl = USING_MOCK ? mock : supabase;

export const getFunds = impl.getFunds;
export const getFilings = impl.getFilings;
export const getHoldings = impl.getHoldings;
export const addFund = impl.addFund;

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is not set. Please configure it in your environment.');
}

if (!SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not set. Please configure it in your environment.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing – sync will not work.',
  );
}

// Fall back to placeholder values so createClient never throws at startup.
// All API calls will fail gracefully until real credentials are configured.
export const supabase = createClient(
  supabaseUrl || 'https://supabase.invalid',
  supabaseAnonKey || 'placeholder-anon-key',
);

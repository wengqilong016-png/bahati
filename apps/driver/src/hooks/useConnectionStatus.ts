import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type ConnectionStatus = 'checking' | 'connected' | 'config-error' | 'network-error';

/**
 * Checks whether the Supabase environment variables are configured and
 * whether the backend is actually reachable.
 *
 * Status values:
 *  - 'checking'      – initial state, probe in progress
 *  - 'connected'     – Supabase is reachable (even auth/RLS errors count as reachable)
 *  - 'config-error'  – VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set
 *  - 'network-error' – env vars are set but the server cannot be reached
 */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    !supabaseUrl || !supabaseAnonKey ? 'config-error' : 'checking',
  );

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setStatus('config-error');
      return;
    }

    let cancelled = false;

    const probe = async () => {
      try {
        const { error } = await supabase.from('kiosks').select('id').limit(1);
        if (cancelled) return;
        // Supabase-js surfaces network failures as PostgrestError with messages like
        // "Failed to fetch" (Chrome/Firefox) or "NetworkError when attempting to fetch
        // resource" (Firefox). Any other error means we actually reached the server.
        if (error && /failed to fetch|networkerror|network request failed/i.test(error.message)) {
          setStatus('network-error');
        } else {
          // Even an RLS/auth error means we reached Supabase.
          setStatus('connected');
        }
      } catch {
        if (!cancelled) setStatus('network-error');
      }
    };

    void probe();
    const interval = setInterval(() => { void probe(); }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}

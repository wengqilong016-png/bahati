import { useState, useEffect } from 'react';
import { type Session, type User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const PENDING_UPLOADS_KEY = 'smartkiosk_pending_photo_uploads';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        // Supabase unreachable — let user see login screen instead of infinite spinner
        setSession(null);
        setUser(null);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async (): Promise<void> => {
    // Clear all local data to prevent cross-driver data leaks
    try {
      await Promise.all([
        db.tasks.clear(),
        db.kiosks.clear(),
        db.sync_queue.clear(),
        db.score_reset_requests.clear(),
        db.kiosk_onboarding_records.clear(),
        db.reconciliations.clear(),
      ]);
      localStorage.removeItem(PENDING_UPLOADS_KEY);
    } catch {
      // Best-effort cleanup — proceed with signout regardless
    }
    await supabase.auth.signOut();
  };

  return { user, session, loading, signIn, signOut };
}

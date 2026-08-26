import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { Profile, Role } from '../types';

interface SignUpArgs {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  grade?: string;
}

interface SignUpResult {
  error: string | null;
  /** true when a session was established immediately (email confirmation off). */
  signedIn: boolean;
  /** true when the account was created but awaits email confirmation. */
  needsConfirmation: boolean;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Set when the profile row could not be read — lets the UI offer a retry instead of hanging. */
  profileError: string | null;
  signUp: (args: SignUpArgs) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  /**
   * The profile row is written by the `numo_handle_new_user` trigger. Immediately
   * after signup the read can land before that row is visible, so a null result
   * is retried briefly before being treated as missing.
   */
  const loadProfile = useCallback(async (userId: string, awaitCreation = false) => {
    const attempts = awaitCreation ? 4 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const { data, error } = await supabase
          .from('numo_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setProfile(data as Profile);
          setProfileError(null);
          return;
        }
      } catch (err) {
        setProfile(null);
        setProfileError(toUserMessage(err, 'Could not load your profile.'));
        return;
      }
      if (attempt < attempts - 1) await sleep(300 * (attempt + 1));
    }
    setProfile(null);
    setProfileError(awaitCreation ? 'Your profile is still being set up.' : null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (user) await loadProfile(user.id, true);
  }, [loadProfile]);

  useEffect(() => {
    let active = true;

    // `loading` must clear on every path, otherwise a connectivity failure at
    // startup leaves the whole app on a permanent loading screen.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) await loadProfile(data.session.user.id);
      } catch (err) {
        if (!active) return;
        setSession(null);
        setProfileError(toUserMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        void loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(
    async ({ email, password, fullName, role, grade }: SignUpArgs): Promise<SignUpResult> => {
      try {
        // The profile row + student progress row are created by the
        // `numo_handle_new_user` DB trigger from this metadata, so it works even
        // when no session is returned (email-confirmation enabled).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              numo_role: role,
              numo_full_name: fullName,
              numo_grade: grade ?? '',
            },
          },
        });
        if (error) return { error: toUserMessage(error), signedIn: false, needsConfirmation: false };

        if (data.session?.user) {
          await loadProfile(data.session.user.id, true);
          return { error: null, signedIn: true, needsConfirmation: false };
        }

        // No session: confirmation is required. Attempt an immediate sign-in in
        // case the project auto-confirms; otherwise report that confirmation is needed.
        const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
        if (signInData.session?.user) {
          await loadProfile(signInData.session.user.id, true);
          return { error: null, signedIn: true, needsConfirmation: false };
        }

        return { error: null, signedIn: false, needsConfirmation: true };
      } catch (err) {
        return { error: toUserMessage(err), signedIn: false, needsConfirmation: false };
      }
    },
    [loadProfile]
  );

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: toUserMessage(error) };
      return { error: null };
    } catch (err) {
      return { error: toUserMessage(err) };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign-out must succeed locally even when the server is unreachable.
    }
    setSession(null);
    setProfile(null);
    setProfileError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

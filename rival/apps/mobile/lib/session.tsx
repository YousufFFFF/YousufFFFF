import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Me } from '@rival/api-client';
import { api, hasStoredSession, onSignedOut } from './api';

/**
 * Session state.
 *
 * One source of truth for "who is signed in and how far through onboarding are
 * they", so the router can decide what to show without every screen re-fetching
 * the profile.
 */

interface SessionValue {
  me: Me | null;
  loading: boolean;
  /** True once the initial restore has finished, however it went. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName?: string; referralCode?: string }) => Promise<void>;
  signInWithProvider: (provider: 'google' | 'apple', idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Applies a partial profile update locally, so the UI does not wait on a refetch. */
  patchMe: (patch: Partial<Me>) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Only call the API if there is something stored; otherwise a cold start
      // wastes a round trip and shows a spinner for no reason.
      if (await hasStoredSession()) {
        try {
          const profile = await api.me();
          if (!cancelled) setMe(profile);
        } catch {
          if (!cancelled) setMe(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The client calls this when a refresh token is rejected.
    onSignedOut(() => setMe(null));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await api.login(email, password);
      setMe(await api.me());
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName?: string; referralCode?: string }) => {
      setLoading(true);
      try {
        await api.register(input);
        setMe(await api.me());
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple', idToken: string) => {
    setLoading(true);
    try {
      await api.loginWithProvider(provider, idToken);
      setMe(await api.me());
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setMe(null);
  }, []);

  const patchMe = useCallback((patch: Partial<Me>) => {
    setMe((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ me, loading, ready, signIn, signUp, signInWithProvider, signOut, refresh, patchMe }),
    [me, loading, ready, signIn, signUp, signInWithProvider, signOut, refresh, patchMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}

/** The signed-in profile, for screens the router only renders when signed in. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error('useMe used outside an authenticated screen');
  return me;
}

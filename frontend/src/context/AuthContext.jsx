import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, firebaseConfigured } from '../config/firebase.js';
import { apiRequest } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState('');

  const loadSession = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      setSession(null);
      return null;
    }

    const token = await firebaseUser.getIdToken();
    const nextSession = await apiRequest('/auth/me', { token });
    setSession(nextSession);
    return nextSession;
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setError('');
      setUser(firebaseUser);

      try {
        await loadSession(firebaseUser);
      } catch (nextError) {
        setSession(null);
        setError(nextError.message);
      } finally {
        setLoading(false);
      }
    });
  }, [loadSession]);

  const getToken = useCallback(async () => {
    if (!user) {
      throw new Error('Спочатку потрібно увійти.');
    }

    return user.getIdToken();
  }, [user]);

  const refreshSession = useCallback(() => loadSession(user), [loadSession, user]);

  const logout = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      configured: firebaseConfigured,
      error,
      getToken,
      loading,
      logout,
      profile: session?.profile ?? null,
      refreshSession,
      session,
      user,
    }),
    [error, getToken, loading, logout, refreshSession, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

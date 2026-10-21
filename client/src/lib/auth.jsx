import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, onUnauthorized } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  // pending = password step passed, waiting for the 2-step code.
  const [state, setState] = useState({ loading: true, user: null, pending: null });

  useEffect(() => {
    api('/auth/me')
      .then((d) => setState({ loading: false, user: d.user ?? null, pending: d.stage === 'otp' ? d : null }))
      .catch(() => setState({ loading: false, user: null, pending: null }));
  }, []);

  useEffect(() => {
    onUnauthorized((data) => {
      setState({ loading: false, user: null, pending: null });
      navigate('/login', { replace: true, state: { message: data?.error || 'Your session has ended. Please sign in again.' } });
    });
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setState({ loading: false, user: null, pending: d });
    return d;
  }, []);

  const verify = useCallback(async (code, method) => {
    const d = await api('/auth/verify', { method: 'POST', body: { code, method } });
    setState({ loading: false, user: d.user, pending: null });
    return d;
  }, []);

  const cancelPending = useCallback(async () => {
    await api('/auth/cancel', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, pending: null });
  }, []);

  const logout = useCallback(
    async (reason) => {
      await api('/auth/logout', { method: 'POST', body: { reason } }).catch(() => {});
      setState({ loading: false, user: null, pending: null });
      const message =
        reason === 'timeout' ? 'You were signed out after 15 minutes of inactivity.' : 'You have signed out.';
      navigate('/login', { replace: true, state: { message } });
    },
    [navigate],
  );

  const refreshUser = useCallback(async () => {
    const d = await api('/auth/me');
    setState((s) => ({ ...s, user: d.user ?? null }));
  }, []);

  const value = useMemo(
    () => ({ ...state, login, verify, cancelPending, logout, refreshUser }),
    [state, login, verify, cancelPending, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

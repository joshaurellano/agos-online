import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { invokeFunction } from '../lib/functions';
import { logger } from '../lib/logger';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const clearError = useCallback(() => setError(''), []);

  // A signed-in login is only usable with an active profile row. Without
  // one (never created, or the admin disabled the account) sign out again
  // and say why, instead of leaving a half-signed-in blank app.
  const loadProfile = useCallback(async (userId) => {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*, roles(role_desc)')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      logger.error('Profile fetch failed:', profileError.message);
      setError('Could not load your account. Check your connection and try again.');
      setUser(null);
    } else if (!data) {
      setError('This account has no profile. Ask an admin to set it up.');
      await supabase.auth.signOut();
    } else if (data.is_active === false) {
      setError('This account is disabled. Contact an admin.');
      await supabase.auth.signOut();
    } else {
      setUser(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes (hourly) are the same person -- nothing to reload.
      if (event === 'TOKEN_REFRESHED') return;
      if (session) {
        // Calling supabase from inside this callback can deadlock auth-js,
        // so hand the profile fetch to the next tick.
        setTimeout(() => loadProfile(session.user.id), 0);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const login = async (username, password) => {
    setError('');
    const email = `${username.trim().toLowerCase()}@agos.local`;
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      if (/banned/i.test(signInError.message)) setError('This account is disabled. Contact an admin.');
      else if (signInError.status === 429) setError('Too many attempts. Wait a minute and try again.');
      else setError('Invalid username or password.');
      return false;
    }
    return true;
  };

  const createUser = async (payload) => {
    setError('');
    const result = await invokeFunction('create-user', payload);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, createUser, logout, clearError, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

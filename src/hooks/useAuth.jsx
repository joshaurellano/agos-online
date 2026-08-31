import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const clearError = () => setError('');

  useEffect(() => {
    
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchProfile(session.user.id);
      else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, roles(role_desc)')
      .eq('id', userId)
      .single();

    if (data) setUser(data);
    else {
      logger.error('Profile fetch failed:', error?.message);
      setUser(null); // or handle as needed
    }
    setLoading(false);
  };

  const login = async (username, password) => {
    setError('');
    const email = `${username}@agos.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('Invalid username or password.'); return false; }
    return true;
  };

  const createUser = async (payload) => {
  setError('');

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    setError("Not authenticated");
    return false;
  }

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    }
  });

  if (error) {
    const errorText = await error.context.text();
    logger.debug('FUNCTION ERROR BODY:', errorText);
    let message = 'Something went wrong';
    try {
      message = JSON.parse(errorText).error || message;
    } catch {
      // Edge function returned a non-JSON body (e.g. an HTML error page) --
      // fall back to the raw text instead of throwing here and leaving
      // setError() never called.
      if (errorText) message = errorText;
    }
    setError(message);
    return false;
  }

  return true;
};

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{
      user,
      login,
      createUser,
      logout,
      clearError,
      error,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
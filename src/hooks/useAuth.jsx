import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

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
      console.error('Profile fetch failed:', error?.message);
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

  const register = async ({ name, username, password, phone ,role_id }) => {
    setError('');
    const email = `${username}@agos.local`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, username, phone, role_id }
      }
    });
    if (error) { setError(error.message); return false; }
    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, login, register, logout, clearError, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
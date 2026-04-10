import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// Demo users
const USERS = [
  { username: 'barangay_captain', password: 'agos2024', role: 'Barangay Official', name: 'Hon. Roberto Cruz', barangay: 'Triangulo, Naga City' },
  { username: 'bgy_secretary', password: 'agos2024', role: 'Barangay Secretary', name: 'Maria Santos', barangay: 'Triangulo, Naga City' },
  { username: 'drrm_officer', password: 'agos2024', role: 'DRRM Team', name: 'Jose Dela Cruz', barangay: 'Triangulo, Naga City' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  const login = (username, password) => {
    const found = USERS.find(u => u.username === username && u.password === password);
    if (found) {
      setUser(found);
      setError('');
      return true;
    }
    setError('Invalid username or password.');
    return false;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

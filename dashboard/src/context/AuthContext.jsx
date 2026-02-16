import { createContext, useState, useContext, useEffect } from 'react';
import client from '../api/client';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on load
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // Check expiry
        if (decoded.exp * 1000 < Date.now()) {
            logout();
        } else {
            setUser({ username: decoded.username, role: decoded.role });
        }
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      const res = await client.post('/login', { username, password });
      const { token, role } = res.data;
      
      localStorage.setItem('token', token);
      setUser({ username, role });
      return true;
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const loginPlayer = async (fid) => {
    try {
      // Use the new endpoint we created in Go
      const res = await client.post('/login/player', { fid: parseInt(fid) });
      const { token, role } = res.data;
      
      localStorage.setItem('token', token);
      // We decode to get expiration, but we trust the response role
      const decoded = jwtDecode(token);
      
      setUser({ 
        username: decoded.username || fid, // FID is the username for players
        role: role // "player"
      });
      return true;
    } catch (err) {
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, loginPlayer, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

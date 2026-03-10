import { createContext, useState, useContext, useEffect } from 'react';
import client from '../api/client';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrateSession = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const decoded = jwtDecode(token);

        if (decoded.exp * 1000 < Date.now()) {
          console.warn("Token expired. Wiping state.");
          logout();
          return;
        }

        if (decoded.role === 'player') {
          setUser({
            username: decoded.username || decoded.fid,
            role: decoded.role
          });
        } else {
          const res = await client.get('/admin/auth/me');

          setUser({
            username: res.data.username,
            role: res.data.role,
            mfaEnabled: res.data.mfa_enabled,
            allianceId: res.data.allianceId
          });
        }
      } catch (e) {
        console.error("Session hydration failed due to a network or parsing error:", e);
        logout();
      } finally {
        setLoading(false);
      }
    };

    void hydrateSession();
  }, []);

  // --- 2. STAFF LOGIN ---
  const login = async (token, role, username, mfaEnabled, allianceId = null) => {
    try {
      localStorage.setItem('token', token);

      localStorage.removeItem('mfa_enabled');
      localStorage.removeItem('allianceId');

      setUser({
        username,
        role,
        allianceId,
        mfaEnabled: !!mfaEnabled
      });

      return true;
    } catch (err) {
      console.error("Failed to set auth state:", err);
      throw err;
    }
  };

  // --- 3. LOGOUT ---
  const logout = () => {
    localStorage.removeItem('token');

    localStorage.removeItem('mfa_enabled');
    localStorage.removeItem('allianceId');

    setUser(null);
  };

  const loginPlayer = async (fid) => {
    try {
      const res = await client.post('/login/player', { fid: parseInt(fid) });
      const { token, role } = res.data;

      localStorage.setItem('token', token);
      const decoded = jwtDecode(token);

      setUser({
        username: decoded.username || fid,
        role: role
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
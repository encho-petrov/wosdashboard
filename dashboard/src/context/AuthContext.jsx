import { createContext, useState, useContext, useEffect } from 'react';
import client from '../api/client';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        if (decoded.exp * 1000 < Date.now()) {
          logout();
        } else {
          // 1. Grab the extra flags that aren't inside the JWT
          const mfaStatus = localStorage.getItem('mfa_enabled') === 'true';
          const storedAlliance = localStorage.getItem('allianceId');

          // 2. Rebuild the full user object
          setUser({
            username: decoded.username,
            role: decoded.role,
            mfaEnabled: mfaStatus,
            allianceId: storedAlliance ? parseInt(storedAlliance, 10) : null
          });
        }
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (token, role, username, mfaEnabled, allianceId = null) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('mfa_enabled', mfaEnabled ? 'true' : 'false');

      // 3. Persist the allianceId so it survives a refresh
      if (allianceId) {
        localStorage.setItem('allianceId', allianceId.toString());
      } else {
        localStorage.removeItem('allianceId');
      }

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
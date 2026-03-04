import { createContext, useState, useContext, useEffect } from 'react';
import client from '../api/client';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- 1. HYDRATION CYCLE ---
  useEffect(() => {
    const hydrateSession = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const decoded = jwtDecode(token);

        // Hard token expiration check
        if (decoded.exp * 1000 < Date.now()) {
          throw new Error("Token expired");
        }

        // Branching Logic: Players hydrate from token, Staff hydrate from DB
        if (decoded.role === 'player') {
          setUser({
            username: decoded.username || decoded.fid,
            role: decoded.role
          });
        } else {
          // Fetch the absolute source of truth for admins/moderators
          const res = await client.get('/admin/auth/me');

          setUser({
            username: res.data.username,
            role: res.data.role,
            mfaEnabled: res.data.mfa_enabled,
            allianceId: res.data.allianceId
          });
        }
      } catch (e) {
        console.warn("Session hydration failed. Wiping state.");
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
      // ONLY store the secure access token
      localStorage.setItem('token', token);

      // Legacy cleanup (wipes the vulnerable keys from old sessions)
      localStorage.removeItem('mfa_enabled');
      localStorage.removeItem('allianceId');

      // Inject dynamic data strictly into React memory
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

    // Legacy cleanup just in case
    localStorage.removeItem('mfa_enabled');
    localStorage.removeItem('allianceId');

    setUser(null);
  };

  // --- 4. PLAYER LOGIN (Unchanged flow, token-based state) ---
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
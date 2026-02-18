import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Lock, User, KeyRound } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Step 1 State
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  // Step 2 (MFA) State
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const [loading, setLoading] = useState(false);

  const handleInitialLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await client.post('/api/login', credentials);

      // Check if server is asking for MFA
      if (res.data.mfa_required) {
        setTempToken(res.data.temp_token);
        setStep(2); // Move to MFA input screen
        toast.info("Authenticator code required");
      } else {
        // Standard login success (No MFA enabled)
        login(res.data.token, res.data.role, credentials.username);
        navigate('/');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await client.post('/api/login/mfa', {
        temp_token: tempToken,
        code: mfaCode
      });

      // MFA Success!
      login(res.data.token, res.data.role, credentials.username);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid authenticator code");
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 bg-blue-600/20 text-blue-500 rounded-xl mb-4">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Moderator Access</h2>
          </div>

          {step === 1 ? (
              <form onSubmit={handleInitialLogin} className="space-y-5">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                      type="text" required placeholder="Username"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-3 pl-11 pr-4 text-white focus:border-blue-500 outline-none transition-all"
                      value={credentials.username} onChange={e => setCredentials({...credentials, username: e.target.value})}
                  />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                      type="password" required placeholder="Password"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-3 pl-11 pr-4 text-white focus:border-blue-500 outline-none transition-all"
                      value={credentials.password} onChange={e => setCredentials({...credentials, password: e.target.value})}
                  />
                </div>
                <button disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all">
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>
          ) : (
              <form onSubmit={handleMfaSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <p className="text-sm text-gray-400 text-center mb-4">
                  Enter the 6-digit code from your Authenticator app.
                </p>
                <input
                    type="text" required maxLength={6} placeholder="000000"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl py-4 text-center text-2xl tracking-[0.5em] font-mono text-white focus:border-blue-500 outline-none transition-all"
                    value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} // Only allow numbers
                    autoFocus
                />
                <button disabled={loading || mfaCode.length !== 6} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all">
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button type="button" onClick={() => setStep(1)} className="w-full py-2 text-gray-500 hover:text-white text-sm font-bold transition-all">
                  Back to Login
                </button>
              </form>
          )}
        </div>
      </div>
  );
}
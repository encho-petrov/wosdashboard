import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Gamepad2, ShieldCheck, ArrowLeft } from 'lucide-react';
import client from '../api/client'; // <-- Make sure this path points to your axios instance

export default function Login() {
  const [activeTab, setActiveTab] = useState('player'); // Default to Player
  const [formData, setFormData] = useState({ username: '', password: '', fid: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- New MFA State for Staff ---
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const { login, loginPlayer } = useAuth();
  const navigate = useNavigate();

  // Reset errors and steps when switching tabs
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setStep(1);
    setError('');
  };

  const handlePlayerSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginPlayer(formData.fid);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Player login failed. Check your FID.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (step === 1) {
        const res = await client.post('/login', {
          username: formData.username,
          password: formData.password
        });

        if (res.data.mfa_required) {
          setTempToken(res.data.temp_token);
          setStep(2);
        } else {
          await login(res.data.token, res.data.role, formData.username, res.data.mfa_enabled);
          navigate('/');
        }
      } else if (step === 2) {
        const res = await client.post('/login/mfa', {
          temp_token: tempToken,
          code: mfaCode
        });

        await login(res.data.token, res.data.role, formData.username, true);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100 p-4">
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">

          {/* Header / Tabs */}
          <div className="flex border-b border-gray-700">
            <button
                type="button"
                onClick={() => handleTabSwitch('player')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center transition-colors ${
                    activeTab === 'player' ? 'bg-blue-600/10 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'
                }`}
            >
              <Gamepad2 className="w-4 h-4 mr-2" /> Player Login
            </button>
            <button
                type="button"
                onClick={() => handleTabSwitch('staff')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center transition-colors ${
                    activeTab === 'staff' ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'
                }`}
            >
              <User className="w-4 h-4 mr-2" /> Staff Login
            </button>
          </div>

          <div className="p-8">
            <h2 className="text-2xl font-bold text-center mb-6">
              {activeTab === 'player' ? 'Alliance Portal' : (step === 1 ? 'Admin Console' : 'Two-Factor Auth')}
            </h2>

            {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm text-center">
                  {error}
                </div>
            )}

            {activeTab === 'player' ? (
                /* --- PLAYER LOGIN FORM (Untouched WOS API) --- */
                <form onSubmit={handlePlayerSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Game ID (FID)</label>
                    <input
                        type="number"
                        placeholder="e.g. 57030176"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                        value={formData.fid}
                        onChange={(e) => setFormData({ ...formData, fid: e.target.value })}
                    />
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      Only players in the authorized state can log in.
                    </p>
                  </div>
                  <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-lg font-bold transition-all transform active:scale-95 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                  >
                    {loading ? 'Verifying...' : 'Enter Portal'}
                  </button>
                </form>
            ) : (
                /* --- STAFF LOGIN FORM (Now with MFA & Rate Limiting) --- */
                <form onSubmit={handleStaffSubmit} className="space-y-5">
                  {step === 1 ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                          <input
                              type="text"
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                              value={formData.username}
                              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                          <input
                              type="password"
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-lg font-bold transition-all transform active:scale-95 bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20"
                        >
                          {loading ? 'Authenticating...' : 'Access Console'}
                        </button>
                      </>
                  ) : (
                      /* --- STEP 2: MFA INPUT --- */
                      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex justify-center mb-4 text-purple-400">
                          <ShieldCheck size={40} />
                        </div>
                        <p className="text-sm text-gray-400 text-center mb-4">
                          Enter the 6-digit code from your Authenticator app.
                        </p>
                        <input
                            type="text" required maxLength={6} placeholder="000000"
                            className="w-full bg-gray-950 border border-gray-700 rounded-xl py-4 mb-4 text-center text-2xl tracking-[0.5em] font-mono text-white focus:border-purple-500 outline-none transition-all"
                            value={mfaCode}
                            onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} // Only allow numbers
                            autoFocus
                        />
                        <div className="flex gap-3">
                          <button
                              type="button"
                              onClick={() => setStep(1)}
                              className="w-1/3 py-3 rounded-xl font-bold bg-gray-700 hover:bg-gray-600 transition-all text-white flex items-center justify-center"
                          >
                            <ArrowLeft size={18} />
                          </button>
                          <button
                              type="submit"
                              disabled={loading || mfaCode.length !== 6}
                              className="w-2/3 py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 transition-all text-white disabled:opacity-50"
                          >
                            {loading ? 'Verifying...' : 'Verify Code'}
                          </button>
                        </div>
                      </div>
                  )}
                </form>
            )}
          </div>
        </div>
      </div>
  );
}
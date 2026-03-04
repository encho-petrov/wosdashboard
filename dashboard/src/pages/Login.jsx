import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Gamepad2, ShieldCheck, ArrowLeft, Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import client from '../api/client';
import { toast } from 'react-toastify';

export default function Login() {
  const [activeTab, setActiveTab] = useState('player'); 
  const [formData, setFormData] = useState({ username: '', password: '', fid: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- Staff MFA & WebAuthn State ---
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [hasWebAuthn, setHasWebAuthn] = useState(false);

  const { login, loginPlayer } = useAuth();
  const navigate = useNavigate();

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

  const triggerBiometricLogin = async (token) => {
    try {
      setLoading(true);
      const beginRes = await client.get(`/webauthn/login/begin?temp_token=${token}`);

      const options = beginRes.data.publicKey;

      if (!options) {
        toast.error("Invalid server response");
      }

      let asseResp;
      try {
        asseResp = await startAuthentication(options);
      } catch (error) {
        if (error.name !== 'NotAllowedError') {
          toast.error("Biometric authentication failed.");
        }
        setLoading(false);
        return;
      }

      const finishRes = await client.post(`/webauthn/login/finish?temp_token=${token}`, asseResp);

      await login(finishRes.data.token, finishRes.data.role, formData.username, true, finishRes.data.allianceId);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Biometric login failed.');
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
          const tToken = res.data.temp_token;
          setTempToken(tToken);
          setHasWebAuthn(res.data.has_webauthn);

          setLoading(false);
          setStep(2);

          if (res.data.has_webauthn) {
            // do not await this!
            triggerBiometricLogin(tToken);
          }
        } else {
          await login(res.data.token, res.data.role, formData.username, res.data.mfa_enabled, res.data.allianceId);
          navigate('/');
        }
      } else if (step === 2) {
        const res = await client.post('/login/mfa', {
          temp_token: tempToken,
          code: mfaCode
        });

        await login(res.data.token, res.data.role, formData.username, true, res.data.allianceId);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-4">

        {/* Main Card */}
        <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-800">

          {/* Header / Tabs */}
          <div className="flex border-b border-gray-800 bg-gray-900/50">
            <button
                type="button"
                onClick={() => handleTabSwitch('player')}
                className={`flex-1 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-center transition-colors ${
                    activeTab === 'player' ? 'bg-blue-600/10 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-white'
                }`}
            >
              <Gamepad2 className="w-4 h-4 mr-2" /> Player
            </button>
            <button
                type="button"
                onClick={() => handleTabSwitch('staff')}
                className={`flex-1 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-center transition-colors ${
                    activeTab === 'staff' ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500' : 'text-gray-500 hover:text-white'
                }`}
            >
              <User className="w-4 h-4 mr-2" /> Staff
            </button>
          </div>

          <div className="p-8">
            <h2 className="text-2xl font-black text-center mb-6 tracking-tighter">
              {activeTab === 'player' ? 'Alliance Portal' : (step === 1 ? 'Admin Console' : 'Authentication')}
            </h2>

            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800/50 text-red-400 rounded-xl text-sm text-center font-bold">
                  {error}
                </div>
            )}

            {activeTab === 'player' ? (
                /* --- PLAYER LOGIN FORM --- */
                <form onSubmit={handlePlayerSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Game ID (FID)</label>
                    <input
                        type="number"
                        placeholder="e.g. 57030176"
                        className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none font-mono text-white transition-colors placeholder-gray-700"
                        value={formData.fid}
                        onChange={(e) => setFormData({ ...formData, fid: e.target.value })}
                    />
                    <p className="mt-3 text-[10px] text-gray-600 font-bold uppercase tracking-widest text-center">
                      Only authorized state residents may enter.
                    </p>
                  </div>
                  <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 rounded-xl font-black uppercase tracking-widest transition-all bg-blue-600 hover:bg-blue-500 text-white shadow-lg disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Enter Portal'}
                  </button>
                </form>
            ) : (
                /* --- STAFF LOGIN FORM --- */
                <form onSubmit={handleStaffSubmit} className="space-y-5">
                  {step === 1 ? (
                      <>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Username</label>
                          <input
                              type="text"
                              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 focus:border-purple-500 focus:outline-none text-white transition-colors"
                              value={formData.username}
                              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Password</label>
                          <input
                              type="password"
                              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 focus:border-purple-500 focus:outline-none text-white transition-colors"
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 mt-2 rounded-xl font-black uppercase tracking-widest transition-all bg-purple-600 hover:bg-purple-500 text-white shadow-lg disabled:opacity-50"
                        >
                          {loading ? 'Authenticating...' : 'Access Console'}
                        </button>
                      </>
                  ) : (
                      /* --- STEP 2: MFA / WEBAUTHN --- */
                      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex justify-center mb-6 text-purple-500">
                          {hasWebAuthn ? <Fingerprint size={48} /> : <ShieldCheck size={48} />}
                        </div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 text-center mb-6">
                          Enter your 6-digit authenticator code.
                        </p>

                        <input
                            type="text" required maxLength={6} placeholder="000000"
                            className="w-full bg-black border border-gray-800 rounded-2xl py-5 mb-6 text-center text-3xl tracking-[0.5em] font-mono text-white focus:border-purple-500 outline-none transition-colors shadow-inner"
                            value={mfaCode}
                            onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                            autoFocus={!hasWebAuthn} // Don't steal focus if bio prompt is active
                        />

                        <div className="flex gap-3 mb-4">
                          <button
                              type="button"
                              onClick={() => setStep(1)}
                              className="w-16 py-3.5 rounded-xl font-bold bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-all text-white flex items-center justify-center shrink-0"
                          >
                            <ArrowLeft size={18} />
                          </button>
                          <button
                              type="submit"
                              disabled={loading || mfaCode.length !== 6}
                              className="flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest bg-purple-600 hover:bg-purple-500 transition-all text-white disabled:opacity-50 shadow-lg"
                          >
                            {loading ? 'Verifying...' : 'Verify Code'}
                          </button>
                        </div>

                        {/* Optional Manual Retry for Biometrics */}
                        {hasWebAuthn && (
                            <div className="text-center mt-6 pt-6 border-t border-gray-800">
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Or use registered device</p>
                              <button
                                  type="button"
                                  onClick={() => triggerBiometricLogin(tempToken)}
                                  disabled={loading}
                                  className="px-6 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto border border-gray-700"
                              >
                                <Fingerprint size={14} /> Use Biometrics
                              </button>
                            </div>
                        )}
                      </div>
                  )}
                </form>
            )}
          </div>
        </div>
      </div>
  );
}
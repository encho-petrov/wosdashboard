import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Gamepad2 } from 'lucide-react';

export default function Login() {
  const [activeTab, setActiveTab] = useState('player'); // Default to Player
  const [formData, setFormData] = useState({ username: '', password: '', fid: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, loginPlayer } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeTab === 'staff') {
        await login(formData.username, formData.password);
      } else {
        await loginPlayer(formData.fid);
      }
      navigate('/');
    } catch (err) {
      // Handle the 403 State Mismatch error specifically
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
            onClick={() => setActiveTab('player')}
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center transition-colors ${
              activeTab === 'player' ? 'bg-blue-600/10 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4 mr-2" /> Player Login
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center transition-colors ${
              activeTab === 'staff' ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4 mr-2" /> Staff Login
          </button>
        </div>

        <div className="p-8">
          <h2 className="text-2xl font-bold text-center mb-6">
            {activeTab === 'player' ? 'Alliance Portal' : 'Admin Console'}
          </h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {activeTab === 'staff' ? (
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
              </>
            ) : (
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
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold transition-all transform active:scale-95 ${
                activeTab === 'player' 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20' 
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20'
              }`}
            >
              {loading ? 'Verifying...' : (activeTab === 'player' ? 'Enter Portal' : 'Access Console')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

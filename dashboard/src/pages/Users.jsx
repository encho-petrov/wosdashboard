import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Trash2, UserPlus, Shield, User, Fingerprint, ShieldAlert } from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function Users() {
  // Data State
  const [users, setUsers] = useState([]);
  const [alliances, setAlliances] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('moderator');
  const [selectedAlliance, setSelectedAlliance] = useState('');

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, optionsRes] = await Promise.all([
        client.get('/admin/users'),
        client.get('/moderator/options')
      ]);
      setUsers(usersRes.data);
      setAlliances(optionsRes.data.alliances || []);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!username || !password) return toast.warning("Missing fields");

    try {
      await client.post('/admin/users', {
        username,
        password,
        role,
        allianceId: role === 'moderator' ? parseInt(selectedAlliance) || null : null
      });
      toast.success("User created!");
      setUsername('');
      setPassword('');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Terminate this user's access?")) return;
    try {
      await client.delete(`/admin/users/${id}`);
      toast.success("User removed");
      await fetchData();
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  const handleResetMFA = async (id, currentUsername) => {
    if (!window.confirm(`Wipe all security settings (TOTP and Biometrics) for ${currentUsername}? They will be forced to log in with just their password.`)) return;
    try {
      await client.post(`/admin/users/${id}/reset-mfa`);
      toast.success(`Security reset for ${currentUsername}`);
      await fetchData();
    } catch (err) {
      toast.error("Failed to reset security settings");
    }
  };

  const getAllianceName = (id) => {
    if (!id) return 'None';
    const a = alliances.find(a => a.id === id);
    return a ? a.name : id;
  };

  return (
      <AdminLayout title="User Management">
        <div className="p-4 lg:p-6 flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-80px)] overflow-y-auto lg:overflow-hidden">

          {/* CREATE USER FORM */}
          <div className="w-full lg:w-80 shrink-0 bg-gray-800 p-6 rounded-xl border border-gray-700 h-fit shadow-lg">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
              <UserPlus className="text-blue-500 w-6 h-6" />
              <h2 className="text-lg font-bold text-white tracking-wide">New Account</h2>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Username</label>
                <input
                    type="text" required
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none transition-colors"
                    value={username} onChange={e => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Temporary Password</label>
                <input
                    type="password" required
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none transition-colors"
                    value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Access Level</label>
                <select
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none font-bold"
                    value={role} onChange={e => setRole(e.target.value)}
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {role === 'moderator' && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Alliance Assignment</label>
                    <select
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                        value={selectedAlliance} onChange={e => setSelectedAlliance(e.target.value)}
                    >
                      <option value="">None (Global Viewer)</option>
                      {alliances.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
              )}

              <button type="submit" className="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2">
                <Shield size={18} /> Provision Access
              </button>
            </form>
          </div>

          {/* USERS TABLE */}
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 flex flex-col shadow-lg overflow-hidden min-h-[500px] lg:min-h-0">
            <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="text-purple-400" /> Active Personnel
              </h2>
              <span className="text-xs font-bold text-gray-500 uppercase bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
                {users.length} Authorized
              </span>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
              {loading ? (
                  <div className="p-10 text-center text-gray-500 animate-pulse font-black tracking-widest uppercase">Fetching Records...</div>
              ) : (
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                    <tr className="bg-gray-900/80 text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-700 font-black">
                      <th className="p-4 pl-6">Operator</th>
                      <th className="p-4">Clearance</th>
                      <th className="p-4">Assignment</th>
                      <th className="p-4 text-right pr-6">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-700/30 transition-colors group">

                          {/* Operator Column with Security Badges */}
                          <td className="p-4 pl-6">
                            <div className="font-bold text-gray-200 text-sm tracking-wide">{u.username}</div>
                            {(u.mfa_enabled || u.has_webauthn) && (
                                <div className="flex gap-1.5 mt-1.5">
                                  {u.has_webauthn && (
                                      <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" title="Biometric / Passkey Enabled">
                                            <Fingerprint size={10} /> Bio
                                        </span>
                                  )}
                                  {u.mfa_enabled && (
                                      <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" title="TOTP Authenticator Enabled">
                                            <Shield size={10} /> TOTP
                                        </span>
                                  )}
                                </div>
                            )}
                          </td>

                          {/* Role Column */}
                          <td className="p-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-[9px] font-black tracking-widest border ${
                                u.role === 'admin'
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                    : 'bg-gray-800 text-gray-400 border-gray-600'
                            }`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>

                          {/* Alliance Column */}
                          <td className="p-4">
                            {u.role === 'admin' ? (
                                <span className="text-gray-600 text-[10px] font-black tracking-widest uppercase italic">Global Access</span>
                            ) : (
                                <span className="text-gray-300 font-bold text-sm tracking-tight">{getAllianceName(u.allianceId)}</span>
                            )}
                          </td>

                          {/* Actions Column */}
                          <td className="p-4 pr-6 text-right space-x-2">
                            {/* Reset Security Button */}
                            <button
                                onClick={() => handleResetMFA(u.id, u.username)}
                                className={`p-2 rounded-lg transition-all ${
                                    (u.mfa_enabled || u.has_webauthn)
                                        ? 'text-yellow-500 hover:bg-yellow-500/10 border border-transparent hover:border-yellow-500/30'
                                        : 'text-gray-600 cursor-not-allowed'
                                }`}
                                disabled={!(u.mfa_enabled || u.has_webauthn)}
                                title="Reset MFA & Biometrics"
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>

                            {/* Delete Button */}
                            {u.id !== 1 && (
                                <button
                                    onClick={() => handleDelete(u.id)}
                                    className="p-2 text-red-500/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/30 lg:opacity-0 lg:group-hover:opacity-100 opacity-100"
                                    title="Terminate Access"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                          </td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
  );
}
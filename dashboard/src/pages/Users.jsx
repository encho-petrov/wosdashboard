import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Trash2, UserPlus, Shield, User } from 'lucide-react';
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

  const getAllianceName = (id) => {
    if (!id) return 'None';
    const a = alliances.find(a => a.id === id);
    return a ? a.name : id;
  };

  return (
      <AdminLayout title="User Management">
        <div className="p-6 flex gap-6 h-full min-h-0">

          {/* CREATE USER FORM */}
          <div className="w-80 shrink-0 bg-gray-800 p-6 rounded-xl border border-gray-700 h-fit shadow-lg">
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
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 flex flex-col min-h-0 shadow-lg">
            <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center rounded-t-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="text-purple-400" /> Active Personnel
              </h2>
              <span className="text-xs font-bold text-gray-500 uppercase bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
              {users.length} Authorized
            </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loading ? (
                  <div className="p-8 text-center text-gray-500 animate-pulse font-bold tracking-widest uppercase">Fetching Records...</div>
              ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="bg-gray-900/80 text-xs uppercase tracking-wider text-gray-400 border-b border-gray-700">
                      <th className="p-4 font-bold">Operator</th>
                      <th className="p-4 font-bold">Clearance</th>
                      <th className="p-4 font-bold">Alliance Assignment</th>
                      <th className="p-4 font-bold text-right">Revoke</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-700/20 transition-colors group">
                          <td className="p-4">
                            <div className="font-bold text-gray-200">{u.username}</div>
                          </td>
                          <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-black tracking-widest border ${
                            u.role === 'admin'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                          </td>
                          <td className="p-4">
                            {u.role === 'admin' ? (
                                <span className="text-gray-600 text-[10px] font-black tracking-widest uppercase">Global Access</span>
                            ) : (
                                <span className="text-gray-300 font-medium">{getAllianceName(u.allianceId)}</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            {u.id !== 1 && (
                                <button
                                    onClick={() => handleDelete(u.id)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Terminate Access"
                                >
                                  <Trash2 className="w-5 h-5" />
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
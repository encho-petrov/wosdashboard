import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Trash2, UserPlus, Shield, User, ArrowLeft, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

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
    fetchData();
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
    if (!username || !password) {
      toast.warning("Username and Password are required");
      return;
    }
    try {
      const payload = {
        username,
        password,
        role,
        allianceId: (role === 'moderator' && selectedAlliance) ? parseInt(selectedAlliance) : null
      };
      await client.post('/admin/users', payload);
      toast.success("User created successfully!");
      setUsername('');
      setPassword('');
      setRole('moderator');
      setSelectedAlliance('');
      const res = await client.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure? This cannot be undone.")) return;
    try {
      await client.delete(`/admin/users/${id}`);
      toast.success("User deleted");
      setUsers(users.filter(u => u.id !== id));
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  const getAllianceName = (id) => {
    if (!id) return <span className="text-gray-600">-</span>;
    const alliance = alliances.find(a => a.id === id);
    return alliance ? (
        <span className="text-blue-400 font-medium">{alliance.name}</span>
    ) : (
        <span className="text-gray-500 italic">Unknown ({id})</span>
    );
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">

        {/* --- STANDARDIZED NAVBAR --- */}
        <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md">
          <div className="flex items-center space-x-3">
            <Activity className="text-blue-500 w-6 h-6" />
            <h1 className="text-xl font-bold tracking-wide">User Management</h1>
          </div>
          <Link
              to="/"
              className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium border border-gray-600"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </nav>

        {/* --- MAIN CONTENT --- */}
        <main className="container mx-auto px-4 py-8 max-w-7xl space-y-8">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Shield className="text-purple-500 w-8 h-8" /> Staff Access
              </h2>
              <p className="text-gray-500 text-sm mt-1">Manage administrative and moderator accounts.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Launcher-Style Card: Add New User */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg h-fit">
              <h2 className="text-lg font-semibold mb-6 flex items-center text-white">
                <UserPlus className="w-5 h-5 mr-2 text-green-400" /> New Account
              </h2>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Username</label>
                  <input
                      type="text"
                      placeholder="e.g. ModJohn"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Password</label>
                  <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Role</label>
                  <select
                      value={role}
                      onChange={e => {
                        setRole(e.target.value);
                        if (e.target.value === 'admin') setSelectedAlliance('');
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {role === 'moderator' && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
                        Assign Alliance <span className="text-red-400">*</span>
                      </label>
                      <select
                          value={selectedAlliance}
                          onChange={e => setSelectedAlliance(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">-- Select Alliance --</option>
                        {alliances.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-3 rounded-xl font-bold text-white shadow-lg shadow-purple-900/20 transition-all transform active:scale-95 mt-4"
                >
                  Create Account
                </button>
              </form>
            </div>

            {/* History-Style Table Card: User List */}
            <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden h-fit">
              <div className="p-4 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-300 flex items-center">
                  <User className="w-4 h-4 mr-2" /> Authorized Staff
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-700/30 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Staff Member</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Assigned Alliance</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 text-sm">
                  {loading ? (
                      <tr><td colSpan="4" className="p-12 text-center text-gray-500 animate-pulse font-mono uppercase tracking-widest">Loading Personnel...</td></tr>
                  ) : users.length === 0 ? (
                      <tr><td colSpan="4" className="p-12 text-center text-gray-500">No personnel records found.</td></tr>
                  ) : (
                      users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-700/30 transition-colors group">
                            <td className="p-4">
                              <div className="font-bold text-white group-hover:text-purple-400 transition-colors">{u.username}</div>
                              <div className="text-[10px] text-gray-500 font-mono">UID: #{u.id}</div>
                            </td>
                            <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest border ${
                              u.role === 'admin'
                                  ? 'bg-purple-900/20 text-purple-300 border-purple-500/30'
                                  : 'bg-blue-900/20 text-blue-300 border-blue-500/30'
                          }`}>
                            {u.role.toUpperCase()}
                          </span>
                            </td>
                            <td className="p-4">
                              {u.role === 'admin' ? (
                                  <span className="text-gray-600 text-[10px] font-black tracking-widest uppercase">Global Access</span>
                              ) : (
                                  getAllianceName(u.allianceId)
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
                      ))
                  )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>
  );
}
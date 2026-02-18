import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Trash2, UserPlus, Shield, User, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Users() {
  // Data State
  const [users, setUsers] = useState([]);
  const [alliances, setAlliances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('moderator'); // Default to moderator
  const [selectedAlliance, setSelectedAlliance] = useState(''); // Store ID

  // Initial Data Load
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch Users and Options (Alliances) in parallel
      const [usersRes, optionsRes] = await Promise.all([
        client.get('/admin/users'),
        client.get('/moderator/options') // Re-using the options endpoint
      ]);

      setUsers(usersRes.data);
      setAlliances(optionsRes.data.alliances || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // Basic Validation
    if (!username || !password) {
      toast.warning("Username and Password are required");
      return;
    }

    try {
      // Prepare Payload
      const payload = {
        username,
        password,
        role,
        // Only send allianceId if role is moderator and one is selected
        allianceId: (role === 'moderator' && selectedAlliance) ? parseInt(selectedAlliance) : null
      };

      await client.post('/admin/users', payload);
      
      toast.success("User created successfully!");
      
      // Reset Form
      setUsername('');
      setPassword('');
      setRole('moderator');
      setSelectedAlliance('');
      
      // Refresh User List
      const res = await client.get('/admin/users');
      setUsers(res.data);
      
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to create user";
      toast.error(msg);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    
    try {
      await client.delete(`/admin/users/${id}`);
      toast.success("User deleted");
      // Remove from local state immediately
      setUsers(users.filter(u => u.id !== id));
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  // Helper to display alliance name in the table
  const getAllianceName = (id) => {
    if (!id) return <span className="text-gray-600">-</span>;
    const alliance = alliances.find(a => a.id === id);
    return alliance ? (
      <span className="text-blue-300 font-medium">{alliance.name}</span>
    ) : (
      <span className="text-gray-500 italic">Unknown ({id})</span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold flex items-center text-white">
            <Shield className="mr-3 text-purple-500 w-8 h-8" /> 
            User Management
          </h1>
          <Link 
            to="/" 
            className="flex items-center text-gray-400 hover:text-white transition-colors bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: Create User Form */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 h-fit shadow-lg">
            <h2 className="text-lg font-semibold mb-6 flex items-center text-white">
              <UserPlus className="w-5 h-5 mr-2 text-green-400" /> Add New User
            </h2>
            
            <form onSubmit={handleCreate} className="space-y-5">
              
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                <input 
                  type="text" 
                  placeholder="e.g. ModJohn"
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Role</label>
                <select 
                  value={role} 
                  onChange={e => {
                    setRole(e.target.value);
                    // Reset alliance if switching to admin
                    if (e.target.value === 'admin') setSelectedAlliance('');
                  }}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {role === 'admin' 
                    ? "Admins have full access to all settings and data." 
                    : "Moderators can only manage their assigned alliance."}
                </p>
              </div>

              {/* Alliance Selection (Conditional) */}
              {role === 'moderator' && (
                <div className="animate-fade-in-down">
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Assign to Alliance <span className="text-red-400">*</span>
                  </label>
                  <select 
                    value={selectedAlliance} 
                    onChange={e => setSelectedAlliance(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">-- Select an Alliance --</option>
                    {alliances.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-400/70 mt-1">
                    This user will only see players in this alliance.
                  </p>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-3 rounded-lg font-bold text-white shadow-lg shadow-purple-900/20 transition-all transform active:scale-95 mt-4"
              >
                Create User
              </button>
            </form>
          </div>

          {/* RIGHT COLUMN: User List */}
          <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg flex flex-col">
            <div className="p-4 border-b border-gray-700 bg-gray-800/50">
              <h3 className="font-semibold text-gray-300 flex items-center">
                <User className="w-4 h-4 mr-2" /> Existing Users
              </h3>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Assigned Alliance</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 text-sm">
                  {loading ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">Loading users...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No users found. Create one!</td></tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id} className="hover:bg-gray-700/30 transition-colors">
                        <td className="p-4 text-gray-500 font-mono">#{u.id}</td>
                        <td className="p-4 font-bold text-white">{u.username}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            u.role === 'admin' 
                              ? 'bg-purple-900/30 text-purple-300 border-purple-800' 
                              : 'bg-blue-900/30 text-blue-300 border-blue-800'
                          }`}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4">
                           {/* Display the Alliance Name if applicable */}
                           {u.role === 'admin' ? (
                             <span className="text-gray-600 text-xs">ALL ACCESS</span>
                           ) : (
                             getAllianceName(u.allianceId) // Assuming backend sends allianceId
                           )}
                        </td>
                        <td className="p-4 text-right">
                          {u.id !== 1 && (
                          <button 
                            onClick={() => handleDelete(u.id)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all"
                            title="Delete User"
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
      </div>
    </div>
  );
}

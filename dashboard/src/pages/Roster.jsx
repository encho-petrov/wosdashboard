import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
// All icons are imported here
import { Users, Edit2, Search, Save, X, RefreshCw, ArrowLeft } from 'lucide-react'; 
import { Link } from 'react-router-dom';

export default function Roster() {
  // Data State
  const [players, setPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const [options, setOptions] = useState({ alliances: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // New state for sync button
  
  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  
  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Initial Load
  useEffect(() => {
    fetchData();
  }, []);

  // Filter Logic (Client-side)
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPlayers(players);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredPlayers(players.filter(p => 
        (p.nickname || '').toLowerCase().includes(lower) || 
        p.fid.toString().includes(lower)
      ));
    }
  }, [searchTerm, players]);

  const fetchData = async () => {
    try {
      const [playerRes, optRes] = await Promise.all([
        client.get('/moderator/players'),
        client.get('/moderator/options')
      ]);
      setPlayers(playerRes.data);
      setOptions(optRes.data);
    } catch (err) {
      toast.error("Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Calls the background sync endpoint
      const res = await client.post('/admin/sync-roster');
      toast.info(res.data.message);
      
      // We reload data after 3 seconds to show immediate updates
      setTimeout(() => fetchData(), 3000);
    } catch (err) {
      console.error(err);
      toast.error("Sync failed to start (Admins only)");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEdit = (player) => {
    setEditingId(player.fid);
    setEditForm({
      power: player.power || 0,
      troopType: player.troopType || 'None',
      allianceId: player.allianceId || '',
      teamId: player.teamId || ''
    });
  };

  const handleSave = async () => {
    try {
      const payload = {
        power: parseInt(editForm.power),
        troopType: editForm.troopType,
        allianceId: editForm.allianceId ? parseInt(editForm.allianceId) : null,
        teamId: editForm.teamId ? parseInt(editForm.teamId) : null,
      };

      await client.put(`/moderator/players/${editingId}`, payload);
      toast.success("Player updated");
      setEditingId(null);
      fetchData(); // Refresh list
    } catch (err) {
      toast.error("Update failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700 pb-6">
          <div className="flex items-center gap-4">
             <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">
                <ArrowLeft className="w-5 h-5" />
             </Link>
             <h1 className="text-2xl font-bold flex items-center text-white">
               <Users className="mr-3 text-blue-500 w-8 h-8" /> 
               Roster Management
             </h1>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Sync Button */}
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={`flex items-center px-4 py-2.5 bg-green-900/20 text-green-400 hover:bg-green-900/40 border border-green-500/30 rounded-lg text-sm font-medium transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Fetch missing nicknames/avatars from Game API"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Fix Missing Data'}
            </button>

            {/* Search Bar */}
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search nickname or FID..."
                className="w-full md:w-64 bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* --- TABLE --- */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Player</th>
                  <th className="p-4 font-semibold">Power</th>
                  <th className="p-4 font-semibold">Troops</th>
                  <th className="p-4 font-semibold">Alliance</th>
                  <th className="p-4 font-semibold">Team</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700 text-sm">
                {loading ? (
                  <tr><td colSpan="6" className="p-12 text-center text-gray-500 animate-pulse">Loading roster data...</td></tr>
                ) : filteredPlayers.length === 0 ? (
                  <tr><td colSpan="6" className="p-12 text-center text-gray-500">No players found matching your search.</td></tr>
                ) : (
                  filteredPlayers.map(p => (
                    <tr key={p.fid} className={`transition-colors ${editingId === p.fid ? "bg-blue-900/20 border-l-4 border-blue-500" : "hover:bg-gray-700/30"}`}>
                      
                      {/* 1. Player Info */}
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <img 
                            src={p.avatar || 'https://via.placeholder.com/40?text=?'} 
                            className="w-10 h-10 rounded-full border border-gray-600 bg-gray-900 object-cover" 
                            alt="" 
                          />
                          <div>
                            <div className="font-bold text-white">{p.nickname || <span className="text-red-400 italic">Unknown</span>}</div>
                            <div className="text-xs text-gray-500 font-mono">FID: {p.fid}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Power (Editable) */}
                      <td className="p-4">
                        {editingId === p.fid ? (
                          <input 
                            type="number" 
                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 w-28 text-white focus:border-blue-500 outline-none"
                            value={editForm.power}
                            onChange={e => setEditForm({...editForm, power: e.target.value})}
                          />
                        ) : (
                          <span className="font-mono text-yellow-500 font-medium">
                            {p.power ? p.power.toLocaleString() : <span className="text-gray-600">-</span>}
                          </span>
                        )}
                      </td>

                      {/* 3. Troops (Editable) */}
                      <td className="p-4">
                        {editingId === p.fid ? (
                          <select 
                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-white focus:border-blue-500 outline-none"
                            value={editForm.troopType}
                            onChange={e => setEditForm({...editForm, troopType: e.target.value})}
                          >
                            <option value="None">None</option>
                            <option value="Brilliant">Brilliant</option>
                            <option value="Helios">Helios</option>
                            <option value="Apex">Apex</option>
                          </select>
                        ) : (
                          <span className={`px-2.5 py-1 rounded text-xs font-medium border ${
                            p.troopType === 'Apex' ? 'bg-red-900/20 text-red-400 border-red-500/30' :
                            p.troopType === 'Helios' ? 'bg-orange-900/20 text-orange-400 border-orange-500/30' :
                            p.troopType === 'Brilliant' ? 'bg-blue-900/20 text-blue-400 border-blue-500/30' :
                            'bg-gray-700/50 text-gray-500 border-gray-600'
                          }`}>
                            {p.troopType || 'None'}
                          </span>
                        )}
                      </td>

                      {/* 4. Alliance (Editable) */}
                      <td className="p-4">
                        {editingId === p.fid ? (
                          <select 
                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-white w-32 focus:border-blue-500 outline-none"
                            value={editForm.allianceId}
                            onChange={e => setEditForm({...editForm, allianceId: e.target.value})}
                          >
                            <option value="">Unassigned</option>
                            {options.alliances.map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={p.allianceName ? "text-white" : "text-gray-600 italic"}>
                            {p.allianceName || 'Unassigned'}
                          </span>
                        )}
                      </td>

                      {/* 5. Team (Editable) */}
                      <td className="p-4">
                        {editingId === p.fid ? (
                          <select 
                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-white w-32 focus:border-blue-500 outline-none"
                            value={editForm.teamId}
                            onChange={e => setEditForm({...editForm, teamId: e.target.value})}
                          >
                            <option value="">No Team</option>
                            {/* Filter teams by selected alliance if possible */}
                            {(options.teams || [])
                              .filter(t => !editForm.allianceId || t.allianceId == editForm.allianceId)
                              .map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={p.teamName ? "text-white" : "text-gray-600 italic"}>
                            {p.teamName || 'No Team'}
                          </span>
                        )}
                      </td>

                      {/* 6. Actions */}
                      <td className="p-4 text-right">
                        {editingId === p.fid ? (
                          <div className="flex justify-end space-x-2">
                            <button onClick={handleSave} className="p-2 bg-green-600 rounded-lg hover:bg-green-500 text-white shadow-lg shadow-green-900/20 transition-all"><Save className="w-4 h-4"/></button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-red-600 rounded-lg hover:bg-red-500 text-white shadow-lg shadow-red-900/20 transition-all"><X className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleEdit(p)} 
                            className="p-2 hover:bg-gray-700 rounded-lg text-blue-400 hover:text-white transition-all"
                            title="Edit Details"
                          >
                            <Edit2 className="w-4 h-4" />
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
  );
}

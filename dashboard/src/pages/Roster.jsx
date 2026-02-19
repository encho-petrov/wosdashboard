import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
  Users, Edit2, Search, Save, X, RefreshCw, ArrowLeft,
  Swords, Snowflake, Trash2, Plus, Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Roster() {
  const { user } = useAuth();

  // --- ORIGINAL DATA STATE ---
  const [players, setPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const [options, setOptions] = useState({
    alliances: [],
    teams: [],
    rosterstats: {
      troopTypes: [],
      battleAvailability: [],
      tundraAvailability: []
    }
  });  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- ORIGINAL UI STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkIds, setBulkIds] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // --- ORIGINAL FILTER LOGIC ---
  useEffect(() => {
    let result = players;
    if (activeTab !== 'all') {
      result = result.filter(p => p.allianceId === activeTab);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p =>
          (p.nickname || '').toLowerCase().includes(lower) ||
          p.fid.toString().includes(lower)
      );
    }
    setFilteredPlayers(result);
  }, [searchTerm, players, activeTab]);

  // --- ORIGINAL API CALLS ---
  const fetchData = async () => {
    try {
      const [playerRes, optRes] = await Promise.all([
        client.get('/moderator/players'), // Restored endpoint
        client.get('/moderator/options')   // Restored endpoint
      ]);
      setPlayers(playerRes.data);
      setOptions(optRes.data);
      if (user?.role !== 'admin' && playerRes.data.length > 0) {
        const firstAlliance = playerRes.data[0].allianceId;
        if (firstAlliance) setActiveTab(firstAlliance);
      }
    } catch (err) {
      toast.error("Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await client.post('/admin/sync-roster'); // Restored endpoint
      toast.info(res.data.message, { autoClose: 5000 });
      setTimeout(() => setIsSyncing(false), 3000);
      setTimeout(() => fetchData(), 30000);
    } catch (err) {
      toast.error("Sync failed to start");
      setIsSyncing(false);
    }
  };

  const handleDelete = async (fid, nickname) => {
    if (!window.confirm(`Are you sure you want to remove ${nickname} from the roster?`)) return;
    try {
      await client.delete(`/moderator/players/${fid}`); // Restored endpoint
      toast.success(`${nickname} removed successfully`);
      await fetchData();
    } catch (err) {
      toast.error("Failed to remove player");
    }
  };

  const handleEdit = (player) => {
    setEditingId(player.fid);
    setEditForm({
      power: player.power || 0,
      troopType: player.troopType || 'None',
      battleAvailability: player.battleAvailability || 'Unavailable',
      tundraAvailability: player.tundraAvailability || 'Unavailable',
      allianceId: player.allianceId || '',
      fightingAllianceId: player.fightingAllianceId || '',
      teamId: player.teamId || ''
    });
  };

  const handleSave = async () => {
    try {
      const payload = {
        power: parseInt(editForm.power),
        troopType: editForm.troopType,
        battleAvailability: editForm.battleAvailability,
        tundraAvailability: editForm.tundraAvailability,
        allianceId: editForm.allianceId ? parseInt(editForm.allianceId) : null,
        fightingAllianceId: editForm.fightingAllianceId ? parseInt(editForm.fightingAllianceId) : null,
        teamId: editForm.teamId ? parseInt(editForm.teamId) : null,
      };
      await client.put(`/moderator/players/${editingId}`, payload); // Restored endpoint
      toast.success("Player updated");
      setEditingId(null);
      await fetchData();
    } catch (err) {
      toast.error("Update failed");
    }
  };

  const handleBatchAdd = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await client.post('/moderator/players', { players: bulkIds }); // Restored endpoint
      toast.success("IDs added to roster successfully!");
      setShowAddModal(false);
      setBulkIds('');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add players");
    } finally {
      setIsAdding(false);
    }
  };

  const getTabs = () => {
    if (user?.role === 'admin') {
      return [{ id: 'all', name: 'All Players' }, ...(options.alliances || []).filter(a => a.type !== 'Fighting')];
    }
    return [{ id: 'all', name: 'My Alliance' }];
  };

  const getBattleColor = (val) => {
    if (val === 'Full' || val === '4h+') return 'text-green-400 font-bold';
    if (val === 'Unavailable') return 'text-gray-600';
    return 'text-yellow-400';
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">

        {/* --- STANDARDIZED NAVBAR --- */}
        <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md">
          <div className="flex items-center space-x-3">
            <Activity className="text-blue-500 w-6 h-6" />
            <h1 className="text-xl font-bold tracking-wide">State Roster</h1>
          </div>
          <Link
              to="/"
              className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium border border-gray-600"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-[1800px] space-y-6">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Users className="text-blue-500 w-7 h-7" /> Roster Management
            </h2>
            <div className="flex gap-3 w-full md:w-auto">
              <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Data'}
              </button>
              <button
                  onClick={() => setShowAddModal(true)}
                  className="flex-1 md:flex-none flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg"
              >
                <Plus size={18} /> Add Players
              </button>
              <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Search..."
                    className="w-full md:w-64 bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tab Selection & Counter */}
          <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">

            <div
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-bold text-gray-300 shadow-inner flex-shrink-0"
                title="Current Player Count"
            >
              <Users size={16} className="text-blue-500" />
              <span>{filteredPlayers.length}</span>
            </div>

            <div className="w-px h-6 bg-gray-700 hidden md:block flex-shrink-0"></div>

            <div className="flex flex-wrap gap-2">
              {getTabs().map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                      }`}
                  >
                    {tab.name}
                  </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold w-16">Img</th>
                  <th className="p-4 font-semibold">Player</th>
                  <th className="p-4 font-semibold text-center">Furnace</th>
                  <th className="p-4 font-semibold">Power</th>
                  <th className="p-4 font-semibold">Troops</th>
                  <th className="p-4 font-semibold w-32"><div className="flex items-center gap-1"><Swords className="w-3 h-3"/> Battle</div></th>
                  <th className="p-4 font-semibold w-28"><div className="flex items-center gap-1"><Snowflake className="w-3 h-3"/> Tundra</div></th>
                  <th className="p-4 font-semibold">Alliance</th>
                  <th className="p-4 font-semibold text-red-300">Fighting Alliance</th>
                  <th className="p-4 font-semibold">Team</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 text-sm">
                {loading ? (
                    <tr><td colSpan="11" className="p-12 text-center text-gray-500 animate-pulse">Loading roster data...</td></tr>
                ) : filteredPlayers.length === 0 ? (
                    <tr><td colSpan="11" className="p-12 text-center text-gray-500">No players found in this view.</td></tr>
                ) : (
                    filteredPlayers.map(p => (
                        <tr key={p.fid} className={`transition-colors ${editingId === p.fid ? "bg-blue-900/10" : "hover:bg-gray-700/30"}`}>
                          <td className="p-4">
                            <img alt="avatar" src={p.avatar || 'https://via.placeholder.com/40?text=?'} className="w-10 h-10 rounded-full border border-gray-600 bg-gray-900 object-cover" />
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-white">{p.nickname || <span className="text-red-400 italic">Unknown</span>}</div>
                            <div className="text-xs text-gray-500 font-mono">FID: {p.fid}</div>
                          </td>
                          <td className="p-4 text-center">
                            {p.stoveImg ? <img alt="level" src={p.stoveImg} className="w-8 h-8 mx-auto object-contain" /> : '-'}
                          </td>
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <input type="number" className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-24 text-white" value={editForm.power} onChange={e => setEditForm({...editForm, power: e.target.value})} />
                            ) : (
                                <span className="font-mono text-yellow-500">{p.power ? p.power.toLocaleString() : '-'}</span>
                            )}
                          </td>
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white text-xs" value={editForm.troopType} onChange={e => setEditForm({...editForm, troopType: e.target.value})}>
                                  {options.rosterstats.troopTypes.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                            ) : (
                                <span className={`px-2 py-1 rounded text-xs border ${p.troopType === 'Apex' ? 'bg-red-900/30 text-red-300 border-red-800' : p.troopType === 'Helios' ? 'bg-orange-900/30 text-orange-300 border-orange-800' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                            {p.troopType !== 'None' ? p.troopType : '-'}
                          </span>
                            )}
                          </td>
                          <td className="p-4 text-xs">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white text-xs" value={editForm.battleAvailability} onChange={e => setEditForm({...editForm, battleAvailability: e.target.value})}>
                                  {options.rosterstats.battleAvailability.map(b => (
                                      <option key={b} value={b}>{b}</option>
                                  ))}                                </select>
                            ) : <span className={getBattleColor(p.battleAvailability)}>{p.battleAvailability}</span>}
                          </td>
                          <td className="p-4 text-xs">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white text-xs" value={editForm.tundraAvailability} onChange={e => setEditForm({...editForm, tundraAvailability: e.target.value})}>
                                  {options.rosterstats.tundraAvailability.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                  ))}                                </select>
                            ) : <span className={p.tundraAvailability === 'Full' ? 'text-blue-400' : 'text-gray-500'}>{p.tundraAvailability}</span>}
                          </td>
                          <td className="p-4 text-xs text-gray-400">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-gray-600 rounded p-1" value={editForm.allianceId} onChange={e => setEditForm({...editForm, allianceId: e.target.value})}>
                                  <option value="">Unassigned</option>
                                  {(options.alliances || []).filter(a => a.type !== 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            ) : p.allianceName || '-'}
                          </td>
                          <td className="p-4 text-xs">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-red-900/50 rounded p-1" value={editForm.fightingAllianceId} onChange={e => setEditForm({...editForm, fightingAllianceId: e.target.value})}>
                                  <option value="">None</option>
                                  {(options.alliances || []).filter(a => a.type === 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            ) : <span className={p.fightingAllianceName ? "text-red-400 font-bold" : "text-gray-600"}>{p.fightingAllianceName || '-'}</span>}
                          </td>
                          <td className="p-4 text-xs text-gray-400">
                            {editingId === p.fid ? (
                                <select className="bg-gray-900 border border-gray-600 rounded p-1" value={editForm.teamId} onChange={e => setEditForm({...editForm, teamId: e.target.value})}>
                                  <option value="">No Team</option>
                                  {(options.teams || []).filter(t => !editForm.allianceId || t.allianceId === editForm.allianceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            ) : p.teamName || '-'}
                          </td>
                          <td className="p-4 text-right">
                            {editingId === p.fid ? (
                                <div className="flex justify-end gap-2">
                                  <button onClick={handleSave} className="p-1.5 bg-green-600 rounded hover:bg-green-500 text-white"><Save size={16}/></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-600 rounded hover:bg-gray-500 text-white"><X size={16}/></button>
                                </div>
                            ) : (
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => handleEdit(p)} className="p-1.5 hover:bg-gray-700 text-blue-400 rounded transition-colors"><Edit2 size={16} /></button>
                                  <button onClick={() => handleDelete(p.fid, p.nickname)} className="p-1.5 hover:bg-red-900/30 text-gray-500 hover:text-red-500 rounded transition-colors"><Trash2 size={16} /></button>
                                </div>
                            )}
                          </td>
                        </tr>
                    ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* --- ORIGINAL MODAL STRUCTURE --- */}
        {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-gray-800 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2"><Plus className="text-blue-500" /> Bulk Import Players</h3>
                  <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
                </div>
                <form onSubmit={handleBatchAdd} className="p-6 space-y-4">
              <textarea
                  className="w-full h-48 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white font-mono text-sm outline-none resize-none"
                  placeholder="12345678, 98765432..."
                  value={bulkIds}
                  onChange={(e) => setBulkIds(e.target.value)}
                  disabled={isAdding}
              />
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2 text-gray-400 font-bold">Cancel</button>
                    <button type="submit" disabled={isAdding || !bulkIds.trim()} className="px-8 py-2 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-500">
                      {isAdding ? 'Adding...' : 'Add to Roster'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </div>
  );
}
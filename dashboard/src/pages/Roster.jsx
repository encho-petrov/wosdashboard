import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
  Users, Edit2, Search, Save, X, RefreshCw, ArrowLeft,
  Swords, Snowflake
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Roster() {
  const { user } = useAuth();

  // Data State
  const [players, setPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const [options, setOptions] = useState({ alliances: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Logic
  useEffect(() => {
    let result = players;

    // 1. Tab Filter
    if (activeTab !== 'all') {
      result = result.filter(p => p.allianceId === activeTab);
    }

    // 2. Search Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p =>
          (p.nickname || '').toLowerCase().includes(lower) ||
          p.fid.toString().includes(lower)
      );
    }

    setFilteredPlayers(result);
  }, [searchTerm, players, activeTab]);

  const fetchData = async () => {
    try {
      const [playerRes, optRes] = await Promise.all([
        client.get('/moderator/players'),
        client.get('/moderator/options')
      ]);

      setPlayers(playerRes.data);
      setOptions(optRes.data);

      // Auto-select tab for Moderators
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
    setIsSyncing(true); // Start spinner
    try {
      const res = await client.post('/admin/sync-roster');

      toast.info(res.data.message, { autoClose: 5000 });

      setTimeout(() => setIsSyncing(false), 3000);

      setTimeout(() => fetchData(), 30000);

    } catch (err) {
      toast.error("Sync failed to start");
      setIsSyncing(false);
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

      await client.put(`/moderator/players/${editingId}`, payload);
      toast.success("Player updated");
      setEditingId(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Update failed");
    }
  };

  // Helper: Get Tabs
  const getTabs = () => {
    if (user?.role === 'admin') {
      return [
        { id: 'all', name: 'All Players' },
        ...(options.alliances || []).filter(a => a.type !== 'Fighting')
      ];
    } else {
      return [{ id: 'all', name: 'My Alliance' }];
    }
  };

  const getBattleColor = (val) => {
    if (val === 'Full' || val === '4h+') return 'text-green-400 font-bold';
    if (val === 'Unavailable') return 'text-gray-600';
    return 'text-yellow-400';
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-sans">
        <div className="max-w-[1800px] mx-auto space-y-6">

          {/* HEADER */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-700 pb-6">
            <div className="flex items-center gap-4">
              <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center text-white">
                  <Users className="mr-3 text-blue-500 w-8 h-8" />
                  Roster Management
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className={`flex items-center px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium transition-colors ${isSyncing ? 'opacity-50' : ''}`}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Data'}
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

          {/* TABS */}
          <div className="flex flex-wrap gap-2">
            {getTabs().map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
                    }`}
                >
                  {tab.name}
                </button>
            ))}
          </div>

          {/* TABLE */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold w-16">Img</th>
                  <th className="p-4 font-semibold">Player</th>
                  <th className="p-4 font-semibold text-center">Furnace</th>
                  <th className="p-4 font-semibold">Power</th> {/* CHANGED: Removed (M) */}
                  <th className="p-4 font-semibold">Troops</th>
                  <th className="p-4 font-semibold w-32"><div className="flex items-center gap-1"><Swords className="w-3 h-3"/> Battle</div></th>
                  <th className="p-4 font-semibold w-28"><div className="flex items-center gap-1"><Snowflake className="w-3 h-3"/> Tundra</div></th>
                  <th className="p-4 font-semibold">Alliance</th> {/* CHANGED: Was General All. */}
                  <th className="p-4 font-semibold text-red-300">Fighting Alliance</th> {/* CHANGED: Was Fighting All. */}
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

                          {/* 1. Avatar */}
                          <td className="p-4">
                            <img
                                alt={"avatar"}
                                src={p.avatar || 'https://via.placeholder.com/40?text=?'}
                                className="w-10 h-10 rounded-full border border-gray-600 bg-gray-900 object-cover"
                            />
                          </td>

                          {/* 2. Name & ID */}
                          <td className="p-4">
                            <div className="font-bold text-white">{p.nickname || <span className="text-red-400 italic">Unknown</span>}</div>
                            <div className="text-xs text-gray-500 font-mono">FID: {p.fid}</div>
                          </td>

                          {/* 3. Furnace Image */}
                          <td className="p-4 text-center">
                            {p.stoveImg ? (
                                <div className="flex justify-center" title={`Level ${p.stoveLv}`}>
                                  <img alt="furnace level" src={p.stoveImg} className="w-8 h-8 object-contain filter drop-shadow" />
                                </div>
                            ) : <span className="text-gray-700">-</span>}
                          </td>

                          {/* 4. Power */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <input
                                    type="number"
                                    className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-24 text-white"
                                    value={editForm.power}
                                    onChange={e => setEditForm({...editForm, power: e.target.value})}
                                />
                            ) : (
                                <span className="font-mono text-yellow-500 font-medium">
                            {/* CHANGED: Removed /1000000 division and M suffix. Added comma formatting. */}
                                  {p.power ? p.power.toLocaleString() : '-'}
                          </span>
                            )}
                          </td>

                          {/* 5. Troops */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white w-20 text-xs"
                                    value={editForm.troopType}
                                    onChange={e => setEditForm({...editForm, troopType: e.target.value})}
                                >
                                  <option value="None">None</option>
                                  <option value="Brilliant">Brilliant</option>
                                  <option value="Helios">Helios</option>
                                  <option value="Apex">Apex</option>
                                </select>
                            ) : (
                                <span className={`px-2 py-1 rounded text-xs border ${
                                    p.troopType === 'Apex' ? 'bg-red-900/30 text-red-300 border-red-800' :
                                        p.troopType === 'Helios' ? 'bg-orange-900/30 text-orange-300 border-orange-800' :
                                            'bg-gray-700 text-gray-400 border-gray-600'
                                }`}>{p.troopType !== 'None' ? p.troopType : '-'}</span>
                            )}
                          </td>

                          {/* 6. Battle Availability */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white w-28 text-xs"
                                    value={editForm.battleAvailability}
                                    onChange={e => setEditForm({...editForm, battleAvailability: e.target.value})}
                                >
                                  <option value="Unavailable">Unavailable</option>
                                  <option value="<2h">&lt; 2h</option>
                                  <option value="2-3h">2-3h</option>
                                  <option value="3-4h">3-4h</option>
                                  <option value="4h+">4h+</option>
                                  <option value="Full">Full</option>
                                </select>
                            ) : (
                                <span className={`text-xs ${getBattleColor(p.battleAvailability)}`}>
                            {p.battleAvailability}
                          </span>
                            )}
                          </td>

                          {/* 7. Tundra Availability */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white w-24 text-xs"
                                    value={editForm.tundraAvailability}
                                    onChange={e => setEditForm({...editForm, tundraAvailability: e.target.value})}
                                >
                                  <option value="Unavailable">Unavailable</option>
                                  <option value="Partial">Partial</option>
                                  <option value="Full">Full</option>
                                </select>
                            ) : (
                                <span className={`text-xs ${p.tundraAvailability === 'Full' ? 'text-blue-400' : 'text-gray-500'}`}>
                            {p.tundraAvailability}
                          </span>
                            )}
                          </td>

                          {/* 8. Alliance (General) */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white w-28 text-xs"
                                    value={editForm.allianceId}
                                    onChange={e => setEditForm({...editForm, allianceId: e.target.value})}
                                >
                                  <option value="">Unassigned</option>
                                  {(options.alliances || [])
                                      .filter(a => a.type !== 'Fighting')
                                      .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            ) : (
                                <span className="text-gray-400 text-xs">{p.allianceName || '-'}</span>
                            )}
                          </td>

                          {/* 9. Fighting Alliance */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-red-900/50 rounded px-1 py-1 text-white w-28 text-xs"
                                    value={editForm.fightingAllianceId}
                                    onChange={e => setEditForm({...editForm, fightingAllianceId: e.target.value})}
                                >
                                  <option value="">None</option>
                                  {(options.alliances || [])
                                      .filter(a => a.type === 'Fighting')
                                      .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            ) : (
                                <span className={`text-xs font-bold ${p.fightingAllianceName ? "text-red-400" : "text-gray-600"}`}>
                            {p.fightingAllianceName || '-'}
                          </span>
                            )}
                          </td>

                          {/* 10. Team */}
                          <td className="p-4">
                            {editingId === p.fid ? (
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-white w-28 text-xs"
                                    value={editForm.teamId}
                                    onChange={e => setEditForm({...editForm, teamId: e.target.value})}
                                >
                                  <option value="">No Team</option>
                                  {(options.teams || [])
                                      .filter(t => !editForm.allianceId || t.allianceId === editForm.allianceId)
                                      .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            ) : (
                                <span className="text-gray-400 text-xs">{p.teamName || '-'}</span>
                            )}
                          </td>

                          {/* 11. Actions */}
                          <td className="p-4 text-right">
                            {editingId === p.fid ? (
                                <div className="flex justify-end space-x-2">
                                  <button onClick={handleSave} className="p-1.5 bg-green-600 rounded hover:bg-green-500 text-white"><Save className="w-4 h-4"/></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 bg-red-600 rounded hover:bg-red-500 text-white"><X className="w-4 h-4"/></button>
                                </div>
                            ) : (
                                <button onClick={() => handleEdit(p)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 hover:text-white">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                            )}
                          </td>
                        </tr>
                    )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
  );
}
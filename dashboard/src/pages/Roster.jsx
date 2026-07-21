import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
  Users, Edit2, Search, Save, X,
  Trash2, Plus, Archive
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { parsePowerInput } from '../utils/powerUtils';

const TundraPills = ({ player, isEditing, onChange }) => {
  const slots = [
    { key: 'avail_0200', label: '02:00' },
    { key: 'avail_0700', label: '07:00' },
    { key: 'avail_1200', label: '12:00' },
    { key: 'avail_1400', label: '14:00' },
    { key: 'avail_1900', label: '19:00' },
    { key: 'avail_PB', label: 'Boost' }
  ];

  return (
      <div className="flex items-center gap-1 flex-wrap w-24">
        {slots.map(slot => {
          const isActive = player[slot.key];
          return (
              <button
                  key={slot.key}
                  type="button"
                  onClick={() => isEditing && onChange(slot.key, !isActive)}
                  disabled={!isEditing}
                  className={`
                            px-1.5 py-0.5 text-[8px] font-black tracking-widest rounded transition-all
                            ${isEditing ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
                            ${isActive
                      ? 'bg-blue-600 text-white shadow-md border border-blue-500'
                      : 'bg-gray-800 text-gray-500 border border-gray-700'
                  }
                        `}
              >
                {slot.label}
              </button>
          );
        })}
      </div>
  );
};

export default function Roster() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isMod = user?.role === 'moderator';

  const { roster: players, globalLoading, refreshGlobalData } = useApp();

  const [options, setOptions] = useState({
    alliances: [],
    teams: [],
    rosterstats: { troopTypes: [], battleAvailability: [], tundraAvailability: [] }
  });

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [activeTab, setActiveTab] = useState(isMod ? user.allianceId : 'all');

  const [sortConfig, setSortConfig] = useState({ key: 'normalPower', direction: 'desc' });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ fid: '', nickname: '', furnaceLevel: 1, troopType: 'None', basePower: '', tundraPower: '', allianceId: '' });
  const [isAdding, setIsAdding] = useState(false);

  const [activeSeason, setActiveSeason] = useState(null);
  const [outboundModal, setOutboundModal] = useState({ isOpen: false, player: null, destState: '' });

  const [selectedMobilePlayerId, setSelectedMobilePlayerId] = useState(null);
  const activeMobilePlayer = useMemo(() =>
          (players || []).find(p => p.fid === selectedMobilePlayerId),
      [players, selectedMobilePlayerId]);

  useEffect(() => {
    void fetchInitialData();
  }, []);

  // LIVE SYNC
  useEffect(() => {
    const handleSync = async () => {
      if (refreshGlobalData) await refreshGlobalData(true);

      await fetchInitialData();
    };

    window.addEventListener('REFRESH_ROSTER', handleSync);
    return () => window.removeEventListener('REFRESH_ROSTER', handleSync);
  }, [refreshGlobalData]);

  const fetchInitialData = async () => {
    try {
      const [optRes, transRes] = await Promise.all([
        client.get('/moderator/options'),
        client.get('/moderator/transfers/active').catch(() => ({ data: {} }))
      ]);
      setOptions(optRes.data);
      setActiveSeason(transRes.data.season);
    } catch (err) {
      toast.error("Failed to load configuration options");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredPlayers = useMemo(() => {
    let result = players || [];

    // Filter by Tab
    if (isMod) {
      result = result.filter(p => Number(p.allianceId) === Number(user.allianceId));
    } else if (activeTab !== 'all') {
      result = result.filter(p => p.allianceId === activeTab);
    }

    // Filter by Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p =>
          (p.nickname || '').toLowerCase().includes(lower) ||
          (p.fid || '').toString().includes(lower)
      );
    }

    // Sort the Results dynamically
    return result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // String comparison (Names, Troop Types)
      if (typeof aVal === 'string' || typeof bVal === 'string') {
        const aStr = (aVal || '').toString().toLowerCase();
        const bStr = (bVal || '').toString().toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      }

      // Numeric comparison (Power, Stove Level)
      aVal = aVal || 0;
      bVal = bVal || 0;
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [searchTerm, players, activeTab, isMod, user?.allianceId, sortConfig]);

  const handleSaveEdit = async () => {
    try {
      const payload = {
        ...editForm,
        power: parsePowerInput(editForm.power),
        normalPower: parsePowerInput(editForm.normalPower),
        allianceId: editForm.allianceId ? parseInt(editForm.allianceId) : null,
        fightingAllianceId: editForm.fightingAllianceId ? parseInt(editForm.fightingAllianceId) : null,
        teamId: editForm.teamId ? parseInt(editForm.teamId) : null
      };

      await client.put(`/moderator/players/${editingId}`, payload);
      toast.success("Player updated");
      setEditingId(null);
      await refreshGlobalData(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Update failed");
    }
  };

  const handleDelete = async (fid, nickname) => {
    if (!isAdmin) return;
    if (!window.confirm(`Remove ${nickname} from state records?`)) return;
    try {
      await client.delete(`/moderator/players/${fid}`);
      toast.success("Player removed");
      if (selectedMobilePlayerId === fid) setSelectedMobilePlayerId(null);
      await refreshGlobalData(true);
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayer.fid || !newPlayer.nickname) return toast.warning("Player ID and Nickname are required!");

    setIsAdding(true);
    try {
      await client.post('/moderator/players', {
        fid: parseInt(newPlayer.fid),
        nickname: newPlayer.nickname,
        furnaceLevel: parseInt(newPlayer.furnaceLevel),
        troopType: newPlayer.troopType,
        basePower: parsePowerInput(newPlayer.basePower),
        tundraPower: parsePowerInput(newPlayer.tundraPower),
        allianceId: newPlayer.allianceId ? parseInt(newPlayer.allianceId) : null
      });
      toast.success("Player successfully drafted to the state roster!");
      setShowAddModal(false);
      setNewPlayer({ fid: '', nickname: '', furnaceLevel: 1, troopType: 'None', basePower: '', tundraPower: '', allianceId: '' });
      await refreshGlobalData(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add player");
    } finally {
      setIsAdding(false);
    }
  };

  const handleTransferOut = async () => {
    try {
      await client.post(`/moderator/players/${outboundModal.player.fid}/transfer-out`, {
        seasonId: activeSeason.id,
        nickname: outboundModal.player.nickname,
        destState: outboundModal.destState || 'Unknown'
      });
      toast.success("Player transferred out and archived.");
      if (selectedMobilePlayerId === outboundModal.player.fid) setSelectedMobilePlayerId(null);
      setOutboundModal({ isOpen: false, player: null, destState: '' });
      await refreshGlobalData(true);
    } catch (err) {
      toast.error("Transfer failed");
    }
  };

  const getBattleColor = (val) => {
    if (val === 'Full' || val === '4h+') return 'text-green-400 font-bold';
    if (val === 'Unavailable') return 'text-gray-500';
    return 'text-yellow-500';
  };

  // Helper component for clickable table headers
  const SortHeader = ({ label, sortKey, align = 'left' }) => {
    const isActive = sortConfig.key === sortKey;
    return (
        <th
            className={`p-4 cursor-pointer hover:bg-gray-800/50 transition-colors select-none ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}
            onClick={() => handleSort(sortKey)}
        >
          <div className={`flex items-center gap-1.5 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : ''} ${isActive ? 'text-blue-400' : ''}`}>
            {label}
            {isActive && (
                <span className="text-[10px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
            )}
          </div>
        </th>
    );
  };

  return (
      <AdminLayout title="State Roster">
        <div className="p-4 md:p-6 space-y-6 max-w-[1800px] mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                <Users className="text-blue-500" /> Player Ledger
              </h2>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                {isMod ? `Restricted View: ${user.username}` : "Global State Database"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              {isAdmin && (
                  <>
                    <button onClick={() => setShowAddModal(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-900/20">
                      <Plus size={16} /> Import
                    </button>
                  </>
              )}
              <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Name or FID..."
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none transition-all shadow-inner"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 shrink-0">
              <Users size={14} className="text-blue-500" />
              <span>{filteredPlayers.length} Active</span>
            </div>
            <div className="w-px h-6 bg-gray-800 mx-2 shrink-0" />
            <div className="flex gap-2">
              {!isMod && (
                  <button
                      onClick={() => setActiveTab('all')}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800'}`}
                  >
                    All Players
                  </button>
              )}
              {(options.alliances || [])
                  .filter(a => a.type !== 'Fighting')
                  .filter(a => isMod ? Number(a.id) === Number(user.allianceId) : true)
                  .map(tab => (
                      <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800'}`}
                      >
                        {tab.name}
                      </button>
                  ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col xl:bg-transparent xl:border-none xl:shadow-none">
            <div className="hidden xl:block overflow-x-auto custom-scrollbar bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl">
              <table className="w-full text-left border-collapse min-w-[1500px]">
                <thead className="bg-black text-gray-600 text-[10px] font-black uppercase tracking-widest border-b border-gray-800">
                <tr>
                  <th className="p-4 w-16 text-center"></th>
                  <SortHeader label="Identity" sortKey="nickname" />
                  <SortHeader label="Furnace" sortKey="stove_lv" align="center" />
                  <SortHeader label="Base Power" sortKey="normalPower" />
                  <SortHeader label="Tundra Power" sortKey="power" />
                  <SortHeader label="Troop Type" sortKey="troopType" />
                  <SortHeader label="Battle" sortKey="battleAvailability" />
                  {/* Tundra slots are arrays/booleans, so we keep this one static */}
                  <th className="p-4 w-32">Tundra</th>
                  <SortHeader label="Alliance" sortKey="allianceName" />
                  <SortHeader label="War Deployment" sortKey="fightingAllianceName" />
                  <SortHeader label="Squad" sortKey="teamName" />
                  <th className="p-4 text-right pr-6">Command</th>
                </tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-800/50">
                {(globalLoading || loadingOptions) ? (
                    <tr><td colSpan="12" className="p-20 text-center text-gray-600 font-black uppercase tracking-widest animate-pulse">Synchronizing State Data...</td></tr>
                ) : filteredPlayers.map(p => {
                  const isEditing = editingId === p.fid;
                  return (
                      <tr key={p.fid} className={`transition-all ${isEditing ? "bg-blue-900/10" : "hover:bg-gray-800/40"}`}>
                        <td className="p-4">
                          <img alt="av" src={p.avatar || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-xl border border-gray-800 bg-black object-cover shadow-inner" />
                        </td>
                        <td className="p-4 min-w-[150px]">
                          <div className="font-black text-gray-100 tracking-tighter">{p.nickname || "Unknown"}</div>
                          <div className="text-[10px] text-gray-600 font-mono tracking-tighter">FID: {p.fid}</div>
                        </td>
                        <td className="p-4 text-center">
                          {p.stoveImg ? (
                              p.stoveImg.startsWith('http') ? (
                                  <img alt="FC" src={p.stoveImg} className="w-8 h-8 mx-auto object-contain drop-shadow-md" />
                              ) : (
                                  <div className="flex justify-center">
                                      <span className="px-2 py-0.5 bg-gray-800 border border-gray-600 text-gray-200 text-[10px] font-black rounded shadow-sm">
                                          F{p.stoveImg}
                                      </span>
                                  </div>
                              )
                          ) : (
                              <span className="text-gray-600 font-bold">-</span>
                          )}
                        </td>

                        <td className="p-4">
                          {isEditing ? (
                              <input type="text" className="bg-black border border-gray-700 rounded-lg px-2 py-1 w-24 text-blue-400 font-mono outline-none" value={editForm.normalPower || ''} onChange={e => setEditForm({...editForm, normalPower: e.target.value})} />
                          ) : <span className="font-mono text-blue-400 font-bold">{p.normalPower?.toLocaleString() || '-'}</span>}
                        </td>

                        <td className="p-4">
                          {isEditing ? (
                              <input type="text" className="bg-black border border-gray-700 rounded-lg px-2 py-1 w-24 text-yellow-500 font-mono outline-none" value={editForm.power || ''} onChange={e => setEditForm({...editForm, power: e.target.value})} />
                          ) : <span className="font-mono text-yellow-600 font-bold">{p.power?.toLocaleString() || '-'}</span>}
                        </td>

                        <td className="p-4">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none" value={editForm.troopType || ''} onChange={e => setEditForm({...editForm, troopType: e.target.value})}>
                                {options.rosterstats.troopTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          ) : <span className="px-2 py-0.5 rounded-lg border border-gray-800 bg-black text-[9px] font-black uppercase tracking-widest text-gray-500">{p.troopType || 'None'}</span>}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none" value={editForm.battleAvailability || ''} onChange={e => setEditForm({...editForm, battleAvailability: e.target.value})}>
                                {options.rosterstats.battleAvailability.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                          ) : <span className={`text-[10px] font-black uppercase tracking-tighter ${getBattleColor(p.battleAvailability)}`}>{p.battleAvailability}</span>}
                        </td>
                        <td className="p-4">
                          <TundraPills
                              player={isEditing ? editForm : p}
                              isEditing={isEditing}
                              onChange={(key, val) => setEditForm({ ...editForm, [key]: val })}
                          />
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest text-gray-500">
                          {isEditing && isAdmin ? (
                              <select className="bg-black border border-gray-700 rounded-lg p-1 outline-none" value={editForm.allianceId || ''} onChange={e => setEditForm({...editForm, allianceId: e.target.value})}>
                                <option value="">Unassigned</option>
                                {options.alliances.filter(a => a.type !== 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                          ) : p.allianceName || '-'}
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest">
                          {isEditing ? (
                              <select className="bg-black border border-red-900/50 rounded-lg p-1 outline-none" value={editForm.fightingAllianceId || ''} onChange={e => setEditForm({...editForm, fightingAllianceId: e.target.value})}>
                                <option value="">None</option>
                                {options.alliances.filter(a => a.type === 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                          ) : <span className={p.fightingAllianceName ? "text-red-500 font-bold" : "text-gray-700"}>{p.fightingAllianceName || '-'}</span>}
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest text-gray-500">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg p-1 outline-none" value={editForm.teamId || ''} onChange={e => setEditForm({...editForm, teamId: e.target.value})}>
                                <option value="">No Team</option>
                                {(options.teams || []).filter(t => !editForm.allianceId || Number(t.allianceId) === Number(editForm.allianceId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                          ) : p.teamName || '-'}
                        </td>
                        <td className="p-4 text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                                <>
                                  <button title="Save Edit" onClick={handleSaveEdit} className="p-2 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-xl border border-green-800/50 transition-all shadow-md"><Save size={16} /></button>
                                  <button title="Cancel Edit" onClick={() => setEditingId(null)} className="p-2 bg-gray-800 text-gray-400 hover:bg-gray-700 rounded-xl transition-all"><X size={16} /></button>
                                </>
                            ) : (
                                <>
                                  <button title="Edit Player" onClick={() => { setEditingId(p.fid); setEditForm(p); }} className="p-2 bg-blue-900/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-md"><Edit2 size={16} /></button>
                                  <button title="Delete Player" onClick={() => handleDelete(p.fid, p.nickname)} className="p-2 bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl border border-red-800/50 transition-all shadow-md"><Trash2 size={16} /></button>
                                  {activeSeason?.status === 'Active' && (
                                      <button title="Archive Player" onClick={() => setOutboundModal({ isOpen: true, player: p, destState: '' })} className="p-2 bg-purple-900/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl border border-purple-800/50 transition-all shadow-md"><Archive size={16} /></button>
                                  )}
                                </>
                            )}
                          </div>
                        </td>
                      </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            <div className="flex xl:hidden flex-col gap-3 p-4 bg-gray-950">
              {(globalLoading || loadingOptions) ? (
                  <div className="p-10 text-center text-gray-600 font-black uppercase tracking-widest animate-pulse">Synchronizing State Data...</div>
              ) : filteredPlayers.length === 0 ? (
                  <div className="p-10 text-center text-gray-600 font-black uppercase tracking-widest">No players found</div>
              ) : filteredPlayers.map(p => (
                  <div
                      key={p.fid}
                      onClick={() => setSelectedMobilePlayerId(p.fid)}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between shadow-md active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <img alt="av" src={p.avatar || 'https://via.placeholder.com/40'} className="w-12 h-12 rounded-full border border-gray-700 shadow-md object-cover bg-black" />
                        {p.stoveImg && (
                            p.stoveImg.startsWith('http') ? (
                                <img alt="FC" src={p.stoveImg} className="w-5 h-5 absolute -bottom-1 -right-1 drop-shadow-xl object-contain" />
                            ) : (
                                <div className="absolute -bottom-1 -right-2 px-1.5 py-0.5 bg-gray-800 border border-gray-600 text-gray-200 text-[8px] font-black rounded shadow-sm">
                                  F{p.stoveImg}
                                </div>
                            )
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-gray-100">{p.nickname || "Unknown"}</div>
                        <div className="text-[10px] text-gray-500 font-mono tracking-tighter">FID: {p.fid}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{p.allianceName || 'No Alliance'}</div>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>

        {/* MODALS BELOW */}
        {showAddModal && isAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-gray-800 border border-gray-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2"><Plus className="text-blue-500" /> Draft Unit</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Manual Data Entry</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
                </div>
                <form onSubmit={handleAddPlayer} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Player ID (FID) *</label>
                          <input type="number" required disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" placeholder="12345678" value={newPlayer.fid} onChange={e => setNewPlayer({...newPlayer, fid: e.target.value})} />
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Nickname *</label>
                          <input type="text" required disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" placeholder="IceWarrior" value={newPlayer.nickname} onChange={e => setNewPlayer({...newPlayer, nickname: e.target.value})} />
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Furnace Level</label>
                          <select disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" value={newPlayer.furnaceLevel} onChange={e => setNewPlayer({...newPlayer, furnaceLevel: parseInt(e.target.value)})}>
                              {[...Array(10)].map((_, i) => (
                                  <option key={i + 1} value={i + 1}>FC{i + 1}</option>
                              ))}
                          </select>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Troops Type</label>
                          <select disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" value={newPlayer.troopType} onChange={e => setNewPlayer({...newPlayer, troopType: e.target.value})}>
                              <option value="None">None</option>
                              <option value="Exalted">Exalted</option>
                              <option value="Helios">Helios</option>
                              <option value="Apex">Apex</option>
                              <option value="Mixed">Mixed</option>
                          </select>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Base Power (Optional)</label>
                          <input type="text" disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" placeholder="e.g. 800M" value={newPlayer.basePower} onChange={e => setNewPlayer({...newPlayer, basePower: e.target.value})} />
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Tundra Power (Optional)</label>
                          <input type="text" disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" placeholder="e.g. 1.2B" value={newPlayer.tundraPower} onChange={e => setNewPlayer({...newPlayer, tundraPower: e.target.value})} />
                      </div>
                      <div className="col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Alliance</label>
                          <select disabled={isAdding} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono focus:border-blue-500 transition-all shadow-inner" value={newPlayer.allianceId} onChange={e => setNewPlayer({...newPlayer, allianceId: e.target.value})}>
                              <option value="">Unassigned</option>
                              {options.alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                      </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2 text-gray-500 font-black uppercase text-xs">Cancel</button>
                    <button type="submit" disabled={isAdding || !newPlayer.fid || !newPlayer.nickname} className="px-10 py-3 bg-blue-600 rounded-2xl text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 transition-all hover:scale-105">
                      {isAdding ? 'Adding...' : 'Deploy to Roster'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {outboundModal.isOpen && isAdmin && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-gray-800 p-8 rounded-3xl w-full max-w-md border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tighter flex items-center gap-2">
                  <Archive className="text-red-500"/> Offload Player: {outboundModal.player.nickname}
                </h3>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-6 leading-relaxed">
                  Archiving will strip deployments and wipe squad records. Ledger entry will be saved to history.
                </p>
                <input
                    type="text" placeholder="Destination State..."
                    className="w-full mb-8 p-3 bg-black border border-gray-700 rounded-xl text-white outline-none focus:border-red-500 shadow-inner"
                    value={outboundModal.destState}
                    onChange={e => setOutboundModal({...outboundModal, destState: e.target.value})}
                />
                <div className="flex justify-end gap-3">
                  <button onClick={() => setOutboundModal({ isOpen: false, player: null, destState: '' })} className="px-6 py-2 text-gray-500 font-black uppercase text-xs">Abort</button>
                  <button onClick={handleTransferOut} className="px-10 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl transition-all">Confirm</button>
                </div>
              </div>
            </div>
        )}

        {activeMobilePlayer && (
            <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
              <div className="bg-gray-900 p-6 rounded-3xl w-full max-w-sm border border-gray-700 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                <button
                    onClick={() => { setSelectedMobilePlayerId(null); setEditingId(null); }}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white p-2"
                >
                  <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-800">
                  <img src={activeMobilePlayer.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-16 h-16 rounded-full border-2 border-gray-700 shadow-md object-cover bg-black" />
                  <div>
                    <h3 className="font-black text-white text-lg">{activeMobilePlayer.nickname || "Unknown"}</h3>
                    <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">FID: {activeMobilePlayer.fid}</p>
                  </div>
                </div>

                <div className="space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-2 gap-4">
                    {/* BASE POWER */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Base Power</label>
                      {editingId === activeMobilePlayer.fid ? (
                          <input type="text" className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs font-mono text-blue-400 outline-none" placeholder="e.g. 500M" value={editForm.normalPower || ''} onChange={e => setEditForm({...editForm, normalPower: e.target.value})} />
                      ) : <span className="font-mono text-blue-400 font-bold">{activeMobilePlayer.normalPower?.toLocaleString() || '-'}</span>}
                    </div>

                    {/* TUNDRA POWER */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Tundra Power</label>
                      {editingId === activeMobilePlayer.fid ? (
                          <input type="text" className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs font-mono text-yellow-500 outline-none" placeholder="e.g. 1B" value={editForm.power || ''} onChange={e => setEditForm({...editForm, power: e.target.value})} />
                      ) : <span className="font-mono text-yellow-500 font-bold">{activeMobilePlayer.power?.toLocaleString() || '-'}</span>}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Troop Type</label>
                    {editingId === activeMobilePlayer.fid ? (
                        <select className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs text-white outline-none" value={editForm.troopType || ''} onChange={e => setEditForm({...editForm, troopType: e.target.value})}>
                          {options.rosterstats.troopTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    ) : <span className="px-2 py-1 rounded-lg border border-gray-800 bg-black text-[10px] font-black uppercase tracking-widest text-gray-400">{activeMobilePlayer.troopType || 'None'}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Battle</label>
                      {editingId === activeMobilePlayer.fid ? (
                          <select className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs text-white outline-none" value={editForm.battleAvailability || ''} onChange={e => setEditForm({...editForm, battleAvailability: e.target.value})}>
                            {options.rosterstats.battleAvailability.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                      ) : <span className={`text-[11px] font-black uppercase tracking-tighter ${getBattleColor(activeMobilePlayer.battleAvailability)}`}>{activeMobilePlayer.battleAvailability}</span>}
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Tundra</label>
                      <TundraPills
                          player={editingId === activeMobilePlayer.fid ? editForm : activeMobilePlayer}
                          isEditing={editingId === activeMobilePlayer.fid}
                          onChange={(key, val) => setEditForm({ ...editForm, [key]: val })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Alliance</label>
                    {editingId === activeMobilePlayer.fid && isAdmin ? (
                        <select className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs text-white outline-none" value={editForm.allianceId || ''} onChange={e => setEditForm({...editForm, allianceId: e.target.value})}>
                          <option value="">Unassigned</option>
                          {options.alliances.filter(a => a.type !== 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    ) : <span className="text-xs font-bold text-gray-300">{activeMobilePlayer.allianceName || '-'}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-red-500/80 block mb-1">War Deployment</label>
                    {editingId === activeMobilePlayer.fid ? (
                        <select className="w-full bg-black border border-red-900/50 rounded-xl p-3 text-xs text-white outline-none" value={editForm.fightingAllianceId || ''} onChange={e => setEditForm({...editForm, fightingAllianceId: e.target.value})}>
                          <option value="">None</option>
                          {options.alliances.filter(a => a.type === 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    ) : <span className={`text-xs ${activeMobilePlayer.fightingAllianceName ? "text-red-500 font-bold" : "text-gray-600"}`}>{activeMobilePlayer.fightingAllianceName || '-'}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Squad</label>
                    {editingId === activeMobilePlayer.fid ? (
                        <select className="w-full bg-black border border-gray-700 rounded-xl p-3 text-xs text-white outline-none" value={editForm.teamId || ''} onChange={e => setEditForm({...editForm, teamId: e.target.value})}>
                          <option value="">No Team</option>
                          {(options.teams || []).filter(t => !editForm.allianceId || Number(t.allianceId) === Number(editForm.allianceId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    ) : <span className="text-xs text-gray-400">{activeMobilePlayer.teamName || '-'}</span>}
                  </div>
                </div>

                <div className="pt-6 mt-4 border-t border-gray-800 flex justify-end gap-2">
                  {editingId === activeMobilePlayer.fid ? (
                      <>
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-800 text-gray-400 hover:bg-gray-700 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest">Cancel</button>
                        <button onClick={handleSaveEdit} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg"><Save size={14} /> Save</button>
                      </>
                  ) : (
                      <>
                        <button onClick={() => { setEditingId(activeMobilePlayer.fid); setEditForm(activeMobilePlayer); }} className="p-3 bg-blue-900/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-md"><Edit2 size={18} /></button>
                        {isAdmin && (
                            <button onClick={() => { void handleDelete(activeMobilePlayer.fid, activeMobilePlayer.nickname); setSelectedMobilePlayerId(null); }} className="p-3 bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl border border-red-800/50 transition-all shadow-md"><Trash2 size={18} /></button>
                        )}
                        {isAdmin && activeSeason?.status === 'Active' && (
                            <button onClick={() => { setOutboundModal({ isOpen: true, player: activeMobilePlayer, destState: '' }); setSelectedMobilePlayerId(null); }} className="p-3 bg-purple-900/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl border border-purple-800/50 transition-all shadow-md"><Archive size={18} /></button>
                        )}
                      </>
                  )}
                </div>
              </div>
            </div>
        )}

        <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
      `}</style>
      </AdminLayout>
  );
}
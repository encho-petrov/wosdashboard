import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext'; // Integrated Global State
import { toast } from 'react-toastify';
import {
  Users, Edit2, Search, Save, X, RefreshCw,
  Trash2, Plus, Archive
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function Roster() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isMod = user?.role === 'moderator';

  // 1. GLOBAL STATE & LOCAL REFRESH
  const { roster: players, globalLoading, refreshGlobalData } = useApp();

  const [options, setOptions] = useState({
    alliances: [],
    teams: [],
    rosterstats: { troopTypes: [], battleAvailability: [], tundraAvailability: [] }
  });

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // MODERATOR LOGIC: Default tab is their assigned alliance ID
  const [activeTab, setActiveTab] = useState(isMod ? user.allianceId : 'all');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkIds, setBulkIds] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [activeSeason, setActiveSeason] = useState(null);
  const [outboundModal, setOutboundModal] = useState({ isOpen: false, player: null, destState: '' });

  useEffect(() => {
    void fetchInitialData();
  }, []);

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

  // 2. HARD-FILTERED PLAYER LOGIC
  const filteredPlayers = useMemo(() => {
    let result = players || [];

    // MODERATOR ENFORCEMENT: If not admin, strictly filter by user.allianceId
    if (isMod) {
      result = result.filter(p => Number(p.allianceId) === Number(user.allianceId));
    } else if (activeTab !== 'all') {
      result = result.filter(p => p.allianceId === activeTab);
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p =>
          (p.nickname || '').toLowerCase().includes(lower) ||
          (p.fid || '').toString().includes(lower)
      );
    }
    return result;
  }, [searchTerm, players, activeTab, isMod, user.allianceId]);

  // --- ACTIONS ---

  const handleSync = async () => {
    if (!isAdmin) return;
    setIsSyncing(true);
    try {
      await client.post('/admin/sync-roster');
      toast.info("Backend sync initiated. Data will refresh shortly.");
      setTimeout(() => {
        refreshGlobalData(true);
        setIsSyncing(false);
      }, 5000);
    } catch (err) {
      toast.error("Sync failed");
      setIsSyncing(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await client.put(`/moderator/players/${editingId}`, {
        ...editForm,
        power: parseInt(editForm.power),
        allianceId: parseInt(editForm.allianceId)
      });
      toast.success("Player updated");
      setEditingId(null);
      await refreshGlobalData(true);
    } catch (err) {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (fid, nickname) => {
    if (!isAdmin) return;
    if (!window.confirm(`Remove ${nickname} from state records?`)) return;
    try {
      await client.delete(`/moderator/players/${fid}`);
      toast.success("Player removed");
      await refreshGlobalData(true);
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const handleBatchAdd = async (e) => {
    e.preventDefault();
    if (!bulkIds.trim()) return;

    setIsAdding(true);
    try {
      await client.post('/moderator/players', { players: bulkIds });
      toast.success("Players successfully drafted to the state roster!");

      setShowAddModal(false);
      setBulkIds('');

      await refreshGlobalData(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add players");
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

  return (
      <AdminLayout title="State Roster">
        <div className="p-4 md:p-6 space-y-6 max-w-[1800px] mx-auto">

          {/* HEADER: Dynamic buttons based on Admin role */}
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
                    <button onClick={handleSync} disabled={isSyncing} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition-all font-bold text-xs uppercase">
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> Sync
                    </button>
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

          {/* TABS: Moderators only see their alliance tab */}
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

          {/* TABLE: Mobile Scrollable */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1400px]">
                <thead className="bg-black text-gray-600 text-[10px] font-black uppercase tracking-widest border-b border-gray-800">
                <tr>
                  <th className="p-4 w-16 text-center"></th>
                  <th className="p-4">Identity</th>
                  <th className="p-4 text-center">Furnace</th>
                  <th className="p-4">Power</th>
                  <th className="p-4">Troop Type</th>
                  <th className="p-4 w-32">Battle</th>
                  <th className="p-4 w-28">Tundra</th>
                  <th className="p-4">Alliance</th>
                  <th className="p-4 text-red-500/80">War Deployment</th>
                  <th className="p-4">Squad</th>
                  <th className="p-4 text-right pr-6">Command</th>
                </tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-800/50">
                {(globalLoading || loadingOptions) ? (
                    <tr><td colSpan="11" className="p-20 text-center text-gray-600 font-black uppercase tracking-widest animate-pulse">Synchronizing State Data...</td></tr>
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
                              <input type="number" className="bg-black border border-gray-700 rounded-lg px-2 py-1 w-28 text-yellow-500 font-mono outline-none" value={editForm.power} onChange={e => setEditForm({...editForm, power: e.target.value})} />
                          ) : <span className="font-mono text-yellow-600 font-bold">{p.power?.toLocaleString() || '-'}</span>}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none" value={editForm.troopType} onChange={e => setEditForm({...editForm, troopType: e.target.value})}>
                                {options.rosterstats.troopTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          ) : <span className="px-2 py-0.5 rounded-lg border border-gray-800 bg-black text-[9px] font-black uppercase tracking-widest text-gray-500">{p.troopType || 'None'}</span>}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none" value={editForm.battleAvailability} onChange={e => setEditForm({...editForm, battleAvailability: e.target.value})}>
                                {options.rosterstats.battleAvailability.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                          ) : <span className={`text-[10px] font-black uppercase tracking-tighter ${getBattleColor(p.battleAvailability)}`}>{p.battleAvailability}</span>}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none" value={editForm.tundraAvailability} onChange={e => setEditForm({...editForm, tundraAvailability: e.target.value})}>
                                {options.rosterstats.tundraAvailability.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          ) : <span className={`text-[10px] font-black uppercase tracking-tighter ${p.tundraAvailability === 'Full' ? 'text-blue-400' : 'text-gray-700'}`}>{p.tundraAvailability}</span>}
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest text-gray-500">
                          {isEditing && isAdmin ? (
                              <select className="bg-black border border-gray-700 rounded-lg p-1 outline-none" value={editForm.allianceId} onChange={e => setEditForm({...editForm, allianceId: e.target.value})}>
                                <option value="">Unassigned</option>
                                {options.alliances.filter(a => a.type !== 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                          ) : p.allianceName || '-'}
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest">
                          {isEditing ? (
                              <select className="bg-black border border-red-900/50 rounded-lg p-1 outline-none" value={editForm.fightingAllianceId} onChange={e => setEditForm({...editForm, fightingAllianceId: e.target.value})}>
                                <option value="">None</option>
                                {options.alliances.filter(a => a.type === 'Fighting').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                          ) : <span className={p.fightingAllianceName ? "text-red-500 font-bold" : "text-gray-700"}>{p.fightingAllianceName || '-'}</span>}
                        </td>
                        <td className="p-4 text-[10px] font-black tracking-widest text-gray-500">
                          {isEditing ? (
                              <select className="bg-black border border-gray-700 rounded-lg p-1 outline-none" value={editForm.teamId} onChange={e => setEditForm({...editForm, teamId: e.target.value})}>
                                <option value="">No Team</option>
                                {(options.teams || []).filter(t => !editForm.allianceId || Number(t.allianceId) === Number(editForm.allianceId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                          ) : p.teamName || '-'}
                        </td>
                        <td className="p-4 text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                                <>
                                  <button onClick={handleSaveEdit} className="p-2 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-xl border border-green-800/50 transition-all shadow-md"><Save size={16} /></button>
                                  <button onClick={() => setEditingId(null)} className="p-2 bg-gray-800 text-gray-400 hover:bg-gray-700 rounded-xl transition-all"><X size={16} /></button>
                                </>
                            ) : (
                                <>
                                  <button onClick={() => { setEditingId(p.fid); setEditForm(p); }} className="p-2 bg-blue-900/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-md"><Edit2 size={16} /></button>
                                  <button onClick={() => handleDelete(p.fid, p.nickname)} className="p-2 bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl border border-red-800/50 transition-all shadow-md"><Trash2 size={16} /></button>
                                  {activeSeason?.status === 'Active' && (
                                      <button onClick={() => setOutboundModal({ isOpen: true, player: p, destState: '' })} className="p-2 bg-purple-900/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl border border-purple-800/50 transition-all shadow-md"><Archive size={16} /></button>
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
          </div>
        </div>

        {/* MODAL: BATCH ADD (ADMIN ONLY) */}
        {showAddModal && isAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-gray-800 border border-gray-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2"><Plus className="text-blue-500" /> Draft Units</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Bulk Import Player IDs</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
                </div>
                <form onSubmit={handleBatchAdd} className="p-8 space-y-4">
              <textarea
                  className="w-full h-48 bg-black border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none resize-none shadow-inner focus:border-blue-500"
                  placeholder="1234567, 7512369..."
                  value={bulkIds} onChange={e => setBulkIds(e.target.value)} disabled={isAdding}
              />
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2 text-gray-500 font-black uppercase text-xs">Cancel</button>
                    <button type="submit" disabled={isAdding || !bulkIds.trim()} className="px-10 py-3 bg-blue-600 rounded-2xl text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 transition-all hover:scale-105">
                      {isAdding ? 'Syncing...' : 'Deploy to Roster'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {/* MODAL: OUTBOUND (ADMIN ONLY) */}
        {outboundModal.isOpen && isAdmin && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
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

        <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
      `}</style>
      </AdminLayout>
  );
}

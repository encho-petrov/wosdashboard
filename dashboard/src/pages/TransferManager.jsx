import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import AdminLayout from '../components/layout/AdminLayout';
import { toast } from 'react-toastify';
import MfaSetupModal from '../components/MfaSetupModal';
import {
    Plus, Archive, Check, X,
    AlertTriangle, Send, Shield, Play, History, Activity
} from 'lucide-react';

export default function TransferManager() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const { alliances, refreshGlobalData } = useApp();

    const [season, setSeason] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    const [viewingHistory, setViewingHistory] = useState(false);
    const [historySeasons, setHistorySeasons] = useState([]);
    const [historyRecords, setHistoryRecords] = useState([]);
    const [selectedPastSeason, setSelectedPastSeason] = useState(null);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [bulkFids, setBulkFids] = useState('');
    const [newSeason, setNewSeason] = useState({ name: '', powerCap: 200000000, leading: false, specials: 3 });
    const [showMfaModal, setShowMfaModal] = useState(false);

    // Mobile modal state
    const [selectedMobileRecordId, setSelectedMobileRecordId] = useState(null);
    const activeMobileRecord = useMemo(() => records.find(r => r.id === selectedMobileRecordId), [records, selectedMobileRecordId]);

    useEffect(() => { void fetchData(); }, []);

    const fetchData = async (silent = false) => {
        if (!silent && records.length === 0) setLoading(true);
        try {
            const res = await client.get('/moderator/transfers/active');
            setSeason(res.data.season);
            setRecords(res.data.records || []);
        } catch (err) {
            toast.error("Failed to load transfer data.");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleViewHistory = async () => {
        setViewingHistory(true);
        try {
            const res = await client.get('/moderator/transfers/history');
            setHistorySeasons(res.data || []);
            if (res.data && res.data.length > 0) {
                await handleSelectPastSeason(res.data[0]);
            }
        } catch (err) { toast.error("Failed to load history."); }
    };

    const handleSelectPastSeason = async (pastSeason) => {
        setSelectedPastSeason(pastSeason);
        try {
            const res = await client.get(`/moderator/transfers/seasons/${pastSeason.id}/records`);
            setHistoryRecords(res.data || []);
        } catch (err) {
            toast.error("Failed to load season records.");
        }
    };

    // --- CALCULATIONS ---
    const stats = useMemo(() => {
        if (!season) return { normalUsed: 0, normalMax: 0, specialUsed: 0, specialMax: 0 };
        const normalMax = season.isLeading ? 20 : 35;
        const specialMax = season.specialInvitesAvailable;
        const normalUsed = records.filter(r => r.inviteType === 'Normal' && r.status !== 'Declined').length;
        const specialUsed = records.filter(r => r.inviteType === 'Special' && r.status !== 'Declined').length;
        return { normalUsed, normalMax, specialUsed, specialMax };
    }, [season, records]);

    // --- ACTIONS ---
    const handleCreateSeason = async () => {
        try {
            await client.post('/moderator/transfers/seasons', newSeason);
            toast.success("Season created in Planning phase!");
            setShowCreateModal(false);
            await fetchData();
        } catch (err) { toast.error("Failed to create season"); }
    };

    const handleUpdateSeasonStatus = async (newStatus) => {
        const msg = newStatus === 'Active'
            ? "Start the Active Transfer Window? This will enable the Transfer Out button on the Roster."
            : "Close this season? This action is permanent and freezes all records.";

        if (!window.confirm(msg)) return;

        try {
            await client.put(`/moderator/transfers/seasons/${season.id}/status`, { status: newStatus });
            toast.success(`Season moved to ${newStatus} phase!`);
            if (newStatus === 'Closed') {
                setSeason(null);
                setRecords([]);
            } else {
                await fetchData();
            }
        } catch (err) { toast.error(`Failed to change status to ${newStatus}`); }
    };

    const handleBulkAdd = async () => {
        if (!bulkFids.trim()) return;
        try {
            toast.info("Polling Game API... This may take a moment.");
            await client.post('/moderator/transfers/bulk-add', { seasonId: season.id, fids: bulkFids });
            toast.success("Candidates added!");
            setShowAddModal(false);
            setBulkFids('');
            await fetchData();
        } catch (err) { toast.error("Failed to add candidates"); }
    };

    const handleUpdateRecord = async (id, field, value) => {
        if (!isAdmin) return;
        const record = records.find(r => r.id === id);
        if (!record) return;

        try {
            await client.put(`/moderator/transfers/${id}`, {
                power: field === 'power' ? parseInt(value) : record.power,
                targetAllianceId: field === 'targetAllianceId' ? (value ? parseInt(value) : null) : record.targetAllianceId,
                inviteType: field === 'inviteType' ? value : record.inviteType,
                status: field === 'status' ? value : record.status
            });
            await fetchData(true);
            if (field === 'status' && value === 'Confirmed') {
                await refreshGlobalData(true);
            }
        } catch (err) {
            toast.error("Update failed");
            await fetchData();
        }
    };

    const handleToggleInvite = (id, currentType, requestedType) => {
        if (!isAdmin) return;
        if (currentType === requestedType) requestedType = 'None';
        if (requestedType === 'Normal' && stats.normalUsed >= stats.normalMax) return toast.warning("Normal invite limit reached!");
        if (requestedType === 'Special' && stats.specialUsed >= stats.specialMax) return toast.warning("Special invite limit reached!");
        void handleUpdateRecord(id, 'inviteType', requestedType);
    };

    const handleConfirmInbound = async (record) => {
        if (!isAdmin) return;
        if (season.status !== 'Active') return toast.warning("Cannot confirm transfers during the Planning Phase!");
        if (!record.targetAllianceId) return toast.warning("Select a Target Alliance first!");

        try {
            await client.post(`/moderator/transfers/${record.id}/confirm-inbound`, {
                fid: record.fid,
                nickname: record.nickname,
                targetAllianceId: record.targetAllianceId
            });
            toast.success("Player Confirmed and added to Roster!");
            await refreshGlobalData(true);
            await fetchData(true);
        } catch (err) { toast.error("Failed to confirm player"); }
    };

    // Refactored buttons to be flex-responsive and match Roster.jsx
    const transferActions = (
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {viewingHistory ? (
                <button onClick={() => setViewingHistory(false)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-900/20 transition-all">
                    <Activity size={16} /> Active Season
                </button>
            ) : (
                <>
                    <button onClick={handleViewHistory} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl font-black text-xs uppercase shadow-lg transition-all">
                        <History size={16} /> History
                    </button>

                    {isAdmin && season && (
                        <>
                            <button onClick={() => setShowAddModal(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl font-black text-xs uppercase shadow-lg transition-all">
                                <Plus size={16} /> Add
                            </button>

                            {season.status === 'Planning' && (
                                <button onClick={() => handleUpdateSeasonStatus('Active')} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-800/50 hover:bg-blue-600/40 text-blue-400 rounded-xl font-black text-xs uppercase shadow-lg transition-all">
                                    <Play size={16} /> Open
                                </button>
                            )}

                            {(season.status === 'Planning' || season.status === 'Active') && (
                                <button onClick={() => handleUpdateSeasonStatus('Closed')} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 border border-red-800/50 hover:bg-red-600/40 text-red-400 rounded-xl font-black text-xs uppercase shadow-lg transition-all">
                                    <Archive size={16} /> Close
                                </button>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );

    // ==========================================
    // RENDER: HISTORY VIEW
    // ==========================================
    if (viewingHistory) {
        return (
            <AdminLayout title="Transfer Manager">
                <div className="p-4 xl:p-6 flex flex-col h-full bg-gray-950 overflow-hidden">

                    {/* CUSTOM RESPONSIVE HEADER */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 shrink-0">
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                                <History className="text-blue-500" /> Transfer History
                            </h2>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                                Archived Seasons
                            </p>
                        </div>
                        {transferActions}
                    </div>

                    <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 flex-1 min-h-0">
                        {loading ? (
                            <div className="flex-1 flex items-center justify-center text-gray-500 font-black uppercase tracking-widest animate-pulse">
                                Synchronizing Ledger...
                            </div>
                        ) : (
                            <div className="w-full xl:w-1/4 bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col h-auto xl:h-full overflow-hidden shadow-lg shrink-0">
                                <h2 className="text-xs font-black text-gray-500 mb-4 uppercase tracking-widest px-2 flex items-center gap-2 shrink-0">
                                    <History size={14} /> Season Archive
                                </h2>
                                {historySeasons.length === 0 && <p className="text-gray-600 text-xs px-2 italic">No closed seasons found.</p>}
                                <div className="flex xl:flex-col gap-3 overflow-x-auto xl:overflow-y-auto custom-scrollbar pb-2 xl:pb-0">
                                    {historySeasons.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleSelectPastSeason(s)}
                                            className={`shrink-0 xl:w-full min-w-[160px] text-left p-3 rounded-xl border transition-all ${selectedPastSeason?.id === s.id ? 'bg-blue-900/20 border-blue-500 text-blue-100 shadow-md' : 'bg-gray-800/50 border-gray-800 text-gray-400 hover:bg-gray-800'}`}
                                        >
                                            <div className="font-bold text-sm truncate">{s.name}</div>
                                            <div className="text-[10px] opacity-60 font-mono tracking-tighter">Cap: {s.powerCap.toLocaleString()}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col min-w-0">
                            {selectedPastSeason ? (
                                <>
                                    <div className="p-4 border-b border-gray-800 bg-gray-900 flex justify-between items-center shrink-0">
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-tighter">Final Ledger: {selectedPastSeason.name}</h3>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                                Closed on {selectedPastSeason.closedAt ? new Date(selectedPastSeason.closedAt).toLocaleDateString() : 'Unknown Date'}
                                            </p>
                                        </div>
                                        <span className="hidden sm:inline-block px-3 py-1 bg-gray-800 text-gray-500 border border-gray-700 text-[10px] font-black uppercase tracking-widest rounded-lg">Archived</span>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                        {/* 🖥️ DESKTOP TABLE */}
                                        <div className="hidden xl:block">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                <tr className="bg-gray-950 sticky top-0 border-b border-gray-800 text-gray-500 text-[10px] font-black uppercase tracking-widest">
                                                    <th className="p-4 pl-6">Candidate</th>
                                                    <th className="p-4">Source</th>
                                                    <th className="p-4">Power</th>
                                                    <th className="p-4">Type</th>
                                                    <th className="p-4 text-right pr-6">Status</th>
                                                </tr>
                                                </thead>
                                                <tbody className="text-xs">
                                                {historyRecords.length === 0 && (
                                                    <tr><td colSpan="5" className="p-20 text-center text-gray-600 italic">No records for this season.</td></tr>
                                                )}
                                                {historyRecords.map(r => {
                                                    const isConfirmed = r.status === 'Confirmed';
                                                    const isDeclined = r.status === 'Declined';
                                                    return (
                                                        <tr key={r.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${isConfirmed ? 'bg-green-900/5 opacity-80' : isDeclined ? 'bg-red-900/5 opacity-60' : ''}`}>
                                                            <td className="p-4 pl-6 flex items-center gap-4">
                                                                <div className="relative">
                                                                    <img src={r.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-10 h-10 rounded-full border border-gray-700 shadow-inner" />
                                                                    {r.furnaceImage && <img src={r.furnaceImage} alt="f" className="w-4 h-4 absolute -bottom-1 -right-1 drop-shadow-md" />}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-gray-200">{r.nickname}</div>
                                                                    <div className="text-[10px] text-gray-500 font-mono tracking-tighter">{r.fid}</div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-gray-400 font-bold">{r.sourceState}</td>
                                                            <td className="p-4 text-yellow-600 font-mono text-[11px] font-bold">{r.power.toLocaleString()}</td>
                                                            <td className="p-4">
                                                                {r.inviteType !== 'None' ? (
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border ${r.inviteType === 'Normal' ? 'bg-blue-900/20 border-blue-800 text-blue-400' : 'bg-purple-900/20 border-purple-800 text-purple-400'}`}>
                                                                            {r.inviteType}
                                                                        </span>
                                                                ) : <span className="text-gray-700 text-[10px] font-black">-</span>}
                                                            </td>
                                                            <td className="p-4 text-right font-black pr-6 text-[10px] uppercase">
                                                                {isConfirmed && <span className="text-green-500 flex justify-end items-center gap-1.5"><Shield size={12}/> Confirmed</span>}
                                                                {isDeclined && <span className="text-red-500">Declined</span>}
                                                                {r.status === 'Pending' && <span className="text-gray-600">Abandoned</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 📱 MOBILE CARDS */}
                                        <div className="flex xl:hidden flex-col gap-3 p-4">
                                            {historyRecords.length === 0 && (
                                                <div className="p-10 text-center text-gray-600 font-black uppercase tracking-widest">No records for this season.</div>
                                            )}
                                            {historyRecords.map(r => {
                                                const isConfirmed = r.status === 'Confirmed';
                                                const isDeclined = r.status === 'Declined';
                                                const isNormal = r.inviteType === 'Normal';
                                                const isSpecial = r.inviteType === 'Special';

                                                return (
                                                    <div
                                                        key={r.id}
                                                        className={`border rounded-xl p-4 flex items-center justify-between transition-all ${
                                                            isNormal ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' :
                                                                isSpecial ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' :
                                                                    isConfirmed ? 'border-green-800/50 shadow-md' :
                                                                        isDeclined ? 'border-red-800/50 shadow-md' : 'border-gray-800 shadow-md'
                                                        } ${
                                                            isConfirmed ? 'bg-green-900/10' :
                                                                isDeclined ? 'bg-red-900/10 opacity-60' : 'bg-gray-900'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="relative shrink-0">
                                                                <img src={r.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-12 h-12 rounded-full border border-gray-700 shadow-md" />
                                                                {r.furnaceImage && <img src={r.furnaceImage} alt="f" className="w-5 h-5 absolute -bottom-1 -right-1 drop-shadow-xl" />}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-100">{r.nickname}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono tracking-tighter">{r.sourceState}</div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-1.5">
                                                            <div className="text-yellow-500 font-mono text-[11px] font-bold">
                                                                {r.power >= 1000000 ? (r.power / 1000000).toFixed(1) + 'M' : r.power.toLocaleString()}
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                {/* Glowing Dots */}
                                                                {isNormal && <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>}
                                                                {isSpecial && <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>}

                                                                {/* Read-Only Status Text/Icons */}
                                                                {isConfirmed && <Shield size={14} className="text-green-500 ml-1" />}
                                                                {isDeclined && <span className="text-[9px] uppercase font-black tracking-widest text-red-500 ml-1">Rejected</span>}
                                                                {r.status === 'Pending' && <span className="text-[9px] uppercase font-black tracking-widest text-gray-600 ml-1">Abandoned</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-4 py-20">
                                    <Archive size={48} className="opacity-10" />
                                    <p className="text-xs font-black uppercase tracking-widest">Select a season archive</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </AdminLayout>
        );
    }

    // ==========================================
    // RENDER: NO ACTIVE SEASON
    // ==========================================
    if (!season) {
        return (
            <AdminLayout title="Transfer Manager">
                <div className="p-4 md:p-6 flex flex-col h-full bg-gray-950 overflow-hidden">

                    {/* CUSTOM RESPONSIVE HEADER */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 shrink-0">
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                                <Archive className="text-blue-500" /> Transfer Manager
                            </h2>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                                Planning & Setup
                            </p>
                        </div>
                        {transferActions}
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 border border-gray-800 rounded-3xl text-gray-300 p-10">
                        <Archive className="w-16 h-16 text-gray-700 mb-6 opacity-50" />
                        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">No Active Season</h2>
                        <p className="mb-8 text-gray-500 text-sm font-bold uppercase tracking-widest text-center max-w-sm">Draft a new window to begin onboarding candidates or check history archives.</p>

                        <div className="flex flex-wrap justify-center gap-4">
                            {isAdmin && (
                                <button onClick={() => setShowCreateModal(true)} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl transition-all hover:scale-105">
                                    Open New Season
                                </button>
                            )}
                            <button onClick={handleViewHistory} className="px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl font-black uppercase tracking-widest shadow-xl transition-all">
                                View History
                            </button>
                        </div>

                        {showCreateModal && (
                            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                                <div className="bg-gray-800 p-8 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl text-left">
                                    <h3 className="text-xl font-black text-white mb-6 uppercase tracking-tighter">Draft Season</h3>
                                    <div className="space-y-4 mb-8">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Season Name</label>
                                            <input type="text" placeholder="e.g. March 2026 Window" className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                                                   value={newSeason.name} onChange={e => setNewSeason({...newSeason, name: e.target.value})} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Power Cap</label>
                                                <input type="number" className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono"
                                                       value={newSeason.powerCap} onChange={e => setNewSeason({...newSeason, powerCap: parseInt(e.target.value)})} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">Specials Available</label>
                                                <input type="number" className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none font-mono"
                                                       value={newSeason.specials} onChange={e => setNewSeason({...newSeason, specials: parseInt(e.target.value)})} />
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-3 p-4 bg-gray-900 rounded-xl border border-gray-700 cursor-pointer group hover:border-blue-500 transition-all">
                                            <input type="checkbox" className="w-5 h-5 rounded border-gray-700 bg-gray-800" checked={newSeason.leading} onChange={e => setNewSeason({...newSeason, leading: e.target.checked})} />
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-widest text-white">Leading State Status</p>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Enforces strict 20-invite limit</p>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setShowCreateModal(false)} className="px-5 py-2.5 text-gray-400 hover:text-white font-black uppercase tracking-widest text-xs">Cancel</button>
                                        <button onClick={handleCreateSeason} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all">Confirm</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </AdminLayout>
        );
    }

    // ==========================================
    // RENDER: ACTIVE DASHBOARD
    // ==========================================
    return (
        <AdminLayout title="Transfer Manager">
            <div className="p-4 md:p-6 flex flex-col h-full bg-gray-950 overflow-hidden">

                {/* CUSTOM RESPONSIVE HEADER */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 shrink-0">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                            <Activity className="text-blue-500" /> Window: {season.name}
                        </h2>
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                            Active Ledger
                        </p>
                    </div>
                    {transferActions}
                </div>

                {/* Status Bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 mb-6 px-4 py-4 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl shrink-0">
                    <div className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border self-start ${
                        season.status === 'Planning' ? 'bg-yellow-900/20 text-yellow-500 border-yellow-700/50' : 'bg-green-900/20 text-green-500 border-green-700/50'
                    }`}>
                        {season.status} Mode
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-8 w-full md:w-auto text-[11px] font-black uppercase tracking-widest sm:divide-x divide-gray-800">
                        <div className="flex justify-between sm:justify-start gap-3 items-center">
                            <span className="text-gray-500">Power Limit:</span>
                            <span className="text-yellow-500 font-mono tracking-tighter">{season.powerCap.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between sm:justify-start gap-3 items-center sm:pl-8">
                            <span className="text-gray-500">Normal Slots:</span>
                            <span className={`${stats.normalUsed >= stats.normalMax ? 'text-red-500' : 'text-blue-400'} font-mono`}>{stats.normalUsed} / {stats.normalMax}</span>
                        </div>
                        <div className="flex justify-between sm:justify-start gap-3 items-center sm:pl-8">
                            <span className="text-gray-500">Special Invites:</span>
                            <span className={`${stats.specialUsed >= stats.specialMax ? 'text-red-500' : 'text-purple-400'} font-mono`}>{stats.specialUsed} / {stats.specialMax}</span>
                        </div>
                    </div>
                </div>

                {/* Ledger Table */}
                <div className="hidden xl:flex flex-1 bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-gray-950 sticky top-0 border-b border-gray-800 text-gray-500 text-[10px] font-black uppercase tracking-widest z-10">
                                <th className="p-4 pl-6">Candidate</th>
                                <th className="p-4">Source</th>
                                <th className="p-4">Destination</th>
                                <th className="p-4">Power Record</th>
                                <th className="p-4 text-center">Invite Type</th>
                                <th className="p-4 text-right pr-6">Management</th>
                            </tr>
                            </thead>
                            <tbody className="text-xs">
                            {records.length === 0 && (
                                <tr><td colSpan="6" className="p-20 text-center text-gray-600 font-black uppercase tracking-widest">No candidates drafted</td></tr>
                            )}
                            {records.map(r => {
                                const isConfirmed = r.status === 'Confirmed';
                                const isDeclined = r.status === 'Declined';
                                const isOverPower = r.power > season.powerCap && !isConfirmed && !isDeclined;

                                return (
                                    <tr key={r.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${isConfirmed ? 'bg-green-900/5 opacity-80' : isDeclined ? 'bg-red-900/5 opacity-60' : ''}`}>
                                        <td className="p-4 pl-6 flex items-center gap-4">
                                            <div className="relative shrink-0">
                                                <img src={r.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-10 h-10 rounded-full border border-gray-700 shadow-md" />
                                                {r.furnaceImage && <img src={r.furnaceImage} alt="f" className="w-4 h-4 absolute -bottom-1 -right-1 drop-shadow-xl" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-gray-100 truncate w-32">{r.nickname}</div>
                                                <div className="text-[10px] text-gray-500 font-mono tracking-tighter">{r.fid}</div>
                                            </div>
                                            {r.direction === 'Outbound' && <span className="px-2 py-0.5 bg-red-900/40 text-red-400 text-[9px] rounded-lg uppercase font-black border border-red-800/50 tracking-widest">Exiting</span>}
                                        </td>

                                        <td className="p-4 text-gray-400 font-bold uppercase tracking-widest text-[10px]">{r.sourceState}</td>

                                        <td className="p-4">
                                            <select
                                                disabled={!isAdmin || isConfirmed || isDeclined || r.direction === 'Outbound'}
                                                value={r.targetAllianceId || ''}
                                                onChange={(e) => handleUpdateRecord(r.id, 'targetAllianceId', e.target.value)}
                                                className="bg-gray-950 border border-gray-800 rounded-xl p-2 text-[10px] font-black tracking-widest text-gray-400 outline-none w-36 disabled:opacity-30 focus:border-blue-500/50 transition-all shadow-inner"
                                            >
                                                <option value="">Pending...</option>
                                                {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </td>

                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    disabled={!isAdmin || isConfirmed || isDeclined}
                                                    defaultValue={r.power}
                                                    onBlur={(e) => handleUpdateRecord(r.id, 'power', e.target.value)}
                                                    className={`bg-gray-950 border rounded-xl p-2 text-[11px] font-mono w-32 outline-none disabled:opacity-30 transition-all shadow-inner ${
                                                        isOverPower ? 'border-red-500 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'border-gray-800 text-yellow-500'
                                                    }`}
                                                />
                                                {isOverPower && <AlertTriangle size={14} className="text-red-500 animate-pulse" />}
                                            </div>
                                        </td>

                                        <td className="p-4">
                                            <div className="flex justify-center gap-1.5">
                                                {['Normal', 'Special'].map((type) => (
                                                    <button
                                                        key={type}
                                                        disabled={!isAdmin || isConfirmed || isDeclined || r.direction === 'Outbound'}
                                                        onClick={() => handleToggleInvite(r.id, r.inviteType, type)}
                                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-20 ${
                                                            r.inviteType === type
                                                                ? (type === 'Normal' ? 'bg-blue-600 text-white shadow-lg' : 'bg-purple-600 text-white shadow-lg')
                                                                : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        {type.substring(0, 4)}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>

                                        <td className="p-4 text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                {r.status === 'Pending' && isAdmin && r.direction === 'Inbound' ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleConfirmInbound(r)}
                                                            disabled={season.status !== 'Active'}
                                                            className={`p-2 rounded-xl border transition-all ${
                                                                season.status === 'Active'
                                                                    ? 'bg-green-900/20 text-green-400 hover:bg-green-600 hover:text-white border-green-800/50 shadow-md'
                                                                    : 'bg-gray-800 text-gray-700 border-gray-700 cursor-not-allowed opacity-30'
                                                            }`}
                                                            title="Accept & Add to Roster"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateRecord(r.id, 'status', 'Declined')}
                                                            className="p-2 bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl border border-red-800/50 transition-all shadow-md"
                                                            title="Reject"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        {isConfirmed && <span className="text-green-500 text-[10px] font-black uppercase flex items-center gap-2"><Shield size={14}/> Onboarded</span>}
                                                        {isDeclined && <span className="text-red-500 text-[10px] font-black uppercase">Rejected</span>}
                                                    </div>
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

                {/* 📱 MOBILE CARDS */}
                <div className="flex xl:hidden flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pb-6">
                    {records.length === 0 && (
                        <div className="p-10 text-center text-gray-600 font-black uppercase tracking-widest">No candidates drafted</div>
                    )}
                    {records.map(r => {
                        const isConfirmed = r.status === 'Confirmed';
                        const isDeclined = r.status === 'Declined';
                        const isNormal = r.inviteType === 'Normal';
                        const isSpecial = r.inviteType === 'Special';

                        return (
                            <div
                                key={r.id}
                                onClick={() => setSelectedMobileRecordId(r.id)}
                                className={`border rounded-xl p-4 flex items-center justify-between transition-all cursor-pointer active:scale-[0.98] ${
                                    isNormal ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' :
                                        isSpecial ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' :
                                            isConfirmed ? 'border-green-800/50 shadow-md' :
                                                isDeclined ? 'border-red-800/50 shadow-md' : 'border-gray-800 shadow-md'
                                } ${
                                    isConfirmed ? 'bg-green-900/10' :
                                        isDeclined ? 'bg-red-900/10 opacity-60' : 'bg-gray-900'
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative shrink-0">
                                        <img src={r.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-12 h-12 rounded-full border border-gray-700 shadow-md" />
                                        {r.furnaceImage && <img src={r.furnaceImage} alt="f" className="w-5 h-5 absolute -bottom-1 -right-1 drop-shadow-xl" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-100">{r.nickname}</div>
                                        <div className="text-[10px] text-gray-500 font-mono tracking-tighter">{r.sourceState}</div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1.5">
                                    <div className="text-yellow-500 font-mono text-[11px] font-bold">
                                        {r.power >= 1000000 ? (r.power / 1000000).toFixed(1) + 'M' : r.power.toLocaleString()}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {/* Glowing Dots */}
                                        {isNormal && <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>}
                                        {isSpecial && <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>}

                                        {/* Status Icons */}
                                        {isConfirmed && <Check size={16} className="text-green-500 ml-1" />}
                                        {isDeclined && <X size={16} className="text-red-500 ml-1" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bulk Add Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                        <div className="bg-gray-800 p-8 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Draft Candidates</h3>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Poll Game API via FID List</p>
                                </div>
                                <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            <textarea
                                className="w-full h-40 p-4 bg-gray-900 border border-gray-700 rounded-2xl text-gray-300 font-mono text-sm outline-none mb-6 shadow-inner focus:border-blue-500 transition-all"
                                placeholder="87654321, 12345678, ..."
                                value={bulkFids}
                                onChange={(e) => setBulkFids(e.target.value)}
                            />
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowAddModal(false)} className="px-6 py-2.5 text-gray-400 hover:text-white font-black text-xs uppercase tracking-widest">Cancel</button>
                                <button onClick={handleBulkAdd} className="px-8 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl flex items-center gap-2 transition-all hover:scale-105">
                                    <Send size={16} /> Sync API
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4B5563; }
            `}</style>
            {showMfaModal && <MfaSetupModal onClose={() => setShowMfaModal(false)} isForced={sessionStorage.getItem('mfa_enabled') === 'false'} />}

            {/* MODAL: MOBILE PLAYER DETAILS */}
            {activeMobileRecord && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
                    <div className="bg-gray-900 p-6 rounded-3xl w-full max-w-sm border border-gray-700 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setSelectedMobileRecordId(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white p-2">
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-800">
                            <img src={activeMobileRecord.avatar || 'https://via.placeholder.com/40'} alt="av" className="w-16 h-16 rounded-full border-2 border-gray-700 shadow-md" />
                            <div>
                                <h3 className="font-black text-white text-lg">{activeMobileRecord.nickname}</h3>
                                <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">FID: {activeMobileRecord.fid}</p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Destination Alliance</label>
                                <select
                                    disabled={!isAdmin || activeMobileRecord.status === 'Confirmed' || activeMobileRecord.status === 'Declined'}
                                    value={activeMobileRecord.targetAllianceId || ''}
                                    onChange={(e) => handleUpdateRecord(activeMobileRecord.id, 'targetAllianceId', e.target.value)}
                                    className="w-full bg-black border border-gray-800 rounded-xl p-3 text-xs font-bold text-gray-300 outline-none focus:border-blue-500"
                                >
                                    <option value="">Pending...</option>
                                    {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Update Power</label>
                                <input
                                    type="number"
                                    disabled={!isAdmin || activeMobileRecord.status === 'Confirmed' || activeMobileRecord.status === 'Declined'}
                                    defaultValue={activeMobileRecord.power}
                                    onBlur={(e) => handleUpdateRecord(activeMobileRecord.id, 'power', e.target.value)}
                                    className="w-full bg-black border border-gray-800 rounded-xl p-3 text-xs font-mono text-yellow-500 outline-none focus:border-yellow-500"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">Invite Type</label>
                                <div className="flex gap-2">
                                    {['Normal', 'Special'].map((type) => (
                                        <button
                                            key={type}
                                            disabled={!isAdmin || activeMobileRecord.status === 'Confirmed' || activeMobileRecord.status === 'Declined'}
                                            onClick={() => handleToggleInvite(activeMobileRecord.id, activeMobileRecord.inviteType, type)}
                                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                activeMobileRecord.inviteType === type
                                                    ? (type === 'Normal' ? 'bg-blue-600 text-white shadow-lg' : 'bg-purple-600 text-white shadow-lg')
                                                    : 'bg-gray-800 text-gray-500 border border-gray-700'
                                            }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activeMobileRecord.status === 'Pending' && isAdmin && activeMobileRecord.direction === 'Inbound' && (
                                <div className="pt-4 border-t border-gray-800 flex gap-3">
                                    <button
                                        onClick={() => { void handleConfirmInbound(activeMobileRecord); setSelectedMobileRecordId(null); }}
                                        disabled={season.status !== 'Active'}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all disabled:opacity-30 disabled:bg-gray-800 disabled:text-gray-500"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => { void handleUpdateRecord(activeMobileRecord.id, 'status', 'Declined'); setSelectedMobileRecordId(null); }}
                                        className="flex-1 py-3 bg-red-900/40 hover:bg-red-600 text-red-500 hover:text-white border border-red-800/50 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all"
                                    >
                                        Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
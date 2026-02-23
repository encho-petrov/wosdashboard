import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import {
    Plus, Archive, Check, X,
    AlertTriangle, Send, Shield, ArrowLeft, Play, History
} from 'lucide-react';

export default function TransferManager() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    // --- STATE: Active Season ---
    const [season, setSeason] = useState(null);
    const [records, setRecords] = useState([]);
    const [alliances, setAlliances] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- STATE: History View ---
    const [viewingHistory, setViewingHistory] = useState(false);
    const [historySeasons, setHistorySeasons] = useState([]);
    const [historyRecords, setHistoryRecords] = useState([]);
    const [selectedPastSeason, setSelectedPastSeason] = useState(null);

    // --- STATE: Modals & Forms ---
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [bulkFids, setBulkFids] = useState('');
    const [newSeason, setNewSeason] = useState({ name: '', powerCap: 200000000, leading: false, specials: 3 });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [transRes, allyRes] = await Promise.all([
                client.get('/moderator/transfers/active'),
                // FIX: Pointing to general alliances instead of war room stats
                client.get('/moderator/admin/alliances')
            ]);
            setSeason(transRes.data.season);
            setRecords(transRes.data.records || []);
            setAlliances(allyRes.data || []);
        } catch (err) {
            toast.error("Failed to load transfer data.");
        } finally {
            setLoading(false);
        }
    };

    // --- HISTORY HANDLERS ---
    const handleViewHistory = async () => {
        setViewingHistory(true);
        setLoading(true);
        try {
            const res = await client.get('/moderator/transfers/history');
            setHistorySeasons(res.data || []);
            if (res.data && res.data.length > 0) {
                await handleSelectPastSeason(res.data[0]);
            }
        } catch (err) {
            toast.error("Failed to load history.");
        } finally {
            setLoading(false);
        }
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
            fetchData();
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
                // Optionally jump straight to history view
                // handleViewHistory();
            } else {
                fetchData();
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
            fetchData();
        } catch (err) { toast.error("Failed to add candidates"); }
    };

    const handleUpdateRecord = async (id, field, value) => {
        if (!isAdmin) return;
        const record = records.find(r => r.id === id);
        if (!record) return;

        const updatedRecords = records.map(r => r.id === id ? { ...r, [field]: value } : r);
        setRecords(updatedRecords);

        try {
            await client.put(`/moderator/transfers/${id}`, {
                power: field === 'power' ? parseInt(value) : record.power,
                targetAllianceId: field === 'targetAllianceId' ? (value ? parseInt(value) : null) : record.targetAllianceId,
                inviteType: field === 'inviteType' ? value : record.inviteType,
                status: field === 'status' ? value : record.status
            });
            if (field === 'status') await fetchData();
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
        handleUpdateRecord(id, 'inviteType', requestedType);
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
            fetchData();
        } catch (err) { toast.error("Failed to confirm player"); }
    };

    if (loading) return <div className="p-10 text-white">Loading Transfer Manager...</div>;

    // ==========================================
    // RENDER: HISTORY VIEW
    // ==========================================
    if (viewingHistory) {
        return (
            <div className="min-h-screen bg-gray-900 text-gray-200 p-6 font-sans flex gap-6">
                {/* Sidebar */}
                <div className="w-1/4 bg-gray-800 p-4 rounded-lg border border-gray-700 h-fit">
                    <button onClick={() => setViewingHistory(false)} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={16} /> Back to Active Season
                    </button>

                    <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2 flex items-center gap-2">
                        <History className="text-blue-500" /> Season History
                    </h2>

                    {historySeasons.length === 0 && <p className="text-gray-500 text-sm">No closed seasons found.</p>}

                    <div className="space-y-2">
                        {historySeasons.map(s => (
                            <button
                                key={s.id}
                                onClick={() => handleSelectPastSeason(s)}
                                className={`w-full text-left p-3 rounded border transition-colors ${selectedPastSeason?.id === s.id ? 'bg-blue-900/40 border-blue-500 text-blue-100' : 'bg-gray-900 border-gray-700 hover:bg-gray-700'}`}
                            >
                                <div className="font-bold">{s.name}</div>
                                <div className="text-xs text-gray-400">Cap: {s.powerCap.toLocaleString()}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content (Read-Only Ledger) */}
                <div className="w-3/4 bg-gray-800 rounded-lg border border-gray-700 shadow-xl overflow-hidden">
                    {selectedPastSeason ? (
                        <>
                            <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{selectedPastSeason.name} - Final Ledger</h3>
                                    <p className="text-xs text-gray-400">Closed on {new Date(selectedPastSeason.closedAt).toLocaleDateString()}</p>
                                </div>
                                <span className="px-3 py-1 bg-gray-800 text-gray-400 border border-gray-700 text-xs font-bold uppercase rounded-full">Archived</span>
                            </div>

                            <table className="w-full text-left border-collapse">
                                <thead>
                                <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="p-3 pl-4">Candidate</th>
                                    <th className="p-3">Source State</th>
                                    <th className="p-3">Power</th>
                                    <th className="p-3">Invite Sent</th>
                                    <th className="p-3 text-right pr-4">Final Status</th>
                                </tr>
                                </thead>
                                <tbody className="text-sm">
                                {historyRecords.length === 0 && (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No records found for this season.</td></tr>
                                )}
                                {historyRecords.map(r => {
                                    const isConfirmed = r.status === 'Confirmed';
                                    const isDeclined = r.status === 'Declined';

                                    let rowClass = "border-b border-gray-700/50 hover:bg-gray-700/20 ";
                                    if (isConfirmed) rowClass += "bg-green-900/10 opacity-70";
                                    if (isDeclined) rowClass += "bg-red-900/10 opacity-50 grayscale";

                                    return (
                                        <tr key={r.id} className={rowClass}>
                                            <td className="p-3 pl-4 flex items-center gap-3">
                                                <div className="relative">
                                                    <img src={r.avatar || 'https://via.placeholder.com/40'} alt="avatar" className="w-10 h-10 rounded-full border border-gray-600" />
                                                    {r.furnaceImage && <img src={r.furnaceImage} alt="furnace" className="w-4 h-4 absolute -bottom-1 -right-1" />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-100">{r.nickname}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{r.fid}</div>
                                                </div>
                                                {r.direction === 'Outbound' && <span className="ml-2 px-2 py-0.5 bg-red-900/30 text-red-400 text-[10px] rounded uppercase font-bold border border-red-800/50">Left State</span>}
                                            </td>
                                            <td className="p-3 text-gray-400">{r.sourceState}</td>
                                            <td className="p-3 text-yellow-500 font-mono text-xs">{r.power.toLocaleString()}</td>
                                            <td className="p-3">
                                                {r.inviteType !== 'None' ? (
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                        r.inviteType === 'Normal' ? 'bg-blue-600/30 text-blue-400 border border-blue-800' : 'bg-purple-600/30 text-purple-400 border border-purple-800'
                                                    }`}>{r.inviteType}</span>
                                                ) : <span className="text-gray-600 text-xs">-</span>}
                                            </td>
                                            <td className="p-3 text-right font-bold pr-4">
                                                {isConfirmed && <span className="text-green-500 flex justify-end items-center gap-1"><Shield size={14}/> Transferred</span>}
                                                {isDeclined && <span className="text-red-500">Declined</span>}
                                                {r.status === 'Pending' && <span className="text-gray-500">Abandoned</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">Select a season from the sidebar to view its ledger.</div>
                    )}
                </div>
            </div>
        );
    }

    // ==========================================
    // RENDER: NO ACTIVE SEASON
    // ==========================================
    if (!season) {
        return (
            <div className="p-10 flex flex-col items-center justify-center h-screen bg-gray-900 text-gray-300 relative">
                <Link to="/" className="absolute top-6 left-6 p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 transition-colors shadow">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <Archive className="w-16 h-16 text-gray-600 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">No Active Transfer Season</h2>
                <p className="mb-6">Start a new season to begin planning transfers, or review history.</p>

                <div className="flex gap-4">
                    {isAdmin && (
                        <button onClick={() => setShowCreateModal(true)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg">
                            Open New Season
                        </button>
                    )}
                    <button onClick={handleViewHistory} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white rounded font-bold shadow-lg flex items-center gap-2">
                        <History size={18} /> View History
                    </button>
                </div>

                {/* Create Season Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                        <div className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-700">
                            <h3 className="text-lg font-bold text-white mb-4">New Transfer Season</h3>
                            <input type="text" placeholder="Season Name (e.g. March 2026)" className="w-full mb-3 p-2 bg-gray-900 border border-gray-700 rounded text-white"
                                   value={newSeason.name} onChange={e => setNewSeason({...newSeason, name: e.target.value})} />
                            <input type="number" placeholder="Power Cap" className="w-full mb-3 p-2 bg-gray-900 border border-gray-700 rounded text-white"
                                   value={newSeason.powerCap} onChange={e => setNewSeason({...newSeason, powerCap: parseInt(e.target.value)})} />
                            <input type="number" placeholder="Special Invites Available" className="w-full mb-3 p-2 bg-gray-900 border border-gray-700 rounded text-white"
                                   value={newSeason.specials} onChange={e => setNewSeason({...newSeason, specials: parseInt(e.target.value)})} />
                            <label className="flex items-center text-gray-300 mb-6 cursor-pointer">
                                <input type="checkbox" className="mr-2" checked={newSeason.leading} onChange={e => setNewSeason({...newSeason, leading: e.target.checked})} />
                                Is Leading State? (Limits to 20 Normal Invites)
                            </label>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                                <button onClick={handleCreateSeason} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">Create</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ==========================================
    // RENDER: ACTIVE DASHBOARD
    // ==========================================
    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-6 font-sans">
            <div className="flex justify-between items-end mb-6 border-b border-gray-700 pb-4">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 transition-colors shadow">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-2xl font-black text-white flex items-center gap-3">
                            <Send className="text-blue-500" /> Transfer Manager: {season.name}
                        </h1>

                        <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full border ${
                            season.status === 'Planning' ? 'bg-yellow-900/30 text-yellow-500 border-yellow-700/50' :
                                'bg-green-900/30 text-green-500 border-green-700/50'
                        }`}>
                            {season.status} Phase
                        </span>
                    </div>

                    <div className="flex gap-6 mt-2 ml-14 text-sm font-bold">
                        <span className="text-gray-400">Power Cap: <span className="text-yellow-500">{season.powerCap.toLocaleString()}</span></span>
                        <span className={`${stats.normalUsed >= stats.normalMax ? 'text-red-500' : 'text-blue-400'}`}>
                            Normal Invites: {stats.normalUsed} / {stats.normalMax}
                        </span>
                        <span className={`${stats.specialUsed >= stats.specialMax ? 'text-red-500' : 'text-purple-400'}`}>
                            Special Invites: {stats.specialUsed} / {stats.specialMax}
                        </span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleViewHistory} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white rounded font-bold shadow transition-colors">
                        <History size={16} /> History
                    </button>

                    {isAdmin && (
                        <>
                            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white rounded font-bold shadow transition-colors">
                                <Plus size={16} /> Add Candidates
                            </button>

                            {season.status === 'Planning' && (
                                <button onClick={() => handleUpdateSeasonStatus('Active')} className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-800/50 hover:bg-blue-600/40 rounded font-bold shadow transition-colors">
                                    <Play size={16} /> Open Window
                                </button>
                            )}

                            {(season.status === 'Planning' || season.status === 'Active') && (
                                <button onClick={() => handleUpdateSeasonStatus('Closed')} className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-800/50 hover:bg-red-600/40 rounded font-bold shadow transition-colors">
                                    <Archive size={16} /> Close Season
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-3 pl-4">Candidate</th>
                        <th className="p-3">Source State</th>
                        <th className="p-3">Target Alliance</th>
                        <th className="p-3">Power</th>
                        <th className="p-3 text-center">Invite Sent</th>
                        <th className="p-3 text-right pr-4">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="text-sm">
                    {records.length === 0 && (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-500">No candidates added yet.</td></tr>
                    )}
                    {records.map(r => {
                        const isConfirmed = r.status === 'Confirmed';
                        const isDeclined = r.status === 'Declined';
                        const isOverPower = r.power > season.powerCap && !isConfirmed && !isDeclined;

                        let rowClass = "border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors ";
                        if (isConfirmed) rowClass += "bg-green-900/10 opacity-70";
                        if (isDeclined) rowClass += "bg-red-900/10 opacity-50 grayscale";

                        return (
                            <tr key={r.id} className={rowClass}>
                                <td className="p-3 pl-4 flex items-center gap-3">
                                    <div className="relative">
                                        <img src={r.avatar || 'https://via.placeholder.com/40'} alt="avatar" className="w-10 h-10 rounded-full border border-gray-600" />
                                        {r.furnaceImage && <img src={r.furnaceImage} alt="furnace" className="w-4 h-4 absolute -bottom-1 -right-1" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-100">{r.nickname}</div>
                                        <div className="text-xs text-gray-500 font-mono">{r.fid}</div>
                                    </div>
                                    {r.direction === 'Outbound' && <span className="ml-2 px-2 py-0.5 bg-red-900/30 text-red-400 text-[10px] rounded uppercase font-bold border border-red-800/50">Leaving</span>}
                                </td>

                                <td className="p-3 text-gray-400">{r.sourceState}</td>

                                <td className="p-3">
                                    <select
                                        disabled={!isAdmin || isConfirmed || isDeclined || r.direction === 'Outbound'}
                                        value={r.targetAllianceId || ''}
                                        onChange={(e) => handleUpdateRecord(r.id, 'targetAllianceId', e.target.value)}
                                        className="bg-gray-900 border border-gray-600 rounded p-1.5 text-xs text-gray-300 outline-none w-32 disabled:opacity-50"
                                    >
                                        <option value="">-- Select --</option>
                                        {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </td>

                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            disabled={!isAdmin || isConfirmed || isDeclined}
                                            defaultValue={r.power}
                                            onBlur={(e) => handleUpdateRecord(r.id, 'power', e.target.value)}
                                            className={`bg-gray-900 border rounded p-1.5 text-xs font-mono w-28 outline-none disabled:opacity-50 ${
                                                isOverPower ? 'border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'border-gray-600 text-yellow-500'
                                            }`}
                                        />
                                        {isOverPower && <AlertTriangle size={14} className="text-red-500" title="Exceeds Power Cap!" />}
                                    </div>
                                </td>

                                <td className="p-3 text-center">
                                    <div className="flex justify-center gap-1">
                                        <button
                                            disabled={!isAdmin || isConfirmed || isDeclined || r.direction === 'Outbound'}
                                            onClick={() => handleToggleInvite(r.id, r.inviteType, 'Normal')}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed ${
                                                r.inviteType === 'Normal' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700'
                                            }`}
                                        >Norm</button>
                                        <button
                                            disabled={!isAdmin || isConfirmed || isDeclined || r.direction === 'Outbound'}
                                            onClick={() => handleToggleInvite(r.id, r.inviteType, 'Special')}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed ${
                                                r.inviteType === 'Special' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700'
                                            }`}
                                        >Spec</button>
                                    </div>
                                </td>

                                <td className="p-3 text-right flex justify-end gap-2 items-center h-full mt-2">
                                    {r.status === 'Pending' && isAdmin && r.direction === 'Inbound' && (
                                        <>
                                            <button
                                                onClick={() => handleConfirmInbound(r)}
                                                disabled={season.status !== 'Active'}
                                                className={`p-1.5 rounded border transition-colors ${
                                                    season.status === 'Active'
                                                        ? 'bg-green-900/40 text-green-400 hover:bg-green-600 hover:text-white border-green-800/50'
                                                        : 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                                                }`}
                                                title={season.status === 'Active' ? "Confirm Transfer & Add to Roster" : "Cannot confirm during Planning Phase"}
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => handleUpdateRecord(r.id, 'status', 'Declined')} className="p-1.5 bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white rounded border border-red-800/50 transition-colors" title="Decline Candidate">
                                                <X size={16} />
                                            </button>
                                        </>
                                    )}
                                    {isConfirmed && <span className="text-green-500 text-xs font-bold uppercase flex items-center gap-1"><Shield size={12}/> Locked</span>}
                                    {isDeclined && <span className="text-red-500 text-xs font-bold uppercase">Declined</span>}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {/* Bulk Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg w-[500px] border border-gray-700">
                        <h3 className="text-lg font-bold text-white mb-2">Bulk Add Candidates</h3>
                        <p className="text-xs text-gray-400 mb-4">Paste a comma-separated list of FIDs. The system will poll the game API for their names and states.</p>
                        <textarea
                            className="w-full h-32 p-3 bg-gray-900 border border-gray-700 rounded text-gray-300 font-mono text-sm outline-none mb-4"
                            placeholder="e.g. 12345678, 87654321, 11223344"
                            value={bulkFids}
                            onChange={(e) => setBulkFids(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                            <button onClick={handleBulkAdd} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold flex items-center gap-2">
                                <Send size={16} /> Start Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
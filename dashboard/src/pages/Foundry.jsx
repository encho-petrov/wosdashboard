import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
    Shield, Lock, Unlock, RotateCcw, X, Search, Megaphone,
    ChevronRight, History as HistoryIcon, Clock, CalendarDays, ChevronDown, Zap, Sword
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function AllianceWarRoom() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const { roster, globalLoading } = useApp();

    const [viewMode, setViewMode] = useState('live');
    const [eventType, setEventType] = useState('Foundry');
    const [loading, setLoading] = useState(true);

    const [legionLocks, setLegionLocks] = useState([]);
    const [deployedPlayers, setDeployedPlayers] = useState([]);
    const [filterText, setFilterText] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [mobileTab, setMobileTab] = useState('bench');

    const [historyList, setHistoryList] = useState([]);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null);
    const [historySnapshot, setHistorySnapshot] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [isMobileTimelineOpen, setIsMobileTimelineOpen] = useState(false);

    useEffect(() => {
        if (viewMode !== 'live' || !user?.allianceId) return;
        const fetchState = async () => {
            try {
                setLoading(true);
                const res = await client.get(`/moderator/foundry/state?eventType=${eventType}`);
                setLegionLocks(res.data.legions || []);
                setDeployedPlayers(res.data.roster || []);
            } catch (err) {
                toast.error(`Failed to load live data`);
            } finally {
                setLoading(false);
            }
        };
        void fetchState();
    }, [eventType, user?.allianceId, viewMode]);

    useEffect(() => {
        if (viewMode !== 'history' || !user?.allianceId) return;
        const fetchHistoryList = async () => {
            try {
                setHistoryLoading(true);
                const res = await client.get(`/moderator/foundry/history?eventType=${eventType}`);
                setHistoryList(res.data || []);
                if (res.data?.length > 0) {
                    setSelectedHistoryId(res.data[0].id);
                } else {
                    setSelectedHistoryId(null);
                    setHistorySnapshot([]);
                }
            } catch (err) {
                toast.error("Failed to load history timeline");
            } finally {
                setHistoryLoading(false);
            }
        };
        void fetchHistoryList();
    }, [viewMode, eventType, user?.allianceId]);

    useEffect(() => {
        if (viewMode !== 'history' || !selectedHistoryId) return;
        const fetchSnapshot = async () => {
            try {
                const res = await client.get(`/moderator/foundry/history/${selectedHistoryId}`);
                setHistorySnapshot(res.data || []);
            } catch (err) {
                toast.error("Failed to load snapshot details");
            }
        };
        void fetchSnapshot();
    }, [selectedHistoryId, viewMode]);

    // --- COMPUTED DATA (Dynamically sorted by relevant power) ---
    const localBench = useMemo(() => {
        if (!roster) return [];
        return roster.filter(p => {
            const inMyAlliance = p.allianceId === user?.allianceId;
            const notDeployed = !deployedPlayers.find(dp => dp.fid === p.playerId || dp.fid === p.fid);
            const matchesText = (p.nickname || '').toLowerCase().includes(filterText.toLowerCase());
            return inMyAlliance && notDeployed && matchesText;
        }).sort((a, b) => {
            // Sort by the power metric relevant to the current event
            if (eventType === 'Foundry') {
                return (b.power || b.tundraPower || 0) - (a.power || a.tundraPower || 0);
            } else {
                return (b.normalPower || 0) - (a.normalPower || 0);
            }
        });
    }, [roster, deployedPlayers, user?.allianceId, filterText, eventType]);

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    const handleDeploy = async (fid, legionId, isSub) => {
        if (!isAdmin) return toast.warning("Read-only access.");
        if (legionId !== null) {
            const currentLegionCount = deployedPlayers.filter(p => p.legionId === legionId && p.isSub === isSub).length;
            const limit = isSub ? 10 : 30;
            if (currentLegionCount >= limit) {
                return toast.error(`Legion ${legionId} ${isSub ? 'Sub' : 'Active'} slots are full (${limit}/${limit})`);
            }
        }
        try {
            await client.post('/moderator/foundry/deploy', { eventType, playerId: parseInt(fid), legionId, isSub });
            if (legionId === null) {
                setDeployedPlayers(prev => prev.filter(p => p.fid !== parseInt(fid)));
            } else {
                setDeployedPlayers(prev => {
                    const filtered = prev.filter(p => p.fid !== parseInt(fid));
                    return [...filtered, { fid: parseInt(fid), legionId, isSub, attendance: 'Pending' }];
                });
            }
            setSelectedPlayer(null);
        } catch (err) { toast.error("Deployment failed"); }
    };

    const toggleLock = async (legionId, currentLock) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/foundry/lock', { eventType, legionId, isLocked: !currentLock });
            setLegionLocks(prev => {
                const filtered = prev.filter(l => l.legionId !== legionId);
                return [...filtered, { legionId, isLocked: !currentLock }];
            });
        } catch (err) { toast.error("Failed to update lock"); }
    };

    const handleAttendanceChange = async (fid, status) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/foundry/attendance', { eventType, playerId: parseInt(fid), attendance: status });
            setDeployedPlayers(prev => prev.map(p => p.fid === parseInt(fid) ? { ...p, attendance: status } : p));
        } catch (err) { toast.error("Failed to update attendance"); }
    };

    const handleReset = async () => {
        if (!isAdmin) return;
        if (!window.confirm(`Archive and reset the ${eventType} board?`)) return;
        const notes = window.prompt("Name this event for history (e.g., 'Vs Alliance XYZ'):");
        if (notes === null) return;

        try {
            await client.post('/moderator/foundry/reset', { eventType, notes });
            toast.success("Event archived!");
            setDeployedPlayers([]);
            setLegionLocks([]);
            setViewMode('history');
        } catch (err) { toast.error("Failed to reset event."); }
    };

    const handleAnnounceDiscord = async (e, legionId) => {
        if (e) e.preventDefault();
        try {
            await client.post(`/moderator/foundry/announce`, {
                eventName: eventType,
                message: `The roster for **Legion ${legionId}** in the upcoming **${eventType}** has been locked and finalized. Please check the portal for deployment details.`
            });
            toast.success(`Legion ${legionId} announced to Discord!`);
        } catch (err) {
            console.error("Discord Announce Error:", err.response || err);
            toast.error(err.response?.data?.error || 'Failed to announce to Discord.');
        }
    };

    const onDragStart = (e, fid) => {
        if (!isAdmin) return e.preventDefault();
        e.dataTransfer.setData("playerFid", fid);
    };

    const onDrop = (e, legionId, isSub) => {
        if (!isAdmin) return;
        const fid = e.dataTransfer.getData("playerFid");
        void handleDeploy(fid, legionId, isSub);
    };

    const handleMobileSelect = (p) => {
        if (!isAdmin) return;
        const pFid = p.fid || p.playerId;
        if (selectedPlayer?.fid === pFid) {
            setSelectedPlayer(null);
            return;
        }
        setSelectedPlayer({ ...p, fid: pFid });
        if (window.innerWidth < 1024) setMobileTab('alliances');
    };

    // --- SHARED COMPONENT: UNIFIED PLAYER CARD (Dynamically handles Power) ---
    const renderPlayerCard = (p, isBench = false, isLocked = false, isHistory = false) => {
        const pFid = p.fid || p.playerId;
        const isSelected = selectedPlayer?.fid === pFid;

        // Determine which power to show based on the active tab
        const displayPower = eventType === 'Foundry' ? (p.power || p.tundraPower || 0) : (p.normalPower || 0);

        return (
            <div
                key={pFid}
                draggable={isAdmin && !isLocked && !isHistory}
                onDragStart={(e) => onDragStart(e, pFid)}
                onClick={() => !isLocked && !isHistory && handleMobileSelect(p)}
                className={`flex items-center justify-between p-2 border rounded-xl transition-all select-none group ${
                    isAdmin && !isLocked && !isHistory ? 'cursor-pointer' : 'cursor-default'
                } ${
                    isSelected
                        ? 'bg-blue-600 border-blue-400 shadow-lg scale-[0.98]'
                        : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                }`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                        <img
                            src={p.avatar || '/default-avatar.png'}
                            className={`w-9 h-9 rounded-lg object-cover border ${isSelected ? 'border-blue-300' : 'border-gray-800'}`}
                            alt=""
                        />
                        {p.stoveImg && (
                            <img src={p.stoveImg} className="absolute -bottom-1 -right-1 w-4 h-4 drop-shadow-md object-contain" alt="" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[11px] font-black truncate leading-tight ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                            {p.nickname}
                        </p>
                        <p className={`text-[9px] font-mono font-bold uppercase flex items-center gap-1 ${
                            isSelected ? 'text-blue-200' : eventType === 'Foundry' ? 'text-yellow-500' : 'text-blue-400'
                        }`}>
                            {eventType === 'Foundry' ? <Sword size={10} /> : <Zap size={10} />}
                            {(displayPower / 1000000).toFixed(1)}M
                        </p>
                    </div>
                </div>

                {!isBench && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {isHistory ? (
                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded border ${
                                p.attendance === 'Attended' ? 'bg-green-900/30 text-green-400 border-green-800' :
                                    p.attendance === 'Missed' ? 'bg-red-900/30 text-red-400 border-red-800' :
                                        p.attendance === 'Exempt' ? 'bg-gray-800 text-gray-400 border-gray-600' :
                                            'bg-yellow-900/30 text-yellow-500 border-yellow-800'
                            }`}>
                                {p.attendance || 'UNKNOWN'}
                            </span>
                        ) : !isLocked && isAdmin ? (
                            <button onClick={() => handleDeploy(pFid, null, false)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0">
                                <X size={14} />
                            </button>
                        ) : isLocked && isAdmin ? (
                            <select
                                value={p.attendance}
                                onChange={(e) => handleAttendanceChange(pFid, e.target.value)}
                                className={`text-[10px] font-black uppercase rounded px-1.5 py-1 outline-none border cursor-pointer shrink-0 ${
                                    p.attendance === 'Attended' ? 'bg-green-900/30 text-green-400 border-green-800' :
                                        p.attendance === 'Missed' ? 'bg-red-900/30 text-red-400 border-red-800' :
                                            p.attendance === 'Exempt' ? 'bg-gray-800 text-gray-400 border-gray-600' :
                                                'bg-yellow-900/30 text-yellow-500 border-yellow-800'
                                }`}
                            >
                                <option value="Pending">?</option>
                                <option value="Attended">YES</option>
                                <option value="Missed">NO</option>
                                <option value="Exempt">EXC</option>
                            </select>
                        ) : null}
                    </div>
                )}
            </div>
        );
    };

    // --- SUB-RENDER: LEGION ZONE (Dynamically Calculates Total Power) ---
    const renderLegionZone = (legionId, playersData, isHistory = false) => {
        const isLocked = isHistory ? true : (legionLocks.find(l => l.legionId === legionId)?.isLocked || false);
        const actives = playersData.filter(p => p.legionId === legionId && !p.isSub);
        const subs = playersData.filter(p => p.legionId === legionId && p.isSub);

        const mapToRoster = (dpList) => dpList.map(dp => {
            const dpFid = dp.playerId || dp.fid;
            const fullP = roster?.find(r => r.playerId === dpFid || r.fid === dpFid) || { nickname: dp.nickname || 'Unknown', power: 0 };
            return { ...dp, ...fullP, fid: dpFid };
        });

        const activePlayers = mapToRoster(actives);
        const subPlayers = mapToRoster(subs);

        // Dynamic Power Calculation for the Legion Header
        const totalPower = activePlayers.reduce((sum, p) => {
            const val = eventType === 'Foundry' ? (p.power || p.tundraPower || 0) : (p.normalPower || 0);
            return sum + val;
        }, 0);

        return (
            <div className={`bg-gray-900 rounded-3xl border transition-all flex flex-col overflow-hidden ${isLocked && !isHistory ? 'border-red-900/50 bg-red-950/5' : 'border-gray-800 shadow-2xl'}`}>
                <div className={`p-4 flex justify-between items-center border-b ${isLocked && !isHistory ? 'bg-red-900/10 border-red-900/20' : 'bg-gray-900/50 border-gray-800'}`}>
                    <div className="flex items-center gap-3">
                        <Shield size={20} className={isLocked && !isHistory ? 'text-red-500' : 'text-blue-500'} />
                        <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-tighter">Legion {legionId}</h4>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                                {actives.length}/30 ACTIVE •
                                <span className={eventType === 'Foundry' ? 'text-yellow-500' : 'text-blue-400'}>
                                    {(totalPower / 1000000).toFixed(0)}M POWER
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isAdmin && !isHistory && isLocked && (
                            <button
                                onClick={(e) => handleAnnounceDiscord(e, legionId)}
                                className="px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-[#5865F2]/20"
                                title="Announce to Discord"
                            >
                                <Megaphone size={14} />
                                <span className="hidden sm:inline">Announce</span>
                            </button>
                        )}
                        {isAdmin && !isHistory && (
                            <button onClick={() => toggleLock(legionId, isLocked)} className={`p-2 rounded-xl border transition-all ${isLocked ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/20' : 'bg-gray-800 text-gray-500 hover:text-white border-gray-700'}`}>
                                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col md:flex-row flex-1 p-2 gap-2 min-h-[400px]">
                    <div
                        className={`flex-1 flex flex-col p-2 rounded-2xl border-2 transition-colors ${
                            isHistory ? 'border-solid border-gray-800/50 bg-gray-900/30' :
                                selectedPlayer && !isLocked ? 'border-dashed border-blue-500/50 bg-blue-900/5' : 'border-dashed border-gray-800/50'
                        }`}
                        onDragOver={(e) => !isLocked && !isHistory && e.preventDefault()}
                        onDrop={(e) => !isLocked && !isHistory && onDrop(e, legionId, false)}
                        onClick={() => !isLocked && !isHistory && selectedPlayer && handleDeploy(selectedPlayer.fid, legionId, false)}
                    >
                        <h5 className="text-[10px] font-black uppercase text-gray-600 mb-2 pl-2 tracking-widest">Active Lineup ({actives.length}/30)</h5>
                        <div className="grid grid-cols-1 gap-1.5 content-start">
                            {activePlayers.map(p => renderPlayerCard(p, false, isLocked, isHistory))}
                        </div>
                    </div>

                    <div
                        className={`w-full md:w-56 flex flex-col p-2 rounded-2xl border-2 transition-colors ${
                            isHistory ? 'border-solid border-gray-800/50 bg-gray-900/30' :
                                selectedPlayer && !isLocked ? 'border-dashed border-yellow-500/50 bg-yellow-900/5' : 'border-dashed border-gray-800/50'
                        }`}
                        onDragOver={(e) => !isLocked && !isHistory && e.preventDefault()}
                        onDrop={(e) => !isLocked && !isHistory && onDrop(e, legionId, true)}
                        onClick={() => !isLocked && !isHistory && selectedPlayer && handleDeploy(selectedPlayer.fid, legionId, true)}
                    >
                        <h5 className="text-[10px] font-black uppercase text-gray-600 mb-2 pl-2 tracking-widest">Subs ({subs.length}/10)</h5>
                        <div className="grid grid-cols-1 gap-1.5 content-start">
                            {subPlayers.map(p => renderPlayerCard(p, false, isLocked, isHistory))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- MAIN RENDER ---
    const headerActions = (
        <div className="flex gap-2 items-center">
            <button
                onClick={() => setViewMode(prev => prev === 'live' ? 'history' : 'live')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${viewMode === 'history' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
            >
                <HistoryIcon size={14} /> <span className="hidden xs:inline">{viewMode === 'history' ? 'Live Board' : 'Archives'}</span>
            </button>

            <div className="hidden sm:flex bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mr-2">
                <button onClick={() => setEventType('Foundry')} className={`px-4 py-1.5 text-xs font-black uppercase transition-colors ${eventType === 'Foundry' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:bg-gray-800'}`}>Foundry</button>
                <button onClick={() => setEventType('Canyon')} className={`px-4 py-1.5 text-xs font-black uppercase transition-colors ${eventType === 'Canyon' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-800'}`}>Canyon</button>
            </div>

            {isAdmin && viewMode === 'live' && (
                <button onClick={handleReset} className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-800/50 rounded-lg text-[10px] font-black uppercase transition-all hover:bg-red-900/40">
                    <RotateCcw size={14} /> <span className="hidden xs:inline">Reset</span>
                </button>
            )}
        </div>
    );

    if (globalLoading || (loading && viewMode === 'live') || !user?.allianceId) {
        return <div className="p-10 text-white font-mono bg-gray-950 min-h-screen flex items-center justify-center tracking-widest uppercase italic">Loading Strategic Assets...</div>;
    }

    return (
        <AdminLayout title="Alliance Events" actions={headerActions}>
            <div className="flex flex-col lg:flex-row h-[calc(100dvh-64px)] lg:h-full overflow-hidden bg-gray-950 relative">

                <div className="sm:hidden flex flex-col bg-gray-900 border-b border-gray-800 shrink-0 z-20">
                    <div className="flex p-2 gap-2">
                        <button onClick={() => setEventType('Foundry')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all border ${eventType === 'Foundry' ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>Foundry</button>
                        <button onClick={() => setEventType('Canyon')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all border ${eventType === 'Canyon' ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>Canyon</button>
                    </div>
                </div>

                {viewMode === 'live' ? (
                    <>
                        <div className="lg:hidden flex bg-gray-900 p-2 border-b border-gray-800 shrink-0 gap-2 z-20">
                            <button onClick={() => setMobileTab('bench')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-all ${mobileTab === 'bench' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 bg-gray-800'}`}>Bench ({localBench.length})</button>
                            <button onClick={() => setMobileTab('alliances')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-all ${mobileTab === 'alliances' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 bg-gray-800'}`}>Legions</button>
                        </div>

                        <aside className={`w-full lg:w-80 bg-gray-900 border-b lg:border-r border-gray-800 shrink-0 overflow-hidden z-10 ${mobileTab === 'bench' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col h-full'}`}>
                            <div className="p-4 bg-gray-900/50 border-b border-gray-800">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input
                                        type="text" placeholder="Search Alliance Roster..."
                                        className="w-full bg-black border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none"
                                        value={filterText} onChange={e => setFilterText(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {localBench.map(p => renderPlayerCard(p, true, false, false))}
                                {localBench.length === 0 && <div className="text-center text-[10px] text-gray-700 mt-10 uppercase font-black tracking-tighter">All players deployed to legions</div>}
                            </div>
                        </aside>

                        <main className={`flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-950 z-10 ${selectedPlayer ? 'pb-40' : 'pb-12'} lg:pb-6 ${mobileTab === 'alliances' ? 'block' : 'hidden lg:block'}`}>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
                                {renderLegionZone(1, deployedPlayers, false)}
                                {renderLegionZone(2, deployedPlayers, false)}
                            </div>
                        </main>

                        {selectedPlayer && (
                            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] lg:hidden animate-in slide-in-from-bottom-5 w-11/12 max-w-sm bg-gray-900 border border-blue-500 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-3 flex flex-col gap-2">
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-xs font-black text-white uppercase truncate flex items-center gap-2">
                                        <ChevronRight size={14} className="text-blue-500" /> {selectedPlayer.nickname}
                                    </span>
                                    <button onClick={() => setSelectedPlayer(null)} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => handleDeploy(selectedPlayer.fid, 1, false)} className="bg-blue-600/20 text-blue-400 border border-blue-500/30 py-3 rounded-xl text-[10px] font-black uppercase">Legion 1 (Act)</button>
                                    <button onClick={() => handleDeploy(selectedPlayer.fid, 2, false)} className="bg-blue-600/20 text-blue-400 border border-blue-500/30 py-3 rounded-xl text-[10px] font-black uppercase">Legion 2 (Act)</button>
                                    <button onClick={() => handleDeploy(selectedPlayer.fid, 1, true)} className="bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 py-3 rounded-xl text-[10px] font-black uppercase">Legion 1 (Sub)</button>
                                    <button onClick={() => handleDeploy(selectedPlayer.fid, 2, true)} className="bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 py-3 rounded-xl text-[10px] font-black uppercase">Legion 2 (Sub)</button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="w-full md:w-80 bg-gray-900 md:border-r border-gray-800 flex flex-col shrink-0 z-20">
                            <div className="hidden md:flex p-4 border-b border-gray-800 items-center gap-2 text-gray-400 font-black uppercase text-xs tracking-widest">
                                <Clock size={16} /> Timeline
                            </div>

                            <button
                                onClick={() => setIsMobileTimelineOpen(!isMobileTimelineOpen)}
                                className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 text-gray-200"
                            >
                                <div className="flex items-center gap-2 font-black uppercase text-xs tracking-widest truncate pr-4">
                                    <Clock size={16} className="text-gray-400 shrink-0" />
                                    <span className="truncate">
                                        {historyList.find(e => e.id === selectedHistoryId)?.notes || 'Select Event'}
                                    </span>
                                </div>
                                <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${isMobileTimelineOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <div className={`
                                ${isMobileTimelineOpen ? 'absolute top-[125px] left-0 right-0 max-h-[60vh] z-50 shadow-2xl border-b border-gray-800 flex' : 'hidden'}
                                md:static md:flex md:flex-1 md:max-h-none md:border-b-0 md:shadow-none
                                bg-gray-900 overflow-y-auto p-2 space-y-2 custom-scrollbar flex-col
                            `}>
                                {historyList.length === 0 ? (
                                    <div className="p-4 text-center text-gray-600 text-sm">No archives found.</div>
                                ) : (
                                    historyList.map(ev => (
                                        <button
                                            key={ev.id}
                                            onClick={() => {
                                                setSelectedHistoryId(ev.id);
                                                setIsMobileTimelineOpen(false);
                                            }}
                                            className={`w-full text-left p-4 rounded-xl border transition-all shrink-0 ${
                                                selectedHistoryId === ev.id
                                                    ? 'bg-blue-900/20 border-blue-500/50 text-blue-100'
                                                    : 'bg-gray-800/50 border-gray-800 text-gray-400 hover:bg-gray-800 hover:border-gray-700'
                                            }`}
                                        >
                                            <div className="font-bold text-sm truncate">{ev.notes || `Event #${ev.id}`}</div>
                                            <div className="text-xs opacity-60 flex items-center gap-1 mt-1">
                                                <CalendarDays size={12} /> {formatDate(ev.eventDate)}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                            {isMobileTimelineOpen && (
                                <div className="md:hidden fixed inset-0 bg-black/50 z-40 top-[125px]" onClick={() => setIsMobileTimelineOpen(false)} />
                            )}
                        </div>

                        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-gray-950 z-10">
                            {!selectedHistoryId ? (
                                <div className="h-full flex items-center justify-center text-gray-600 uppercase font-black tracking-widest text-xs">Select an archived event</div>
                            ) : historyLoading ? (
                                <div className="h-full flex items-center justify-center text-blue-500 uppercase font-black tracking-widest text-xs animate-pulse">Loading Archive...</div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
                                    {renderLegionZone(1, historySnapshot, true)}
                                    {renderLegionZone(2, historySnapshot, true)}
                                </div>
                            )}
                        </main>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
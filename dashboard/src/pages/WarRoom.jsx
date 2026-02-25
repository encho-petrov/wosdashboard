import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
    Shield, Lock, Unlock,
    Megaphone, RotateCcw, Search, UserPlus, X, ChevronRight
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function WarRoom() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const isMod = user?.role === 'moderator';

    const { roster: players, globalLoading, refreshGlobalData } = useApp();

    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterOptions, setFilterOptions] = useState({
        troopTypes: [],
        battleAvailability: [],
        tundraAvailability: []
    });

    const [filterText, setFilterText] = useState('');
    const [filterTroops, setFilterTroops] = useState('All');
    const [filterAvail, setFilterAvail] = useState('All');
    const [filterTundra, setFilterTundra] = useState('All');
    const [sortBy, setSortBy] = useState('Power');
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    const [displayLimit, setDisplayLimit] = useState(30);
    const [mobileTab, setMobileTab] = useState('bench');

    useEffect(() => {
        void fetchData();
    }, []);

    const fetchData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const [sRes, fRes] = await Promise.all([
                client.get('/moderator/war-room/stats'),
                client.get('/moderator/war-room/filters')
            ]);
            setStats(sRes.data);
            setFilterOptions(fRes.data);
        } catch (err) {
            toast.error("Failed to load war room data");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // --- LOGIC: MUTUALLY EXCLUSIVE FILTERS ---
    const handleBattleFilterChange = (val) => {
        setFilterAvail(val);
        if (val !== 'All') setFilterTundra('All'); // Reset Tundra
        setDisplayLimit(30);
    };

    const handleTundraFilterChange = (val) => {
        setFilterTundra(val);
        if (val !== 'All') setFilterAvail('All'); // Reset Battle
        setDisplayLimit(30);
    };

    const handleReset = async () => {
        if (!isAdmin) return;
        if (!window.confirm("Are you sure you want to reset the event? This will clear all War Room and Squad assignments.")) return;
        try {
            await client.post('/moderator/war-room/reset');
            toast.success("Event data reset successfully.");
            void fetchData(true);
            await refreshGlobalData(true);
        } catch (err) { toast.error("Failed to reset event data."); }
    };

    const toggleLock = async (allianceId, currentLock) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/war-room/lock', {
                allianceId,
                isLocked: !currentLock
            });
            await fetchData(true);
        } catch (err) { toast.error("Failed to update lock"); }
    };

    const handleDeploy = async (fid, allianceId) => {
        if (isMod) return toast.warning("Moderators have read-only access.");
        try {
            await client.post('/moderator/war-room/deploy', {
                playerIds: [parseInt(fid)],
                allianceId: allianceId
            });
            await refreshGlobalData(true);
            await fetchData(true);
            setSelectedPlayer(null);
        } catch (err) { toast.error("Deployment failed"); }
    };

    const handleAnnounceWarRoom = async () => {
        if (!isAdmin) return;
        let description = "Here are the confirmed deployments for the upcoming battle:\n\n";
        stats.forEach(alliance => {
            const members = (players || []).filter(p => p.fightingAllianceId === alliance.id);
            if (members.length > 0) {
                description += `**🛡️ ${alliance.name} (${members.length} Members)**\n`;
                members.forEach(m => { description += `• ${m.nickname} - *${m.troopType}*\n`; });
                description += `\n`;
            }
        });

        try {
            await client.post('/moderator/discord/announce', {
                title: "⚔️ War Room Locked & Deployed",
                description: description,
                color: 15158332
            });
            toast.success("War Room deployed to Discord!");
        } catch (err) { toast.error("Failed to announce deployments."); }
    };

    const filteredPlayers = useMemo(() => {
        return (players || []).filter(p => {
            const matchesText = (p.nickname || '').toLowerCase().includes(filterText.toLowerCase()) ||
                (p.fid || '').toString().includes(filterText);
            const matchesTroops = filterTroops === 'All' || p.troopType === filterTroops;

            // Logic: Only one of these will ever be active at a time due to handlers
            const matchesAvail = filterAvail === 'All' || p.battleAvailability === filterAvail;
            const matchesTundra = filterTundra === 'All' || p.tundraAvailability === filterTundra;

            return matchesText && matchesTroops && matchesAvail && matchesTundra && !p.fightingAllianceId;
        }).sort((a, b) => {
            if (sortBy === 'Power') return (b.power || 0) - (a.power || 0);
            return (a.nickname || '').localeCompare(b.nickname || '');
        });
    }, [players, filterText, filterTroops, filterAvail, filterTundra, sortBy]);

    const getTroopColor = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('helios')) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
        if (t.includes('brilliant')) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
        if (t.includes('apex')) return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
        return 'text-gray-400 border-gray-700 bg-gray-800/40';
    };

    const onDragStart = (e, fid) => {
        if (isMod) return e.preventDefault();
        e.dataTransfer.setData("playerFid", fid);
    };

    const onDrop = (e, allianceId) => {
        if (isMod) return;
        const fid = e.dataTransfer.getData("playerFid");
        void handleDeploy(fid, allianceId);
    };

    const handleMobileSelect = (p) => {
        if (isMod) return;
        setSelectedPlayer(p);
        if (window.innerWidth < 1024) {
            setMobileTab('alliances');
        }
    };

    const headerActions = (
        <div className="flex gap-2">
            {isAdmin && (
                <button onClick={handleReset} className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-800/50 rounded-lg text-[10px] font-black uppercase">
                    <RotateCcw size={14} /> <span className="hidden sm:inline">Reset</span>
                </button>
            )}
            {isAdmin && stats.some(a => a.isLocked) && (
                <button onClick={handleAnnounceWarRoom} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 text-blue-400 border border-blue-800/50 rounded-lg text-[10px] font-black uppercase">
                    <Megaphone size={14} className="animate-pulse" /> <span className="hidden sm:inline">Announce</span>
                </button>
            )}
        </div>
    );

    if (loading || globalLoading) return <div className="p-10 text-white font-mono bg-gray-950 min-h-screen">LOADING STRATEGIC ASSETS...</div>;

    return (
        <AdminLayout title="War Room" actions={headerActions}>
            <div className="flex flex-col lg:flex-row h-[calc(100dvh-64px)] lg:h-full overflow-hidden bg-gray-950">
                {/* --- MOBILE TOGGLE BAR --- */}
                <div className="lg:hidden flex bg-gray-900 p-2 border-b border-gray-800 shrink-0 gap-2">
                    <button
                        onClick={() => setMobileTab('bench')}
                        className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'bench' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}
                    >
                        Bench ({filteredPlayers.length})
                    </button>
                    <button
                        onClick={() => setMobileTab('alliances')}
                        className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'alliances' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}
                    >
                        Deployments
                    </button>
                </div>

                {/* 1. BENCH SIDEBAR */}
                <aside className={`w-full lg:w-80 bg-gray-900 border-b lg:border-r border-gray-800 shrink-0 overflow-hidden ${mobileTab === 'bench' ? 'flex flex-col flex-1' : 'hidden lg:flex lg:flex-col h-full'}`}>
                    <div className="p-4 space-y-3 bg-gray-900/50 border-b border-gray-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text" placeholder="Filter Players..."
                                className="w-full bg-black border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none"
                                value={filterText} onChange={e => {setFilterText(e.target.value); setDisplayLimit(30);}}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <select
                                value={filterTroops}
                                onChange={e => {setFilterTroops(e.target.value); setDisplayLimit(30);}}
                                className="bg-black border border-gray-800 text-[10px] rounded-lg p-1 text-gray-400 outline-none"
                            >
                                <option value="All">All Troops</option>
                                {(filterOptions.troopTypes || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>

                            <select
                                value={filterAvail}
                                onChange={e => handleBattleFilterChange(e.target.value)}
                                className={`bg-black border rounded-lg p-1 text-[10px] outline-none transition-colors ${filterAvail !== 'All' ? 'border-blue-500 text-blue-400' : 'border-gray-800 text-gray-400'}`}
                            >
                                <option value="All">Battle Availability</option>
                                {(filterOptions.battleAvailability || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>

                            <select
                                value={filterTundra}
                                onChange={e => handleTundraFilterChange(e.target.value)}
                                className={`bg-black border rounded-lg p-1 text-[10px] outline-none transition-colors ${filterTundra !== 'All' ? 'border-purple-500 text-purple-400' : 'border-gray-800 text-gray-400'}`}
                            >
                                <option value="All">Tundra Availability</option>
                                {(filterOptions.tundraAvailability || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {filteredPlayers.slice(0, displayLimit).map(p => (
                            <div
                                key={p.fid}
                                draggable={!isMod}
                                onDragStart={(e) => onDragStart(e, p.fid)}
                                onClick={() => handleMobileSelect(p)}
                                className={`p-3 rounded-2xl border transition-all select-none ${isMod ? 'cursor-default border-gray-800' : 'cursor-pointer'} ${selectedPlayer?.fid === p.fid ? 'bg-blue-600 border-blue-400 scale-95 shadow-lg' : 'bg-gray-950 border-gray-800 hover:border-gray-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <img src={p.avatar} className="w-10 h-10 rounded-xl object-cover" alt="" />
                                        {p.stoveImg && <img src={p.stoveImg} className="absolute -bottom-1 -right-1 w-5 h-5" alt="" />}
                                    </div>
                                    <div className="min-w-0 flex-1 space-x-2">
                                        <p className={`text-[11px] font-black ${selectedPlayer?.fid === p.fid ? 'text-white' : 'text-gray-200'}`}>{p.nickname}</p>
                                        <div className={`mt-1 inline-block text-[8px] px-1.5 rounded-sm border font-black uppercase tracking-tighter ${getTroopColor(p.troopType)}`}>{p.troopType || 'NONE'}</div>
                                        <div className={`mt-1 inline-block text-[8px] px-1.5 rounded-sm border font-black tracking-tighter text-gray-400 border-gray-700 bg-gray-800/40`}>{p.allianceName || 'NONE'}</div>

                                    </div>
                                </div>
                            </div>
                        ))}

                        {filteredPlayers.length > displayLimit && (
                            <button
                                onClick={() => setDisplayLimit(prev => prev + 30)}
                                className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors border-t border-gray-800 mt-2"
                            >
                                + Load More ({filteredPlayers.length - displayLimit} Remaining)
                            </button>
                        )}
                    </div>
                </aside>

                {/* 2. DEPLOYMENT GRID */}
                <main className={`flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-950 ${selectedPlayer ? 'pb-32' : 'pb-12'} lg:pb-6 ${mobileTab === 'alliances' ? 'block' : 'hidden lg:block'}`}>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {(stats || []).map(alliance => {
                            const roster = (players || []).filter(p => p.fightingAllianceId === alliance.id);
                            const isLocked = alliance.isLocked;

                            return (
                                <div
                                    key={alliance.id}
                                    onDragOver={(e) => !isLocked && !isMod && e.preventDefault()}
                                    onDrop={(e) => !isLocked && !isMod && onDrop(e, alliance.id)}
                                    onClick={() => !isLocked && !isMod && selectedPlayer && handleDeploy(selectedPlayer.fid, alliance.id)}
                                    className={`bg-gray-900 rounded-3xl border transition-all flex flex-col overflow-hidden min-h-[400px] 
                                        ${selectedPlayer && !isLocked && !isMod ? 'border-blue-500 ring-4 ring-blue-500/20 animate-pulse scale-[1.02] cursor-crosshair' : 'border-gray-800 shadow-2xl'} 
                                        ${isLocked ? 'bg-red-950/5' : ''}`}
                                >
                                    <div className={`p-4 flex justify-between items-center border-b ${isLocked ? 'bg-red-900/10 border-red-900/20' : 'bg-gray-900/50 border-gray-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <Shield size={20} className={isLocked ? 'text-red-500' : 'text-blue-500'} />
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-tighter">{alliance.name}</h4>
                                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{alliance.memberCount} PLAYERS • {(alliance.totalPower / 1000000).toFixed(0)}M</p>
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); void toggleLock(alliance.id, isLocked); }}
                                                className={`p-2 rounded-xl border transition-all ${isLocked ? 'bg-red-500 text-white border-red-400' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-white'}`}
                                            >
                                                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
                                        {roster.map(m => (
                                            <div key={m.fid} className="flex items-center justify-between p-2 bg-black/40 border border-gray-800 rounded-xl group transition-all hover:border-gray-600">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <img src={m.avatar} className="w-7 h-7 rounded-lg grayscale group-hover:grayscale-0 transition-all" alt="" />
                                                    <span className="text-[11px] font-bold text-gray-300 truncate tracking-tighter group-hover:text-white">{m.nickname}</span>
                                                </div>
                                                {isAdmin && !isLocked && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); void handleDeploy(m.fid, null); }}
                                                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 text-red-500 lg:hover:bg-red-500/10 rounded-lg transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {roster.length === 0 && (
                                            <div className="col-span-full h-40 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center text-gray-700">
                                                <UserPlus size={24} className="mb-2 opacity-20" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">{isLocked ? 'Locked' : 'Drop Players'}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>

                {/* Mobile Selected Player Floating Action Bar */}
                {selectedPlayer && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] lg:hidden animate-in slide-in-from-bottom-5">
                        <div className="bg-blue-600 text-white pl-6 pr-2 py-2 rounded-full font-black text-xs tracking-widest shadow-2xl flex items-center gap-4 border border-blue-400">
                            <span className="flex items-center gap-2">
                                <ChevronRight size={16} /> Deploy {selectedPlayer.nickname.substring(0, 10)}
                            </span>
                            <button
                                onClick={() => setSelectedPlayer(null)}
                                className="p-2 bg-blue-800 rounded-full hover:bg-blue-900 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
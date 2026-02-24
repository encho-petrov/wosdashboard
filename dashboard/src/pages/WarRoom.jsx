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

    const headerActions = (
        <div className="flex gap-2">
            {isAdmin && (
                <button onClick={handleReset} className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-800/50 rounded-lg text-[10px] font-black">
                    <RotateCcw size={14} /> Reset
                </button>
            )}
            {isAdmin && stats.some(a => a.isLocked) && (
                <button onClick={handleAnnounceWarRoom} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 text-blue-400 border border-blue-800/50 rounded-lg text-[10px] font-black">
                    <Megaphone size={14} className="animate-pulse" /> Announce
                </button>
            )}
        </div>
    );

    if (loading || globalLoading) return <div className="p-10 text-white font-mono bg-gray-950 min-h-screen">LOADING STRATEGIC ASSETS...</div>;

    return (
        <AdminLayout title="War Room" actions={headerActions}>
            <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-gray-950">

                {/* 1. BENCH SIDEBAR */}
                <aside className="w-full lg:w-80 bg-gray-900 border-b lg:border-r border-gray-800 flex flex-col shrink-0 overflow-hidden">
                    <div className="p-4 space-y-3 bg-gray-900/50 border-b border-gray-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text" placeholder="Filter Units..."
                                className="w-full bg-black border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none"
                                value={filterText} onChange={e => setFilterText(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select value={filterTroops} onChange={e => setFilterTroops(e.target.value)} className="bg-black border border-gray-800 text-[10px] rounded-lg p-1 text-gray-400 outline-none">
                                <option value="All">All Troops</option>
                                {(filterOptions.troopTypes || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <select value={filterAvail} onChange={e => setFilterAvail(e.target.value)} className="bg-black border border-gray-800 text-[10px] rounded-lg p-1 text-gray-400 outline-none">
                                <option value="All">All Battle</option>
                                {(filterOptions.battleAvailability || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {filteredPlayers.map(p => (
                            <div
                                key={p.fid}
                                draggable={!isMod}
                                onDragStart={(e) => onDragStart(e, p.fid)}
                                onClick={() => !isMod && setSelectedPlayer(p)}
                                className={`p-3 rounded-2xl border transition-all select-none ${isMod ? 'cursor-default border-gray-800' : 'cursor-pointer'} ${selectedPlayer?.fid === p.fid ? 'bg-blue-600 border-blue-400 scale-95 shadow-lg' : 'bg-gray-950 border-gray-800 hover:border-gray-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <img src={p.avatar} className="w-10 h-10 rounded-xl object-cover" alt="" />
                                        {p.stoveImg && <img src={p.stoveImg} className="absolute -bottom-1 -right-1 w-5 h-5" alt="" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-[11px] font-black ${selectedPlayer?.fid === p.fid ? 'text-white' : 'text-gray-200'}`}>{p.nickname}</p>
                                        <div className={`mt-1 inline-block text-[8px] px-1.5 rounded-sm border font-black uppercase tracking-tighter ${getTroopColor(p.troopType)}`}>{p.troopType || 'NONE'}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* 2. DEPLOYMENT GRID */}
                <main className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-950">
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
                                    className={`bg-gray-900 rounded-3xl border transition-all flex flex-col overflow-hidden min-h-[400px] ${selectedPlayer && !isLocked && !isMod ? 'border-blue-500 ring-2 ring-blue-500/10 cursor-crosshair' : 'border-gray-800 shadow-2xl'} ${isLocked ? 'bg-red-950/5' : ''}`}
                                >
                                    <div className={`p-4 flex justify-between items-center border-b ${isLocked ? 'bg-red-900/10 border-red-900/20' : 'bg-gray-900/50 border-gray-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <Shield size={20} className={isLocked ? 'text-red-500' : 'text-blue-500'} />
                                            <div>
                                                <h4 className="text-sm font-black text-white tracking-tighter">{alliance.name}</h4>
                                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{alliance.memberCount} UNITS • {(alliance.totalPower / 1000000).toFixed(0)}M</p>
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
                                                        className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {roster.length === 0 && (
                                            <div className="col-span-full h-40 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center text-gray-700">
                                                <UserPlus size={24} className="mb-2 opacity-20" />
                                                <p className="text-[10px] font-black tracking-widest">{isLocked ? 'Locked' : 'Drop Units'}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
                {selectedPlayer && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] lg:hidden animate-bounce">
                        <div className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-blue-400">
                            <ChevronRight size={16} /> Deploy to Alliance
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
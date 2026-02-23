import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
    Swords, Shield, Search,
    ArrowLeft, Trophy, Lock, Unlock, ArrowDownWideNarrow, X, RotateCcw, Megaphone
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WarRoom() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

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

    useEffect(() => { void fetchData(); }, []);

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
        if (!window.confirm("Are you sure you want to reset the event? This will clear all War Room and Squad assignments and cannot be undone.")) {
            return;
        }

        try {
            await client.post('/moderator/war-room/reset');
            toast.success("Event data has been reset successfully.");
            void fetchData(true);
        } catch (err) {
            toast.error("Failed to reset event data.");
        }
    };

    const handleAnnounceWarRoom = async () => {
        let description = "Here are the confirmed deployments for the upcoming battle:\n\n";

        stats.forEach(alliance => {
            const members = players.filter(p => p.fightingAllianceId === alliance.id);
            if (members.length > 0) {
                description += `**🛡️ ${alliance.name} (${members.length} Members)**\n`;
                members.forEach(m => {
                    description += `• ${m.nickname} - *${m.troopType}*\n`;
                });
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
        } catch (err) {
            toast.error("Failed to announce deployments.");
        }
    };

    const filteredPlayers = useMemo(() => {
        return players.filter(p => {
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

    // --- Helper for Troop Colors ---
    const getTroopColor = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('helios')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        if (t.includes('brilliant')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (t.includes('apex')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        if (t.includes('mixed')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        return 'bg-gray-900 text-gray-500 border-gray-700';
    };

    const onDragStart = (e, fid) => {
        e.dataTransfer.setData("playerFid", fid);
    };

    const onDrop = async (e, allianceId) => {
        const fid = e.dataTransfer.getData("playerFid");
        try {
            await client.post('/moderator/war-room/deploy', {
                playerIds: [parseInt(fid)],
                allianceId: allianceId
            });
            await refreshGlobalData(true)
            await fetchData(true);
        } catch (err) { toast.error("Deployment failed"); }
    };

    const toggleLock = async (allianceId, currentLock) => {
        try {
            await client.post('/moderator/war-room/lock', {
                allianceId,
                isLocked: !currentLock
            });
            await fetchData(true);
        } catch (err) { toast.error("Failed to update lock"); }
    };

    if (loading || globalLoading) return <div className="p-10 text-white font-mono">LOADING WAR ROOM...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-4 md:p-6">
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white border border-gray-700 transition-all">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
                                <Trophy className="text-yellow-500 w-6 h-6" /> WAR ROOM
                            </h1>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">State Event Deployment</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={handleReset}
                                className="ml-2 flex items-center gap-2 px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/50 rounded-lg transition-all text-xs font-bold uppercase"
                                title="Wipe all deployments"
                            >
                                <RotateCcw size={14} />
                                Reset
                            </button>
                        )}

                        {isAdmin && stats.some(a => a.isLocked) && (
                            <button
                                onClick={handleAnnounceWarRoom}
                                className="ml-2 flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded-lg transition-all text-xs font-bold uppercase drop-shadow-md"
                                title="Announce Deployments to Discord"
                            >
                                <Megaphone size={14} className="animate-pulse" />
                                Announce
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="bg-gray-900 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:border-blue-500 outline-none w-64 transition-all"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                            />
                        </div>

                        {[
                            { id: 'troops', icon: <Swords size={16}/>, val: filterTroops, set: setFilterTroops, opts: filterOptions.troopTypes, label: 'All Types' },
                            { id: 'battle', icon: <Shield size={16}/>, val: filterAvail, set: setFilterAvail, opts: filterOptions.battleAvailability, label: 'All Battle' },
                            { id: 'tundra', icon: <Trophy size={16}/>, val: filterTundra, set: setFilterTundra, opts: filterOptions.tundraAvailability, label: 'All Tundra' }
                        ].map(f => (
                            <div key={f.id} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 focus-within:border-blue-500 transition-all">
                                <span className="text-gray-500">{f.icon}</span>
                                <select
                                    className="bg-transparent text-xs font-bold outline-none border-none text-gray-300 cursor-pointer"
                                    value={f.val}
                                    onChange={(e) => f.set(e.target.value)}
                                >
                                    <option value="All" className="bg-gray-900">{f.label}</option>
                                    {f.opts?.map(opt => (
                                        <option key={opt} value={opt} className="bg-gray-900">{opt}</option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2">
                            <ArrowDownWideNarrow size={16} className="text-gray-500" />
                            <select
                                className="bg-transparent text-xs font-bold outline-none border-none text-gray-300"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="Power" className="bg-gray-900">Power</option>
                                <option value="Name" className="bg-gray-900">Name</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">

                    {/* Available Sidebar */}
                    <div className="lg:col-span-3 bg-gray-900/30 border border-gray-800 rounded-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                            <h2 className="font-black text-sm uppercase tracking-widest text-gray-400">Available ({filteredPlayers.length})</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-800" onDragOver={(e) => e.preventDefault()}>
                            {filteredPlayers.map(p => (
                                <div
                                    key={p.fid}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, p.fid)}
                                    className="bg-gray-800/40 border border-gray-700 p-3 rounded-xl hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing group shadow-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <img src={p.avatar} className="w-12 h-12 rounded-lg object-cover border-2 border-gray-700 shadow-inner" alt="" />
                                            {p.allianceName && (
                                                <div className="absolute -top-2 -left-2 bg-gray-900 text-[8px] font-black border border-gray-700 px-1 rounded shadow-md text-blue-400">
                                                    {p.allianceName}
                                                </div>
                                            )}
                                            {p.stoveImg && (
                                                <img src={p.stoveImg} className="absolute -bottom-2 -right-2 w-7 h-7 drop-shadow-md" title={`Furnace Lv ${p.stoveLv}`} alt="" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-sm truncate text-white tracking-tight">{p.nickname}</h4>
                                            <p className="text-[10px] text-gray-500 font-mono font-bold">{(p.power || 0).toLocaleString()} POWER</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-tighter shadow-sm ${getTroopColor(p.troopType)}`}>
                                            {p.troopType || 'NONE'}
                                        </span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/50 font-black uppercase tracking-tighter ${p.battleAvailability === 'Available' ? 'text-green-400' : 'text-red-400'}`}>
                                            {p.battleAvailability}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Deployment Boards */}
                    <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-800" onDragOver={(e) => e.preventDefault()}>
                        {stats.map(alliance => {
                            const roster = players.filter(p => p.fightingAllianceId === alliance.id);
                            const isLocked = alliance.isLocked;

                            return (
                                <div
                                    key={alliance.id}
                                    onDragOver={(e) => !isLocked && e.preventDefault()}
                                    onDrop={(e) => !isLocked && onDrop(e, alliance.id)}
                                    className={`flex flex-col h-[520px] rounded-2xl border-2 transition-all overflow-hidden shadow-2xl ${
                                        isLocked ? 'border-red-900/50 bg-red-950/5' : 'border-gray-800 bg-gray-900/20 hover:border-blue-500/30'
                                    }`}
                                >
                                    <div className={`p-4 border-b ${isLocked ? 'border-red-900/50 bg-red-900/10' : 'border-gray-800 bg-gray-900/50'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-black text-lg tracking-tighter text-white uppercase">{alliance.name}</h3>
                                            <button
                                                onClick={() => toggleLock(alliance.id, isLocked)}
                                                className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-red-500 bg-red-500/10' : 'text-gray-500 hover:bg-green-500/10 hover:text-green-500'}`}
                                            >
                                                {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                                            <span>{alliance.memberCount} MEMBERS</span>
                                            <span>{(alliance.totalPower || 0).toLocaleString()} POWER</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-black/20 scrollbar-thin scrollbar-thumb-gray-800">
                                        {roster.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-gray-700 border-2 border-dashed border-gray-800 rounded-xl uppercase text-[10px] font-bold">
                                                {isLocked ? 'DEPLOYMENTS LOCKED' : 'DROP TROOPS HERE'}
                                            </div>
                                        ) : (
                                            roster.map(p => (
                                                <div
                                                    key={p.fid}
                                                    className={`flex items-center gap-3 p-2 rounded-xl border bg-gray-900/80 group ${isLocked ? 'border-red-900/20' : 'border-gray-800 hover:border-blue-500/50'}`}
                                                >
                                                    <div className="relative">
                                                        <img src={p.avatar} className="w-8 h-8 rounded-md object-cover border border-gray-700" alt="" />
                                                        {p.stoveImg && <img src={p.stoveImg} className="absolute -bottom-1 -right-1 w-4 h-4" alt="" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] font-black text-white truncate">{p.nickname}</div>
                                                        <div className={`text-[8px] font-bold inline-block px-1 rounded-sm border ${getTroopColor(p.troopType)}`}>
                                                            {p.troopType}
                                                        </div>
                                                    </div>
                                                    {!isLocked && (
                                                        <button
                                                            onClick={() => onDrop({ dataTransfer: { getData: () => p.fid } }, null)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-500"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
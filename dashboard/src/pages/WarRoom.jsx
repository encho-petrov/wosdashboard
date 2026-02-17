import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext'; // <--- FIXED: Added Import
import { toast } from 'react-toastify';
import {
    Swords, Shield, Users, Search,
    ArrowLeft, Trophy, Lock, Unlock, ArrowDownWideNarrow, Trash2
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WarRoom() {
    const { user } = useAuth(); // <--- FIXED: Added Hook

    const [players, setPlayers] = useState([]);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draggedPlayerId, setDraggedPlayerId] = useState(null);

    // Filters & Sorting
    const [filterText, setFilterText] = useState('');
    const [filterTroops, setFilterTroops] = useState('All');
    const [filterAvail, setFilterAvail] = useState('All');
    const [sortBy, setSortBy] = useState('Power');

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const [pRes, sRes] = await Promise.all([
                client.get('/moderator/players'),
                client.get('/moderator/war-room/stats')
            ]);
            setPlayers(pRes.data);
            setStats(sRes.data);
        } catch (err) { toast.error("Failed to load data"); }
        finally { setLoading(false); }
    };

    // --- LOGIC ---

    const sortList = (list) => {
        return [...list].sort((a, b) => {
            if (sortBy === 'Power') return (b.power || 0) - (a.power || 0);
            if (sortBy === 'Furnace') return (b.stoveLv || 0) - (a.stoveLv || 0);
            if (sortBy === 'Name') return a.nickname.localeCompare(b.nickname);
            return 0;
        });
    };

    // 1. Unassigned Pool
    const poolPlayers = useMemo(() => {
        let list = players.filter(p => {
            if (p.fightingAllianceId) return false;
            if (filterText && !p.nickname?.toLowerCase().includes(filterText.toLowerCase())) return false;
            if (filterTroops !== 'All' && p.troopType !== filterTroops) return false;
            return !(filterAvail !== 'All' && p.battleAvailability !== filterAvail);

        });
        return sortList(list);
    }, [players, filterText, filterTroops, filterAvail, sortBy]);

    // 2. Fighting Alliance Rosters
    const allianceRosters = useMemo(() => {
        const rosters = {};
        stats.forEach(a => rosters[a.id] = []);
        players.forEach(p => {
            if (p.fightingAllianceId && rosters[p.fightingAllianceId]) {
                rosters[p.fightingAllianceId].push(p);
            }
        });
        Object.keys(rosters).forEach(key => {
            rosters[key] = sortList(rosters[key]);
        });
        return rosters;
    }, [players, stats, sortBy]);

    // --- ACTIONS ---

    const handleReset = async () => {
        if (!window.confirm("DANGER: This will disband ALL teams, unlock alliances, and return ALL players to the reserve pool. Are you sure?")) return;

        try {
            await client.post('/moderator/war-room/reset');
            toast.success("Event Reset Complete");
            await fetchData();
        } catch (err) {
            toast.error("Reset failed");
        }
    };

    const handleDragStart = (e, playerId, currentAllianceId) => {
        if (currentAllianceId) {
            const alliance = stats.find(a => a.id === currentAllianceId);
            if (alliance?.isLocked) {
                e.preventDefault();
                toast.warning("This alliance is locked!");
                return;
            }
        }
        setDraggedPlayerId(playerId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = async (e, targetAllianceId) => {
        e.preventDefault();
        if (!draggedPlayerId) return;

        if (targetAllianceId) {
            const alliance = stats.find(a => a.id === targetAllianceId);
            if (alliance?.isLocked) {
                toast.warning("Cannot add to a locked roster!");
                return;
            }
        }

        const updatedPlayers = players.map(p =>
            p.fid === draggedPlayerId
                ? { ...p, fightingAllianceId: targetAllianceId, fightingAllianceName: targetAllianceId ? 'Assigned' : null }
                : p
        );
        setPlayers(updatedPlayers);
        setDraggedPlayerId(null);

        try {
            await client.post('/moderator/war-room/deploy', {
                playerIds: [draggedPlayerId],
                allianceId: targetAllianceId
            });
            toast.success("Troops moved");
        } catch (err) {
            toast.error("Move failed");
            await fetchData();
        }
    };

    const toggleLock = async (alliance) => {
        try {
            const newStatus = !alliance.isLocked;
            setStats(stats.map(s => s.id === alliance.id ? {...s, isLocked: newStatus} : s));

            await client.post('/moderator/war-room/lock', {
                allianceId: alliance.id,
                isLocked: newStatus
            });
            toast.info(newStatus ? "Roster Locked" : "Roster Unlocked");
        } catch (err) {
            toast.error("Failed to toggle lock");
            await fetchData();
        }
    };

    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

    const getColumnStats = (allianceId) => {
        const roster = allianceRosters[allianceId] || [];
        return {
            count: roster.length,
            power: roster.reduce((sum, p) => sum + (p.power || 0), 0)
        };
    };

    // --- RENDERER ---
    const PlayerCard = ({ p, isCompact = false, locked = false }) => (
        <div
            draggable={!locked}
            onDragStart={(e) => handleDragStart(e, p.fid, p.fightingAllianceId)}
            className={`bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3 transition-all shadow-sm group relative ${
                locked ? 'opacity-75 cursor-not-allowed' : 'cursor-grab hover:bg-gray-750 hover:border-blue-500/50'
            } ${isCompact ? 'text-xs' : ''}`}
        >
            <div className="relative">
                <img src={p.avatar} className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-black`} alt="" />
                {p.stoveImg && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-600">
                        <img src={p.stoveImg} className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} object-contain`} alt="" />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <span className="font-bold text-gray-200 truncate">{p.nickname}</span>
                    {!isCompact && <span className="text-yellow-500 font-mono text-xs">{p.power?.toLocaleString()}</span>}
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Troop Badge */}
                    {p.troopType !== 'None' && (
                        <span className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase ${
                            p.troopType === 'Helios' ? 'bg-orange-900/40 text-orange-400 border border-orange-500/30' :
                                'bg-blue-900/40 text-blue-400 border border-blue-500/30'
                        }`}>{p.troopType.substring(0, 1)}</span>
                    )}

                    {/* General Alliance Badge */}
                    {p.allianceName && (
                        <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold bg-gray-700 text-gray-300 border border-gray-600 truncate max-w-[80px]" title={p.allianceName}>
               {p.allianceName}
             </span>
                    )}

                    {/* Availability Dot */}
                    <div
                        className={`w-2 h-2 rounded-full ${p.battleAvailability === 'Full' || p.battleAvailability === '4h+' ? 'bg-green-500' : 'bg-gray-600'}`}
                        title={`Availability: ${p.battleAvailability}`}
                    />
                </div>
            </div>
            {isCompact && <div className="text-right text-yellow-500 font-mono">{p.power?.toLocaleString()}</div>}
        </div>
    );

    return (
        <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden font-sans">

            {/* HEADER */}
            <div className="h-16 bg-gray-800 border-b border-gray-700 flex justify-between items-center px-6 shrink-0 z-10 shadow-md">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 bg-gray-900 rounded-lg text-gray-400 hover:text-white border border-gray-700">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl font-bold flex items-center text-white">
                        <Swords className="mr-3 text-red-500 w-6 h-6" /> War Room
                    </h1>
                </div>

                <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-400"/><span className="text-white font-bold">{players.length}</span></div>
                    <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-400"/><span className="text-white font-bold">{(players.reduce((sum, p) => sum + (p.power || 0), 0)).toLocaleString()}</span></div>

                    {/* RESET BUTTON (ADMIN ONLY) */}
                    {user?.role === 'admin' && (
                        <button
                            onClick={handleReset}
                            className="ml-4 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase rounded border border-red-400 flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" /> End Event
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">

                {/* --- LEFT: POOL --- */}
                <div className="w-[400px] flex flex-col border-r border-gray-700 bg-gray-800/50">
                    <div className="p-4 space-y-3 bg-gray-800 border-b border-gray-700 z-10">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
                            <input type="text" placeholder="Search..." className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm outline-none"
                                   value={filterText} onChange={e => setFilterText(e.target.value)} />
                        </div>
                        {/* Filters */}
                        <div className="flex gap-2">
                            <select className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-xs"
                                    value={filterTroops} onChange={e => setFilterTroops(e.target.value)}>
                                <option value="All">All Troops</option>
                                <option value="Helios">Helios</option>
                                <option value="Brilliant">Brilliant</option>
                            </select>
                            <select className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-xs"
                                    value={filterAvail} onChange={e => setFilterAvail(e.target.value)}>
                                <option value="All">Any Avail</option>
                                <option value="Full">Full</option>
                                <option value="4h+">4h+</option>
                            </select>
                        </div>
                        {/* Sorting */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
                            <ArrowDownWideNarrow className="w-4 h-4 text-gray-500" />
                            <span className="text-xs text-gray-400">Sort by:</span>
                            <select
                                className="bg-transparent text-blue-400 text-xs font-bold outline-none cursor-pointer hover:text-blue-300"
                                value={sortBy} onChange={e => setSortBy(e.target.value)}
                            >
                                <option value="Power">Highest Power</option>
                                <option value="Furnace">Furnace Level</option>
                                <option value="Name">Name (A-Z)</option>
                            </select>
                        </div>
                    </div>

                    <div
                        className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        {poolPlayers.map(p => <PlayerCard key={p.fid} p={p} />)}
                    </div>
                </div>

                {/* --- RIGHT: ALLIANCES --- */}
                <div className="flex-1 bg-gray-900 p-6 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700">
                    <div className="flex gap-6 h-full min-w-max">
                        {stats.map(alliance => {
                            const { count, power } = getColumnStats(alliance.id);
                            const roster = allianceRosters[alliance.id] || [];
                            const isLocked = alliance.isLocked;

                            return (
                                <div
                                    key={alliance.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, alliance.id)}
                                    className={`w-[380px] flex flex-col bg-gray-800 rounded-xl border shadow-xl overflow-hidden transition-colors ${
                                        isLocked ? 'border-red-900/50' : 'border-gray-700'
                                    }`}
                                >
                                    <div className={`p-4 border-b ${isLocked ? 'bg-red-900/10 border-red-900/30' : 'bg-gray-750 border-gray-600'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                                <Shield className={`w-5 h-5 ${isLocked ? 'text-gray-500' : 'text-red-500'}`} />
                                                {alliance.name}
                                            </h2>
                                            <button
                                                onClick={() => toggleLock(alliance)}
                                                className={`p-1.5 rounded transition-colors ${
                                                    isLocked ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700 text-gray-400 hover:text-white'
                                                }`}
                                                title={isLocked ? "Unlock Roster" : "Lock Roster"}
                                            >
                                                {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-gray-900/50 p-2 rounded border border-gray-600/50">
                                                <div className="text-[10px] text-gray-400 uppercase">Power</div>
                                                <div className="text-yellow-400 font-bold font-mono text-sm">{power.toLocaleString()}</div>
                                            </div>
                                            <div className="bg-gray-900/50 p-2 rounded border border-gray-600/50">
                                                <div className="text-[10px] text-gray-400 uppercase">Players</div>
                                                <div className="text-blue-400 font-bold font-mono text-sm">{count}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex-1 overflow-y-auto p-3 space-y-2 transition-colors scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent ${isLocked ? 'bg-gray-900/80' : 'bg-gray-800/50'}`}>
                                        {roster.length === 0 && !isLocked && (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg m-2 opacity-50">
                                                <span className="text-sm">Drag troops here</span>
                                            </div>
                                        )}
                                        {isLocked && roster.length === 0 && (
                                            <div className="h-full flex items-center justify-center text-red-500/50 text-sm italic">
                                                Roster Locked
                                            </div>
                                        )}
                                        {roster.map(p => (
                                            <PlayerCard key={p.fid} p={p} isCompact={true} locked={isLocked} />
                                        ))}
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
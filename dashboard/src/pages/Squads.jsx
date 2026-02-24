import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext'; // <-- Global State
import { toast } from 'react-toastify';
import {
    Users, Crown, Trash2, ArrowLeft, Search, Sword, Megaphone, X
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Squads() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [activeAlliance, setActiveAlliance] = useState(null);
    const [alliances, setAlliances] = useState([]);
    const [squads, setSquads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draggedPlayerId, setDraggedPlayerId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const { roster: players, globalLoading, refreshGlobalData } = useApp();

    useEffect(() => {
        const init = async () => {
            try {
                const res = await client.get('/moderator/war-room/stats');
                setAlliances(res.data);
                if (res.data.length > 0) setActiveAlliance(res.data[0].id);
            } catch (err) { toast.error("Failed to load alliances"); }
        };
        void init();
    }, []);

    useEffect(() => {
        if (activeAlliance) void fetchData();
    }, [activeAlliance]);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const aid = parseInt(activeAlliance);
            const sRes = await client.get(`/moderator/squads/${aid}`);
            setSquads(sRes.data || []);
        } catch (err) {
            console.error(err);
            toast.error("Failed to refresh squad data");
        } finally {
            if (!silent) setLoading(false);
        }
    };


    const infantry = useMemo(() => {
        const aid = parseInt(activeAlliance);
        if (!aid || !players) return [];

        return players.filter(p => {
            const inAlliance = Number(p.fightingAllianceId) === Number(aid);

            const noTeam = !p.teamId;

            const matchesSearch = p.nickname.toLowerCase().includes(searchTerm.toLowerCase());

            return inAlliance && noTeam && matchesSearch;
        });
    }, [players, searchTerm, activeAlliance]);

    const squadRosters = useMemo(() => {
        const map = {};
        squads.forEach(s => map[s.id] = []);
        players.forEach(p => {
            if (p.teamId && map[p.teamId]) {
                map[p.teamId].push(p);
            }
        });
        return map;
    }, [players, squads]);


    const handlePromote = async (fid) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/squads/promote', {
                fid,
                allianceId: parseInt(activeAlliance)
            });
            toast.success("Squad created!");

            await refreshGlobalData(true);
            await fetchData(true);
        } catch (err) {
            toast.error("Promotion failed");
            await fetchData();
        }
    };

    const handleDemote = async (teamId) => {
        if (!isAdmin) return;
        if (!window.confirm("Disband this squad?")) return;
        try {
            await client.post('/moderator/squads/demote', { teamId });
            toast.info("Squad disbanded");

            await refreshGlobalData(true);
            await fetchData(true);
        } catch (err) { toast.error("Demotion failed"); }
    };

    const handleDrop = async (e, teamId) => {
        e.preventDefault();
        if (!isAdmin || !draggedPlayerId) return;

        try {
            await client.post('/moderator/squads/assign', {
                fid: draggedPlayerId,
                teamId: teamId
            });

            await refreshGlobalData(true);
            await fetchData(true);
        } catch (err) {
            toast.error("Move failed");
            await fetchData();
        } finally {
            setDraggedPlayerId(null);
        }
    };

    const handleDragStart = (e, fid) => {
        if (!isAdmin) return;
        setDraggedPlayerId(fid);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!isAdmin) return;
        e.dataTransfer.dropEffect = "move";
    };

    const handleRemoveMember = async (fid) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/squads/assign', {
                fid: fid,
                teamId: null
            });

            await refreshGlobalData(true);
            await fetchData(true);
            toast.info("Member removed from squad");
        } catch (err) {
            toast.error("Failed to remove member");
        }
    };

    const handleAnnounceSquads = async () => {
        let description = "Current Squad formations for the event:\n\n";
        squads.forEach(sq => {
            const captain = players.find(p => p.fid === sq.captainFid);
            const roster = players.filter(p => p.teamId === sq.id);
            description += `**🛑 Squad ${sq.id}**\n`;
            description += `👑 **Lead:** ${captain ? captain.nickname : 'No Captain Assigned'}\n`;
            const joiners = roster.filter(p => p.fid !== sq.captainFid);
            if (joiners.length > 0) {
                joiners.forEach(j => { description += `  ↳ ${j.nickname}\n`; });
            } else {
                description += `  ↳ *No joiners assigned yet*\n`;
            }
            description += `\n`;
        });

        try {
            await client.post('/moderator/discord/announce', {
                title: "🛡️ Squad Assignments Finalized",
                description: description,
                color: 3447003
            });
            toast.success("Squads announced to Discord!");
        } catch (err) { toast.error("Failed to announce squads."); }
    };

    if (loading || globalLoading) {
        return <div className="h-screen bg-gray-900 flex items-center justify-center text-white font-mono">LOADING SQUAD COMMAND...</div>;
    }

    return (
        <div className="h-screen bg-gray-900 text-gray-100 flex flex-col font-sans overflow-hidden">
            {/* HEADER */}
            <div className="h-16 bg-gray-800 border-b border-gray-700 flex justify-between items-center px-6 shrink-0 z-10 shadow-md">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 bg-gray-900 rounded-lg text-gray-400 hover:text-white border border-gray-700">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl font-bold flex items-center text-white">
                        <Sword className="mr-3 text-purple-500 w-6 h-6" /> Squad Management
                    </h1>

                    {isAdmin && (
                        <button
                            onClick={handleAnnounceSquads}
                            className="ml-4 flex items-center space-x-2 px-4 py-1.5 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded-lg transition-colors text-xs font-bold uppercase drop-shadow-md"
                        >
                            <Megaphone size={14} />
                            <span>Announce</span>
                        </button>
                    )}
                </div>

                {/* Alliance Tabs */}
                <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                    {alliances.map(a => (
                        <button
                            key={a.id}
                            onClick={() => setActiveAlliance(a.id)}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                                parseInt(activeAlliance) === a.id
                                    ? 'bg-red-600 text-white shadow'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {a.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: INFANTRY POOL (Sidebar) */}
                <div className="w-[350px] flex flex-col border-r border-gray-700 bg-gray-800/30">
                    <div className="p-4 border-b border-gray-700 bg-gray-800">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Unassigned Infantry</h2>
                            <span className="bg-gray-700 text-white text-xs px-2 py-0.5 rounded">{infantry.length}</span>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full bg-gray-900 border border-gray-600 rounded pl-9 pr-2 py-1.5 text-sm outline-none focus:border-blue-500"
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div
                        className="flex-1 overflow-y-auto p-3 space-y-2"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        {infantry.length === 0 && <div className="text-center text-gray-500 text-sm mt-10">No unassigned troops in this alliance</div>}
                        {infantry.map(p => (
                            <div
                                key={p.fid}
                                draggable={isAdmin}
                                onDragStart={(e) => handleDragStart(e, p.fid)}
                                className={`bg-gray-700/50 border border-gray-600 rounded p-2 flex items-center gap-2 transition-colors ${
                                    isAdmin ? 'cursor-grab hover:bg-gray-600' : 'cursor-default opacity-80'
                                }`}
                            >
                                <img alt="avatar" src={p.avatar} className="w-8 h-8 rounded-full bg-black" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate text-gray-200">{p.nickname}</div>
                                    <div className="text-yellow-500 font-mono text-xs">{p.power?.toLocaleString()}</div>
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={() => handlePromote(p.fid)}
                                        className="p-1.5 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/40 rounded transition-colors"
                                        title="Promote to Captain"
                                    >
                                        <Crown className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: SQUADS GRID */}
                <div className="flex-1 bg-gray-900 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {squads.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-600">
                                <Users className="w-16 h-16 mb-4 opacity-20" />
                                <p>No squads formed yet.</p>
                                <p className="text-sm">Promote a player from the left to create a squad.</p>
                            </div>
                        )}
                        {squads.map(sq => {
                            const roster = squadRosters[sq.id] || [];
                            const captain = roster.find(p => p.fid === sq.captainFid) || { nickname: sq.name, avatar: 'https://via.placeholder.com/40' };
                            return (
                                <div
                                    key={sq.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, sq.id)}
                                    className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-[320px]"
                                >
                                    <div className="p-3 bg-gray-750 border-b border-gray-600 flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <img alt="avatar" src={captain.avatar} className="w-10 h-10 rounded-full border-2 border-yellow-500" />
                                                <Crown className="w-4 h-4 text-yellow-500 absolute -top-2 -right-1 fill-current" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-white text-sm w-24" title={captain.nickname}>{captain.nickname}</div>
                                                <div className="text-yellow-500 font-mono text-xs">{sq.totalPower.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <button onClick={() => handleDemote(sq.id)} className="text-gray-600 hover:text-red-500 transition-colors p-1">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-800/50 scrollbar-thin scrollbar-thumb-gray-600">
                                        {roster.filter(p => p.fid !== sq.captainFid).map(p => (
                                            <div key={p.fid} className="bg-gray-700/30 rounded p-1.5 flex items-center gap-2 text-xs group transition-colors hover:bg-gray-700/60">
                                                <img alt="avatar" src={p.avatar} className="w-6 h-6 rounded-full" />
                                                <span className="text-gray-300 truncate flex-1">{p.nickname}</span>
                                                <span className="text-yellow-600 font-mono">{p.power?.toLocaleString()}</span>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => handleRemoveMember(p.fid)}
                                                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-500 transition-opacity"
                                                        title="Remove from squad"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {roster.length <= 1 && <div className="text-center text-xs text-gray-600 italic py-4">Drag infantry here</div>}
                                    </div>
                                    <div className="p-2 bg-gray-800 border-t border-gray-700 text-center">
                                        <span className="text-xs text-blue-400 font-bold">{roster.length} Members</span>
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
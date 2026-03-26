import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
    Crown, Trash2, Search, Sword, Megaphone, X, ChevronRight
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { useRateLimit } from '../hooks/useRateLimit';

export default function Squads() {
    const { user } = useAuth();
    const { features } = useApp();
    const isAdmin = user?.role === 'admin';
    const isMod = user?.role === 'moderator';

    const { roster: players, globalLoading, refreshGlobalData } = useApp();

    // --- STATE ---
    const [activeAlliance, setActiveAlliance] = useState(null);
    const [alliances, setAlliances] = useState([]);
    const [squads, setSquads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draggedPlayerId, setDraggedPlayerId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [mobileTab, setMobileTab] = useState('infantry');

    // --- Rate Limiter Setup for Discord Announcement ---
    const postAnnounceData = (payload) => client.post('/moderator/discord/announce', payload);
    const {
        execute: executeAnnounce,
        isPending: isAnnouncePending,
        cooldown: announceCooldown
    } = useRateLimit(postAnnounceData);

    useEffect(() => {
        const init = async () => {
            try {
                const res = await client.get('/moderator/war-room/stats');

                // ACCESS THE NESTED alliances ARRAY
                const alliancesData = res.data.alliances || [];

                setAlliances(alliancesData);

                // USE THE EXTRACTED ARRAY FOR LENGTH CHECK
                if (alliancesData.length > 0) {
                    setActiveAlliance(alliancesData[0].id);
                }
            } catch (err) {
                console.error(err);
                toast.error("Failed to load alliances");
            }
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
            toast.error("Failed to refresh squad data");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // --- ACTIONS (STRICTLY FROM SOURCE) ---
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
            setSelectedPlayer(null);
        } catch (err) { toast.error("Promotion failed"); }
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

    const handleAssign = async (fid, teamId) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/squads/assign', {
                fid: fid,
                teamId: teamId
            });
            await refreshGlobalData(true);
            await fetchData(true);
            setSelectedPlayer(null);
        } catch (err) { toast.error("Move failed"); }
    };

    const handleAnnounceSquads = async () => {
        if (!isAdmin) return;

        // Find the current alliance name based on the activeAlliance ID
        const currentAlliance = alliances.find(a => a.id === parseInt(activeAlliance));
        const allianceName = currentAlliance ? currentAlliance.name : "Unknown Alliance";

        let description = `Current Squad formations for **${allianceName}**:\n\n`;

        squads.forEach(sq => {
            const captain = (players || []).find(p => p.fid === sq.captainFid);
            const roster = (players || []).filter(p => p.teamId === sq.id);

            description += `👑 **Lead:** ${captain ? captain.nickname : 'No Captain Assigned'}\n`;

            const joiners = roster.filter(p => p.fid !== sq.captainFid);
            if (joiners.length > 0) {
                joiners.forEach(j => {
                    description += `  ↳ ${j.nickname}\n`;
                });
            } else {
                description += `  ↳ *No joiners assigned yet*\n`;
            }
            description += `\n`;
        });

        try {
            await executeAnnounce({
                title: "🛡️ Squad Assignments Finalized",
                description: description,
                color: 3447003
            });
            toast.success(`Squads for ${allianceName} announced!`);
        } catch (err) {
            if (err?.response?.status !== 429) {
                toast.error("Failed to announce squads.");
            }
        }
    };

    // --- LOGIC ---
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
        (squads || []).forEach(s => map[s.id] = []);
        (players || []).forEach(p => {
            if (p.teamId && map[p.teamId]) map[p.teamId].push(p);
        });
        return map;
    }, [players, squads]);

    // --- INTERACTION ---
    const handleDragStart = (e, fid) => {
        if (!isAdmin) return e.preventDefault();
        setDraggedPlayerId(fid);
    };

    const handleDrop = (e, teamId) => {
        e.preventDefault();
        if (!isAdmin || !draggedPlayerId) return;
        void handleAssign(draggedPlayerId, teamId);
        setDraggedPlayerId(null);
    };

    const handleMobileSelect = (p) => {
        if (isMod) return;
        setSelectedPlayer(p);
        if (window.innerWidth < 1024) setMobileTab('squads');
    };

    const isAnnounceLocked = isAnnouncePending || announceCooldown > 0;

    const headerActions = (
        <div className="flex gap-2">
            {isAdmin && features?.Discord && squads.length > 0 && (
                <button
                    onClick={handleAnnounceSquads}
                    disabled={isAnnounceLocked}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        isAnnounceLocked
                            ? 'bg-gray-800/80 text-gray-500 border border-gray-700 cursor-not-allowed'
                            : 'bg-blue-900/20 text-blue-400 border border-blue-800/50 hover:bg-blue-900/40'
                    }`}
                >
                    <Megaphone size={14} className={(!isAnnouncePending && announceCooldown === 0) ? "animate-pulse" : ""} />
                    {isAnnouncePending ? 'Sending...' : announceCooldown > 0 ? `Wait ${announceCooldown}s` : 'Announce'}
                </button>
            )}
        </div>
    );

    if (loading || globalLoading) return <div className="p-10 text-white font-mono bg-gray-950 min-h-screen uppercase tracking-widest animate-pulse">Synchronizing Squad Intel...</div>;

    return (
        <AdminLayout title="Squad Management" actions={headerActions}>
            <div className="flex flex-col lg:flex-row h-[calc(100dvh-64px)] lg:h-full overflow-hidden bg-gray-950 relative">

                {/* --- MOBILE TABS --- */}
                <div className="lg:hidden flex bg-gray-900 p-2 border-b border-gray-800 shrink-0 gap-2 z-10">
                    <button onClick={() => setMobileTab('infantry')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'infantry' ? 'bg-red-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}>
                        Unassigned ({infantry.length})
                    </button>
                    <button onClick={() => setMobileTab('squads')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'squads' ? 'bg-red-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}>
                        Squads
                    </button>
                </div>

                {/* 1. INFANTRY SIDEBAR */}
                <aside className={`w-full lg:w-80 bg-gray-900 border-b lg:border-r border-gray-800 flex-1 lg:flex-none lg:shrink-0 min-h-0 overflow-hidden ${mobileTab === 'infantry' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>

                    {/* Alliance Selector */}
                    <div className="p-2 flex gap-1 overflow-x-auto bg-black/20 custom-scrollbar shrink-0">
                        {(alliances || []).map(a => (
                            <button
                                key={a.id}
                                onClick={() => setActiveAlliance(a.id)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                    parseInt(activeAlliance) === a.id ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {a.name}
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-b border-gray-800 bg-gray-900/50 space-y-3 shrink-0">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-black uppercase text-gray-500">Unassigned</h3>
                            <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded-full font-bold text-blue-400">{infantry.length}</span>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text" placeholder="Search Players..."
                                className="w-full bg-black border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none"
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {infantry.map(p => (
                            <div
                                key={p.fid}
                                draggable={isAdmin}
                                onDragStart={(e) => handleDragStart(e, p.fid)}
                                onClick={() => handleMobileSelect(p)}
                                className={`
                                    p-3 rounded-2xl border transition-all select-none
                                    ${isMod ? 'cursor-default border-gray-800' : 'cursor-pointer'}
                                    ${selectedPlayer?.fid === p.fid ? 'bg-red-600 border-red-400 scale-95 shadow-lg' : 'bg-gray-950 border-gray-800 hover:border-gray-700'}
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <img src={p.avatar} className="w-10 h-10 rounded-xl object-cover" alt="" />
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-[11px] font-black ${selectedPlayer?.fid === p.fid ? 'text-white' : 'text-gray-200'}`}>{p.nickname}</p>
                                        <p className="text-[9px] font-mono text-yellow-600">{(p.power || 0).toLocaleString()}</p>
                                        <p className="text-[9px] font-mono text-gray-400 border-gray-700">{p.allianceName}</p>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            aria-label={`Promote ${p.nickname}`}
                                            onClick={(e) => { e.stopPropagation(); void handlePromote(p.fid); }}
                                            className="p-1.5 bg-yellow-600/10 text-yellow-500 hover:bg-yellow-600 hover:text-white rounded-lg transition-all"
                                        >
                                            <Crown size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* 2. SQUADS GRID */}
                <main className={`flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-950 ${selectedPlayer ? 'pb-32' : 'pb-12'} lg:pb-6 ${mobileTab === 'squads' ? 'block' : 'hidden lg:block'}`}>
                    
                    {squads.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-700 opacity-50 pb-20">
                            <Sword size={48} className="mb-4" />
                            <p className="font-black uppercase tracking-widest text-sm">No Squads Created</p>
                            <p className="text-[10px] mt-2 font-bold uppercase tracking-widest">Promote a player to begin</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {(squads || []).map(sq => {
                            const roster = squadRosters[sq.id] || [];
                            const captain = roster.find(p => p.fid === sq.captainFid) || { nickname: 'Player Lead', avatar: '' };

                            return (
                                <div
                                    key={sq.id}
                                    data-testid={`squad-card-${sq.id}`}
                                    onDragOver={(e) => isAdmin && e.preventDefault()}
                                    onDrop={(e) => handleDrop(e, sq.id)}
                                    onClick={() => isAdmin && selectedPlayer && handleAssign(selectedPlayer.fid, sq.id)}
                                    className={`
                                        bg-gray-900 rounded-3xl border transition-all flex flex-col min-h-[320px] overflow-hidden
                                        ${selectedPlayer && isAdmin ? 'border-red-500 ring-2 ring-red-500/10 cursor-crosshair' : 'border-gray-800 shadow-2xl'}
                                    `}
                                >
                                    {/* Squad Header */}
                                    <div className="p-4 bg-gray-900/80 border-b border-gray-800 flex justify-between items-center">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <img src={captain.avatar || "https://via.placeholder.com/40"} className="w-10 h-10 rounded-xl border-2 border-yellow-500 object-cover" alt="" />
                                                <Crown size={12} className="absolute -top-1.5 -right-1.5 text-yellow-500 fill-yellow-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-black text-white">{captain.nickname}</h4>
                                                <p className="text-[10px] text-yellow-600 font-mono font-bold tracking-tighter">{(sq.totalPower || 0).toLocaleString()}</p>
                                                <p className="text-[9px] font-mono text-gray-400 border-gray-700">{captain.allianceName}</p>
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <button aria-label="Disband Squad" onClick={(e) => { e.stopPropagation(); void handleDemote(sq.id); }} className="p-2 text-gray-500 hover:text-red-500 transition-all">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Squad Members */}
                                    <div className="flex-1 p-4 space-y-2 content-start">
                                        {roster.filter(p => p.fid !== sq.captainFid).map(p => (
                                            <div key={p.fid} className="flex items-center justify-between p-2 bg-black/40 border border-gray-800 rounded-xl group hover:border-gray-600 transition-all">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <img src={p.avatar} className="w-7 h-7 rounded-lg object-cover grayscale group-hover:grayscale-0" alt="" />
                                                    <span className="text-[11px] font-bold text-gray-400 group-hover:text-white tracking-tighter">{p.nickname}</span>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        aria-label={`Remove ${p.nickname}`}
                                                        onClick={(e) => { e.stopPropagation(); void handleAssign(p.fid, null); }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-500 transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {roster.length <= 1 && (
                                            <div className="h-32 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center text-gray-700">
                                                <Sword size={20} className="mb-2 opacity-10" />
                                                <p className="text-[9px] font-black uppercase tracking-widest">Awaiting Soldiers</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-800 text-[10px] font-black uppercase text-center text-gray-500">
                                        {roster.length} / 8 Members
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>

                {selectedPlayer && isAdmin && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] lg:hidden animate-bounce">
                        <div className="bg-red-600 text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-red-400">
                            <ChevronRight size={16} /> Assign to Squad
                        </div>
                    </div>
                )}
            </div>

            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
            `}</style>
        </AdminLayout>
    );
}
import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import {
    Shield, Lock, Unlock,
    Megaphone, RotateCcw, Search, UserPlus, X, ChevronRight,
    ChevronDown, CheckSquare, Square, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import formatPower from '../components/FormatPower.jsx';
import { useRateLimit } from '../hooks/useRateLimit';

const MultiSelectDropdown = ({ options, selected, onChange, placeholder, activeColorClass }) => {
    const [isOpen, setIsOpen] = useState(false);
    const toggleOption = (opt) => {
        if (selected.includes(opt)) onChange(selected.filter(v => v !== opt));
        else onChange([...selected, opt]);
    };
    return (
        <div className="relative">
            <div onClick={() => setIsOpen(!isOpen)} className={`bg-black border rounded-lg p-2 text-[10px] outline-none cursor-pointer flex justify-between items-center transition-colors ${selected.length > 0 ? activeColorClass : 'border-gray-800 text-gray-400 hover:border-gray-700'}`}>
                <span className="truncate font-black uppercase tracking-widest">{selected.length === 0 ? placeholder : `${selected.length} Selected`}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
            {isOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-1">
                        {options.map(opt => {
                            const isSelected = selected.includes(opt);
                            return (
                                <button key={opt} onClick={() => toggleOption(opt)} className={`flex items-center gap-2 px-2 py-2 text-[10px] rounded-md transition-colors w-full text-left font-bold uppercase tracking-widest ${isSelected ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                                    {isSelected ? <CheckSquare size={14} className="text-blue-500 shrink-0" /> : <Square size={14} className="opacity-50 shrink-0" />}
                                    <span className="truncate">{opt}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function WarRoom() {
    const { user } = useAuth();
    const { features } = useApp();
    const isAdmin = user?.role === 'admin';
    const isMod = user?.role === 'moderator';

    const { roster: players, globalLoading, refreshGlobalData } = useApp();

    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterOptions, setFilterOptions] = useState({ troopTypes: [], battleAvailability: [], tundraAvailability: [] });

    // --- Global Event State ---
    const [eventType, setEventType] = useState('');
    const [attendanceStats, setAttendanceStats] = useState({});
    const [attendanceMap, setAttendanceMap] = useState({});

    // --- Modal States ---
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [archiveName, setArchiveName] = useState('');

    const [filterText, setFilterText] = useState('');
    const [filterTroops, setFilterTroops] = useState('All');
    const [filterAvail, setFilterAvail] = useState([]);
    const [filterTundra, setFilterTundra] = useState([]);
    const [sortBy, setSortBy] = useState('Power');
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    const [displayLimit, setDisplayLimit] = useState(30);
    const [mobileTab, setMobileTab] = useState('bench');

    const postAnnounceData = (payload) => client.post('/moderator/discord/announce', payload);
    const { execute: executeAnnounce, isPending: isAnnouncePending, cooldown: announceCooldown } = useRateLimit(postAnnounceData);

    useEffect(() => { void fetchData(); }, []);

    useEffect(() => {
        const fetchAttendanceStats = async () => {
            if (!eventType) {
                setAttendanceStats({});
                return;
            }
            try {
                const res = await client.get(`/moderator/war-room/attendance-stats?eventType=${eventType}`);
                const map = {};
                (res.data || []).forEach(s => { map[s.fid] = s.score; });
                setAttendanceStats(map);
            } catch (err) { console.error("Failed to fetch attendance stats"); }
        };
        void fetchAttendanceStats();
    }, [eventType]);

    useEffect(() => {
        const handleSync = () => { void fetchData(true); };
        window.addEventListener('REFRESH_WARROOM', handleSync);
        return () => window.removeEventListener('REFRESH_WARROOM', handleSync);
    }, []);

    const fetchData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const [sRes, fRes] = await Promise.all([
                client.get('/moderator/war-room/stats'),
                client.get('/moderator/war-room/filters')
            ]);
            // Extract the new nested response
            setStats(sRes.data.alliances || []);
            setEventType(sRes.data.eventType || '');
            setFilterOptions(fRes.data);
        } catch (err) {
            toast.error("Failed to load war room data");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleStartSession = async (type) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/war-room/session', { eventType: type });
            setEventType(type);
            toast.success(`Started global session for ${type}!`);
        } catch (err) {
            toast.error("Failed to lock global session");
        }
    };

    const validateAndOpenArchive = () => {
        const deployedPlayers = (players || []).filter(p => p.fightingAllianceId);
        if (deployedPlayers.length > 0) {
            const hasPending = deployedPlayers.some(p => !attendanceMap[p.fid] || attendanceMap[p.fid] === 'Pending');
            if (hasPending) return toast.error("Cannot archive: Please resolve all pending attendance records.");
        }
        setShowArchiveModal(true);
    };

    const confirmArchive = async () => {
        if (!isAdmin) return;

        try {
            const deployedPlayers = (players || []).filter(p => p.fightingAllianceId);
            const payload = {
                notes: archiveName,
                eventType: eventType,
                attendance: deployedPlayers.map(p => ({
                    fid: p.fid,
                    attendance: attendanceMap[p.fid]
                }))
            };

            await client.post('/moderator/war-room/reset', payload);
            toast.success("Event archived and board wiped!");

            setAttendanceMap({});
            setArchiveName('');
            setShowArchiveModal(false);

            void fetchData(true);
            await refreshGlobalData(true);
        } catch (err) {
            toast.error("Failed to reset event data.");
        }
    };

    const toggleLock = async (allianceId, currentLock) => {
        if (!isAdmin) return;
        try {
            await client.post('/moderator/war-room/lock', { allianceId, isLocked: !currentLock });
            await fetchData(true);
        } catch (err) { toast.error("Failed to update lock"); }
    };

    const handleDeploy = async (fid, allianceId) => {
        if (isMod) return toast.warning("Moderators have read-only access.");
        try {
            await client.post('/moderator/war-room/deploy', { playerIds: [parseInt(fid)], allianceId: allianceId });
            if (allianceId !== null) setAttendanceMap(prev => ({ ...prev, [fid]: 'Pending' }));
            await refreshGlobalData(true);
            await fetchData(true);
            setSelectedPlayer(null);
        } catch (err) { toast.error("Deployment failed"); }
    };

    const handleManualAttendance = (fid, status) => {
        if (!isAdmin) return;
        setAttendanceMap(prev => ({ ...prev, [fid]: status }));
    };

    const handleBulkAttendance = (allianceId, status) => {
        if (!isAdmin) return;
        const members = (players || []).filter(p => p.fightingAllianceId === allianceId);
        setAttendanceMap(prev => {
            const nextMap = { ...prev };
            members.forEach(m => { nextMap[m.fid] = status; });
            return nextMap;
        });
    };

    const handleAnnounceWarRoom = async () => {
        if (!isAdmin) return;
        let description = `Here are the confirmed deployments for the upcoming **${eventType}** battle:\n\n`;

        stats.forEach(alliance => {
            const members = (players || []).filter(p => p.fightingAllianceId === alliance.id);
            if (members.length > 0) {
                description += `**🛡️ ${alliance.name} (${members.length} Members)**\n`;
                members.forEach(m => {
                    const allianceTag = m.allianceName ? `[${m.allianceName}]` : '[None]';
                    description += `• ${allianceTag} ${m.nickname}\n`;
                });
                description += `\n`;
            }
        });

        try {
            await executeAnnounce({ title: `⚔️ War Room Locked & Deployed`, description: description, color: 15158332 });
            toast.success("War Room deployed to Discord!");
        } catch (err) {
            if (err?.response?.status !== 429) toast.error("Failed to announce deployments.");
        }
    };

    const filteredPlayers = useMemo(() => {
        return (players || []).filter(p => {
            const matchesText = (p.nickname || '').toLowerCase().includes(filterText.toLowerCase()) || (p.fid || '').toString().includes(filterText);
            const matchesTroops = filterTroops === 'All' || p.troopType === filterTroops;
            const matchesAvail = filterAvail.length === 0 || filterAvail.includes(p.battleAvailability);
            let matchesTundra = true;
            if (filterTundra.length > 0) {
                matchesTundra = filterTundra.some(slot => {
                    if (slot === '02:00') return p.avail_0200;
                    if (slot === '07:00') return p.avail_0700;
                    if (slot === '12:00') return p.avail_1200;
                    if (slot === '14:00') return p.avail_1400;
                    if (slot === '19:00') return p.avail_1900;
                    if (slot === 'Boost') return p.avail_PB;
                    return false;
                });
            }
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
        if (window.innerWidth < 1024) setMobileTab('alliances');
    };

    const renderPlayerBadge = (fid) => {
        const reliability = attendanceStats[fid];
        if (reliability === undefined) return null;
        return (
            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest ${
                reliability >= 85 ? 'bg-green-900/40 text-green-400 border border-green-800/50' :
                    reliability >= 50 ? 'bg-yellow-900/40 text-yellow-500 border border-yellow-800/50' :
                        'bg-red-900/40 text-red-400 border border-red-800/50'
            }`}>
                {reliability}%
            </span>
        );
    };

    const headerActions = (
        <div className="flex gap-2 items-center">

            {eventType && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-900/20 border border-green-800 rounded-lg mr-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-green-400 tracking-widest">{eventType} Session</span>
                </div>
            )}

            {isAdmin && eventType && (
                <button onClick={validateAndOpenArchive} className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-800/50 rounded-lg text-[10px] font-black uppercase transition-colors hover:bg-red-900/40">
                    <RotateCcw size={14} /> <span className="hidden sm:inline">Archive & Reset</span>
                </button>
            )}

            {isAdmin && features?.Discord && stats.some(a => a.isLocked) && (
                <button
                    onClick={handleAnnounceWarRoom}
                    disabled={isAnnouncePending || announceCooldown > 0}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors ${
                        isAnnouncePending || announceCooldown > 0
                            ? 'bg-gray-800/50 text-gray-500 border border-gray-700/50 cursor-not-allowed'
                            : 'bg-blue-900/20 text-blue-400 border border-blue-800/50 hover:bg-blue-900/40'
                    }`}
                >
                    <Megaphone size={14} className={(!isAnnouncePending && announceCooldown === 0) ? "animate-pulse" : ""} />
                    <span className="hidden sm:inline">
                        {isAnnouncePending ? 'Sending...' : announceCooldown > 0 ? `Wait ${announceCooldown}s` : 'Announce'}
                    </span>
                </button>
            )}
        </div>
    );

    if (loading || globalLoading) return <div className="p-10 text-white font-mono bg-gray-950 min-h-screen">LOADING STRATEGIC ASSETS...</div>;

    return (
        <AdminLayout title="War Room" actions={headerActions}>
            <div className="flex flex-col lg:flex-row h-[calc(100dvh-64px)] lg:h-full overflow-hidden bg-gray-950 relative">

                {/* 1. NULL STATE / INIT MODAL OVERLAY */}
                {!eventType && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center animate-in zoom-in-95">
                            <Shield className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Initialize Session</h2>
                            <p className="text-gray-400 text-sm mb-8">Select the upcoming event type to lock the War Room globally and load historical reliability data.</p>

                            {isAdmin ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {['SvS', 'Tyrant', 'Tundra'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => handleStartSession(type)}
                                            className="bg-gray-800 hover:bg-blue-600 border border-gray-700 hover:border-blue-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-lg hover:scale-105"
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-yellow-900/20 border border-yellow-700/50 text-yellow-500 p-4 rounded-xl text-sm font-bold uppercase tracking-widest animate-pulse">
                                    Waiting for an Admin to start the session...
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 2. ARCHIVE MODAL */}
                {showArchiveModal && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
                            <div className="flex items-center gap-3 text-red-500 mb-4">
                                <AlertTriangle size={24} />
                                <h2 className="text-xl font-black uppercase tracking-widest">Archive Session</h2>
                            </div>
                            <p className="text-gray-400 text-sm mb-6">This will clear the War Room and save all attendance data permanently. Name this event for the history ledger.</p>

                            <input
                                type="text"
                                placeholder="e.g. Vs State 390"
                                value={archiveName}
                                onChange={(e) => setArchiveName(e.target.value)}
                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none mb-6 font-bold"
                            />

                            <div className="flex gap-3">
                                <button onClick={() => setShowArchiveModal(false)} className="flex-1 py-3 bg-gray-800 text-gray-400 font-bold uppercase rounded-xl hover:bg-gray-700 transition-colors">Cancel</button>
                                <button onClick={confirmArchive} className="flex-1 py-3 bg-red-600 text-white font-black uppercase rounded-xl hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20">Confirm</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Tabs */}
                <div className="lg:hidden flex bg-gray-900 p-2 border-b border-gray-800 shrink-0 gap-2">
                    <button onClick={() => setMobileTab('bench')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'bench' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}>Bench ({filteredPlayers.length})</button>
                    <button onClick={() => setMobileTab('alliances')} className={`flex-1 py-2.5 text-xs font-black uppercase rounded-lg transition-colors ${mobileTab === 'alliances' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 bg-gray-800 hover:text-white'}`}>Deployments</button>
                </div>

                <aside className={`w-full lg:w-80 bg-gray-900 border-b lg:border-r border-gray-800 flex-1 lg:flex-none lg:shrink-0 min-h-0 overflow-hidden ${mobileTab === 'bench' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col h-full'}`}>
                    <div className="p-4 space-y-3 bg-gray-900/50 border-b border-gray-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input type="text" placeholder="Filter Players..." className="w-full bg-black border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none" value={filterText} onChange={e => {setFilterText(e.target.value); setDisplayLimit(30);}} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <select value={filterTroops} onChange={e => {setFilterTroops(e.target.value); setDisplayLimit(30);}} className="bg-black border border-gray-800 text-[10px] rounded-lg p-1 text-gray-400 outline-none font-black uppercase tracking-widest cursor-pointer">
                                <option value="All">All Troops</option>
                                {(filterOptions.troopTypes || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <MultiSelectDropdown options={filterOptions.battleAvailability || []} selected={filterAvail} onChange={(newSelection) => { setFilterAvail(newSelection); setDisplayLimit(30); }} placeholder="Battle Avail" activeColorClass="border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]" />
                            <MultiSelectDropdown options={filterOptions.tundraAvailability || []} selected={filterTundra} onChange={(newSelection) => { setFilterTundra(newSelection); setDisplayLimit(30); }} placeholder="Tundra Slots" activeColorClass="border-purple-500 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {filteredPlayers.slice(0, displayLimit).map(p => (
                            <div key={p.fid} draggable={!isMod} onDragStart={(e) => onDragStart(e, p.fid)} onClick={() => handleMobileSelect(p)} className={`p-3 rounded-2xl border transition-all select-none ${isMod ? 'cursor-default border-gray-800' : 'cursor-pointer'} ${selectedPlayer?.fid === p.fid ? 'bg-blue-600 border-blue-400 scale-95 shadow-lg' : 'bg-gray-950 border-gray-800 hover:border-gray-700'}`}>
                                <div className="flex items-center gap-3">
                                    <div className="relative shrink-0">
                                        <img src={p.avatar} className="w-10 h-10 rounded-xl object-cover" alt="" />
                                        {p.stoveImg && <img src={p.stoveImg} className="absolute -bottom-1 -right-1 w-5 h-5 object-contain" alt="" />}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-[11px] font-black truncate ${selectedPlayer?.fid === p.fid ? 'text-white' : 'text-gray-200'}`}>{p.nickname}</p>
                                            {renderPlayerBadge(p.fid)}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <div className={`text-[8px] px-1.5 rounded-sm border font-black uppercase tracking-tighter ${getTroopColor(p.troopType)}`}>{p.troopType || 'NONE'}</div>
                                            <div className={`text-[8px] px-1.5 rounded-sm border font-black tracking-tighter text-gray-400 border-gray-700 bg-gray-800/40`}>{p.allianceName || 'NONE'}</div>
                                        </div>
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <span className="text-[9px] text-blue-400 font-mono" title="Base Power">⚡ ⚡ {formatPower(p.normalPower)}</span>
                                            <span className="text-[9px] text-gray-600">|</span>
                                            <span className="text-[9px] text-yellow-500 font-mono" title="Tundra Power">⚔️ {formatPower(p.power)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredPlayers.length > displayLimit && (
                            <button onClick={() => setDisplayLimit(prev => prev + 30)} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors border-t border-gray-800 mt-2">
                                + Load More ({filteredPlayers.length - displayLimit} Remaining)
                            </button>
                        )}
                    </div>
                </aside>

                <main className={`flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-950 ${selectedPlayer ? 'pb-32' : 'pb-12'} lg:pb-6 ${mobileTab === 'alliances' ? 'block' : 'hidden lg:block'}`}>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {(stats || []).map(alliance => {
                            const roster = (players || []).filter(p => p.fightingAllianceId === alliance.id);
                            const isLocked = alliance.isLocked;
                            const totalBasePower = roster.reduce((sum, p) => sum + (p.normalPower || 0), 0);
                            const totalTundraPower = roster.reduce((sum, p) => sum + (p.power || 0), 0);

                            return (
                                <div key={alliance.id} data-testid={`alliance-dropzone-${alliance.id}`} onDragOver={(e) => !isLocked && !isMod && e.preventDefault()} onDrop={(e) => !isLocked && !isMod && onDrop(e, alliance.id)} onClick={() => !isLocked && !isMod && selectedPlayer && handleDeploy(selectedPlayer.fid, alliance.id)} className={`bg-gray-900 rounded-3xl border transition-all flex flex-col overflow-hidden min-h-[400px] ${selectedPlayer && !isLocked && !isMod ? 'border-blue-500 ring-4 ring-blue-500/20 animate-pulse scale-[1.02] cursor-crosshair' : 'border-gray-800 shadow-2xl'} ${isLocked ? 'bg-red-950/5' : ''}`}>
                                    <div className={`p-4 flex justify-between items-center border-b ${isLocked ? 'bg-red-900/10 border-red-900/20' : 'bg-gray-900/50 border-gray-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <Shield size={20} className={isLocked ? 'text-red-500' : 'text-blue-500'} />
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-tighter">{alliance.name}</h4>
                                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                                                    {roster.length} PLAYERS •
                                                    <span className="text-blue-400"> ⚡ {formatPower(totalBasePower)}</span> •
                                                    <span className="text-yellow-500"> ⚔️ {formatPower(totalTundraPower)}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isAdmin && isLocked && (
                                                <div className="hidden sm:flex items-center gap-1 mr-2 bg-gray-950 p-1 rounded-lg border border-gray-800">
                                                    <button onClick={(e) => { e.stopPropagation(); handleBulkAttendance(alliance.id, 'Attended'); }} className="p-1 text-green-500 hover:bg-green-500/20 rounded-md transition-colors" title="Mark All YES"><CheckCircle2 size={14} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleBulkAttendance(alliance.id, 'Majority'); }} className="p-1 text-blue-400 hover:bg-blue-400/20 rounded-md transition-colors" title="Mark All MAJ"><CheckCircle2 size={14} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleBulkAttendance(alliance.id, 'Minimal'); }} className="p-1 text-orange-400 hover:bg-orange-400/20 rounded-md transition-colors" title="Mark All MIN"><CheckCircle2 size={14} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleBulkAttendance(alliance.id, 'Missed'); }} className="p-1 text-red-500 hover:bg-red-500/20 rounded-md transition-colors" title="Mark All NO"><XCircle size={14} /></button>
                                                </div>
                                            )}

                                            {isAdmin && (
                                                <button aria-label={isLocked ? `Unlock ${alliance.name}` : `Lock ${alliance.name}`} onClick={(e) => { e.stopPropagation(); void toggleLock(alliance.id, isLocked); }} className={`p-2 rounded-xl border transition-all ${isLocked ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/20' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-white'}`}>
                                                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
                                        {roster.map(m => {
                                            const pStatus = attendanceMap[m.fid] || 'Pending';
                                            return (
                                                <div key={m.fid} className="flex items-center justify-between p-2.5 bg-black/40 border border-gray-800 rounded-xl group transition-all hover:border-gray-600">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <img src={m.avatar} className="w-8 h-8 rounded-lg grayscale group-hover:grayscale-0 transition-all object-cover shrink-0 border border-gray-800" alt="" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-[11px] font-bold text-gray-300 truncate tracking-tighter group-hover:text-white">{m.nickname}</div>
                                                                {renderPlayerBadge(m.fid)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <span className="text-[9px] text-blue-400 font-mono" title="Base Power">⚡ {formatPower(m.normalPower)}</span>
                                                                <span className="text-[9px] text-gray-600">|</span>
                                                                <span className="text-[9px] text-yellow-500 font-mono" title="Tundra Power">⚔️ {formatPower(m.power)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {isAdmin && isLocked ? (
                                                            <select
                                                                value={pStatus}
                                                                onChange={(e) => { e.stopPropagation(); handleManualAttendance(m.fid, e.target.value); }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`text-[10px] font-black uppercase rounded px-1.5 py-1 outline-none border cursor-pointer ${
                                                                    pStatus === 'Attended' ? 'bg-green-900/30 text-green-400 border-green-800' :
                                                                        pStatus === 'Majority' ? 'bg-blue-900/30 text-blue-400 border-blue-800' :
                                                                            pStatus === 'Minimal' ? 'bg-orange-900/30 text-orange-400 border-orange-800' :
                                                                                pStatus === 'Missed' ? 'bg-red-900/30 text-red-400 border-red-800' :
                                                                                    pStatus === 'Exempt' ? 'bg-gray-800 text-gray-400 border-gray-600' :
                                                                                        'bg-yellow-900/30 text-yellow-500 border-yellow-800 animate-pulse'
                                                                }`}
                                                            >
                                                                <option className="bg-gray-900 text-yellow-500" value="Pending">?</option>
                                                                <option className="bg-gray-900 text-green-500" value="Attended">YES</option>
                                                                <option className="bg-gray-900 text-blue-400" value="Majority">MAJ</option>
                                                                <option className="bg-gray-900 text-orange-500" value="Minimal">MIN</option>
                                                                <option className="bg-gray-900 text-red-500" value="Missed">NO</option>
                                                                <option className="bg-gray-900 text-gray-400" value="Exempt">EXC</option>
                                                            </select>
                                                        ) : isAdmin && !isLocked ? (
                                                            <button aria-label={`Remove ${m.nickname}`} onClick={(e) => { e.stopPropagation(); void handleDeploy(m.fid, null); }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 text-red-500 lg:hover:bg-red-500/10 rounded-lg transition-all">
                                                                <X size={14} />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            )})}
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

                {selectedPlayer && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] lg:hidden animate-in slide-in-from-bottom-5">
                        <div className="bg-blue-600 text-white pl-6 pr-2 py-2 rounded-full font-black text-xs tracking-widest shadow-2xl flex items-center gap-4 border border-blue-400">
                            <span className="flex items-center gap-2"><ChevronRight size={16} /> Deploy {selectedPlayer.nickname.substring(0, 10)}</span>
                            <button onClick={() => setSelectedPlayer(null)} className="p-2 bg-blue-800 rounded-full hover:bg-blue-900 transition-colors"><X size={14} /></button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
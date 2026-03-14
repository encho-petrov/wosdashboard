import { useState, useEffect } from 'react';
import client from '../api/client';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import { Clock, Users, Shield, CalendarDays, ChevronDown } from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function WarRoomHistory() {
    const { alliances } = useApp();
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [snapshot, setSnapshot] = useState({ teams: [], players: [] });
    const [loading, setLoading] = useState(true);

    const [isMobileTimelineOpen, setIsMobileTimelineOpen] = useState(false);

    useEffect(() => {
        const fetchHistoryList = async () => {
            try {
                const res = await client.get('/moderator/war-room/history');
                const fetchedEvents = res.data || []; // Safety fallback
                setEvents(fetchedEvents);
                if (fetchedEvents.length > 0) {
                    setSelectedEventId(fetchedEvents[0].id);
                }
            } catch (err) {
                toast.error("Failed to load history timeline.");
            } finally {
                setLoading(false);
            }
        };
        void fetchHistoryList();
    }, []);

    useEffect(() => {
        if (!selectedEventId) return;

        const fetchSnapshotDetails = async () => {
            try {
                const res = await client.get(`/moderator/war-room/history/${selectedEventId}`);
                setSnapshot(res.data || { teams: [], players: [] });
            } catch (err) {
                toast.error("Failed to load snapshot details.");
            }
        };
        void fetchSnapshotDetails();
    }, [selectedEventId]);

    if (loading) return <div className="p-8 text-center text-blue-500 font-mono">LOADING TEMPORAL DATA...</div>;

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    const safeEvents = events || [];
    const selectedEvent = safeEvents.find(e => e.id === selectedEventId);

    // Safely extract arrays
    const safePlayers = snapshot?.players || [];
    const safeTeams = snapshot?.teams || [];

    return (
        <AdminLayout title="Event History">
            <div className="flex flex-col md:flex-row h-full overflow-hidden bg-gray-950 relative">

                {/* TIMELINE SIDEBAR (Desktop) / DROPDOWN (Mobile) */}
                <div className="w-full md:w-80 bg-gray-900 md:border-r border-gray-800 flex flex-col shrink-0 z-20">

                    {/* Desktop Header */}
                    <div className="hidden md:flex p-4 border-b border-gray-800 items-center gap-2 text-gray-400 font-black uppercase text-xs tracking-widest">
                        <Clock size={16} /> Timeline
                    </div>

                    {/* Mobile Header Toggle */}
                    <button
                        onClick={() => setIsMobileTimelineOpen(!isMobileTimelineOpen)}
                        className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 text-gray-200"
                    >
                        <div className="flex items-center gap-2 font-black uppercase text-xs tracking-widest truncate pr-4">
                            <Clock size={16} className="text-gray-400 shrink-0" />
                            <span className="truncate">
                                {selectedEvent ? (selectedEvent.notes || `Event #${selectedEvent.id}`) : 'Timeline'}
                            </span>
                        </div>
                        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${isMobileTimelineOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Timeline List */}
                    <div className={`
                        ${isMobileTimelineOpen ? 'absolute top-[57px] left-0 right-0 max-h-[60vh] z-50 shadow-2xl border-b border-gray-800 flex' : 'hidden'}
                        md:static md:flex md:flex-1 md:max-h-none md:border-b-0 md:shadow-none
                        bg-gray-900 overflow-y-auto p-2 space-y-2 custom-scrollbar flex-col
                    `}>
                        {safeEvents.length === 0 ? (
                            <div className="p-4 text-center text-gray-600 text-sm">No archived events found.</div>
                        ) : (
                            safeEvents.map(ev => (
                                <button
                                    key={ev.id}
                                    onClick={() => {
                                        setSelectedEventId(ev.id);
                                        setIsMobileTimelineOpen(false);
                                    }}
                                    className={`w-full text-left p-4 rounded-xl border transition-all shrink-0 ${
                                        selectedEventId === ev.id
                                            ? 'bg-blue-900/20 border-blue-500/50 text-blue-100'
                                            : 'bg-gray-800/50 border-gray-800 text-gray-400 hover:bg-gray-800 hover:border-gray-700'
                                    }`}
                                >
                                    <div className="font-bold text-sm truncate">{ev.notes || `Event #${ev.id}`}</div>
                                    <div className="text-xs opacity-60 flex items-center gap-1 mt-1">
                                        <CalendarDays size={12} /> {formatDate(ev.eventDate)}
                                    </div>
                                    <div className="text-[10px] mt-2 uppercase tracking-wider opacity-50">
                                        Archived by: {ev.createdBy}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Mobile Overlay Background (Click to close) */}
                    {isMobileTimelineOpen && (
                        <div
                            className="md:hidden fixed inset-0 bg-black/50 z-40 top-[121px]"
                            onClick={() => setIsMobileTimelineOpen(false)}
                        />
                    )}
                </div>

                {/* SNAPSHOT VIEWER */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {!selectedEventId ? (
                        <div className="h-full flex items-center justify-center text-gray-600">Select an event from the timeline.</div>
                    ) : (
                        <div className="space-y-12 max-w-5xl mx-auto pb-12">

                            {[...new Set([
                                ...safePlayers.map(p => p.fightingAllianceId),
                                ...safeTeams.map(t => t.fightingAllianceId)
                            ])]
                                .filter(id => id !== null && id !== undefined)
                                .map(allianceId => {
                                    const allianceObj = alliances.find(a => a.id === allianceId);
                                    const allianceName = allianceObj ? allianceObj.name : `Alliance #${allianceId}`;

                                    const alliancePlayers = safePlayers.filter(p => p.fightingAllianceId === allianceId);
                                    const allianceTeams = safeTeams.filter(t => t.fightingAllianceId === allianceId);

                                    return (
                                        <div key={allianceId} className="space-y-6">

                                            {/* ALLIANCE HEADER */}
                                            <div className="flex items-center gap-3 border-b border-gray-800 pb-2">
                                                <Shield className="text-red-500" size={24} />
                                                <h2 className="text-xl font-black text-white uppercase tracking-widest truncate">
                                                    {allianceName} <span className="text-sm text-gray-500 font-bold ml-2 shrink-0">(ID: {allianceId})</span>
                                                </h2>
                                            </div>

                                            {/* ALLIANCE ROSTER */}
                                            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                                                <h3 className="text-red-400 font-black tracking-widest uppercase text-sm mb-4">
                                                    Total Roster <span className="text-gray-500 text-xs">({alliancePlayers.length} Assigned)</span>
                                                </h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                    {alliancePlayers.map(p => {
                                                        const baseAlliance = alliances.find(a => a.id === p.allianceId);
                                                        const baseTag = baseAlliance ? `[${baseAlliance.name}]` : (p.allianceId ? `[ID: ${p.allianceId}]` : '');

                                                        return (
                                                            <div key={p.id} className="bg-gray-800 border border-gray-700 p-3 rounded-xl flex flex-col justify-center shadow-sm">
                                                                <div className="font-bold text-gray-200 text-sm truncate" title={p.nickname}>
                                                                    {p.nickname}
                                                                </div>
                                                                <div className="flex justify-between items-center mt-1">
                                                                    <span className="text-xs text-gray-500 font-mono">{p.playerId}</span>
                                                                    <span className="text-[10px] font-black text-blue-400/80 uppercase truncate pl-2">{baseTag}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* SQUADS/TEAMS */}
                                            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                                                <h3 className="text-blue-400 font-black tracking-widest uppercase text-sm mb-4 flex items-center gap-2">
                                                    <Users size={18} /> Squad Deployments
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {allianceTeams.length === 0 ? (
                                                        <div className="text-gray-600 text-sm italic">No squads created.</div>
                                                    ) : (
                                                        allianceTeams.map(team => {
                                                            const teamPlayers = safePlayers.filter(p => p.teamId === team.originalTeamId);
                                                            const captain = safePlayers.find(p => p.playerId === team.captainFid);

                                                            return (
                                                                <div key={team.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col">
                                                                    <div className="border-b border-gray-800 pb-2 mb-2">
                                                                        <h4 className="font-bold text-gray-100">{team.name}</h4>
                                                                        <div className="text-xs text-yellow-500 mt-1 uppercase tracking-wider font-bold">
                                                                            Captain: {captain ? captain.nickname : 'None'}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1 space-y-1">
                                                                        {teamPlayers.length === 0 ? (
                                                                            <div className="text-xs text-gray-600 italic mt-2">No members assigned.</div>
                                                                        ) : (
                                                                            teamPlayers.map(p => {
                                                                                const baseAlliance = alliances.find(a => a.id === p.allianceId);
                                                                                const baseTag = baseAlliance ? `[${baseAlliance.name}]` : (p.allianceId ? `[ID: ${p.allianceId}]` : '');

                                                                                return (
                                                                                    <div key={p.id} className="flex justify-between items-center py-1 border-b border-gray-800/30 last:border-0">
                                                                                        <div className="flex items-center gap-2 truncate pr-2">
                                                                                            <div className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                                                                                            <span className="text-sm text-gray-300 truncate" title={p.nickname}>
                                                                                            {p.nickname}
                                                                                                <span className="text-[10px] text-gray-600 font-mono ml-2">{p.playerId}</span>
                                                                                        </span>
                                                                                        </div>
                                                                                        <span className="text-[10px] font-bold text-blue-400/60 shrink-0 uppercase">{baseTag}</span>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

            </div>
        </AdminLayout>
    );
}
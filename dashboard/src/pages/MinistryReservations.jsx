import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import {
    Calendar, ArrowLeft, Plus, X, History, LayoutDashboard,
    Play, Archive, Bell, BellOff, Clock, Search
} from 'lucide-react';

export default function MinistryReservations() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [event, setEvent] = useState(null);
    const [schedule, setSchedule] = useState([]);
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchModal, setSearchModal] = useState({ isOpen: false, slot: null, query: '' });

    const [formBaseDate, setFormBaseDate] = useState('');
    const [createForm, setCreateForm] = useState({
        title: '', announceEnabled: true,
        days: [
            { buffName: 'Construction', activeDate: '' },
            { buffName: 'Research', activeDate: '' },
            { buffName: 'Training', activeDate: '' }
        ]
    });

    // --- History State ---
    const [viewingHistory, setViewingHistory] = useState(false);
    const [historyEvents, setHistoryEvents] = useState([]);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null);

    useEffect(() => {
        fetchData();
        fetchRoster();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await client.get('/moderator/ministry/active');
            setEvent(res.data.event);
            setSchedule(res.data.schedule || []);
        } catch (err) {
            toast.error("Failed to load ministry data");
        } finally {
            setLoading(false);
        }
    };

    const fetchRoster = async () => {
        try {
            const res = await client.get('/moderator/players');
            setRoster(res.data.players || res.data || []);
        } catch (err) { console.error("Could not load roster for search", err); }
    };

    const handleBaseDateChange = (e) => {
        const base = e.target.value;
        setFormBaseDate(base);
        if (!base) return;

        const baseDate = new Date(base);
        const formatYMD = (d) => d.toISOString().split('T')[0];
        const addDays = (date, days) => {
            const result = new Date(date);
            result.setDate(result.getDate() + days);
            return formatYMD(result);
        };

        setCreateForm(prev => ({
            ...prev,
            title: `Ministry: Week of ${base}`,
            days: [
                { buffName: 'Construction', activeDate: formatYMD(baseDate) },
                { buffName: 'Research', activeDate: addDays(baseDate, 1) },
                { buffName: 'Training', activeDate: addDays(baseDate, 3) }
            ]
        }));
    };

    const handleCreateEvent = async () => {
        if (!createForm.title || !createForm.days[0].activeDate) return toast.warning("Please fill out the dates.");
        try {
            await client.post('/moderator/ministry/events', createForm);
            toast.success("Ministry schedule generated!");
            setShowCreateModal(false);
            await fetchData();
        } catch (err) { toast.error("Failed to create event"); }
    };

    const handleUpdateStatus = async (newStatus) => {
        const msg = newStatus === 'Active' ? "Start the execution phase? Discord pings will begin." : "Archive this schedule? This cannot be undone.";
        if (!window.confirm(msg)) return;
        try {
            await client.put(`/moderator/ministry/events/${event.id}/status`, { status: newStatus });
            toast.success(`Event moved to ${newStatus}`);
            if (newStatus === 'Closed') setEvent(null);
            else await fetchData();
        } catch (err) { toast.error("Failed to change status"); }
    };

    const handleAssignSlot = async (player) => {
        const slot = searchModal.slot;
        try {
            await client.put(`/moderator/ministry/slots/${slot.id}`, {
                playerFid: player.fid,
                nickname: player.nickname
            });
            toast.success("Player assigned!");
            setSearchModal({ isOpen: false, slot: null, query: '' });
            await fetchData();
        } catch (err) { toast.error("Failed to assign player"); }
    };

    const handleClearSlot = async (slot) => {
        try {
            await client.put(`/moderator/ministry/slots/${slot.id}`, { playerFid: null, nickname: slot.nickname });
            toast.success("Slot cleared");
            await fetchData();
        } catch (err) { toast.error("Failed to clear slot"); }
    };

    const handleToggleAnnounce = async () => {
        if (!isAdmin) return;
        const newState = !event.announceEnabled;
        try {
            await client.put(`/moderator/ministry/events/${event.id}/announce`, { announceEnabled: newState });
            toast.success(`Discord Pings turned ${newState ? 'ON' : 'OFF'}`);
            await fetchData();
        } catch (err) { toast.error("Failed to toggle announcements"); }
    };

    // --- History Handlers ---
    const handleViewHistory = async () => {
        setViewingHistory(true);
        setLoading(true);
        try {
            const res = await client.get('/moderator/ministry/history');
            setHistoryEvents(res.data || []);
            if (res.data.length > 0) {
                await loadHistorySchedule(res.data[0].id);
            }
        } catch (err) {
            toast.error("Failed to load history list");
        } finally {
            setLoading(false);
        }
    };

    const loadHistorySchedule = async (id) => {
        setSelectedHistoryId(id);
        try {
            const res = await client.get(`/moderator/ministry/history/${id}`);
            setSchedule(res.data || []);
        } catch (err) {
            toast.error("Failed to load past schedule");
        }
    };

    const exitHistory = () => {
        setViewingHistory(false);
        fetchData();
    };

    const formatTimeUTC = (index) => {
        const hours = Math.floor(index / 2).toString().padStart(2, '0');
        const minutes = index % 2 === 0 ? '00' : '30';
        return `${hours}:${minutes} UTC`;
    };

    const filteredRoster = roster.filter(p => p.nickname.toLowerCase().includes(searchModal.query.toLowerCase()) || p.fid.toString().includes(searchModal.query));

    if (loading) return <div className="p-10 text-white">Loading Ministry Schedule...</div>;

    // NO ACTIVE EVENT RENDER (with History button available)
    if (!event && !viewingHistory) {
        return (
            <div className="p-10 flex flex-col items-center justify-center h-screen bg-gray-900 text-gray-300 relative">
                <Link to="/" className="absolute top-6 left-6 p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 transition-colors shadow">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <Calendar className="w-16 h-16 text-gray-600 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">No Active Ministry Event</h2>
                <p className="mb-6">Draft a new schedule to start assigning buffs, or view previous records.</p>
                <div className="flex gap-4">
                    {isAdmin && (
                        <button onClick={() => setShowCreateModal(true)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg">
                            Draft New Schedule
                        </button>
                    )}
                    <button onClick={handleViewHistory} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded font-bold shadow-lg flex items-center gap-2">
                        <History size={18} /> View History
                    </button>
                </div>

                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                        <div className="bg-gray-800 p-6 rounded-lg w-[500px] border border-gray-700 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-4">Plan Ministry Schedule</h3>
                            <label className="block text-xs text-gray-400 mb-1">Base Date (Usually Monday)</label>
                            <input type="date" className="w-full mb-4 p-2 bg-gray-900 border border-gray-700 rounded text-white"
                                   value={formBaseDate} onChange={handleBaseDateChange} />
                            <input type="text" placeholder="Event Title" className="w-full mb-4 p-2 bg-gray-900 border border-gray-700 rounded text-white font-bold"
                                   value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} />
                            <div className="space-y-3 mb-6 bg-gray-900 p-3 rounded border border-gray-700">
                                <p className="text-xs text-gray-400 uppercase font-bold border-b border-gray-700 pb-2">Dynamic Buff Dates</p>
                                {createForm.days.map((day, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                        <span className="text-sm text-gray-300 w-1/3">{day.buffName}</span>
                                        <input type="date" className="w-2/3 p-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                                               value={day.activeDate}
                                               onChange={e => {
                                                   const newDays = [...createForm.days];
                                                   newDays[idx].activeDate = e.target.value;
                                                   setCreateForm({...createForm, days: newDays});
                                               }} />
                                    </div>
                                ))}
                            </div>
                            <label className="flex items-center text-gray-300 mb-6 cursor-pointer bg-blue-900/20 p-3 rounded border border-blue-800/50">
                                <input type="checkbox" className="mr-3 w-4 h-4" checked={createForm.announceEnabled} onChange={e => setCreateForm({...createForm, announceEnabled: e.target.checked})} />
                                <Bell size={18} className="mr-2 text-blue-400" /> Enable Auto-Discord Announcements
                            </label>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                                <button onClick={handleCreateEvent} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold">Generate 144 Slots</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-6 font-sans flex flex-col h-screen">
            {/* Header */}
            <div className="flex justify-between items-end mb-4 border-b border-gray-700 pb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700 transition-colors shadow">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-black text-white flex items-center gap-3">
                        <Calendar className="text-purple-500" />
                        {viewingHistory ? `History: ${historyEvents.find(e => e.id === selectedHistoryId)?.title || 'Archive'}` : event?.title}
                    </h1>
                    {!viewingHistory && event && (
                        <>
                            <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full border ${
                                event.status === 'Planning' ? 'bg-yellow-900/30 text-yellow-500 border-yellow-700/50' :
                                    'bg-green-900/30 text-green-500 border-green-700/50'
                            }`}>
                                {event.status} Phase
                            </span>
                            <button
                                onClick={handleToggleAnnounce}
                                disabled={!isAdmin}
                                className={`px-3 py-1 flex items-center gap-2 text-xs font-bold rounded-full border transition-colors ${
                                    event.announceEnabled
                                        ? 'bg-blue-900/30 border-blue-800 text-blue-100 hover:bg-blue-800/50'
                                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
                                }`}
                                title="Toggle Auto-Announcements"
                            >
                                {event.announceEnabled ? <><Bell size={14} className="text-blue-400"/> Discord Pings ON</> : <><BellOff size={14} className="text-red-400"/> Discord Pings OFF</>}
                            </button>
                        </>
                    )}
                </div>

                <div className="flex gap-3">
                    {viewingHistory ? (
                        <button onClick={exitHistory} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-500 transition-colors">
                            <LayoutDashboard size={16} /> Active Board
                        </button>
                    ) : (
                        <>
                            <button onClick={handleViewHistory} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white rounded font-bold shadow transition-colors">
                                <History size={16} /> History
                            </button>
                            {isAdmin && event && (
                                <>
                                    {event.status === 'Planning' && (
                                        <button onClick={() => handleUpdateStatus('Active')} className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-800/50 hover:bg-blue-600/40 rounded font-bold shadow transition-colors">
                                            <Play size={16} /> Start Execution
                                        </button>
                                    )}
                                    <button onClick={() => handleUpdateStatus('Closed')} className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-800/50 hover:bg-red-600/40 rounded font-bold shadow transition-colors">
                                        <Archive size={16} /> Close & Archive
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Sidebar + Grid Container */}
            <div className="flex-1 flex gap-6 min-h-0">
                {/* Sidebar */}
                {viewingHistory && (
                    <div className="w-64 bg-gray-800/50 border border-gray-700 rounded-xl overflow-y-auto p-3 flex flex-col gap-2 shrink-0 custom-scrollbar">
                        <h3 className="text-xs font-bold text-gray-500 uppercase px-2 mb-2">Past Weeks</h3>
                        {historyEvents.length === 0 && <p className="text-center text-xs text-gray-600 py-4">No archives found.</p>}
                        {historyEvents.map(h => (
                            <button
                                key={h.id}
                                onClick={() => loadHistorySchedule(h.id)}
                                className={`w-full text-left p-3 rounded-lg border transition-all ${
                                    selectedHistoryId === h.id
                                        ? 'bg-purple-900/30 border-purple-500 text-purple-100'
                                        : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:bg-gray-800'
                                }`}
                            >
                                <div className="text-sm font-bold truncate">{h.title}</div>
                                <div className="text-[10px] opacity-60">Closed: {new Date(h.closedAt).toLocaleDateString()}</div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Grid */}
                <div className={`flex-1 grid grid-cols-3 gap-6 h-full min-h-0`}>
                    {schedule.map(day => (
                        <div key={day.id} className="bg-gray-800 border border-gray-700 rounded-xl flex flex-col h-full overflow-hidden shadow-xl">
                            <div className="p-4 bg-gray-900 border-b border-gray-700 shrink-0 text-center">
                                <h3 className="text-lg font-black text-white uppercase tracking-wider">{day.buffName}</h3>
                                <p className="text-sm text-gray-400 font-mono mt-1">{new Date(day.activeDate).toDateString()}</p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {day.slots.map(slot => (
                                    <div key={slot.id} className={`flex items-center p-2 rounded border transition-colors ${
                                        slot.playerFid ? 'bg-blue-900/20 border-blue-800/50 hover:bg-blue-900/40' : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                    }`}>
                                        <div className="w-20 shrink-0 font-mono text-xs font-bold text-gray-400 flex items-center gap-1">
                                            <Clock size={12}/> {formatTimeUTC(slot.slotIndex)}
                                        </div>

                                        <div className="flex-1 flex items-center justify-between px-2 border-l border-gray-700 pl-3 ml-2 min-w-0">
                                            {slot.playerFid ? (
                                                <>
                                                    <div className="truncate">
                                                        <div className="font-bold text-gray-200 text-sm truncate">{slot.nickname}</div>
                                                        <div className="text-[10px] text-gray-500 uppercase truncate">
                                                            {slot.allianceName || 'No Alliance'} {viewingHistory ? '' : `| ${slot.playerFid}`}
                                                        </div>
                                                    </div>
                                                    {!viewingHistory && (
                                                        <button onClick={() => handleClearSlot(slot)} className="p-1.5 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors">
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                !viewingHistory ? (
                                                    <button
                                                        onClick={() => setSearchModal({ isOpen: true, slot: slot, query: '' })}
                                                        className="w-full text-left text-xs text-gray-500 hover:text-green-400 font-bold flex items-center gap-2 py-1"
                                                    >
                                                        <Plus size={14} /> Assign Player
                                                    </button>
                                                ) : <span className="text-xs text-gray-700 italic">Unassigned</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modals remain the same */}
            {searchModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg w-[400px] border border-gray-700 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white">Assign Player</h3>
                            <button onClick={() => setSearchModal({ isOpen: false, slot: null, query: '' })} className="text-gray-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4 font-mono bg-gray-900 p-2 rounded">
                            Target Slot: {formatTimeUTC(searchModal.slot?.slotIndex)} UTC
                        </p>
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search by name or FID..."
                                className="w-full pl-9 p-2 bg-gray-900 border border-gray-700 rounded text-white outline-none focus:border-blue-500"
                                value={searchModal.query}
                                onChange={(e) => setSearchModal({...searchModal, query: e.target.value})}
                            />
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {filteredRoster.length === 0 ? (
                                <p className="text-center text-gray-500 text-sm py-4">No players found.</p>
                            ) : (
                                filteredRoster.slice(0, 20).map(p => (
                                    <button
                                        key={p.fid}
                                        onClick={() => handleAssignSlot(p)}
                                        className="w-full flex justify-between items-center p-2 bg-gray-900 hover:bg-blue-900/40 border border-gray-800 hover:border-blue-800/50 rounded transition-colors text-left"
                                    >
                                        <div>
                                            <div className="font-bold text-sm text-gray-200">{p.nickname}</div>
                                            <div className="text-xs text-gray-500">{p.fid}</div>
                                        </div>
                                        <div className="text-[10px] bg-gray-800 px-2 py-1 rounded border border-gray-700 text-gray-400">{p.allianceName || 'None'}</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4B5563; }
            `}</style>
        </div>
    );
}
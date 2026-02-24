import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import AdminLayout from '../components/layout/AdminLayout';
import { toast } from 'react-toastify';
import {
    Calendar, Plus, X, History, LayoutDashboard,
    Play, Archive, Bell, BellOff, Clock, Search, Activity,
    ChevronDown, ChevronUp
} from 'lucide-react';

export default function MinistryReservations() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const { roster } = useApp();

    const [event, setEvent] = useState(null);
    const [schedule, setSchedule] = useState([]);
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

    const [viewingHistory, setViewingHistory] = useState(false);
    const [historyEvents, setHistoryEvents] = useState([]);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null);

    // --- MOBILE SPECIFIC STATE ---
    const [activeMobileTab, setActiveMobileTab] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState({});

    useEffect(() => {
        void fetchData();
    }, []);

    // Set initial mobile tab when schedule loads
    useEffect(() => {
        if (schedule.length > 0 && !activeMobileTab) {
            setActiveMobileTab(schedule[0].id);
        }
    }, [schedule, activeMobileTab]);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await client.get('/moderator/ministry/active');
            setEvent(res.data.event);
            setSchedule(res.data.schedule || []);
        } catch (err) {
            toast.error("Failed to load ministry data");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleBaseDateChange = (e) => {
        const base = e.target.value;
        setFormBaseDate(base);
        if (!base) return;

        const [year, month, day] = base.split('-').map(Number);
        const baseDate = new Date(Date.UTC(year, month - 1, day));

        const formatYMD = (d) => d.toISOString().split('T')[0];
        const addDays = (date, days) => {
            const result = new Date(date);
            result.setUTCDate(result.getUTCDate() + days);
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
            await fetchData(true);
        } catch (err) { toast.error("Failed to assign player"); }
    };

    const handleClearSlot = async (slot) => {
        try {
            await client.put(`/moderator/ministry/slots/${slot.id}`, { playerFid: null, nickname: slot.nickname });
            toast.success("Slot cleared");
            await fetchData(true);
        } catch (err) { toast.error("Failed to clear slot"); }
    };

    const handleToggleAnnounce = async () => {
        if (!isAdmin) return;
        const newState = !event.announceEnabled;
        try {
            await client.put(`/moderator/ministry/events/${event.id}/announce`, { announceEnabled: newState });
            toast.success(`Discord Pings turned ${newState ? 'ON' : 'OFF'}`);
            await fetchData(true);
        } catch (err) { toast.error("Failed to toggle announcements"); }
    };

    const handleViewHistory = async () => {
        setViewingHistory(true);
        try {
            const res = await client.get('/moderator/ministry/history');
            setHistoryEvents(res.data || []);
            if (res.data.length > 0) {
                await loadHistorySchedule(res.data[0].id);
            }
        } catch (err) { toast.error("Failed to load history"); }
    };

    const loadHistorySchedule = async (id) => {
        setSelectedHistoryId(id);
        try {
            const res = await client.get(`/moderator/ministry/history/${id}`);
            setSchedule(res.data || []);
            if (res.data && res.data.length > 0) setActiveMobileTab(res.data[0].id);
        } catch (err) {
            toast.error("Failed to load past schedule");
        }
    };

    const exitHistory = () => {
        setViewingHistory(false);
        void fetchData(true)
    };

    const formatTimeUTC = (index) => {
        const hours = Math.floor(index / 2).toString().padStart(2, '0');
        const minutes = index % 2 === 0 ? '00' : '30';
        return `${hours}:${minutes} UTC`;
    };

    // --- ACCORDION LOGIC ---
    const groupSlots = (slots) => {
        if (!slots) return [];
        return [
            { title: '00:00 - 05:30 UTC', slots: slots.slice(0, 12), id: 'q1' },
            { title: '06:00 - 11:30 UTC', slots: slots.slice(12, 24), id: 'q2' },
            { title: '12:00 - 17:30 UTC', slots: slots.slice(24, 36), id: 'q3' },
            { title: '18:00 - 23:30 UTC', slots: slots.slice(36, 48), id: 'q4' }
        ].filter(g => g.slots.length > 0);
    };

    const toggleGroup = (key) => {
        setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const filteredRoster = roster.filter(p =>
        (p.nickname || '').toLowerCase().includes(searchModal.query.toLowerCase()) ||
        (p.fid || '').toString().includes(searchModal.query)
    );

    const ministryActions = (
        <div className="flex gap-3">
            {viewingHistory ? (
                <button onClick={exitHistory} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-500 transition-colors">
                    <LayoutDashboard size={16} /> Active Board
                </button>
            ) : (
                <>
                    <button onClick={handleViewHistory} className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white rounded font-bold transition-colors">
                        <History size={16} /> <span className="hidden sm:inline">History</span>
                    </button>
                    {isAdmin && event && (
                        <>
                            {event.status === 'Planning' && (
                                <button onClick={() => handleUpdateStatus('Active')} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-800/50 hover:bg-blue-600/40 rounded font-bold transition-colors">
                                    <Play size={16} /> <span className="hidden sm:inline">Start</span>
                                </button>
                            )}
                            <button onClick={() => handleUpdateStatus('Closed')} className="flex items-center gap-2 px-4 py-1.5 bg-red-600/20 text-red-400 border border-red-800/50 hover:bg-red-600/40 rounded font-bold transition-colors">
                                <Archive size={16} /> <span className="hidden sm:inline">Close</span>
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    );

    const pageTitle = viewingHistory
        ? `Archive: ${historyEvents.find(e => e.id === selectedHistoryId)?.title || ''}`
        : (event?.title || 'Ministry Scheduler');

    // --- NO ACTIVE EVENT RENDER ---
    if (!event && !viewingHistory) {
        return (
            <AdminLayout title="Ministry Scheduler" actions={ministryActions}>
                <div className="p-4 md:p-10 flex flex-col items-center justify-center h-full bg-gray-900 text-gray-300 text-center">
                    <Calendar className="w-16 h-16 text-gray-600 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">No Active Ministry Event</h2>
                    <p className="mb-6 max-w-md">Draft a new schedule to start assigning buffs, or view previous records.</p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        {isAdmin && (
                            <button onClick={() => setShowCreateModal(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all">
                                Draft New Schedule
                            </button>
                        )}
                        <button onClick={handleViewHistory} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all">
                            <History size={18} /> View History
                        </button>
                    </div>

                    {showCreateModal && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                            <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl text-left">
                                <h3 className="text-lg font-black uppercase tracking-tight text-white mb-4">Plan Ministry Schedule</h3>
                                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Base Date (Usually Monday)</label>
                                <input type="date" className="w-full mb-4 p-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-blue-500 transition-all"
                                       value={formBaseDate} onChange={handleBaseDateChange} />
                                <input type="text" placeholder="Event Title" className="w-full mb-4 p-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-bold outline-none focus:border-blue-500 transition-all"
                                       value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} />
                                <div className="space-y-3 mb-6 bg-gray-900 p-4 rounded-xl border border-gray-700">
                                    <p className="text-xs text-gray-400 uppercase font-black tracking-widest border-b border-gray-800 pb-2">Dynamic Buff Dates</p>
                                    {createForm.days.map((day, idx) => (
                                        <div key={idx} className="flex justify-between items-center">
                                            <span className="text-sm font-bold text-gray-300 w-1/3">{day.buffName}</span>
                                            <input type="date" className="w-2/3 p-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:border-blue-500 outline-none"
                                                   value={day.activeDate}
                                                   onChange={e => {
                                                       const newDays = [...createForm.days];
                                                       newDays[idx].activeDate = e.target.value;
                                                       setCreateForm({...createForm, days: newDays});
                                                   }} />
                                        </div>
                                    ))}
                                </div>
                                <label className="flex items-center text-gray-300 mb-6 cursor-pointer bg-blue-900/20 p-4 rounded-xl border border-blue-800/50 hover:bg-blue-900/30 transition-all">
                                    <input type="checkbox" className="mr-3 w-4 h-4 rounded accent-blue-600" checked={createForm.announceEnabled} onChange={e => setCreateForm({...createForm, announceEnabled: e.target.checked})} />
                                    <span className="font-bold text-sm"><Bell size={16} className="inline mr-2 text-blue-400 mb-0.5" /> Enable Discord Pings</span>
                                </label>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setShowCreateModal(false)} className="px-5 py-2 text-gray-400 hover:text-white font-bold">Cancel</button>
                                    <button onClick={handleCreateEvent} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black uppercase tracking-widest shadow-lg">Generate 144 Slots</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title={pageTitle} actions={ministryActions}>
            <div className="p-4 lg:p-6 h-full flex flex-col min-h-0 bg-gray-900">

                {/* Event Status Header */}
                {!viewingHistory && event && (
                    <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
                        <div className={`px-4 py-2 rounded-xl border flex items-center justify-center gap-2 ${
                            event.status === 'Planning' ? 'bg-yellow-900/20 border-yellow-700/50 text-yellow-500' : 'bg-green-900/20 border-green-700/50 text-green-500'
                        }`}>
                            <Activity size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">{event.status} Mode</span>
                        </div>
                        <button
                            onClick={handleToggleAnnounce}
                            disabled={!isAdmin}
                            className={`px-4 py-2 flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest rounded-xl border transition-all ${
                                event.announceEnabled
                                    ? 'bg-blue-900/20 border-blue-800 text-blue-400 hover:bg-blue-900/40'
                                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {event.announceEnabled ? <><Bell size={16} /> Discord Pings Active</> : <><BellOff size={16} /> Pings Silenced</>}
                        </button>
                    </div>
                )}

                {/* --- MOBILE TABS (Hidden on Desktop) --- */}
                {schedule.length > 0 && (
                    <div className="flex lg:hidden gap-2 overflow-x-auto pb-2 mb-4 shrink-0 custom-scrollbar">
                        {schedule.map(day => (
                            <button
                                key={day.id}
                                onClick={() => setActiveMobileTab(day.id)}
                                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                    activeMobileTab === day.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-500 border border-gray-700'
                                }`}
                            >
                                {day.buffName}
                            </button>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 font-black uppercase tracking-widest animate-pulse italic">
                        Accessing Ministry Archive...
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">

                        {/* History Sidebar */}
                        {viewingHistory && (
                            <div className="w-full lg:w-64 bg-gray-800/50 border border-gray-700 rounded-xl overflow-y-auto p-3 flex flex-col gap-2 shrink-0 custom-scrollbar shadow-lg max-h-48 lg:max-h-none">
                                <h3 className="text-xs font-bold text-gray-500 uppercase px-2 mb-2 tracking-widest">Archive List</h3>
                                {historyEvents.map(h => (
                                    <button
                                        key={h.id}
                                        onClick={() => loadHistorySchedule(h.id)}
                                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                                            selectedHistoryId === h.id
                                                ? 'bg-purple-900/30 border-purple-500 text-purple-100 shadow-md'
                                                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:bg-gray-800'
                                        }`}
                                    >
                                        <div className="text-sm font-bold truncate">{h.title}</div>
                                        <div className="text-[10px] opacity-60 mt-1 font-mono">Closed: {new Date(h.closedAt).toLocaleDateString()}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* MAIN GRID */}
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
                            {schedule.map(day => (
                                <div
                                    key={day.id}
                                    className={`bg-gray-800 border border-gray-700 rounded-2xl flex-col h-full overflow-hidden shadow-2xl ${
                                        activeMobileTab === day.id ? 'flex' : 'hidden'
                                    } lg:flex`}
                                >
                                    <div className="p-4 bg-gray-900/80 border-b border-gray-700 shrink-0 text-center">
                                        <h3 className="text-lg font-black text-white uppercase tracking-tighter">{day.buffName}</h3>
                                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">{new Date(day.activeDate).toDateString()}</p>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-black/10">
                                        {groupSlots(day.slots).map((group, gIdx) => {
                                            const groupKey = `${day.id}-${group.id}`;
                                            // Default collapsed on mobile, expanded on desktop
                                            const isCollapsed = collapsedGroups[groupKey] || false;

                                            return (
                                                <div key={group.id} className="bg-gray-900/50 border border-gray-700/50 rounded-xl overflow-hidden">

                                                    {/* Accordion Header */}
                                                    <button
                                                        onClick={() => toggleGroup(groupKey)}
                                                        className="w-full p-3 flex justify-between items-center bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition-colors lg:pointer-events-none"
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{group.title}</span>
                                                        <div className="lg:hidden text-gray-500">
                                                            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                                        </div>
                                                    </button>

                                                    {/* Slots List */}
                                                    <div className={`p-2 space-y-1.5 lg:block ${isCollapsed ? 'hidden' : 'block'}`}>
                                                        {group.slots.map(slot => (
                                                            <div key={slot.id} className={`flex items-center p-2 rounded-lg border transition-all ${
                                                                slot.playerFid ? 'bg-blue-900/10 border-blue-500/30 hover:bg-blue-900/20' : 'bg-gray-900 border-gray-800 hover:border-gray-600'
                                                            }`}>
                                                                <div className="w-16 shrink-0 font-mono text-[10px] font-black text-gray-500 flex items-center gap-1">
                                                                    <Clock size={12}/> {formatTimeUTC(slot.slotIndex).split(' ')[0]}
                                                                </div>

                                                                <div className="flex-1 flex items-center justify-between px-2 border-l border-gray-700 pl-3 ml-2 min-w-0">
                                                                    {slot.playerFid ? (
                                                                        <>
                                                                            <div className="truncate">
                                                                                <div className="font-bold text-gray-100 text-xs truncate uppercase tracking-tighter">{slot.nickname}</div>
                                                                                <div className="text-[9px] text-gray-500 font-black uppercase truncate tracking-tighter">
                                                                                    {slot.allianceName || 'Global'} {viewingHistory ? '' : `| ${slot.playerFid}`}
                                                                                </div>
                                                                            </div>
                                                                            {!viewingHistory && (
                                                                                <button onClick={() => handleClearSlot(slot)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0">
                                                                                    <X size={14} />
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        !viewingHistory ? (
                                                                            <button
                                                                                onClick={() => setSearchModal({ isOpen: true, slot: slot, query: '' })}
                                                                                className="w-full text-left text-[10px] text-gray-600 hover:text-green-500 font-black uppercase tracking-widest flex items-center gap-2 py-1 transition-colors"
                                                                            >
                                                                                <Plus size={14} /> Reserve Slot
                                                                            </button>
                                                                        ) : <span className="text-[10px] text-gray-700 italic font-black uppercase tracking-widest">Vacant</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Selection Modal (Already highly mobile responsive, just tightened the styling) */}
            {searchModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 p-5 rounded-3xl w-full max-w-md border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tighter uppercase">Select Operator</h3>
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">
                                    Target: {searchModal.slot?.day?.buffName} @ {formatTimeUTC(searchModal.slot?.slotIndex)}
                                </p>
                            </div>
                            <button onClick={() => setSearchModal({ isOpen: false, slot: null, query: '' })} className="p-2 text-gray-500 hover:text-white bg-gray-900 rounded-xl border border-gray-700 transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="relative mb-4 shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                            <input
                                type="text" autoFocus
                                placeholder="Search Callsign or FID..."
                                className="w-full pl-11 p-3.5 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-blue-500 transition-all shadow-inner text-sm font-bold placeholder-gray-600"
                                value={searchModal.query}
                                onChange={(e) => setSearchModal({...searchModal, query: e.target.value})}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                            {filteredRoster.length === 0 ? (
                                <div className="text-center py-12">
                                    <Search className="w-12 h-12 text-gray-700 mx-auto mb-3 opacity-20" />
                                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest">No matching records</p>
                                </div>
                            ) : (
                                filteredRoster.slice(0, 50).map(p => (
                                    <button
                                        key={p.fid}
                                        onClick={() => handleAssignSlot(p)}
                                        className="w-full flex justify-between items-center p-3.5 bg-gray-900/50 hover:bg-blue-600/20 border border-gray-800 hover:border-blue-500/50 rounded-xl transition-all text-left group"
                                    >
                                        <div className="min-w-0 pr-3">
                                            <div className="font-bold text-sm text-gray-200 group-hover:text-white uppercase truncate tracking-tighter">{p.nickname}</div>
                                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{p.fid}</div>
                                        </div>
                                        <div className="text-[9px] font-black uppercase tracking-widest bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 shrink-0">
                                            {p.allianceName || 'Global'}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4B5563; }
            `}</style>
        </AdminLayout>
    );
}
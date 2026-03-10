import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import {Clock, Plus, Trash2, Power, AtSign, Hash, RotateCw, CalendarIcon, Edit, X} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export default function DiscordCrons({ adminScope, roles, channels }) {
    const [crons, setCrons] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- FORM STATE ---
    const [message, setMessage] = useState('');
    const [pingRoleId, setPingRoleId] = useState('');
    const [channelId, setChannelId] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [name, setName] = useState('');

    // New Scheduling State
    const [nextRunTime, setNextRunTime] = useState(null);
    const [recurrenceType, setRecurrenceType] = useState('ONCE');

    // Interval Config
    const [intervalHours, setIntervalHours] = useState(48);

    // Weekly Config
    const [weeklyWeeks, setWeeklyWeeks] = useState(2);
    const [weeklyDays, setWeeklyDays] = useState([]); // Array of integers 0-6 (Sun-Sat)

    const DAYS_OF_WEEK = [
        { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' },
        { id: 4, label: 'Thu' }, { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' },
        { id: 0, label: 'Sun' } // 0 is Sunday in Go's time.Weekday()
    ];

    useEffect(() => {
        void fetchCrons();
    }, [adminScope]);

    const fetchCrons = async () => {
        try {
            setLoading(true);
            const res = await client.get(`/moderator/discord/crons?scope=${adminScope}`);
            setCrons(res.data || []);
        } catch (err) {
            toast.error('Failed to load scheduled jobs');
        } finally {
            setLoading(false);
        }
    };

    const toggleDay = (dayId) => {
        setWeeklyDays(prev =>
            prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
        );
    };

    const handleCreate = async (e) => {
        e.preventDefault();

        if (!nextRunTime || !message || !channelId) {
            return toast.warning('Date/Time, Channel, and Message are required.');
        }

        let configObj = {};
        if (recurrenceType === 'INTERVAL') {
            if (!intervalHours || intervalHours < 1) return toast.warning("Interval hours must be at least 1.");
            configObj = { hours: parseInt(intervalHours) };
        } else if (recurrenceType === 'WEEKLY') {
            if (weeklyDays.length === 0) return toast.warning("Select at least one day of the week.");
            if (!weeklyWeeks || weeklyWeeks < 1) return toast.warning("Week interval must be at least 1.");
            configObj = { days: weeklyDays, weeks: parseInt(weeklyWeeks) };
        }

        try {
            const pad = (n) => n.toString().padStart(2, '0');
            const utcNextRun = `${nextRunTime.getFullYear()}-${pad(nextRunTime.getMonth() + 1)}-${pad(nextRunTime.getDate())}T${pad(nextRunTime.getHours())}:${pad(nextRunTime.getMinutes())}:00Z`;

            const payload = {
                name: name,
                nextRunTime: utcNextRun,
                recurrenceType: recurrenceType,
                recurrenceConfig: JSON.stringify(configObj),
                message: message,
                channelId: channelId,
                pingRoleId: pingRoleId || null
            };

            if (editingId) {
                await client.put(`/moderator/discord/crons/${editingId}?scope=${adminScope}`, payload);
                toast.success('Scheduled alert updated!');
            } else {
                await client.post(`/moderator/discord/crons?scope=${adminScope}`, payload);
                toast.success('Scheduled alert created!');
            }

            // Reset Form
            setMessage('');
            setNextRunTime('');
            setPingRoleId('');
            setRecurrenceType('ONCE');
            setWeeklyDays([]);
            cancelEdit();
            await fetchCrons();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create job');
        }
    };

    const handleEditClick = (cron) => {
        setName(cron.name || '');
        setEditingId(cron.id);
        setMessage(cron.message);
        setChannelId(cron.channelId);
        setPingRoleId(cron.pingRoleId || '');
        setRecurrenceType(cron.recurrenceType);

        setNextRunTime(new Date(cron.nextRunTime));

        if (cron.recurrenceType === 'INTERVAL') {
            const cfg = JSON.parse(cron.recurrenceConfig);
            setIntervalHours(cfg.hours || 48);
        } else if (cron.recurrenceType === 'WEEKLY') {
            const cfg = JSON.parse(cron.recurrenceConfig);
            setWeeklyDays(cfg.days || []);
            setWeeklyWeeks(cfg.weeks || 2);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setName('');
        setEditingId(null);
        setMessage('');
        setNextRunTime(null);
        setPingRoleId('');
        setRecurrenceType('ONCE');
        setWeeklyDays([]);
    };

    const handleToggle = async (id) => {
        try {
            await client.put(`/moderator/discord/crons/${id}/toggle?scope=${adminScope}`);
            toast.success('Job status updated');
            await fetchCrons();
        } catch (err) {
            toast.error('Failed to update job');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this scheduled job?')) return;
        try {
            await client.delete(`/moderator/discord/crons/${id}?scope=${adminScope}`);
            toast.success('Job deleted');
            await fetchCrons();
        } catch (err) {
            toast.error('Failed to delete job');
        }
    };

    const formatScheduleRules = (type, configStr) => {
        if (type === 'ONCE') return 'One-time Event';
        try {
            const cfg = JSON.parse(configStr);
            if (type === 'INTERVAL') return `Every ${cfg.hours} Hours`;
            if (type === 'WEEKLY') {
                const dayNames = cfg.days.map(d => DAYS_OF_WEEK.find(dw => dw.id === d)?.label).join(', ');
                return `Every ${cfg.weeks > 1 ? `${cfg.weeks} Weeks` : 'Week'} on ${dayNames}`;
            }
        } catch (e) {
            return 'Invalid Config';
        }
    };

    if (loading) return <div className="p-4 text-gray-400">Loading schedules...</div>;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative z-10 mt-6">
            <h2 className="text-xl font-black uppercase text-white tracking-widest flex items-center gap-3 mb-6">
                <Clock className="text-purple-500" /> Scheduled Automation
            </h2>

            {/* CREATE NEW CRON FORM */}
            <form onSubmit={handleCreate} className="bg-black/40 border border-gray-800 rounded-2xl p-5 mb-8 space-y-5">

                {/* ROW 0: Event Name */}
                <div className="space-y-2 mb-4">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Event Name</label>
                    <input
                        type="text"
                        required
                        placeholder="e.g., Bear Trap Reminder"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-purple-500"
                    />
                </div>

                {/* ROW 1: Date/Time & Recurrence */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">First Run (Local Time)</label>
                        <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-10" />
                            <DatePicker
                                selected={nextRunTime}
                                onChange={(date) => setNextRunTime(date)}
                                showTimeSelect
                                timeFormat="HH:mm" // Forces 24-hour time selector
                                timeIntervals={15}
                                dateFormat="yyyy-MM-dd HH:mm" // Forces 24-hour display
                                calendarStartDay={1} // 1 = moonday
                                placeholderText="Select UTC Date & Time"
                                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500"
                                wrapperClassName="w-full"
                             showMonthYearDropdown/>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Repeat Rules</label>
                        <div className="relative">
                            <RotateCw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <select
                                value={recurrenceType}
                                onChange={(e) => setRecurrenceType(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500 appearance-none cursor-pointer"
                            >
                                <option value="ONCE">Does not repeat (Run Once)</option>
                                <option value="INTERVAL">Fixed Interval (e.g. Every 48 Hours)</option>
                                <option value="WEEKLY">Specific Days (e.g. Tue/Thu bi-weekly)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* CONDITIONAL RECURRENCE SETTINGS */}
                {recurrenceType === 'INTERVAL' && (
                    <div className="p-4 bg-purple-900/10 border border-purple-500/30 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <label className="text-xs font-bold text-purple-400 uppercase tracking-wider">Repeat Every (Hours)</label>
                        <input
                            type="number"
                            min="1"
                            value={intervalHours}
                            onChange={(e) => setIntervalHours(e.target.value)}
                            className="w-full bg-gray-950 border border-purple-500/50 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-purple-400"
                        />
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Perfect for Bear Trap (48 Hours) or Custom Shields.</p>
                    </div>
                )}

                {recurrenceType === 'WEEKLY' && (
                    <div className="p-4 bg-purple-900/10 border border-purple-500/30 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div>
                            <label className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 block">Days of the Week</label>
                            <div className="flex flex-wrap gap-2">
                                {DAYS_OF_WEEK.map(day => (
                                    <button
                                        key={day.id}
                                        type="button"
                                        onClick={() => toggleDay(day.id)}
                                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                                            weeklyDays.includes(day.id)
                                                ? 'bg-purple-600 text-white shadow-md'
                                                : 'bg-gray-950 text-gray-500 border border-gray-800 hover:border-purple-500/50'
                                        }`}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 block">Repeat Interval</label>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Every</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={weeklyWeeks}
                                    onChange={(e) => setWeeklyWeeks(e.target.value)}
                                    className="w-20 bg-gray-950 border border-purple-500/50 text-center text-white text-sm rounded-xl py-2 outline-none focus:border-purple-400"
                                />
                                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Weeks</span>
                            </div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-2">Set to 1 for Weekly, 2 for Bi-Weekly (Crazy Joe, Foundry).</p>
                        </div>
                    </div>
                )}

                {/* ROW 2: Target & Role */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target Channel</label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <select
                                required
                                value={channelId}
                                onChange={(e) => setChannelId(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500 appearance-none cursor-pointer"
                            >
                                <option value="">Select Channel...</option>
                                {channels.map(ch => (
                                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Role to Ping</label>
                        <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <select
                                value={pingRoleId}
                                onChange={(e) => setPingRoleId(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500 appearance-none cursor-pointer"
                            >
                                <option value="">No Role Ping</option>
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>@{role.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* ROW 3: Message */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Announcement Message</label>
                    <textarea
                        required
                        placeholder="Type the message you want the bot to send..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows="3"
                        className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl p-3 outline-none focus:border-purple-500 resize-none"
                    ></textarea>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    {editingId && (
                        <button type="button" onClick={cancelEdit} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-black tracking-widest uppercase rounded-xl transition-all flex items-center gap-2">
                            <X size={16} /> Cancel
                        </button>
                    )}
                    <button type="submit" className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-black tracking-widest uppercase rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20">
                        {editingId ? <Edit size={16} /> : <Plus size={16} />}
                        {editingId ? 'Save Changes' : 'Deploy Automation'}
                    </button>
                </div>
            </form>

            {/* LIST OF EXISTING ALERTS */}
            <div className="space-y-3">
                {crons.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4 font-black tracking-widest uppercase">No custom alerts scheduled yet.</p>
                ) : crons.map(cron => (
                    <div key={cron.id} className={`flex flex-col lg:flex-row lg:items-center justify-between border rounded-2xl p-4 gap-4 transition-all ${cron.isActive ? 'bg-gray-900 border-gray-700' : 'bg-black/40 border-gray-800 opacity-60'}`}>

                        <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">{cron.name}</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="bg-purple-900/20 text-purple-400 border border-purple-500/30 font-bold uppercase tracking-widest text-[10px] px-2.5 py-1 rounded-md">
                                    {formatScheduleRules(cron.recurrenceType, cron.recurrenceConfig)}
                                </span>

                                <span className="bg-gray-800 text-gray-300 font-mono text-[10px] px-2.5 py-1 rounded-md border border-gray-700 flex items-center gap-1">
                                    <Clock size={10}/> Next: {new Date(cron.nextRunTime).toISOString().replace('T', ' ').substring(0, 16)} UTC
                                </span>

                                {cron.pingRoleId && (
                                    <span className="text-blue-400 text-[10px] uppercase font-black tracking-widest bg-blue-900/20 border border-blue-500/30 px-2 py-1 rounded-md">
                                        Pings Role
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-white line-clamp-2">{cron.message}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => handleEditClick(cron)}
                                className="p-2.5 bg-blue-900/20 text-blue-500 border border-blue-800/50 hover:bg-blue-600/40 rounded-xl transition-colors flex items-center justify-center"
                                title="Edit Automation"
                            >
                                <Edit size={16} />
                            </button>
                            <button
                                onClick={() => handleToggle(cron.id)}
                                className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${cron.isActive ? 'bg-green-600/20 text-green-500 border border-green-500/30 hover:bg-green-600/40' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'}`}
                                title={cron.isActive ? 'Pause Automation' : 'Resume Automation'}
                            >
                                <Power size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(cron.id)}
                                className="p-2.5 bg-red-900/20 text-red-500 border border-red-800/50 hover:bg-red-600/40 rounded-xl transition-colors flex items-center justify-center"
                                title="Delete Automation"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
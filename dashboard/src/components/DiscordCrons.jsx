import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Clock, Plus, Trash2, Power, Info, AtSign, Hash } from 'lucide-react';

export default function DiscordCrons({ adminScope, roles, channels }) {
    const [crons, setCrons] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [expression, setExpression] = useState('');
    const [message, setMessage] = useState('');
    const [pingRoleId, setPingRoleId] = useState('');
    const [channelId, setChannelId] = useState('');

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

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!expression || !message) return toast.warning('Expression and message are required.');

        try {
            const payload = {
                cronExpression: expression,
                message: message,
                channelId: channelId,
                pingRoleId: pingRoleId || null
            };
            await client.post(`/moderator/discord/crons?scope=${adminScope}`, payload);
            toast.success('Scheduled job created successfully!');
            setExpression('');
            setMessage('');
            setPingRoleId('');
            await fetchCrons();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create job');
        }
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

    if (loading) return <div className="p-4 text-gray-400">Loading schedules...</div>;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative z-10 mt-6">
            <h2 className="text-xl font-black uppercase text-white tracking-widest flex items-center gap-3 mb-6">
                <Clock className="text-purple-500" /> Custom Scheduled Alerts
            </h2>

            {/* CREATE NEW CRON FORM */}
            <form onSubmit={handleCreate} className="bg-black/40 border border-gray-800 rounded-2xl p-4 mb-8 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cron Expression</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="0 14 * * 5 (Fridays at 14:00 UTC)"
                                value={expression}
                                onChange={(e) => setExpression(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500"
                            />
                        </div>
                        <a href="https://crontab.guru/" target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                            <Info size={12} /> Need help formatting? Use crontab.guru
                        </a>
                    </div>

                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target Channel</label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <select
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

                    <div className="flex-1 space-y-2">
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

                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Announcement Message</label>
                    <textarea
                        placeholder="Type the message you want the bot to send..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows="3"
                        className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-xl p-3 outline-none focus:border-purple-500 resize-none"
                    ></textarea>
                </div>

                <div className="flex justify-end">
                    <button type="submit" className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20">
                        <Plus size={16} /> Create Scheduled Alert
                    </button>
                </div>
            </form>

            {/* LIST OF EXISTING CRONS */}
            <div className="space-y-3">
                {crons.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4 italic">No custom alerts scheduled yet.</p>
                ) : crons.map(cron => (
                    <div key={cron.id} className={`flex flex-col md:flex-row md:items-center justify-between border rounded-2xl p-4 gap-4 transition-all ${cron.isActive ? 'bg-gray-900 border-gray-700' : 'bg-black/40 border-gray-800 opacity-60'}`}>

                        <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-3">
                                <span className="bg-gray-800 text-gray-300 font-mono text-xs px-2 py-1 rounded-md border border-gray-700">
                                    {cron.cronExpression}
                                </span>
                                {cron.pingRoleId && (
                                    <span className="text-blue-400 text-xs font-bold bg-blue-900/20 px-2 py-1 rounded-md">
                                        Has Role Ping
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-white line-clamp-2 mt-2">{cron.message}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => handleToggle(cron.id)}
                                className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${cron.isActive ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                                title={cron.isActive ? 'Pause Job' : 'Resume Job'}
                            >
                                <Power size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(cron.id)}
                                className="p-2.5 bg-red-600/20 text-red-500 hover:bg-red-600/30 rounded-xl transition-colors flex items-center justify-center"
                                title="Delete Job"
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
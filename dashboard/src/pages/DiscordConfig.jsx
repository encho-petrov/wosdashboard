import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
    Trash2, Link as LinkIcon, Unlink, Save,
    ShieldAlert, Hash, Server, CheckCircle2, Globe, AtSign
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import DiscordCrons from '../components/DiscordCrons';

export default function DiscordConfig() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [adminScope, setAdminScope] = useState('alliance');
    const [loading, setLoading] = useState(true);
    const [isLinked, setIsLinked] = useState(false);
    const [guildName, setGuildName] = useState('');

    const [channels, setChannels] = useState([]);
    const [roles, setRoles] = useState([]);

    const [routes, setRoutes] = useState({});
    const [pingRoles, setPingRoles] = useState({});

    const availableEvents = adminScope === 'state' ? [
        { id: 'ministry_alert', label: 'Ministry Buff Alerts', desc: '5-minute warnings and daily manifests' },
        { id: 'pet_alert', label: 'Pet Skill Alerts', desc: 'Reminders for captains to activate skills' },
        { id: 'fortress_rotation', label: 'Fortress Rotation', desc: 'Weekly schedule announcements' },
        { id: 'global_war_room', label: 'Global War Room Updates', desc: 'State-wide deployment notifications' }
    ] : [
        { id: 'general_announcements', label: 'General Announcements', desc: 'Catch-all for strategy, schedules, war room locks, etc.' },
        { id: 'command_alerts', label: 'Command Alerts', desc: 'Sensitive alerts like Foundry roster adjustments' }
    ];

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success')) {
            toast.success('Successfully linked to Discord!');
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        void fetchStatus();
    }, [adminScope]);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            setIsLinked(false);
            setGuildName('');
            setChannels([]);
            setRoles([]);
            setRoutes({});
            setPingRoles({});

            const res = await client.get(`/moderator/discord/status?scope=${adminScope}`);

            setIsLinked(res.data.isLinked);
            setGuildName(res.data.guildName);

            if (res.data.isLinked) {
                await fetchChannelsAndRoles();

                if (res.data.routes) {
                    const loadedRoutes = {};
                    const loadedRoles = {};

                    Object.keys(res.data.routes).forEach(key => {
                        loadedRoutes[key] = res.data.routes[key].channelId;
                        loadedRoles[key] = res.data.routes[key].pingRoleId || '';
                    });

                    setRoutes(loadedRoutes);
                    setPingRoles(loadedRoles);
                }
            }
        } catch (err) {
            toast.error('Failed to load Discord configuration');
        } finally {
            setLoading(false);
        }
    };

    const fetchChannelsAndRoles = async () => {
        try {
            const [channelsRes, rolesRes] = await Promise.all([
                client.get(`/moderator/discord/channels?scope=${adminScope}`),
                client.get(`/moderator/discord/roles?scope=${adminScope}`)
            ]);
            setChannels(channelsRes.data || []);
            setRoles(rolesRes.data || []);
        } catch (err) {
            toast.error('Failed to fetch Discord data');
        }
    };

    const handleConnect = async () => {
        try {
            const res = await client.get(`/moderator/discord/login?scope=${adminScope}`);
            window.location.href = res.data.url;
        } catch (err) {
            toast.error('Failed to initiate login');
        }
    };

    const handleSaveRoute = async (eventType) => {
        const channelId = routes[eventType];
        if (!channelId) {
            return toast.warning('Please select a channel first');
        }

        const payload = {
            eventType: eventType,
            channelId: channelId,
            pingRoleId: pingRoles[eventType] || null
        };

        try {
            await client.post(`/moderator/discord/routes?scope=${adminScope}`, payload);
            toast.success('Route saved successfully!');
            await fetchStatus();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save route');
        }
    };

    const handleUnlinkRoute = async (eventType) => {
        if (!window.confirm("Are you sure you want to unlink this channel? Automated alerts will stop for this event until you configure it again.")) return;

        try {
            await client.delete(`/moderator/discord/routes/${eventType}?scope=${adminScope}`);
            toast.success('Channel unlinked successfully!');
            await fetchStatus();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to unlink channel.');
        }
    };

    const handleDisconnectServer = async () => {
        const confirmMsg = `WARNING: This will completely disconnect the ${adminScope === 'state' ? 'State' : 'Alliance'} Discord server!\n\nAll saved channels, role pings, and custom automated alerts will be permanently deleted.\n\nAre you absolutely sure?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            await client.delete(`/moderator/discord/disconnect?scope=${adminScope}`);
            toast.success('Server disconnected and all configurations wiped.');
            await fetchStatus();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to disconnect server.');
        }
    };

    if (loading && !channels.length) return <div className="p-10 text-white flex justify-center">LOADING COMMUNICATIONS INTERFACE...</div>;

    return (
        <AdminLayout title="Discord Integrations">
            <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-6">

                {isAdmin && (
                    <div className="flex justify-center mb-8">
                        <div className="bg-gray-900 border border-gray-800 p-1 rounded-2xl inline-flex shadow-xl">
                            <button onClick={() => setAdminScope('alliance')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${adminScope === 'alliance' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <Server size={16} /> Alliance Settings
                            </button>
                            <button onClick={() => setAdminScope('state')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${adminScope === 'state' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <Globe size={16} /> Global State Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* Connection Status Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                    <h2 className="text-xl font-black uppercase text-white tracking-widest flex items-center gap-3 mb-2">
                        {adminScope === 'state' ? <Globe className="text-purple-500" /> : <Server className="text-blue-500" />}
                        {adminScope === 'state' ? "State Server Connection" : "Alliance Server Connection"}
                    </h2>

                    {isLinked ? (
                        <div className="flex flex-col sm:flex-row items-center justify-between bg-black/40 border border-gray-800 rounded-2xl p-4 gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-900/20 text-blue-500 flex items-center justify-center border border-blue-500/30">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-green-500">Connected</p>
                                    <p className="text-lg font-bold text-white">{guildName}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleDisconnectServer}
                                className="px-4 py-2 bg-red-900/20 text-red-500 hover:bg-red-900/40 hover:text-red-400 text-sm font-bold rounded-xl transition-all border border-red-800/50 flex items-center gap-2"
                                title="Permanently disconnect this server"
                            >
                                <Trash2 size={16} /> Disconnect Server
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 bg-black/40 border border-gray-800 border-dashed rounded-2xl text-center">
                            <ShieldAlert size={48} className="text-gray-600 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">No Server Linked</h3>
                            <button onClick={handleConnect} className="px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-black uppercase rounded-xl transition-all flex items-center gap-2 mt-4">
                                <LinkIcon size={18} /> Connect {adminScope === 'state' ? 'State' : 'Alliance'} Discord
                            </button>
                        </div>
                    )}
                </div>

                {/* Event Routing Card */}
                {isLinked && (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative z-10">
                        <h2 className="text-xl font-black uppercase text-white tracking-widest flex items-center gap-3 mb-6">
                            <Hash className="text-purple-500" /> Event Routing
                        </h2>

                        <div className="space-y-4">
                            {availableEvents.map(event => (
                                <div key={event.id} className="flex flex-col xl:flex-row xl:items-center justify-between bg-black/40 border border-gray-800 rounded-2xl p-4 gap-4 transition-colors hover:border-gray-700">

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{event.label}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{event.desc}</p>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto">
                                        {/* CHANNEL DROPDOWN */}
                                        <div className="relative flex-1 sm:w-56">
                                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                            <select
                                                className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-purple-500 appearance-none cursor-pointer"
                                                value={routes[event.id] || ''}
                                                onChange={(e) => setRoutes({ ...routes, [event.id]: e.target.value })}
                                            >
                                                <option value="" disabled>Select Channel...</option>
                                                {channels.map(ch => (
                                                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* ROLE DROPDOWN */}
                                        <div className="relative flex-1 sm:w-56">
                                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                            <select
                                                className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-purple-500 appearance-none cursor-pointer"
                                                value={pingRoles[event.id] || ''}
                                                onChange={(e) => setPingRoles({ ...pingRoles, [event.id]: e.target.value })}
                                            >
                                                <option value="">No Role Ping</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.id}>@{role.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* ACTION BUTTONS */}
                                        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                            <button
                                                onClick={() => handleSaveRoute(event.id)}
                                                disabled={!routes[event.id]}
                                                className="flex-1 sm:flex-none p-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0 shadow-lg shadow-purple-900/20"
                                                title="Save Route"
                                            >
                                                <Save size={16} />
                                            </button>

                                            {/* ONLY SHOW UNLINK IF A ROUTE IS ACTUALLY SAVED IN THE DB */}
                                            {routes[event.id] && (
                                                <button
                                                    onClick={() => handleUnlinkRoute(event.id)}
                                                    className="flex-1 sm:flex-none p-2.5 bg-red-900/20 text-red-500 hover:bg-red-900/40 hover:text-red-400 rounded-xl transition-all border border-red-800/50 flex items-center justify-center shrink-0"
                                                    title="Unlink this channel"
                                                >
                                                    <Unlink size={16} />
                                                </button>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Crons Component */}
                <DiscordCrons adminScope={adminScope} roles={roles} channels={channels} />
            </div>
        </AdminLayout>
    );
}
import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
    LayoutGrid, Calendar, Shield, Save,
    Info, Lock, AlertTriangle, ArrowLeft, Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Import your icon mapping utility
import { getRewardIcon } from '../assets/rewards/index';

export default function Rotation() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    // Data State
    const [buildings, setBuildings] = useState([]);
    const [alliances, setAlliances] = useState([]);
    const [matrix, setMatrix] = useState({}); // Stores [buildingId-week]: allianceId
    const [rewards, setRewards] = useState({}); // Stores { weekNum: [rewards array] }
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const weeks = [1, 2, 3, 4, 5, 6, 7, 8];

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);

            // 1. Fetch buildings, alliances, and the current schedule grid
            const [bRes, aRes, sRes] = await Promise.all([
                client.get('/moderator/rotation/buildings'),
                client.get('/moderator/options'),
                client.get('/moderator/rotation/schedule/1')
            ]);

            setBuildings(bRes.data);
            setAlliances(aRes.data.alliances || []);

            const scheduleMap = {};
            sRes.data.forEach(entry => {
                scheduleMap[`${entry.buildingId}-${entry.week}`] = entry.allianceId;
            });
            setMatrix(scheduleMap);

            // 2. Fetch rewards for ALL 8 weeks simultaneously
            const rewardPromises = weeks.map(w => client.get(`/moderator/rotation/rewards/${w}`));
            const rewardResponses = await Promise.all(rewardPromises);

            const rewardsMap = {};
            rewardResponses.forEach((res, index) => {
                const weekNum = weeks[index];
                rewardsMap[weekNum] = res.data;
            });
            setRewards(rewardsMap);

        } catch (err) {
            toast.error("Failed to load rotation data");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCellChange = (buildingId, week, allianceId) => {
        if (!isAdmin) return;
        setMatrix(prev => ({
            ...prev,
            [`${buildingId}-${week}`]: parseInt(allianceId) || null
        }));
    };

    // Conflict Detection: Returns true if alliance has >1 assignment of same type in that week
    const hasConflict = useMemo(() => {
        const conflicts = {};
        weeks.forEach(w => {
            const fortAssignments = {};
            const shAssignments = {};

            buildings.forEach(b => {
                const val = matrix[`${b.id}-${w}`];
                if (!val) return;

                const target = b.type === 'Fortress' ? fortAssignments : shAssignments;
                target[val] = (target[val] || 0) + 1;

                if (target[val] > 1) {
                    conflicts[`${b.id}-${w}`] = true;
                }
            });
        });
        return conflicts;
    }, [matrix, buildings]);

    const handleSave = async () => {
        if (Object.keys(hasConflict).length > 0) {
            toast.error("Cannot save: Detected alliance scheduling conflicts.");
            return;
        }

        setSaving(true);
        try {
            const entries = Object.entries(matrix).map(([key, allianceId]) => {
                const [buildingId, week] = key.split('-').map(Number);
                return {
                    seasonId: 1,
                    week: week,
                    buildingId: buildingId,
                    allianceId: allianceId
                };
            }).filter(e => e.allianceId !== null);

            await client.post('/moderator/rotation/save', { seasonId: 1, entries });
            toast.success("Season rotation saved and locked!");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to save schedule");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center font-mono text-blue-500">
            INITIALIZING STATE MATRIX...
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">

            {/* --- STANDARDIZED NAVBAR --- */}
            <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md">
                <div className="flex items-center space-x-3">
                    <Activity className="text-blue-500 w-6 h-6" />
                    <h1 className="text-xl font-bold tracking-wide uppercase">Rotation Control</h1>
                </div>
                <Link to="/" className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium border border-gray-600">
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Dashboard</span>
                </Link>
            </nav>

            <main className="container mx-auto px-4 py-8 max-w-[1600px] space-y-6">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <LayoutGrid className="text-blue-400" /> Season 1 Rotation Matrix
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Manage 12 Fortresses and 4 Strongholds. One Fortress & One Stronghold per alliance limit enforced.
                        </p>
                    </div>

                    {isAdmin ? (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50"
                        >
                            <Save size={18} /> {saving ? 'Saving...' : 'Save Season Plan'}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 text-amber-400 border border-amber-800/30 rounded-lg text-xs font-bold uppercase">
                            <Lock size={14} /> Read-Only Mode (Moderator)
                        </div>
                    )}
                </div>

                {/* The Matrix */}
                <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-gray-700/30 border-b border-gray-700">
                                <th className="p-4 w-48 sticky left-0 bg-gray-800 z-10 border-r border-gray-700 shadow-[1px_0_0_0_#374151]">Building ID</th>
                                {weeks.map(w => (
                                    <th key={w} className="p-4 text-center min-w-[140px] font-black text-xs uppercase tracking-tighter text-gray-400">
                                        Week {w}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                            {buildings.map(b => (
                                <tr key={b.id} className="hover:bg-gray-700/20 transition-colors">
                                    <td className="p-4 sticky left-0 bg-gray-800 z-10 border-r border-gray-700 shadow-[1px_0_0_0_#374151]">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${b.type === 'Stronghold' ? 'bg-purple-900/30 text-purple-400' : 'bg-blue-900/30 text-blue-400'}`}>
                                                <Shield size={16} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm">{b.type} {b.internal_id}</div>

                                            </div>
                                        </div>
                                    </td>

                                    {weeks.map(w => {
                                        const coord = `${b.id}-${w}`;
                                        const conflict = hasConflict[coord];
                                        const currentAlliance = matrix[coord] || '';

                                        // Retrieve the reward for this specific week and building
                                        const weekRewards = rewards[w] || [];
                                        const cellReward = weekRewards.find(r => r.building_id === b.id);

                                        return (
                                            <td key={w} className={`p-2 align-middle ${conflict ? 'bg-red-900/10' : ''}`}>
                                                <div className="flex items-center gap-2 relative">

                                                    {/* --- REWARD ICON (Left Side) --- */}
                                                    {/* We use a fixed width container so the dropdowns stay perfectly aligned vertically even if an icon is missing */}
                                                    <div className="flex-shrink-0 w-7 flex justify-center items-center">
                                                        {cellReward && cellReward.icon && (
                                                            <img
                                                                src={getRewardIcon(cellReward.icon)}
                                                                alt={cellReward.name}
                                                                // Larger size, no opacity, added drop shadow and a subtle hover grow effect
                                                                className="w-7 h-7 object-contain drop-shadow-md hover:scale-110 transition-transform cursor-help"
                                                                title={cellReward.name} // Native hover tooltip
                                                                onError={(e) => e.target.style.display = 'none'}
                                                            />
                                                        )}
                                                    </div>

                                                    {/* --- DROPDOWN (Right Side) --- */}
                                                    <div className="relative w-full">
                                                        <select
                                                            disabled={!isAdmin}
                                                            value={currentAlliance}
                                                            onChange={(e) => handleCellChange(b.id, w, e.target.value)}
                                                            // Removed horizontal padding slightly and centered text for 3-letter tags
                                                            className={`w-full bg-gray-900 border appearance-none rounded-lg px-2 py-2 text-xs font-bold text-center outline-none transition-all cursor-pointer ${
                                                                conflict
                                                                    ? 'border-red-500 text-red-400'
                                                                    : currentAlliance
                                                                        ? 'border-blue-500/30 text-blue-100 hover:border-blue-500'
                                                                        : 'border-gray-700 text-gray-500 hover:border-gray-600'
                                                            } disabled:cursor-default`}
                                                        >
                                                            <option value="">---</option>
                                                            {alliances.map(a => (
                                                                <option key={a.id} value={a.id}>{a.name}</option>
                                                            ))}
                                                        </select>

                                                        {/* Conflict Warning Indicator */}
                                                        {conflict && (
                                                            <div className="absolute -top-2 -right-2 z-10 bg-gray-900 rounded-full">
                                                                <AlertTriangle size={16} className="text-red-500 fill-red-900 drop-shadow-md" />
                                                            </div>
                                                        )}
                                                    </div>

                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Legend / Warnings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 space-y-3">
                        <h4 className="text-sm font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                            <Info size={16} className="text-blue-400" /> Rotation Rules
                        </h4>
                        <ul className="text-xs text-gray-500 space-y-2 list-disc list-inside">
                            <li>Weekly signup logic: 1 Fortress + 1 Stronghold max per alliance.</li>
                            <li>Week 1-2: Typically handled by shells for auto-signup stacking.</li>
                            <li>Red highlights indicate an alliance has exceeded their building limit for that week.</li>
                        </ul>
                    </div>

                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex flex-col justify-center items-center text-center">
                        <p className="text-sm text-gray-400 mb-2">Automated Discord Announcement:</p>
                        <div className="font-mono text-xs bg-gray-950 px-4 py-2 rounded-lg border border-gray-700 text-blue-500">
                            Triggered every {user?.discordAnnounceDay || 'Thursday'} at {user?.discordAnnounceTime || '12:00'} UTC
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
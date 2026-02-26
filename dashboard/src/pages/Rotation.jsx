import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
    LayoutGrid, Shield, Save,
    Lock, AlertTriangle, Megaphone
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { getRewardIcon } from '../assets/rewards/index';

export default function Rotation() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    // Data State
    const [buildings, setBuildings] = useState([]);
    const [alliances, setAlliances] = useState([]);
    const [matrix, setMatrix] = useState({});
    const [rewards, setRewards] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Season Management State
    const [seasons, setSeasons] = useState([]);
    const [currentSeason, setCurrentSeason] = useState(null);
    const [viewSeason, setViewSeason] = useState(null);

    const weeks = [1, 2, 3, 4, 5, 6, 7, 8];

    // Determine if the currently viewed season is in the past
    const isReadOnly = useMemo(() => {
        if (!currentSeason || !viewSeason) return false;
        return viewSeason < currentSeason;
    }, [currentSeason, viewSeason]);

    useEffect(() => {
        void fetchInitialData();
    }, []);

    // Re-fetch the schedule whenever the selected season changes
    useEffect(() => {
        if (viewSeason) {
            void fetchSchedule(viewSeason);
        }
    }, [viewSeason]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);

            // Fetch structural data and the season state
            const [bRes, aRes, sListRes] = await Promise.all([
                client.get('/moderator/rotation/buildings'),
                client.get('/moderator/options'),
                client.get('/moderator/rotation/seasons')
            ]);

            setBuildings(bRes.data);
            setAlliances(aRes.data.alliances || []);
            setSeasons(sListRes.data.availableSeasons);
            setCurrentSeason(sListRes.data.liveSeason);
            setViewSeason(sListRes.data.liveSeason);

            // Fetch rewards (Weekly rewards are static across seasons)
            const rewardPromises = weeks.map(w => client.get(`/moderator/rotation/rewards/${w}`));
            const rewardResponses = await Promise.all(rewardPromises);

            const rewardsMap = {};
            rewardResponses.forEach((res, index) => {
                rewardsMap[weeks[index]] = res.data;
            });
            setRewards(rewardsMap);

        } catch (err) {
            toast.error("Failed to load initial rotation data");
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedule = async (seasonId) => {
        try {
            const res = await client.get(`/moderator/rotation/schedule/${seasonId}`);
            const scheduleMap = {};
            res.data.forEach(entry => {
                scheduleMap[`${entry.buildingId}-${entry.week}`] = entry.allianceId;
            });
            setMatrix(scheduleMap);
        } catch (err) {
            toast.error(`Failed to load Season ${seasonId} schedule`);
        }
    };

    const handleCellChange = (buildingId, week, allianceId) => {
        if (!isAdmin || isReadOnly) return;
        setMatrix(prev => ({
            ...prev,
            [`${buildingId}-${week}`]: parseInt(allianceId) || null
        }));
    };

    const handleAnnounceRotation = async (week) => {
        if (isReadOnly) return;
        try {
            await client.post(`/moderator/discord/rotation/${viewSeason}/${week}`);
            toast.success(`Week ${week} schedule sent to Discord!`);
        } catch (err) {
            toast.error("Failed to announce rotation.");
        }
    };

    const hasConflict = useMemo(() => {
        const conflicts = {};
        weeks.forEach(w => {
            const fortAssignments = {};
            const shAssignments = {};

            buildings.forEach(b => {
                const val = matrix[`${b.id}-${w}`];
                if (!val) return;
                if (b.type === 'Fortress') {
                    fortAssignments[val] = (fortAssignments[val] || 0) + 1;
                } else if (b.type === 'Stronghold') {
                    shAssignments[val] = (shAssignments[val] || 0) + 1;
                }
            });

            let fortLimit = 3;
            if (w === 1) fortLimit = 1;
            if (w === 2) fortLimit = 2;
            const shLimit = 1;

            buildings.forEach(b => {
                const val = matrix[`${b.id}-${w}`];
                if (!val) return;
                if (b.type === 'Fortress' && fortAssignments[val] > fortLimit) conflicts[`${b.id}-${w}`] = true;
                else if (b.type === 'Stronghold' && shAssignments[val] > shLimit) conflicts[`${b.id}-${w}`] = true;
            });
        });
        return conflicts;
    }, [matrix, buildings]);

    const handleSave = async () => {
        if (isReadOnly) return;
        if (Object.keys(hasConflict).length > 0) {
            toast.error("Cannot save: Detected alliance scheduling conflicts.");
            return;
        }

        setSaving(true);
        try {
            const entries = Object.entries(matrix).map(([key, allianceId]) => {
                const [buildingId, week] = key.split('-').map(Number);
                return {
                    seasonId: viewSeason,
                    week: week,
                    buildingId: buildingId,
                    allianceId: allianceId
                };
            }).filter(e => e.allianceId !== null);

            await client.post('/moderator/rotation/save', { seasonId: viewSeason, entries });
            toast.success(`Season ${viewSeason} plan saved!`);
        } catch (err) {
            toast.error("Failed to save schedule");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center font-mono text-blue-500">SYNCHRONIZING SEASON MATRIX...</div>;

    return (
        <AdminLayout title="Fortress Rotation">
            <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
                <main className="container mx-auto px-4 py-8 max-w-[1600px] space-y-6">

                    {/* Header with Season Selector */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                            <div>
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <LayoutGrid className="text-blue-400" /> Season {viewSeason} Matrix
                                </h2>
                                <p className="text-gray-500 text-sm mt-1">Status: {isReadOnly ? 'Archived / Read-Only' : 'Active Planning'}</p>
                            </div>

                            <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 flex items-center gap-3">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Select Season</span>
                                <select
                                    value={viewSeason}
                                    onChange={(e) => setViewSeason(parseInt(e.target.value))}
                                    className="bg-transparent text-blue-400 font-bold outline-none cursor-pointer text-sm"
                                >
                                    {seasons.map(s => (
                                        <option key={s} value={s} className="bg-gray-800">Season {s} {s === currentSeason ? '(Live)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {isAdmin && !isReadOnly ? (
                            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all disabled:opacity-50">
                                <Save size={18} /> {saving ? 'Saving...' : `Save Season ${viewSeason}`}
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 text-amber-400 border border-amber-800/30 rounded-lg text-xs font-bold uppercase">
                                <Lock size={14} /> {isReadOnly ? `Season ${viewSeason} Locked` : 'Restricted Access'}
                            </div>
                        )}
                    </div>

                    {/* The Matrix Table */}
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                <tr className="bg-gray-700/30 border-b border-gray-700">
                                    <th className="p-4 w-48 sticky left-0 bg-gray-800 z-10 border-r border-gray-700">Building</th>
                                    {weeks.map(w => (
                                        <th key={w} className="p-4 text-center min-w-[140px] font-black text-xs uppercase tracking-tighter text-gray-400 group relative">
                                            <div className="flex items-center justify-center gap-2">
                                                <span>Week {w}</span>
                                                {isAdmin && !isReadOnly && (
                                                    <button onClick={() => handleAnnounceRotation(w)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white rounded-md border border-blue-500/30">
                                                        <Megaphone size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/50">
                                {buildings.map(b => (
                                    <tr key={b.id} className="hover:bg-gray-700/20 transition-colors">
                                        <td className="p-4 sticky left-0 bg-gray-800 z-10 border-r border-gray-700">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${b.type === 'Stronghold' ? 'bg-purple-900/30 text-purple-400' : 'bg-blue-900/30 text-blue-400'}`}>
                                                    <Shield size={16} />
                                                </div>
                                                <div className="font-bold text-sm">{b.type} {b.internal_id}</div>
                                            </div>
                                        </td>
                                        {weeks.map(w => {
                                            const coord = `${b.id}-${w}`;
                                            const conflict = hasConflict[coord];
                                            const currentAlliance = matrix[coord] || '';
                                            const cellReward = (rewards[w] || []).find(r => r.building_id === b.id);

                                            return (
                                                <td key={w} className={`p-2 align-middle ${conflict ? 'bg-red-900/10' : ''}`}>
                                                    <div className="flex items-center gap-2 relative">
                                                        <div className="flex-shrink-0 w-7 flex justify-center items-center">
                                                            {cellReward?.icon && (
                                                                <img src={getRewardIcon(cellReward.icon)} alt="" className="w-7 h-7 object-contain drop-shadow-md" title={cellReward.name} />
                                                            )}
                                                        </div>
                                                        <div className="relative w-full">
                                                            <select
                                                                disabled={!isAdmin || isReadOnly}
                                                                value={currentAlliance}
                                                                onChange={(e) => handleCellChange(b.id, w, e.target.value)}
                                                                className={`w-full bg-gray-900 border appearance-none rounded-lg px-2 py-2 text-xs font-bold text-center outline-none transition-all ${
                                                                    conflict ? 'border-red-500 text-red-400' : currentAlliance ? 'border-blue-500/30 text-blue-100' : 'border-gray-700 text-gray-500'
                                                                } disabled:opacity-80`}
                                                            >
                                                                <option value="">---</option>
                                                                {alliances.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                            </select>
                                                            {conflict && <div className="absolute -top-2 -right-2"><AlertTriangle size={16} className="text-red-500 fill-red-900" /></div>}
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
                </main>
            </div>
        </AdminLayout>
    );
}
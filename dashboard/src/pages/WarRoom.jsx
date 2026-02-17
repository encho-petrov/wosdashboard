import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import {
    Swords, Shield, Users, Search, Filter,
    ArrowRight, ArrowLeft, RefreshCw, XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WarRoom() {
    const [players, setPlayers] = useState([]);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(new Set());

    // Filters
    const [filterText, setFilterText] = useState('');
    const [filterTroops, setFilterTroops] = useState('All');
    const [filterAvail, setFilterAvail] = useState('All');
    const [hideDeployed, setHideDeployed] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [pRes, sRes] = await Promise.all([
                client.get('/moderator/players'), // Reuse existing roster endpoint
                client.get('/moderator/war-room/stats')     // New stats endpoint
            ]);
            setPlayers(pRes.data);
            setStats(sRes.data);
        } catch (err) {
            toast.error("Failed to load War Room data");
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredPlayers = useMemo(() => {
        return players.filter(p => {
            // 1. Text Search
            if (filterText && !p.nickname?.toLowerCase().includes(filterText.toLowerCase())) return false;
            // 2. Troop Type
            if (filterTroops !== 'All' && p.troopType !== filterTroops) return false;
            // 3. Availability
            if (filterAvail !== 'All' && p.battleAvailability !== filterAvail) return false;
            // 4. Hide Deployed
            if (hideDeployed && p.fightingAllianceId) return false;

            return true;
        });
    }, [players, filterText, filterTroops, filterAvail, hideDeployed]);

    // Selection Handlers
    const toggleSelect = (id) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const selectAll = () => {
        if (selected.size === filteredPlayers.length) setSelected(new Set()); // Deselect all
        else setSelected(new Set(filteredPlayers.map(p => p.fid))); // Select all visible
    };

    // Action: Deploy
    const handleDeploy = async (allianceId) => {
        if (selected.size === 0) return;

        try {
            await client.post('/moderator/war-room/deploy', {
                playerIds: Array.from(selected),
                allianceId: allianceId
            });

            toast.success(`Deployed ${selected.size} troops!`);
            setSelected(new Set());
            fetchData(); // Refresh data to update lists and stats
        } catch (err) {
            toast.error("Deployment failed");
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans flex flex-col">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 px-4">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold flex items-center text-white">
                        <Swords className="mr-3 text-red-500 w-8 h-8" />
                        War Room <span className="text-gray-500 text-sm ml-3 font-normal">Tactical Deployment</span>
                    </h1>
                </div>
                <div className="flex gap-4">
                    {/* Global Stats */}
                    {stats.map(s => (
                        <div key={s.id} className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 flex items-center gap-3">
                            <Shield className="w-4 h-4 text-red-400" />
                            <span className="font-bold text-gray-200">{s.name}</span>
                            <span className="bg-gray-700 px-2 rounded text-sm text-blue-300">{s.memberCount}</span>
                            <span className="text-xs text-yellow-500 font-mono">{(s.totalPower/1000000).toFixed(0)}M</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: THE POOL */}
                <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden shadow-xl">

                    {/* Filters Toolbar */}
                    <div className="p-4 border-b border-gray-700 bg-gray-800 flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search Reserves..."
                                    className="bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm w-48 focus:border-blue-500 outline-none"
                                    value={filterText} onChange={e => setFilterText(e.target.value)}
                                />
                            </div>

                            <select
                                className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm outline-none"
                                value={filterTroops} onChange={e => setFilterTroops(e.target.value)}
                            >
                                <option value="All">All Troops</option>
                                <option value="Helios">Helios</option>
                                <option value="Brilliant">Brilliant</option>
                                <option value="Apex">Apex</option>
                            </select>

                            <select
                                className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm outline-none"
                                value={filterAvail} onChange={e => setFilterAvail(e.target.value)}
                            >
                                <option value="All">Any Availability</option>
                                <option value="Full">Full Event</option>
                                <option value="4h+">4h+</option>
                                <option value="Unavailable">Unavailable</option>
                            </select>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={hideDeployed}
                                onChange={e => setHideDeployed(e.target.checked)}
                                className="rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-0"
                            />
                            Hide Assigned
                        </label>
                    </div>

                    {/* Player List */}
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase sticky top-0 backdrop-blur-md">
                            <tr>
                                <th className="p-4 w-10">
                                    <input type="checkbox" onChange={selectAll} checked={selected.size > 0 && selected.size === filteredPlayers.length} />
                                </th>
                                <th className="p-4">Player</th>
                                <th className="p-4">Power</th>
                                <th className="p-4">Troops</th>
                                <th className="p-4">Availability</th>
                                <th className="p-4">Current Deployment</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700 text-sm">
                            {filteredPlayers.map(p => (
                                <tr
                                    key={p.fid}
                                    onClick={() => toggleSelect(p.fid)}
                                    className={`cursor-pointer transition-colors ${
                                        selected.has(p.fid) ? 'bg-blue-900/20' : 'hover:bg-gray-700/30'
                                    }`}
                                >
                                    <td className="p-4">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(p.fid)}
                                            onChange={() => {}} // Handled by row click
                                            className="pointer-events-none"
                                        />
                                    </td>
                                    <td className="p-4 font-bold text-white flex items-center gap-2">
                                        {p.nickname}
                                        <span className="text-gray-500 text-xs font-normal">({p.stoveLv})</span>
                                    </td>
                                    <td className="p-4 text-yellow-500 font-mono">{(p.power/1000000).toFixed(1)}M</td>
                                    <td className="p-4">
                       <span className={`px-2 py-0.5 rounded text-xs border ${
                           p.troopType === 'Helios' ? 'border-orange-500 text-orange-400' : 'border-gray-600 text-gray-500'
                       }`}>{p.troopType}</span>
                                    </td>
                                    <td className="p-4 text-xs">
                                        {p.battleAvailability === 'Full'
                                            ? <span className="text-green-400 font-bold">Full Event</span>
                                            : <span className="text-gray-400">{p.battleAvailability}</span>
                                        }
                                    </td>
                                    <td className="p-4 text-xs">
                                        {p.fightingAllianceName
                                            ? <span className="text-red-400 font-bold bg-red-900/10 px-2 py-1 rounded border border-red-900/30">{p.fightingAllianceName}</span>
                                            : <span className="text-gray-600 italic">Reserve</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-500 text-center">
                        Showing {filteredPlayers.length} / {players.length} players. {selected.size} selected.
                    </div>
                </div>

                {/* RIGHT COLUMN: DEPLOYMENT ZONES */}
                <div className="flex flex-col gap-4">

                    {/* Action Header */}
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg text-center">
                        <h2 className="text-gray-400 uppercase text-xs font-bold tracking-widest mb-2">Selection Actions</h2>
                        <div className="text-3xl font-bold text-white mb-4">{selected.size} <span className="text-lg font-normal text-gray-500">Troops Selected</span></div>

                        <button
                            onClick={() => handleDeploy(null)}
                            disabled={selected.size === 0}
                            className="w-full py-3 rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <XCircle className="w-5 h-5" /> Return to Reserve
                        </button>
                    </div>

                    {/* Deployment Targets */}
                    {stats.map(alliance => (
                        <button
                            key={alliance.id}
                            onClick={() => handleDeploy(alliance.id)}
                            disabled={selected.size === 0}
                            className="group relative bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-gray-700 hover:border-red-500/50 transition-all text-left shadow-lg overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Swords className="w-32 h-32 text-red-500" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-xl font-bold text-white group-hover:text-red-400 transition-colors">{alliance.name}</h3>
                                    <Shield className="w-6 h-6 text-gray-600 group-hover:text-red-500 transition-colors" />
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <div className="text-gray-500 text-xs uppercase">Troops</div>
                                        <div className="text-white font-mono text-lg">{alliance.memberCount}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500 text-xs uppercase">Power</div>
                                        <div className="text-yellow-500 font-mono text-lg">{(alliance.totalPower/1000000).toFixed(0)}M</div>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center text-blue-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                    Deploy Selection <ArrowRight className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </button>
                    ))}

                </div>
            </div>
        </div>
    );
}
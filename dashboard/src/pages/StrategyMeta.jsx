import { useState, useEffect, useRef } from 'react';
import client, { API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { toast } from 'react-toastify';
import { Swords, Shield, Save, Users, PawPrint, Send, X, Map as MapIcon, MapPin as Pin } from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import { useRateLimit } from '../hooks/useRateLimit';
import html2canvas from 'html2canvas';
import svsMapImage from '../assets/maps/svs.png';
import tyrantMapImage from '../assets/maps/tyrant.webp';
import tundraMapImage from '../assets/maps/foundry.png';

const HeroSlot = ({ label, slotIndex, selectedId, heroes, onChange }) => {
    const selectedHero = (heroes || []).find(h => h.id === parseInt(selectedId));

    return (
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex flex-col items-center gap-3">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label} {slotIndex + 1}</span>
            <div className="w-16 h-16 rounded-full bg-gray-900 border-2 border-gray-700 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                {selectedHero ? (
                    <img
                        src={`${API_URL}${selectedHero.localImagePath}`}
                        alt={selectedHero.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    <Users className="text-gray-600 w-6 h-6" />
                )}
            </div>
            <select
                aria-label={`${label} ${slotIndex + 1}`}
                value={selectedId || ''}
                onChange={(e) => onChange(slotIndex, e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs font-bold text-center outline-none focus:border-blue-500 text-gray-200"
            >
                <option value="">Select Hero...</option>
                {(heroes || []).map(h => (
                    <option key={h.id} value={h.id}>{h.name} ({h.troopType})</option>
                ))}
            </select>
        </div>
    );
};

export default function Strategy() {
    const { user } = useAuth();
    const { features } = useApp();
    const isAdmin = user?.role === 'admin';

    // Core State
    const [heroes, setHeroes] = useState([]);
    const [captains, setCaptains] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('Attack');

    // Meta State
    const [attackData, setAttackData] = useState({
        infantryRatio: 0, lancerRatio: 0, marksmanRatio: 0,
        leads: [null, null, null], joiners: [null, null, null, null]
    });

    const [defenseData, setDefenseData] = useState({
        infantryRatio: 0, lancerRatio: 0, marksmanRatio: 0,
        leads: [null, null, null], joiners: [null, null, null, null]
    });

    const mapRef = useRef(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [mapEventType, setMapEventType] = useState('SvS');
    const [mapData, setMapData] = useState({
        SvS: { topLeft: '', topRight: '', bottomLeft: '', bottomRight: '' },
        Tyrant: { x: 50, y: 50 },
        Tundra: {
            imperial: '',
            mercenary: '',
            munition: '',
            boiler: '',
            repair4: '',
            repair3: '',
            transit: '',
            prototype1: '',
            repair1: '',
            repair2: '',
            prototype2: ''
        }
    });

    // Pet Schedule State
    const STATIC_SLOTS = [
        { id: 1, label: "Hours 12:00 - 14:00 UTC", startHour: 12, startMinute: 0 },
        { id: 2, label: "Hours 14:00 - 16:00 UTC", startHour: 14, startMinute: 0 },
        { id: 3, label: "Hours 15:00 - 17:00 UTC", startHour: 15, startMinute: 0 },
    ];
    const [fightDate, setFightDate] = useState('');
    const [schedule, setSchedule] = useState({ 1: [], 2: [], 3: [] });

    // Rate Limiter
    const postNotifyData = (payload) => client.post('/moderator/strategy/notify', payload);
    const {
        execute: executeNotify,
        isPending: isNotifyPending,
        cooldown: notifyCooldown
    } = useRateLimit(postNotifyData);

    useEffect(() => {
        if (isAdmin) {
            void fetchInitialData();
        }
    }, [isAdmin]);

    useEffect(() => {
        if (activeTab === 'Pet Schedule') {
            void fetchPetSchedule(fightDate);
        }
    }, [activeTab, fightDate]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [heroRes, activeRes, capRes] = await Promise.all([
                client.get('/moderator/strategy/heroes'),
                client.get('/moderator/strategy/active'),
                client.get('/moderator/strategy/captains')
            ]);

            setHeroes(heroRes.data);
            setCaptains(capRes.data || []);

            if (activeRes.data.attack) setAttackData(activeRes.data.attack);
            if (activeRes.data.defense) setDefenseData(activeRes.data.defense);

            // Populate saved map data if it exists in the active strategy payload
            if (activeRes.data.mapData) {
                setMapData(prev => ({ ...prev, ...activeRes.data.mapData }));
            }

        } catch (err) {
            toast.error("Failed to load strategy data");
        } finally {
            setLoading(false);
        }
    };

    const fetchPetSchedule = async (targetDate) => {
        try {
            const res = await client.get(`/moderator/strategy/pets?date=${targetDate}`);
            if (res.data) {
                if (!targetDate && res.data.date) setFightDate(res.data.date);
                setSchedule(res.data.schedule || { 1: [], 2: [], 3: [] });
            }
        } catch (err) {
            if (!targetDate) setFightDate(new Date().toISOString().split('T')[0]);
            setSchedule({ 1: [], 2: [], 3: [] });
        }
    };

    const handleSave = async () => {
        if (activeTab === 'Pet Schedule') return handleSavePets();

        setSaving(true);
        try {
            let payload;

            // Handle Tactical Map Saving
            if (activeTab === 'Tactical Map') {
                payload = {
                    type: 'TacticalMap',
                    mapData: mapData // Send the whole flexible JSON object
                };
            } else {
                // Handle Attack/Defense Saving
                const currentData = activeTab === 'Attack' ? attackData : defenseData;
                if (currentData.leads.includes(null) || currentData.leads.includes('')) {
                    setSaving(false);
                    return toast.error("Please assign all 3 Lead Heroes.");
                }
                if (currentData.joiners.includes(null) || currentData.joiners.includes('')) {
                    setSaving(false);
                    return toast.error("Please assign all 4 Joiner Heroes.");
                }

                payload = {
                    type: activeTab,
                    infantryRatio: parseInt(currentData.infantryRatio) || 0,
                    lancerRatio: parseInt(currentData.lancerRatio) || 0,
                    marksmanRatio: parseInt(currentData.marksmanRatio) || 0,
                    leads: currentData.leads.map(Number),
                    joiners: currentData.joiners.map(Number),
                    mapData: mapData // Keep map data attached so it doesn't get wiped out
                };
            }

            await client.post('/moderator/strategy/meta', payload);
            toast.success(`${activeTab} saved successfully!`);
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to save strategy");
        } finally {
            setSaving(false);
        }
    };

    const handleSavePets = async () => { /* Existing Pet Save Logic */
        if (!fightDate) return toast.error("Please select a Fight Date.");
        setSaving(true);
        try {
            await client.post('/moderator/strategy/pets', { fightDate, schedule });
            toast.success("Pet Schedule saved successfully!");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to save schedule");
        } finally {
            setSaving(false);
        }
    };

    const handlePublishToDiscord = async () => {
        if (activeTab === 'Tactical Map') {
            return announceMapToDiscord();
        }

        try {
            await executeNotify({ target: activeTab, fightDate: fightDate });
            toast.success(`Published ${activeTab} to Discord!`);
        } catch (err) {
            if (err?.response?.status !== 429) toast.error("Failed to send Discord notification.");
        }
    };

    const announceMapToDiscord = async () => {
        if (!mapRef.current) return;
        setIsCapturing(true); // Triggers re-render to hide UI elements we don't want in the photo

        try {
            // Small timeout to allow React to render the "clean" state before snapshotting
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(mapRef.current, {
                useCORS: true,
                scale: 2, // High resolution for Discord
                backgroundColor: '#030712' // Tailwind gray-950
            });

            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('image', blob, `${mapEventType.toLowerCase()}_map.png`);
                formData.append('eventType', mapEventType);
                formData.append('message', `🗺️ **New ${mapEventType} Tactical Map Deployed!**`);

                try {
                    await client.post('/moderator/discord/announce-map', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    toast.success("Map published to Discord!");
                } catch (err) {
                    toast.error("Failed to send map to Discord.");
                } finally {
                    setIsCapturing(false);
                }
            }, 'image/png');

        } catch (err) {
            console.error(err);
            toast.error("Failed to generate map image.");
            setIsCapturing(false);
        }
    };

    const handleMapChange = (key, value) => {
        setMapData(prev => ({
            ...prev,
            [mapEventType]: { ...prev[mapEventType], [key]: value }
        }));
    };

    const handleTyrantClick = (e) => {
        if (mapEventType !== 'Tyrant') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setMapData(prev => ({ ...prev, Tyrant: { x, y } }));
    };

    const updateSlot = (type, role, index, value) => {
        const setter = type === 'Attack' ? setAttackData : setDefenseData;
        setter(prev => {
            const newArr = [...prev[role]];
            newArr[index] = value;
            return { ...prev, [role]: newArr };
        });
    };

    const updateRatio = (type, field, value) => {
        const setter = type === 'Attack' ? setAttackData : setDefenseData;
        setter(prev => ({ ...prev, [field]: value }));
    };

    const addCaptainToSlot = (slotId, captainFid) => {
        if (!captainFid) return;
        setSchedule(prev => ({ ...prev, [slotId]: [...(prev[slotId] || []), parseInt(captainFid)] }));
    };

    const removeCaptainFromSlot = (slotId, captainFid) => {
        setSchedule(prev => ({ ...prev, [slotId]: (prev[slotId] || []).filter(id => id !== captainFid) }));
    };

    if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Admin Access Required</div>;
    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center font-mono text-blue-500">LOADING TACTICAL ASSETS...</div>;

    const currentData = activeTab === 'Attack' ? attackData : defenseData;
    const isNotifyLocked = isNotifyPending || notifyCooldown > 0;

    return (
        <AdminLayout title="War Strategy">
            <div className="min-h-screen bg-gray-900 text-gray-100 font-sans pb-12">
                <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">

                    {/* Header & Tabs */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-gray-800 pb-4">
                        <div className="flex w-full md:w-auto overflow-x-auto no-scrollbar gap-1 md:gap-4">
                            <button onClick={() => setActiveTab('Attack')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-6 py-3 rounded-t-xl font-bold transition-colors whitespace-nowrap text-xs sm:text-sm md:text-base ${activeTab === 'Attack' ? 'bg-gray-800 text-red-400 border-t-2 border-red-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                <Swords size={16} className="md:w-5 md:h-5" /> Attack
                            </button>
                            <button onClick={() => setActiveTab('Defense')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-6 py-3 rounded-t-xl font-bold transition-colors whitespace-nowrap text-xs sm:text-sm md:text-base ${activeTab === 'Defense' ? 'bg-gray-800 text-blue-400 border-t-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                <Shield size={16} className="md:w-5 md:h-5" /> Defense
                            </button>
                            <button onClick={() => setActiveTab('Tactical Map')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-6 py-3 rounded-t-xl font-bold transition-colors whitespace-nowrap text-xs sm:text-sm md:text-base ${activeTab === 'Tactical Map' ? 'bg-gray-800 text-purple-400 border-t-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                <MapIcon size={16} className="md:w-5 md:h-5" /> Tactical Map
                            </button>
                            {(features?.Squads &&
                                <button onClick={() => setActiveTab('Pet Schedule')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-6 py-3 rounded-t-xl font-bold transition-colors whitespace-nowrap text-xs sm:text-sm md:text-base ${activeTab === 'Pet Schedule' ? 'bg-gray-800 text-yellow-400 border-t-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                    <PawPrint size={16} className="md:w-5 md:h-5" /> Pets
                                </button>
                            )}
                        </div>

                        <div className="flex gap-3 w-full md:w-auto">
                            <button onClick={handleSave} disabled={saving || isCapturing} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg ${activeTab === 'Attack' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : activeTab === 'Defense' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20'}`}>
                                <Save size={18} /> {saving ? 'Saving...' : 'Save Plan'}
                            </button>
                            {features?.Discord && (
                                <button
                                    onClick={handlePublishToDiscord}
                                    disabled={isNotifyLocked || isCapturing}
                                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg ${
                                        isNotifyLocked || isCapturing
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed border border-gray-600'
                                            : 'bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-indigo-900/20'
                                    }`}
                                >
                                    <Send size={18} className={(!isNotifyPending && notifyCooldown === 0 && !isCapturing) ? "animate-pulse" : ""} />
                                    {isCapturing ? 'Snapping...' : isNotifyPending ? 'Sending...' : notifyCooldown > 0 ? `Wait ${notifyCooldown}s` : 'Announce'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-b-2xl rounded-tr-2xl p-6 border border-gray-700 shadow-xl space-y-8">

                        {/* VIEW 1: ATTACK / DEFENSE META */}
                        {(activeTab === 'Attack' || activeTab === 'Defense') && (
                            <>
                                <div>
                                    <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">📊 Troop Ratios (%)</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                                            <label className="text-xs text-gray-500 font-bold uppercase">Infantry</label>
                                            <input type="number" min="0" max="100" value={currentData.infantryRatio} onChange={(e) => updateRatio(activeTab, 'infantryRatio', e.target.value)} className="w-full bg-transparent text-xl font-black text-white outline-none mt-1" />
                                        </div>
                                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                                            <label className="text-xs text-gray-500 font-bold uppercase">Lancer</label>
                                            <input type="number" min="0" max="100" value={currentData.lancerRatio} onChange={(e) => updateRatio(activeTab, 'lancerRatio', e.target.value)} className="w-full bg-transparent text-xl font-black text-white outline-none mt-1" />
                                        </div>
                                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                                            <label className="text-xs text-gray-500 font-bold uppercase">Marksman</label>
                                            <input type="number" min="0" max="100" value={currentData.marksmanRatio} onChange={(e) => updateRatio(activeTab, 'marksmanRatio', e.target.value)} className="w-full bg-transparent text-xl font-black text-white outline-none mt-1" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-4">👑 Main Leads (Captains)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {[0, 1, 2].map(i => <HeroSlot key={`lead-${i}`} label="Lead" slotIndex={i} selectedId={currentData.leads[i]} heroes={heroes} onChange={(idx, val) => updateSlot(activeTab, 'leads', idx, val)} />)}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-4">⚔️ Rally Joiners</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[0, 1, 2, 3].map(i => <HeroSlot key={`joiner-${i}`} label="Joiner" slotIndex={i} selectedId={currentData.joiners[i]} heroes={heroes} onChange={(idx, val) => updateSlot(activeTab, 'joiners', idx, val)} />)}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* VIEW 2: TACTICAL MAP */}
                        {activeTab === 'Tactical Map' && (
                            <div className="space-y-6">
                                {/* Map Selector */}
                                {!isCapturing && (
                                    <div className="flex bg-gray-900 p-1 border border-gray-700 rounded-xl max-w-sm mx-auto">
                                        {['SvS', 'Tyrant', 'Tundra'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => setMapEventType(type)}
                                                className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-colors ${mapEventType === type ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-white'}`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Map Capture Container */}
                                <div
                                    ref={mapRef}
                                    className="relative w-full overflow-hidden rounded-2xl border-4 border-gray-800 bg-black aspect-square max-w-2xl mx-auto"
                                    style={{
                                        backgroundImage: `url(${mapEventType === 'SvS' ? svsMapImage : mapEventType === 'Tyrant' ? tyrantMapImage : tundraMapImage})`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center'
                                    }}
                                    onClick={mapEventType === 'Tyrant' && !isCapturing ? handleTyrantClick : undefined}
                                >
                                    {/* Overlay Darkener for readability */}
                                    <div className="absolute inset-0 bg-black/30 pointer-events-none" />

                                    {/* --- SvS MAP RENDERER --- */}
                                    {mapEventType === 'SvS' && (
                                        <>
                                            <input type="text" value={mapData.SvS.topLeft} onChange={(e) => handleMapChange('topLeft', e.target.value)} className={`absolute top-[20%] left-[20%] -translate-x-1/2 -translate-y-1/2 w-32 bg-gray-900/80 border-2 border-red-500 text-white font-black text-center py-2 rounded-xl backdrop-blur-sm focus:outline-none ${isCapturing ? 'border-none bg-transparent text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,1)]' : ''}`} placeholder="State # / Ally" readOnly={isCapturing} />
                                            <input type="text" value={mapData.SvS.topRight} onChange={(e) => handleMapChange('topRight', e.target.value)} className={`absolute top-[20%] left-[80%] -translate-x-1/2 -translate-y-1/2 w-32 bg-gray-900/80 border-2 border-blue-500 text-white font-black text-center py-2 rounded-xl backdrop-blur-sm focus:outline-none ${isCapturing ? 'border-none bg-transparent text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,1)]' : ''}`} placeholder="State # / Ally" readOnly={isCapturing} />
                                            <input type="text" value={mapData.SvS.bottomLeft} onChange={(e) => handleMapChange('bottomLeft', e.target.value)} className={`absolute top-[80%] left-[20%] -translate-x-1/2 -translate-y-1/2 w-32 bg-gray-900/80 border-2 border-yellow-500 text-white font-black text-center py-2 rounded-xl backdrop-blur-sm focus:outline-none ${isCapturing ? 'border-none bg-transparent text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,1)]' : ''}`} placeholder="State # / Ally" readOnly={isCapturing} />
                                            <input type="text" value={mapData.SvS.bottomRight} onChange={(e) => handleMapChange('bottomRight', e.target.value)} className={`absolute top-[80%] left-[80%] -translate-x-1/2 -translate-y-1/2 w-32 bg-gray-900/80 border-2 border-purple-500 text-white font-black text-center py-2 rounded-xl backdrop-blur-sm focus:outline-none ${isCapturing ? 'border-none bg-transparent text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,1)]' : ''}`} placeholder="State # / Ally" readOnly={isCapturing} />
                                        </>
                                    )}

                                    {/* --- TYRANT MAP RENDERER --- */}
                                    {mapEventType === 'Tyrant' && (
                                        <div
                                            className="absolute pointer-events-none z-10"
                                            style={{
                                                left: `${mapData.Tyrant.x}%`,
                                                top: `${mapData.Tyrant.y}%`,
                                                transform: 'translate(-50%, -50%)' // Hard-centered wrapper
                                            }}
                                        >
                                            <div className="relative flex items-center justify-center">
                                                {/* Radar Ping Animation */}
                                                <div className="absolute w-8 h-8 rounded-full bg-red-500/60 animate-ping" />

                                                {/* Solid Center Crosshair */}
                                                <Pin size={40} className="text-red-500 relative z-10 drop-shadow-[0_0_10px_rgba(239,68,68,1)]" />
                                            </div>
                                        </div>
                                    )}

                                    {/* --- TUNDRA MAP RENDERER --- */}
                                    {mapEventType === 'Tundra' && (
                                        <>
                                            {[
                                                { key: 'imperial', name: 'Imperial', top: '50%', left: '50%', color: 'border-orange-500' },
                                                { key: 'mercenary', name: 'Mercenary', top: '32%', left: '50%', color: 'border-green-500' },
                                                { key: 'munition', name: 'Munition', top: '74%', left: '50%', color: 'border-green-500' },

                                                { key: 'boiler', name: 'Boiler', top: '14%', left: '33%', color: 'border-green-500' },
                                                { key: 'repair4', name: 'Repair IV', top: '14%', left: '66%', color: 'border-blue-400' },

                                                { key: 'repair3', name: 'Repair III', top: '86%', left: '30%', color: 'border-blue-400' },
                                                { key: 'transit', name: 'Transit', top: '86%', left: '68%', color: 'border-green-500' },

                                                { key: 'prototype1', name: 'Prototype I', top: '43%', left: '18%', color: 'border-purple-500' },
                                                { key: 'repair1', name: 'Repair I', top: '58%', left: '12%', color: 'border-blue-400' },

                                                { key: 'repair2', name: 'Repair II', top: '48%', left: '87%', color: 'border-blue-400' },
                                                { key: 'prototype2', name: 'Prototype II', top: '61%', left: '80%', color: 'border-purple-500' }
                                            ].map((pos) => {
                                                const selectedCap = captains.find(c => c.fid === parseInt(mapData.Tundra[pos.key]));

                                                if (isCapturing) {
                                                    return selectedCap ? (
                                                        <div key={pos.key} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center drop-shadow-[0_4px_4px_rgba(0,0,0,1)]" style={{ top: pos.top, left: pos.left }}>
                                                            <span className="text-white font-black text-xs md:text-sm bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm border border-gray-600/50 whitespace-nowrap">{selectedCap.nickname}</span>
                                                            <span className="text-yellow-500 font-bold text-[8px] md:text-[10px] uppercase tracking-widest bg-black/40 px-1 rounded whitespace-nowrap">{pos.name}</span>
                                                        </div>
                                                    ) : null;
                                                }

                                                return (
                                                    <select
                                                        key={pos.key}
                                                        value={mapData.Tundra[pos.key] || ''}
                                                        onChange={(e) => handleMapChange(pos.key, e.target.value)}
                                                        className={`absolute -translate-x-1/2 -translate-y-1/2 w-24 md:w-32 bg-gray-900/90 border-2 ${pos.color} text-white text-[9px] md:text-[11px] font-bold px-1.5 py-1.5 rounded-lg backdrop-blur-md focus:outline-none shadow-xl`}
                                                        style={{ top: pos.top, left: pos.left }}
                                                    >
                                                        <option value="">{pos.name}...</option>
                                                        {captains.map(c => <option key={c.fid} value={c.fid}>{c.nickname}</option>)}
                                                    </select>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* VIEW 3: PET SCHEDULE */}
                        {activeTab === 'Pet Schedule' && features?.Squads &&  (
                            /* Existing Pet Schedule Render Code */
                            <div className="space-y-6">
                                {/* ... keeping your existing pet schedule UI exactly the same ... */}
                                <div className="flex justify-between items-end border-b border-gray-700 pb-4">
                                    <div>
                                        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest">🐾 Captain Pet Rotation</h3>
                                        <p className="text-xs text-gray-500 mt-1">Assign captains to activate their pets at specific UTC intervals.</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-xs text-yellow-500 font-bold uppercase mb-1">Fight Date (UTC)</label>
                                        <input
                                            type="date"
                                            value={fightDate}
                                            onChange={(e) => setFightDate(e.target.value)}
                                            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {STATIC_SLOTS.map((slot) => (
                                        <div key={slot.id} className="bg-gray-900 p-5 rounded-xl border border-gray-700">
                                            <div className="flex justify-between items-center mb-4">
                                                <span className="text-yellow-400 font-black tracking-wide">{slot.label}</span>
                                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">Warning sent 10m early</span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                                {(schedule[slot.id] || []).map(fid => {
                                                    const cap = (captains || []).find(c => c.fid === fid);
                                                    if (!cap) return null;
                                                    return (
                                                        <div key={cap.fid} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 relative group pr-8">
                                                            <div className="w-8 h-8 rounded-full bg-black overflow-hidden shrink-0 border border-gray-500">
                                                                {cap.avatarImage ? <img src={cap.avatarImage} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 m-2 text-gray-500" />}
                                                            </div>
                                                            <div className="overflow-hidden">
                                                                <div className="text-sm font-bold truncate">{cap.nickname}</div>
                                                                <div className="text-[10px] uppercase truncate opacity-70 text-yellow-500">{cap.allianceName || 'No Alliance'}</div>
                                                            </div>
                                                            <button aria-label={`Remove ${cap.nickname}`} onClick={() => removeCaptainFromSlot(slot.id, cap.fid)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1 bg-gray-900 rounded-full">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <select aria-label={`Assign to slot ${slot.id}`} value="" onChange={(e) => addCaptainToSlot(slot.id, e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 outline-none focus:border-yellow-500 w-full md:w-auto">
                                                <option value="">+ Assign Captain to this slot...</option>
                                                {(captains || []).filter(cap => !(schedule[slot.id] || []).includes(cap.fid)).map(cap => (
                                                    <option key={cap.fid} value={cap.fid}>{cap.nickname} {cap.allianceName ? `[${cap.allianceName}]` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </AdminLayout>
    );
}
import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield, Users, Sword, Castle, Clock, Zap } from 'lucide-react';

export default function PlayerDashboard() {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await client.get('/player/dashboard');
      setData(res.data);
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading Command Center...</div>;
  if (!data) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Profile not found.</div>;

  const { player, teammates, ministries, forts } = data;

  const getSlotTime = (index) => {
    const startH = Math.floor(index / 2).toString().padStart(2, '0');
    const startM = (index % 2 === 0) ? '00' : '30';
    const endH = Math.floor((index + 1) / 2).toString().padStart(2, '0');
    const endM = ((index + 1) % 2 === 0) ? '00' : '30';
    return `${startH}:${startM} - ${endH === '24' ? '00' : endH}:${endM}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";

    const date = new Date(dateString);

    return date.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-100 font-sans pb-10">

        {/* NAVBAR */}
        <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3">
            <Shield className="text-red-500 w-6 h-6" />
            <h1 className="text-xl font-bold tracking-wide">War Command</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <div className="text-sm font-bold text-white">{player.nickname}</div>
              <div className="text-xs text-gray-500 font-mono">FID: {player.fid}</div>
            </div>
            <button onClick={logout} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">

          {/* TOP CARD: PLAYER IDENTITY */}
          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl flex flex-col md:flex-row items-center gap-6">

            {/* Avatar + Furnace Icon */}
            <div className="relative shrink-0">
              <img
                  alt="avatar"
                  src={player.avatar || "https://via.placeholder.com/100"}
                  className="w-24 h-24 rounded-full border-4 border-gray-700 bg-black object-cover"
              />
              {player.stoveImg && (
                  <div className="absolute -bottom-2 -right-2 bg-gray-800 rounded-full flex items-center justify-center p-1 border border-gray-600 shadow-lg w-10 h-10 overflow-hidden">
                    {player.stoveImg.startsWith('http') ? (
                        <img src={player.stoveImg} className="w-full h-full object-contain" alt="Furnace" />
                    ) : (
                        <span className="text-white font-black text-[10px] tracking-tighter">
                            FC{player.stoveImg}
                        </span>
                    )}
                  </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 text-center md:text-left space-y-3 w-full">
              <h2 className="text-3xl font-bold text-white">{player.nickname}</h2>

              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {/* General Alliance Badge */}
                {player.allianceName ? (
                    <span className="px-3 py-1 rounded-lg bg-gray-700/50 text-gray-300 border border-gray-600 text-sm font-bold flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5" /> {player.allianceName}
                    </span>
                ) : (
                    <span className="px-3 py-1 rounded-lg bg-gray-700/30 text-gray-500 border border-gray-700 text-sm">No Alliance</span>
                )}

                {/* Troop Badge */}
                <span className="px-3 py-1 rounded-lg bg-gray-700/50 text-gray-300 border border-gray-600 text-sm font-bold">
                    {player.troopType || 'Unknown Troops'}
                </span>
              </div>

              {/* Power Badges Row */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-1">
                {/* Base Power Badge */}
                <div className="px-3 py-1.5 rounded-lg bg-blue-900/20 text-blue-400 border border-blue-500/30 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Base Power</span>
                    <span className="font-mono font-bold text-sm">{player.normalPower ? player.normalPower.toLocaleString() : "0"}</span>
                  </div>
                </div>

                {/* Tundra Power Badge */}
                <div className="px-3 py-1.5 rounded-lg bg-yellow-900/20 text-yellow-500 border border-yellow-500/30 flex items-center gap-2">
                  <Sword className="w-3.5 h-3.5" />
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Tundra Power</span>
                    <span className="font-mono font-bold text-sm">{player.power ? player.power.toLocaleString() : "0"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: ASSIGNMENTS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 1. FIGHTING ALLIANCE CARD */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-lg relative overflow-hidden h-[280px] flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Sword className="w-32 h-32" />
              </div>

              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4 shrink-0">Assigned Alliance</h3>

              <div className="flex-1 flex flex-col items-center justify-center">
                {player.fightingAllianceName ? (
                    <div className="text-center w-full animate-in fade-in zoom-in-95 duration-300">
                      <Shield className="w-16 h-16 text-red-500 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]" />
                      <div className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase truncate px-2">{player.fightingAllianceName}</div>
                      <div className="mt-4 text-green-400 text-xs font-bold flex items-center justify-center gap-2 bg-green-900/20 py-1.5 px-4 rounded-full border border-green-500/30 w-fit mx-auto">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div> Active Assignment
                      </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-500">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="font-black tracking-widest uppercase text-sm">Awaiting Orders</p>
                    </div>
                )}
              </div>
            </div>

            {/* 2. SQUAD CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col h-[280px]">
              <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest">Your Squad</h3>
                  {player.teamName && <span className="text-lg font-bold text-white leading-tight block mt-1">{player.teamName}</span>}
                </div>
                <Users className="text-purple-500 w-6 h-6 shrink-0" />
              </div>

              {player.teamName ? (
                  <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {teammates && teammates.length > 0 ? teammates.map(tm => (
                        <div key={tm.fid} className="flex items-center gap-3 bg-gray-900/50 p-2.5 rounded-xl border border-gray-700/50 hover:bg-gray-700/50 transition-colors">
                          <img alt="avatar" src={tm.avatar} className="w-10 h-10 rounded-full border border-gray-600 bg-black object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-gray-200 truncate">{tm.nickname}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-blue-400 font-mono" title="Base Power">⚡ {(tm.normalPower/1000000).toFixed(1)}M</span>
                              <span className="text-[10px] text-gray-600">|</span>
                              <span className="text-[10px] text-yellow-500 font-mono" title="Tundra Power">⚔️ {(tm.power/1000000).toFixed(1)}M</span>
                            </div>
                          </div>
                          {tm.stoveImg && (
                              <div className="w-7 h-7 flex items-center justify-center bg-gray-800 rounded border border-gray-600 shrink-0 overflow-hidden">
                                {tm.stoveImg.startsWith('http') ? (
                                    <img alt="avatar" src={tm.stoveImg} className="w-full h-full object-contain" />
                                ) : (
                                    <span className="text-[9px] font-black text-white tracking-tighter">F{tm.stoveImg}</span>
                                )}
                              </div>
                          )}
                        </div>
                    )) : (
                        <div className="text-gray-500 text-sm font-bold uppercase tracking-widest text-center py-10 opacity-50">No other members</div>
                    )}
                  </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-black tracking-widest uppercase text-sm">No Squad Assigned</p>
                  </div>
              )}
            </div>

            {/* 3. MINISTRY RESERVATIONS CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col h-[250px]">
              <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest">Ministry Schedule</h3>
                <Clock className="text-blue-500 w-5 h-5" />
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {ministries && ministries.length > 0 ? (
                    <div className="space-y-3">
                      {ministries.map((min, idx) => (
                          <div key={min.id || idx} className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-900/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                              <Clock className="text-blue-400 w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-sm font-black text-white">{formatDate(min.activeDate)} <span className="text-blue-400">({min.buffName})</span></div>
                              <div className="text-xs text-gray-400 mt-0.5 font-mono">{getSlotTime(min.slotIndex)} (UTC)</div>
                            </div>
                          </div>
                      ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                      <Clock className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No upcoming reservations</p>
                    </div>
                )}
              </div>
            </div>

            {/* 4. FORT ROTATION CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col h-[250px]">
              <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest">Alliance Forts</h3>
                <Castle className="text-orange-500 w-5 h-5" />
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {forts && forts.length > 0 ? (
                    <div className="space-y-3">
                      {forts.map((fort, idx) => (
                          <div key={idx} className="bg-gray-900/50 p-3 rounded-xl border border-gray-700/50 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-orange-900/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                              <Castle className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                              <span className="text-sm font-black text-white">{fort.buildingType} </span>
                              <span className="text-base text-orange-300 font-mono mt-0.5">{fort.internalId}</span>
                            </div>
                          </div>
                      ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                      <Castle className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No forts assigned this week</p>
                    </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 10px; }
      `}</style>
      </div>
  );
}
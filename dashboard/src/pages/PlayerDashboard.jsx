import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield, Users, Sword, Castle, Clock } from 'lucide-react';

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
            <button onClick={logout} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">

          {/* TOP CARD: PLAYER IDENTITY */}
          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl flex flex-col md:flex-row items-center gap-6">

            {/* Avatar + Furnace Icon */}
            <div className="relative">
              <img
                  alt="avatar"
                  src={player.avatar || "https://via.placeholder.com/100"}
                  className="w-24 h-24 rounded-full border-4 border-gray-700 bg-black object-cover"
              />
              {player.stoveImg && (
                  <div className="absolute -bottom-2 -right-2 bg-gray-800 rounded-full flex items-center justify-center p-1 border border-gray-600 shadow-lg w-10 h-10 overflow-hidden">
                    {/* Conditional Rendering based on data type */}
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
            <div className="flex-1 text-center md:text-left space-y-2">
              <h2 className="text-3xl font-bold text-white">{player.nickname}</h2>

              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                {/* General Alliance Badge */}
                {player.allianceName ? (
                    <span className="px-3 py-1 rounded bg-blue-900/40 text-blue-300 border border-blue-500/30 text-sm font-bold flex items-center gap-2">
                    <Shield className="w-3 h-3" /> {player.allianceName}
                 </span>
                ) : (
                    <span className="px-3 py-1 rounded bg-gray-700 text-gray-400 border border-gray-600 text-sm">No Alliance</span>
                )}

                {/* Power Badge */}
                <span className="px-3 py-1 rounded bg-yellow-900/20 text-yellow-500 border border-yellow-500/20 text-sm font-mono font-bold">
                 ⚡ {player.power ? player.power.toLocaleString() : "0"}
               </span>

                {/* Troop Badge */}
                <span className="px-3 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-600 text-sm">
                 {player.troopType || 'Unknown Troops'}
               </span>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: ASSIGNMENTS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 1. FIGHTING ALLIANCE CARD */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Sword className="w-32 h-32" />
              </div>

              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Assigned Alliance</h3>

              {player.fightingAllianceName ? (
                  <div className="text-center py-8">
                    <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <div className="text-4xl font-black text-white tracking-tight uppercase">{player.fightingAllianceName}</div>
                    <div className="mt-2 text-green-400 text-sm font-bold flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> Active Assignment
                    </div>
                  </div>
              ) : (
                  <div className="text-center py-10 text-gray-500">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Awaiting Orders...</p>
                  </div>
              )}
            </div>

            {/* 2. SQUAD CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col">
              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Your Squad</h3>

              {player.teamName ? (
                  <div className="flex-1 flex flex-col">
                    <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center">
                      <span className="text-xl font-bold text-white">{player.teamName}</span>
                      <Users className="text-purple-500 w-5 h-5" />
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[200px] pr-2 scrollbar-thin scrollbar-thumb-gray-600">
                      {teammates && teammates.length > 0 ? teammates.map(tm => (
                          <div key={tm.fid} className="flex items-center gap-3 bg-gray-700/30 p-2 rounded hover:bg-gray-700/50 transition-colors">
                            <img alt="avatar" src={tm.avatar} className="w-8 h-8 rounded-full bg-black" />
                            <div className="flex-1">
                              <div className="text-sm font-bold text-gray-200">{tm.nickname}</div>
                              <div className="text-xs text-yellow-500 font-mono">{tm.tundraPower ? tm.tundraPower.toLocaleString() : 0}</div>
                            </div>
                            {tm.stoveImg && (
                                <div className="w-6 h-6 flex items-center justify-center bg-gray-800 rounded border border-gray-600 shrink-0">
                                  {tm.stoveImg.startsWith('http') ? (
                                    <img alt="avatar" src={tm.stoveImg} className="w-5 h-5 object-contain" />
                                      ) : (
                                      <span className="text-[8px] font-black text-white">F{tm.stoveImg}</span>
                                      )}
                                </div>
                                )}
                          </div>
                      )) : (
                          <div className="text-gray-500 text-sm italic text-center py-4">No other members yet</div>
                      )}
                    </div>
                  </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500 min-h-[150px]">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p>No Squad Assigned</p>
                  </div>
              )}
            </div>

            {/* 3. MINISTRY RESERVATIONS CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col">
              <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest">Ministry Schedule</h3>
                <Clock className="text-blue-500 w-5 h-5" />
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {ministries && ministries.length > 0 ? (
                    <div className="space-y-3">
                      {ministries.map((min, idx) => (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-900/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                              <Clock className="text-blue-400 w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-sm font-black text-white">{min.activeDate} <span className="text-blue-400">({min.buffName})</span></div>
                              <div className="text-xs text-gray-400 mt-0.5 font-mono">{getSlotTime(min.slotIndex)} (UTC)</div>
                            </div>
                          </div>
                      ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 h-full min-h-[100px]">
                      <Clock className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm italic">No upcoming reservations</p>
                    </div>
                )}
              </div>
            </div>

            {/* 4. FORT ROTATION CARD */}
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg flex flex-col">
              <div className="mb-4 pb-4 border-b border-gray-700 flex justify-between items-center">
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
                              <snap className="text-sm font-black text-white">{fort.buildingType} </snap>
                              <snap className="text-sm text-orange-300 font-mono mt-0.5">{fort.internalId}</snap>
                            </div>
                          </div>
                      ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 h-full min-h-[100px]">
                      <Castle className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm italic">No forts assigned this week</p>
                    </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
  );
}
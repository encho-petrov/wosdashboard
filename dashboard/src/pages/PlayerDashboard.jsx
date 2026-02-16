import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield, Users, Trophy, Flame } from 'lucide-react';

export default function PlayerDashboard() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await client.get('/player/me');
        setProfile(res.data);
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading Portal...</div>;

  if (!profile) return <div className="min-h-screen bg-gray-900 text-white p-10">Error loading profile.</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Top Bar */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
           <Shield className="text-blue-500 w-6 h-6" />
           <span className="font-bold text-lg tracking-wide">Alliance Portal</span>
        </div>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        
        {/* Profile Header Card */}
        <div className="bg-gray-800 rounded-2xl p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-8 border border-gray-700 shadow-xl">
          
          {/* Avatar Section */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-700 shadow-lg bg-gray-900">
               <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            {/* Furnace Level Badge */}
            <div className="absolute -bottom-2 -right-2 bg-gray-900 rounded-full p-1 border border-gray-700 flex items-center justify-center w-10 h-10" title={`Furnace Level ${profile.stoveLv}`}>
               <span className="text-xs font-bold text-orange-400 flex items-center">
                 <Flame className="w-3 h-3 mr-0.5" />{profile.stoveLv}
               </span>
            </div>
          </div>

          {/* Info Section */}
          <div className="flex-1 text-center md:text-left space-y-2">
            <h1 className="text-3xl font-bold text-white">{profile.nickname}</h1>
            <p className="text-gray-400 font-mono text-sm">FID: {profile.fid}</p>
            
            <div className="flex flex-wrap gap-3 justify-center md:justify-start mt-4">
              <span className="px-3 py-1 bg-gray-700 rounded-full text-xs font-medium text-gray-300 border border-gray-600">
                Power: {profile.tundraPower ? profile.tundraPower.toLocaleString() : 'Not Set'}
              </span>
              <span className="px-3 py-1 bg-gray-700 rounded-full text-xs font-medium text-gray-300 border border-gray-600">
                Troops: {profile.troopType || 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* Assignment Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Alliance Card */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Shield className="w-24 h-24 text-blue-500" />
            </div>
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Assigned Alliance</h3>
            <p className="text-2xl font-bold text-white">
              {profile.allianceName || <span className="text-gray-600 italic">Unassigned</span>}
            </p>
          </div>

          {/* Team Card */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-24 h-24 text-green-500" />
            </div>
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Your Team</h3>
            <p className="text-2xl font-bold text-white">
              {profile.teamName || <span className="text-gray-600 italic">No Team Yet</span>}
            </p>
            {profile.captainName && (
               <div className="mt-4 flex items-center text-sm text-green-400">
                  <Trophy className="w-4 h-4 mr-1.5" /> Captain: {profile.captainName}
               </div>
            )}
          </div>

        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-gray-500 text-sm">
           <p>Data is synced from State #391. Contact a moderator if your assignment is incorrect.</p>
        </div>

      </main>
    </div>
  );
}

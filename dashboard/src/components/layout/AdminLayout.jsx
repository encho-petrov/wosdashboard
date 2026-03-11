import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navLinks } from '../../config/navigation';
import { LogOut, Activity, Menu, ChevronRight } from 'lucide-react';

import PullToRefresh from '../PullToRefresh';
import MfaSetupModal from '../MfaSetupModal';
import client from "../../api/client.js";
import LiveSyncManager from '../LiveSyncManager';

export default function AdminLayout({ children, title, actions }) {
    const { user, logout } = useAuth();
    const [pendingCount, setPendingCount] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        let lastSleepTime = Date.now();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                lastSleepTime = Date.now();
            } else if (document.visibilityState === 'visible') {
                const timeAsleep = Date.now() - lastSleepTime;

                if (timeAsleep > 120000) {
                    window.location.reload(true);
                } else {
                    window.dispatchEvent(new Event('resize'));
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);


    useEffect(() => {
        if (user?.role !== 'admin') {
            setPendingCount(0);
            return;
        }

        const checkQueue = async () => {
            try {
                const res = await client.get('/moderator/admin/pending');
                setPendingCount(res.data?.length || 0);
            } catch (err) {
                console.error("Background transfer check failed");
            }
        };

        void checkQueue();

        const interval = setInterval(checkQueue, 60000);

        return () => clearInterval(interval);

    }, [user?.role, location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredLinks = navLinks.filter(link => {
        const hasRole = link.requiredRoles.includes(user?.role)
        if (link.requiresAlliance && !user?.allianceId) {
            return false;
        }
        return hasRole;
    });

    const isMfaRequired = user && !user.mfaEnabled;

    return (
        <div className="flex h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden relative">
            <LiveSyncManager />
            {/* MFA OVERLAY */}
            {isMfaRequired && (
                <>
                    <MfaSetupModal isForced={true} />
                    <div className="fixed top-4 right-4 z-[60]">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-red-900/80 text-red-200 hover:text-white hover:bg-red-600 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-xl backdrop-blur-md border border-red-500/50"
                        >
                            <LogOut size={16} /> Disconnect
                        </button>
                    </div>
                </>
            )}

            {/* MOBILE SIDEBAR OVERLAY */}
            {isSidebarOpen && (
                <div className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
            )}

            {/* SIDEBAR DRAWER */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 
                transform transition-transform duration-300 ease-in-out flex flex-col shrink-0
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* ... Sidebar contents remain unchanged ... */}
                <div className="h-16 flex items-center px-6 border-b border-gray-800 shrink-0">
                    <Activity className="text-blue-500 w-6 h-6 mr-3" />
                    <span className="font-black text-lg tracking-tighter text-white uppercase">Command Console</span>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                    {filteredLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.path;
                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold transition-all group ${
                                    isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon size={18} />
                                    <span className="text-sm uppercase tracking-wider">{link.name}</span>
                                </div>
                                {isActive && <ChevronRight size={14} />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-800 bg-gray-900/50 shrink-0">
                    <Link to="/profile" onClick={() => setIsSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 bg-gray-950 rounded-xl border border-gray-800 hover:border-blue-500/50 transition-all mb-3 group relative cursor-pointer block">
                        <div className="flex items-center gap-3 w-full">
                            <div className="relative">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-xs text-white shrink-0 group-hover:bg-blue-500 transition-colors">
                                    {user?.username?.charAt(0).toUpperCase()}
                                </div>
                                {pendingCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-gray-950"></span>
                        </span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-white truncate group-hover:text-blue-400 transition-colors">{user?.username}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">{user?.role}</p>
                            </div>
                        </div>
                    </Link>
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-950/50 rounded-xl font-black text-xs uppercase transition-colors">
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 h-screen">
                <header className="h-16 bg-gray-900/50 border-b border-gray-800 px-4 lg:px-6 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg">
                            <Menu size={20} />
                        </button>
                        <h1 className="font-black text-lg text-white uppercase tracking-tighter truncate">
                            {title || 'Overview'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">{actions}</div>
                </header>

                <div className="flex-1 relative overflow-hidden">
                    <PullToRefresh>
                        <main className="h-full overflow-y-auto bg-gray-950 custom-scrollbar">
                            {isMfaRequired ? null : children}
                        </main>
                    </PullToRefresh>
                </div>
            </div>
        </div>
    );
}
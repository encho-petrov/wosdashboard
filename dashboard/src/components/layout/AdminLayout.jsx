import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Activity, ArrowLeft } from 'lucide-react';

export default function AdminLayout({ children, title, showBackButton = true, actions }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col h-screen">
            {/* Global Admin Navbar */}
            <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md shrink-0">
                <div className="flex items-center space-x-4">
                    {showBackButton && location.pathname !== '/' && (
                        <Link to="/" className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-gray-300">
                            <ArrowLeft size={20} />
                        </Link>
                    )}
                    <div className="flex items-center gap-2">
                        <Activity className="text-purple-500 w-6 h-6" />
                        <span className="font-black text-xl tracking-wider text-white">
                            {title || 'Command Center'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                        {actions}
                    <span className="text-sm font-bold text-gray-400 border border-gray-700 px-3 py-1 rounded-full bg-gray-900 shadow-inner">
                        {user?.username}
                    </span>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 px-4 py-2 rounded-lg font-bold transition-all border border-red-800/50"
                    >
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto min-h-0 relative">
                {children}
            </main>
        </div>
    );
}
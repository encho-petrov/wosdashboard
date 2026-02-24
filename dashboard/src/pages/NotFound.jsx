import { Link } from 'react-router-dom';
import { MapPinOff, Home } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-4">
            <div className="text-center max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
                        <MapPinOff size={64} className="text-purple-500" />
                    </div>
                </div>

                <h1 className="text-4xl font-black uppercase tracking-tighter mb-4 text-white">
                    404 - Sector Not Found
                </h1>

                <p className="text-sm font-bold text-gray-400 mb-8 uppercase tracking-widest">
                    The coordinates you entered lead to empty space. This route does not exist or access has been revoked.
                </p>

                <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg"
                >
                    <Home size={18} /> Return to Base
                </Link>
            </div>
        </div>
    );
}
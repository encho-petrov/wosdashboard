import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ children }) {
    const [startY, setStartY] = useState(0);
    const [pullY, setPullY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const handleTouchStart = (e) => {
        const scrollableNode = e.target.closest('.custom-scrollbar, .overflow-y-auto, .overflow-auto');

        if (!scrollableNode || scrollableNode.scrollTop === 0) {
            setStartY(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e) => {
        if (startY === 0) return;
        const currentY = e.touches[0].clientY;
        const distance = currentY - startY;

        if (distance > 0) {
            setPullY(distance * 0.4);
        }
    };

    const handleTouchEnd = () => {
        if (pullY > 60) {
            setRefreshing(true);
            window.location.reload(true);
        } else {
            setPullY(0);
            setStartY(0);
        }
    };

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-full relative overflow-hidden"
        >
            <div
                className="absolute top-0 left-0 w-full flex justify-center items-center z-[100] pointer-events-none"
                style={{
                    height: '60px',
                    transform: `translateY(${pullY > 0 ? (pullY - 60) : -60}px)`,
                    transition: pullY === 0 ? 'transform 0.3s ease-out' : 'none'
                }}
            >
                <div className="bg-gray-800 rounded-full p-2.5 shadow-2xl border border-gray-700">
                    <RefreshCw
                        className={`text-blue-500 ${refreshing ? 'animate-spin' : ''}`}
                        size={20}
                        style={{ transform: `rotate(${pullY * 4}deg)` }}
                    />
                </div>
            </div>

            <div
                className="w-full h-full"
                style={{
                    transform: `translateY(${pullY}px)`,
                    transition: pullY === 0 ? 'transform 0.3s ease-out' : 'none'
                }}
            >
                {children}
            </div>
        </div>
    );
}
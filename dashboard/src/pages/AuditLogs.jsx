import { useState, useEffect } from 'react';
import client from '../api/client';
import { Link } from 'react-router-dom';
import { ShieldAlert, Search, ArrowLeft, Activity } from 'lucide-react';

export default function AuditLogs() {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        client.get('/moderator/admin/audit-logs')
            .then(res => {
                setLogs(res.data || []);
            })
            .catch(err => {
                console.error("Failed to fetch audit logs:", err);
                setLogs([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const safeLogs = Array.isArray(logs) ? logs : [];
    const filteredLogs = safeLogs.filter(l =>
        (l.action && l.action.toLowerCase().includes(filter.toLowerCase())) ||
        (l.details && l.details.toLowerCase().includes(filter.toLowerCase()))
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            {/* Consistent Navbar */}
            <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-md">
                <div className="flex items-center space-x-3">
                    <Activity className="text-blue-500 w-6 h-6" />
                    <h1 className="text-xl font-bold tracking-wide">Audit Console</h1>
                </div>
                <Link
                    to="/"
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium border border-gray-600"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Dashboard</span>
                </Link>
            </nav>

            <main className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
                {/* Header and Search Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <ShieldAlert className="text-red-500 w-7 h-7" /> System Activity Logs
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">Tracking all administrative and security actions.</p>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        <input
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            placeholder="Search actions or details..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                </div>

                {/* Main Table Card - Matches Dashboard.jsx History Table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-700/30 text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-4">Timestamp</th>
                                <th className="p-4">Staff Member</th>
                                <th className="p-4">Action</th>
                                <th className="p-4">Details</th>
                                <th className="p-4 text-right">Source IP</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700 text-sm">
                            {loading ? (
                                <tr><td colSpan="5" className="p-12 text-center text-gray-500 animate-pulse">Loading system logs...</td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr><td colSpan="5" className="p-12 text-center text-gray-500">No logs found matching your search.</td></tr>
                            ) : (
                                filteredLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-700/30 transition-colors">
                                        <td className="p-4 text-gray-400 font-mono text-xs">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <span className="font-bold text-blue-400">{log.username || 'SYSTEM'}</span>
                                        </td>
                                        <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-900 text-gray-300 font-mono text-xs border border-gray-700">
                          {log.action}
                        </span>
                                        </td>
                                        <td className="p-4 text-gray-300 italic max-w-md truncate" title={log.details}>
                                            {log.details}
                                        </td>
                                        <td className="p-4 text-right text-gray-500 font-mono text-xs">
                                            {log.ip_address}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
import { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Play, Download, Activity, FileText, CheckCircle } from 'lucide-react';

export default function RedemptionWidget() {
    const [codes, setCodes] = useState('');
    const [activeJob, setActiveJob] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const wasRunning = useRef(false);

    useEffect(() => {
        void fetchData();
        const interval = setInterval(pollJobStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const histRes = await client.get('/moderator/jobs');
            setHistory(histRes.data || []);
        } catch (err) {
            console.error("Data fetch error", err);
        } finally {
            setLoading(false);
        }
    };

    const pollJobStatus = async () => {
        try {
            const res = await client.get('/moderator/job/current');
            if (res.data.active) {
                setActiveJob(res.data.data);
                setIsSubmitting(false);
                wasRunning.current = true;
            } else {
                setActiveJob(null);
                if (wasRunning.current) {
                    toast.success("Redemption Job Finished!");
                    wasRunning.current = false;
                    await fetchData();
                }
            }
        } catch (e) { /* Silent */ }
    };

    const handleStartJob = async (e) => {
        e.preventDefault();
        if (!codes.trim()) return toast.warning("Enter gift codes.");
        setIsSubmitting(true);
        const codeList = codes.split(',').map(c => c.trim()).filter(c => c);
        try {
            await client.post('/moderator/redeem', { giftCodes: codeList });
            toast.success("Job Launched!");
            setCodes('');
            setTimeout(() => setIsSubmitting(false), 3500);
        } catch (err) {
            toast.error("Job failed to start.");
            setIsSubmitting(false);
        }
    };

    const handleDownload = async (filename) => {
        try {
            const response = await client.get(`/moderator/reports/${filename}`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            toast.error("Download failed. File might be missing.");
        }
    };

    return (
        <div className="space-y-8">
            {/* AUTOMATION PANEL */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Launcher */}
                <div className="lg:col-span-5 bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
                        <Play size={16} className="text-green-500" /> Redemption Hub
                    </h2>
                    <form onSubmit={handleStartJob} className="space-y-4">
                        <textarea
                            aria-label="Gift Codes Input"
                            className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white font-mono text-xs focus:border-blue-500 outline-none h-40 resize-none shadow-inner"
                            placeholder="GIFTCODE1, GIFTCODE2..."
                            value={codes} onChange={e => setCodes(e.target.value)}
                        />
                        <button type="submit" disabled={!!activeJob || isSubmitting} className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg shadow-blue-900/20">
                            {isSubmitting ? 'Starting...' : (activeJob ? 'Process Running...' : 'Execute Batch')}
                        </button>
                    </form>
                </div>

                {/* Live Progress */}
                <div className="lg:col-span-7 bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
                        <Activity size={16} className="text-blue-500" /> Active Job Stream
                    </h2>
                    {!activeJob ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-700">
                            <CheckCircle size={48} className="mb-2 opacity-20" />
                            <p className="text-xs font-black uppercase tracking-widest">Systems Nominal</p>
                        </div>
                    ) : (
                        <div className="flex-1 space-y-6 flex flex-col justify-center">
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                    <span>Progress</span>
                                    <span className="text-blue-400 animate-pulse">{activeJob.status}</span>
                                </div>
                                <div className="h-4 bg-black rounded-full overflow-hidden border border-gray-800">
                                    <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${(activeJob.processed / (activeJob.total || 1)) * 100}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-gray-500 uppercase">
                                    <span>Processed: {activeJob.processed}</span>
                                    <span>Total: {activeJob.total}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RECENT RECORDS */}
            <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                        <FileText size={16} className="text-yellow-500" /> Redemption Logs
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-black text-gray-600 text-[10px] font-black uppercase tracking-widest">
                        <tr>
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">Batch Codes</th>
                            <th className="p-4">Processed</th>
                            <th className="p-4 text-center">Outcome</th>
                            <th className="p-4 text-right">Report</th>
                        </tr>
                        </thead>
                        <tbody className="text-xs">
                        {history.slice(0, 10).map(job => (
                            <tr key={job.jobId} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 text-gray-400 font-mono">{new Date(job.createdAt).toLocaleString()}</td>
                                <td className="p-4 text-gray-300 font-bold truncate max-w-[200px]">{job.giftCodes.replace(/[\[\]"]/g, '')}</td>
                                <td className="p-4 text-gray-500 font-bold">{job.processedPlayers} / {job.totalPlayers}</td>
                                <td className="p-4 text-center">
                                        <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${job.status === 'COMPLETED' ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
                                            {job.status}
                                        </span>
                                </td>
                                <td className="p-4 text-right">
                                    {job.reportPath ? (
                                        <button
                                            aria-label={`Download report ${job.jobId}`}
                                            onClick={() => handleDownload(job.reportPath)}
                                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg group-hover:text-blue-400"
                                            title="Download CSV Report"
                                        >
                                            <Download className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <span className="text-gray-700">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
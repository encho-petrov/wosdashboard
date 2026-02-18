import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import {
  LogOut, Play, Download, Activity, FileText,
  CheckCircle, Users as UsersIcon, List, Swords, Sword, Shield, KeyRound
} from 'lucide-react';

import ChangePasswordModal from '../components/ChangePasswordModal';
import MfaSetupModal from '../components/MfaSetupModal';

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [codes, setCodes] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false); // <-- ADD THIS

  const wasRunning = useRef(false);

  // 1. Fetch History
  const fetchHistory = async () => {
    try {
      const res = await client.get('/moderator/jobs');
      setHistory(res.data || []);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 2. Poll Real-time Status
  useEffect(() => {
    if (localStorage.getItem('mfa_enabled') === 'false') {
      setShowMfaModal(true);
    }
    fetchHistory();

    const interval = setInterval(async () => {
      try {
        const res = await client.get('/moderator/job/current');
        const isRunning = res.data.active;

        if (isRunning) {
          setActiveJob(res.data.data);
        } else {
          setActiveJob(null);
          if (wasRunning.current) {
            toast.success("Job Completed!");
            await fetchHistory();
          }
        }
        wasRunning.current = isRunning;
      } catch (error) {
        // Silent fail on polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleStart = async (e) => {
    e.preventDefault();
    if (!codes.trim()) return toast.warning("Please enter at least one gift code");

    const codeList = codes.split(',').map(c => c.trim()).filter(c => c !== "");

    try {
      await client.post('/moderator/redeem', { giftCodes: codeList });
      toast.success("Job started successfully!");
      setCodes('');
      wasRunning.current = true;
      setActiveJob({ status: "STARTING", processed: 0, total: 0 });
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error("A job is already running!");
      } else {
        toast.error("Failed to start job");
      }
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await client.get(`/moderator/reports/${filename}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error("Download failed.");
    }
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">

        <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-md gap-4">

          {/* Left: Brand */}
          <div className="flex items-center space-x-3">
            <Activity className="text-blue-500 w-6 h-6" />
            <h1 className="text-xl font-bold tracking-wide">
              WOS Dashboard <span className="text-gray-500 text-sm font-normal">v1.0</span>
            </h1>
          </div>

          {/* Right: Actions & User */}
          <div className="flex flex-wrap justify-center items-center gap-3">

            {/* 1. Roster */}
            <Link
                to="/roster"
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors text-sm font-medium border border-blue-500/20"
            >
              <List className="w-4 h-4" />
              <span>Roster</span>
            </Link>

            {/* 2. War Room */}
            <Link
                to="/war-room"
                className="flex items-center space-x-2 px-3 py-1.5 bg-red-900/20 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors text-sm font-medium border border-red-500/30"
            >
              <Swords className="w-4 h-4" />
              <span>War Room</span>
            </Link>

            {/* 3. Squads */}
            <Link
                to="/squads"
                className="flex items-center space-x-2 px-3 py-1.5 bg-purple-900/20 text-purple-400 hover:bg-purple-900/30 rounded-lg transition-colors text-sm font-medium border border-purple-500/30"
            >
              <Sword className="w-4 h-4" />
              <span>Squads</span>
            </Link>

            {/* 4. Users (Admin Only) */}
            {user?.role === 'admin' && (
                <Link
                    to="/users"
                    className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700/50 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium border border-gray-600/50"
                >
                  <UsersIcon className="w-4 h-4" />
                  <span>Users</span>
                </Link>
            )}
            {user?.role === 'admin' && (
                <Link
                    to="/alliances"
                    className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700/50 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium border border-gray-600/50"
                >
                  <Shield className="w-4 h-4" />
                  <span>Alliances</span>
                </Link>
            )}

            <div className="h-6 w-px bg-gray-700 mx-1 hidden md:block"></div>

            <div className="flex items-center space-x-3">
              <div className="text-right hidden md:block">
                <div className="text-sm font-bold text-white">{user?.username}</div>
                <div className="text-xs text-gray-500 uppercase">{user?.role}</div>
              </div>

              {/* --- CHANGE PASSWORD BUTTON --- */}
              <button
                  onClick={() => setShowPasswordModal(true)}
                  className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-blue-400"
                  title="Change Password"
              >
                <KeyRound className="w-5 h-5" />
              </button>

              <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-red-400"
                  title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>

        {/* --- MAIN CONTENT --- */}
        <main className="container mx-auto px-4 py-8 space-y-8 max-w-7xl">
          {/* Launcher & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Card 1: Launcher */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center text-white">
                <Play className="w-5 h-5 mr-2 text-green-400"/> New Redemption
              </h2>
              <form onSubmit={handleStart}>
                <label className="block text-sm text-gray-400 mb-2">Gift Codes (comma separated)</label>
                <textarea
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none h-32 font-mono text-sm resize-none"
                    placeholder="CODE2024, BONUS500..."
                    value={codes}
                    onChange={(e) => setCodes(e.target.value)}
                />
                <button
                    type="submit"
                    disabled={!!activeJob}
                    className={`mt-4 w-full py-3 rounded-lg font-bold flex items-center justify-center transition-all ${
                        activeJob
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/20'
                    }`}
                >
                  {activeJob ? 'System Busy...' : 'Launch Redemption Job'}
                </button>
              </form>
            </div>

            {/* Card 2: Status */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg flex flex-col relative overflow-hidden">
              <h2 className="text-lg font-semibold mb-4 flex items-center text-white z-10">
                <Activity className="w-5 h-5 mr-2 text-blue-400"/> Live Status
              </h2>

              {!activeJob ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4 opacity-50 flex-1 min-h-[160px]">
                    <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <p>System Idle. Ready for tasks.</p>
                  </div>
              ) : (
                  <div className="space-y-6 flex-1 flex flex-col justify-center z-10">
                    <div>
                      <div className="flex justify-between text-sm mb-2 font-mono">
                        <span className="text-gray-400">Job ID: <span className="text-white">{activeJob.job_id}</span></span>
                        <span className="text-blue-400 animate-pulse font-bold tracking-wider">{activeJob.status}</span>
                      </div>

                      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-3 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(2, (activeJob.processed / (activeJob.total || 1)) * 100)}%` }}
                        >
                        </div>
                      </div>

                      <div className="flex justify-between mt-2 text-xs text-gray-400 font-mono">
                        <span>Processed: <strong className="text-white">{activeJob.processed}</strong></span>
                        <span>Total: <strong className="text-white">{activeJob.total}</strong></span>
                      </div>
                    </div>
                  </div>
              )}
            </div>
          </div>

          {/* Recent History Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
              <h2 className="text-lg font-semibold flex items-center text-white">
                <FileText className="w-5 h-5 mr-2 text-purple-400"/> Recent History
              </h2>
              <button onClick={fetchHistory} className="text-sm text-blue-400 hover:text-white transition-colors">Refresh</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-700/30 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Codes</th>
                  <th className="p-4">Progress</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Report</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 text-sm">
                {loadingHistory ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">Loading...</td></tr>
                ) : history.length === 0 ? (
                    <tr><td colSpan="5" className="p-12 text-center text-gray-500">No jobs found.</td></tr>
                ) : (
                    history.map((job) => (
                        <tr key={job.jobId} className="hover:bg-gray-700/30 transition-colors">
                          <td className="p-4 text-gray-400 font-mono text-xs">{new Date(job.createdAt).toLocaleString()}</td>
                          <td className="p-4 max-w-xs truncate text-gray-300 font-mono" title={job.giftCodes}>
                            {job.giftCodes.replace(/[\[\]"]/g, '').substring(0, 30)}...
                          </td>
                          <td className="p-4 text-gray-400">{job.processedPlayers} / {job.totalPlayers}</td>
                          <td className="p-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            job.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>{job.status}</span>
                          </td>
                          <td className="p-4 text-right">
                            {job.reportPath && (
                                <button onClick={() => handleDownload(job.reportPath)} className="text-gray-400 hover:text-blue-400">
                                  <Download className="w-5 h-5" />
                                </button>
                            )}
                          </td>
                        </tr>
                    ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* --- MOUNT THE MODAL COMPONENT --- */}
        {showPasswordModal && (
            <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
        )}
        {showMfaModal && (
            <MfaSetupModal
                onClose={() => setShowMfaModal(false)}
                isForced={localStorage.getItem('mfa_enabled') === 'false'}
            />
        )}
      </div>
  );
}
import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { startRegistration } from '@simplewebauthn/browser';
import AdminLayout from '../components/layout/AdminLayout';
import { KeyRound, Fingerprint, ShieldCheck, User, Trash2, Check, X, ShieldAlert } from 'lucide-react';

export default function Profile() {
    const { user } = useAuth();

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [resolvingId, setResolvingId] = useState(null);

    useEffect(() => {
        void fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await client.get('/moderator/profile');
            setProfile(res.data);
        } catch (err) {
            toast.error("Failed to load profile data");
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            return toast.error("New passwords do not match");
        }

        setIsSubmitting(true);
        try {
            await client.post('/moderator/change-password', {
                old_password: oldPassword,
                new_password: newPassword
            });
            toast.success("Password updated successfully");
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to update password");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRegisterDevice = async () => {
        try {
            const beginRes = await client.get('/admin/webauthn/register/begin');

            // DRILL DOWN HERE:
            const options = beginRes.data.publicKey;

            if (!options) {
                toast.error("Invalid response from server");
                return;
            }

            let attResp;
            try {
                attResp = await startRegistration(options);
            } catch (error) {
                if (error.name === 'NotAllowedError') {
                    toast.error("Registration cancelled.");
                } else {
                    toast.error(`WebAuthn Error: ${error.message}`);
                }
                return;
            }

            await client.post('/admin/webauthn/register/finish', attResp);
            toast.success("Device registered successfully!");
            await fetchProfile();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to register device");
        }
    };

    const handleRemoveDevice = async (credentialId) => {
        if (!window.confirm("Remove this device? You will no longer be able to log in with it.")) return;

        try {
            await client.delete('/admin/webauthn/device', {
                data: { credential_id: credentialId }
            });
            toast.info("Device removed.");
            await fetchProfile();
        } catch (err) {
            toast.error("Failed to remove device.");
        }
    };

    const fetchTransfers = async () => {
        if (user?.role !== 'admin') return;
        try {
            const res = await client.get('/moderator/admin/pending');
            setPendingTransfers(res.data || []);
        } catch (err) {
            console.error("Failed to load transfers");
        }
    };

    useEffect(() => {
        void fetchProfile();
        void fetchTransfers();
    }, []);

    const handleResolve = async (transferId, status) => {
        setResolvingId(transferId);
        try {
            await client.put(`/moderator/admin/${transferId}/resolve`, { status });
            toast.success(`Transfer ${status}!`);
            await fetchTransfers();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to process transfer");
        } finally {
            setResolvingId(null);
        }
    };

    if (loading) return <AdminLayout title="My Profile"><div className="p-10 text-gray-500 font-mono animate-pulse">LOADING PROFILE...</div></AdminLayout>;

    return (
        <AdminLayout title="My Profile">
            <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">

                {/* Identity Card */}
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 flex items-center gap-6 shadow-lg">
                    <div className="w-16 h-16 bg-gray-900 rounded-2xl border border-gray-700 flex items-center justify-center shrink-0">
                        <User size={32} className="text-blue-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{profile?.username}</h2>
                        <div className="flex gap-2 mt-2">
                            <span className="text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">
                                {profile?.role}
                            </span>
                            {profile?.mfa_enabled && (
                                <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-1 rounded flex items-center gap-1">
                                    <ShieldCheck size={12} /> TOTP Active
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {pendingTransfers.length > 0 && (
                    <div className="bg-gray-900 rounded-2xl border border-red-900/50 p-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2 mb-4">
                            <ShieldAlert className="text-red-500" /> Action Required: Transfer Queue
                        </h3>

                        <div className="space-y-3">
                            {pendingTransfers.map(transfer => (
                                <div key={transfer.id} className="bg-gray-800 border border-gray-700 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-500">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-200">
                                            <span className="text-blue-400">{transfer.requesterName}</span> requested to move <span className="text-white font-black truncate">{transfer.targetUsername}</span>
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                                            Destination: <span className="text-gray-300">{transfer.toAllianceName || 'Unknown'}</span> • {new Date(transfer.createdAt).toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleResolve(transfer.id, 'Declined')}
                                            disabled={resolvingId === transfer.id}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-red-400 border border-red-900/50 hover:bg-red-900/30 rounded-lg font-black text-xs uppercase tracking-widest transition-all"
                                        >
                                            <X size={14} /> Decline
                                        </button>
                                        <button
                                            onClick={() => handleResolve(transfer.id, 'Approved')}
                                            disabled={resolvingId === transfer.id}
                                            className="flex items-center gap-1.5 px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-black text-xs uppercase tracking-widest shadow-lg shadow-green-900/20 transition-all"
                                        >
                                            <Check size={14} /> Approve
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Security: Biometrics */}
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-lg flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-700 pb-4">
                            <Fingerprint className="text-purple-400 w-6 h-6" />
                            <h3 className="text-lg font-bold text-white tracking-wide">Device Security</h3>
                        </div>
                        <p className="text-sm text-gray-400 mb-6 flex-1">
                            Use your device's built-in authenticator (Face ID, Touch ID, or Windows Hello) to log in securely. You can register multiple devices for convenience.
                        </p>

                        {/* Show status if they have at least one device */}
                        {profile?.devices && profile.devices.length > 0 && (
                            <div className="space-y-2 mb-6">
                                {profile.devices.map((deviceId, index) => (
                                    <div key={deviceId} className="flex items-center justify-between bg-black/40 border border-gray-700 rounded-xl p-3">
                                        <div className="flex items-center gap-3">
                                            <ShieldCheck className="w-5 h-5 text-green-400" />
                                            <div>
                                                <p className="text-xs font-bold text-gray-200">Registered Device {index + 1}</p>
                                                <p className="text-[9px] text-gray-500 font-mono truncate w-32 md:w-48">
                                                    ID: {deviceId.substring(0, 12)}...
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveDevice(deviceId)}
                                            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                            title="Remove Device"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Always show the button, just change the text contextually */}
                        <button
                            onClick={handleRegisterDevice}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <Fingerprint size={18} />
                            {profile?.has_webauthn ? 'Add Another Device' : 'Register This Device'}
                        </button>
                    </div>

                    {/* Security: Password */}
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-lg">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-700 pb-4">
                            <KeyRound className="text-blue-500 w-6 h-6" />
                            <h3 className="text-lg font-bold text-white tracking-wide">Change Password</h3>
                        </div>

                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Current Password</label>
                                <input
                                    type="password" required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-colors"
                                    value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">New Password</label>
                                <input
                                    type="password" required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-colors"
                                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Confirm New Password</label>
                                <input
                                    type="password" required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-colors"
                                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full mt-2 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { startRegistration } from '@simplewebauthn/browser';
import AdminLayout from '../components/layout/AdminLayout';
import { KeyRound, Fingerprint, ShieldCheck, User } from 'lucide-react';

export default function Profile() {
    const { user } = useAuth();

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Password Form State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
            // 1. Get the challenge from the Go backend
            const beginRes = await client.get('/webauthn/register/begin');
            const options = beginRes.data;

            // 2. Ask the browser to prompt FaceID / Windows Hello
            let attResp;
            try {
                attResp = await startRegistration(options);
            } catch (error) {
                if (error.name === 'NotAllowedError') {
                    toast.error("Registration cancelled by user.");
                } else {
                    toast.error("Biometrics not supported or failed.");
                }
                return;
            }

            // 3. Send the cryptographically signed response back to Go
            await client.post('/webauthn/register/finish', attResp);

            toast.success("Device registered successfully!");
            await fetchProfile(); // Refresh to show the active badge
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to register device");
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Security: Biometrics */}
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-lg flex flex-col">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-700 pb-4">
                            <Fingerprint className="text-purple-400 w-6 h-6" />
                            <h3 className="text-lg font-bold text-white tracking-wide">Device Security</h3>
                        </div>
                        <p className="text-sm text-gray-400 mb-6 flex-1">
                            Use your device's built-in authenticator (Face ID, Touch ID, or Windows Hello) to log in securely without needing a 6-digit code.
                        </p>

                        {profile?.has_webauthn ? (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                                <Fingerprint className="w-8 h-8 text-green-400 mx-auto mb-2" />
                                <p className="text-sm font-bold text-green-400">Biometric Login Enabled</p>
                                <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">Device is registered</p>
                            </div>
                        ) : (
                            <button
                                onClick={handleRegisterDevice}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <Fingerprint size={18} /> Register This Device
                            </button>
                        )}
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
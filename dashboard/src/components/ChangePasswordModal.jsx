import { useState } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { X, KeyRound, Save } from 'lucide-react';

export default function ChangePasswordModal({ onClose }) {
    const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error("New passwords do not match!");
        }
        if (passwords.new.length < 6) {
            return toast.error("Password must be at least 6 characters.");
        }

        setLoading(true);
        try {
            // Adjust this endpoint to match whatever your router.go expects for password changes
            await client.post('/moderator/change-password', {
                oldPassword: passwords.old,
                newPassword: passwords.new
            });
            toast.success("Password updated successfully!");
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to update password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <KeyRound className="text-blue-500 w-5 h-5" /> Change Password
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Current Password</label>
                        <input
                            type="password" required
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                            value={passwords.old} onChange={e => setPasswords({...passwords, old: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">New Password</label>
                        <input
                            type="password" required minLength={6}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                            value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Confirm New Password</label>
                        <input
                            type="password" required minLength={6}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                            value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 font-bold hover:text-white">Cancel</button>
                        <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-2">
                            <Save size={16} /> {loading ? 'Saving...' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
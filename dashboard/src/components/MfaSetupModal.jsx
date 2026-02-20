import { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { QRCodeSVG } from 'qrcode.react'; // Import the QR library
import { X, ShieldCheck } from 'lucide-react';

export default function MfaSetupModal({ onClose, isForced }) {
    const [setupData, setSetupData] = useState({ secret: '', url: '' });
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        // Fetch the secret and QR URL from backend when modal opens
        client.get('/moderator/mfa/generate')
            .then(res => {
                setSetupData(res.data);
                setLoading(false);
            })
            .catch(() => {
                toast.error("Failed to initialize MFA setup");
                onClose();
            });
    }, []);

    const handleEnableMfa = async (e) => {
        e.preventDefault();
        setVerifying(true);
        try {
            await client.post('/moderator/mfa/enable', {
                secret: setupData.secret,
                code: code
            });

            sessionStorage.setItem('mfa_enabled', 'true');
            toast.success("Two-Factor Authentication Enabled!");

            if (isForced) {
                window.location.reload();
            } else {
                onClose();
            }
        } catch (err) {
            toast.error(err.response?.data?.error || "Invalid code, try again");
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="text-green-500 w-5 h-5" /> Enable 2FA
                    </h3>
                    {!isForced && (
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                    )}
                </div>

                {loading ? (
                    <div className="p-10 text-center text-gray-500 font-mono animate-pulse">Generating Secure Key...</div>
                ) : (
                    <div className="p-6 space-y-6">
                        <div className="text-center space-y-2">
                            <p className="text-sm text-gray-300">
                                1. Scan this QR code with your Authenticator App (Google Authenticator, Authy, etc.)
                            </p>

                            <div className="flex justify-center bg-white p-4 rounded-xl inline-block mx-auto mt-4 mb-2 border-4 border-gray-700">
                                <QRCodeSVG value={setupData.url} size={180} />
                            </div>

                            <p className="text-xs text-gray-500 font-mono bg-gray-900 p-2 rounded-lg break-all">
                                Secret Key: <span className="text-gray-300">{setupData.secret}</span>
                            </p>
                        </div>

                        <form onSubmit={handleEnableMfa} className="space-y-4 border-t border-gray-700 pt-6">
                            <p className="text-sm text-gray-300 text-center">
                                2. Enter the 6-digit code from the app to verify setup.
                            </p>
                            <input
                                type="text" required maxLength={6} placeholder="000000"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 text-center text-xl tracking-[0.5em] font-mono text-white focus:border-green-500 outline-none transition-all"
                                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                            />

                            <div className="flex justify-end gap-3 pt-2">
                                {!isForced && (
                                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 font-bold hover:text-white">Cancel</button>
                                )}
                                <button
                                    type="submit"
                                    disabled={verifying || code.length !== 6}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-2"
                                >
                                    {verifying ? 'Verifying...' : 'Enable 2FA'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
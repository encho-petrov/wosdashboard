import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { toast } from 'react-toastify';
import { Shield, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';

export default function Alliances() {
    const [alliances, setAlliances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ name: '', type: 'General' });

    useEffect(() => { void fetchAlliances(); }, []);

    const fetchAlliances = async () => {
        try {
            const res = await client.get('/moderator/admin/alliances');
            setAlliances(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            toast.error("Failed to load alliances");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.name.trim()) return toast.warning("Name is required");
        try {
            if (editingId === -1) {
                await client.post('/moderator/admin/alliances', form);
                toast.success("Alliance created");
            } else {
                await client.put(`/moderator/admin/alliances/${editingId}`, form);
                toast.success("Alliance updated");
            }
            setEditingId(null);
            await fetchAlliances();
        } catch (err) {
            toast.error(err.response?.data?.error || "Operation failed");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this alliance?")) return;
        try {
            await client.delete(`/moderator/admin/alliances/${id}`);
            toast.success("Alliance deleted");
            await fetchAlliances();
        } catch (err) {
            toast.error(err.response?.data?.error || "Delete failed");
        }
    };

    return (
        <AdminLayout title="Alliance Management">
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <main className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <Shield className="text-blue-500 w-8 h-8" /> Alliances
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">Configure and manage state alliance groups.</p>
                    </div>

                    <button
                        onClick={() => { setEditingId(-1); setForm({name:'', type:'General'}); }}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                    >
                        <Plus className="w-5 h-5" /> Add New Alliance
                    </button>
                </div>

                {/* Styled Inline Form Card */}
                {editingId !== null && (
                    <div className="bg-gray-800 rounded-xl p-6 border border-blue-500/50 shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
                        <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4">
                            {editingId === -1 ? 'Create New Entry' : 'Edit Alliance'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Alliance Name</label>
                                <input
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. [XYZ] Alliance Name"
                                    value={form.name}
                                    onChange={e => setForm({...form, name: e.target.value})}
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Strategic Type</label>
                                <select
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={form.type}
                                    onChange={e => setForm({...form, type: e.target.value})}
                                >
                                    <option value="General">General</option>
                                    <option value="Fighting">Fighting</option>
                                </select>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <Save className="w-5 h-5"/> Save
                                </button>
                                <button
                                    onClick={() => setEditingId(null)}
                                    className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-bold transition-all"
                                >
                                    <X className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Standardized Table Card */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-700/30 text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-4">Alliance Details</th>
                                <th className="p-4">Strategic Tag</th>
                                <th className="p-4 text-right">Management</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700 text-sm">
                            {loading ? (
                                <tr><td colSpan="3" className="p-12 text-center text-gray-500 animate-pulse font-mono">RETRIEVING ALLIANCES...</td></tr>
                            ) : alliances.length === 0 ? (
                                <tr><td colSpan="3" className="p-12 text-center text-gray-500 italic">No alliances registered in the system.</td></tr>
                            ) : (
                                alliances.map(a => (
                                    <tr key={a.id} className="hover:bg-gray-700/30 transition-colors group">
                                        <td className="p-4 font-bold text-white group-hover:text-blue-400 transition-colors">
                                            {a.name}
                                        </td>
                                        <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest border ${
                                                    a.type === 'Fighting'
                                                        ? 'bg-red-900/20 text-red-400 border-red-500/30'
                                                        : 'bg-blue-900/20 text-blue-400 border-blue-500/30'
                                                }`}>
                                                    {(a.type || 'General').toUpperCase()}
                                                </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setEditingId(a.id); setForm({name: a.name, type: a.type}); }}
                                                    className="p-2 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors"
                                                    title="Edit Alliance"
                                                >
                                                    <Edit2 className="w-4 h-4"/>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(a.id)}
                                                    className="p-2 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors"
                                                    title="Delete Alliance"
                                                >
                                                    <Trash2 className="w-4 h-4"/>
                                                </button>
                                            </div>
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
        </AdminLayout>
    );
}
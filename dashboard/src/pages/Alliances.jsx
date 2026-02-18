import React, { useState, useEffect } from 'react';
import client from '../api/client'; // Verify this path is correct!
import { toast } from 'react-toastify';
import { Shield, Plus, Edit2, Trash2, Save, X, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Alliances() {
    const [alliances, setAlliances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ name: '', type: 'General' });

    useEffect(() => { fetchAlliances(); }, []);

    const fetchAlliances = async () => {
        try {
            const res = await client.get('/moderator/admin/alliances');
            // Ensure we always have an array even if the server returns null
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

    if (loading) return <div className="p-10 text-white font-mono">LOADING ALLIANCES...</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex justify-between items-center border-b border-gray-700 pb-6">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white border border-gray-700">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-2xl font-bold flex items-center text-white">
                            <Shield className="mr-3 text-blue-500 w-8 h-8" /> Alliance Management
                        </h1>
                    </div>
                    <button
                        onClick={() => { setEditingId(-1); setForm({name:'', type:'General'}); }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 font-bold"
                    >
                        <Plus className="w-4 h-4" /> Add Alliance
                    </button>
                </div>

                {/* Inline Form */}
                {editingId !== null && (
                    <div className="bg-gray-800 p-6 rounded-xl border border-blue-500/50 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="text-xs text-gray-400 block mb-1 uppercase font-bold">Name</label>
                            <input
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                                autoFocus
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <label className="text-xs text-gray-400 block mb-1 uppercase font-bold">Type</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                value={form.type}
                                onChange={e => setForm({...form, type: e.target.value})}
                            >
                                <option value="General">General</option>
                                <option value="Fighting">Fighting</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleSave} className="p-2.5 bg-green-600 rounded-lg hover:bg-green-500"><Save className="w-5 h-5"/></button>
                            <button onClick={() => setEditingId(null)} className="p-2.5 bg-gray-600 rounded-lg hover:bg-gray-500"><X className="w-5 h-5"/></button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-4">Alliance Name</th>
                            <th className="p-4">Type</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                        {alliances.map(a => (
                            <tr key={a.id} className="hover:bg-gray-700/30">
                                <td className="p-4 font-bold text-white">{a.name}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                      a.type === 'Fighting' ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-blue-900/30 text-blue-400 border-blue-800'
                                  }`}>
                                    {(a.type || 'General').toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    <button onClick={() => { setEditingId(a.id); setForm({name: a.name, type: a.type}); }} className="p-1.5 hover:bg-blue-600/20 text-blue-400 rounded"><Edit2 className="w-4 h-4"/></button>
                                    <button onClick={() => handleDelete(a.id)} className="p-1.5 hover:bg-red-600/20 text-red-400 rounded"><Trash2 className="w-4 h-4"/></button>
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
import { useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function LiveSyncManager() {
    const { user } = useAuth();
    const streamRef = useRef(false);

    useEffect(() => {
        if (!user || user.role !== 'admin') return;

        const token = localStorage.getItem('token');
        const baseUrl = client.defaults.baseURL || '';
        const ctrl = new AbortController();

        const connectStream = async () => {
            await fetchEventSource(`${baseUrl}/moderator/stream`, {
                method: 'GET',
                signal: ctrl.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/event-stream',
                },
                onmessage(ev) {
                    console.log(`[LiveSync] Received Event: ${ev.data}`);
                    window.dispatchEvent(new CustomEvent(ev.data));
                },
                onclose() {
                    console.log("[LiveSync] Connection closed.");
                },
                onerror(err) {
                    console.error("[LiveSync] Error:", err);
                    throw err;
                }
            });
        };

        if (!streamRef.current) {
            void connectStream();
            streamRef.current = true;
        }

        return () => {
            ctrl.abort();
            streamRef.current = false;
        };
    }, [user]);

    return null;
}
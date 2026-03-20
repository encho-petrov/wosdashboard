import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
    const { user } = useAuth();

    const [alliances, setAlliances] = useState([]);
    const [roster, setRoster] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(true);
    const [features, setFeatures] = useState({});

    const fetchGlobalData = useCallback(async (silent = false) => {
        if (!user || user.role === 'player') {
            setGlobalLoading(false);
            return;
        }

        if (!silent) setGlobalLoading(true);

        try {
            const [optionsRes, rosterRes, featuresRes] = await Promise.all([
                client.get('/moderator/options'),
                client.get('/moderator/players'),
                client.get('/system/features')
            ]);

            setAlliances(optionsRes.data.alliances || []);
            setRoster(rosterRes.data.players || rosterRes.data || []);
            setFeatures(featuresRes.data || {});
        } catch (err) {
            console.error("Failed to sync global data", err);
            toast.error("Network sync failed. Please refresh.");
        } finally {
            if (!silent) setGlobalLoading(false);
        }
    }, [user]);

    // Automatically run this when the user logs in or role changes
    useEffect(() => {
        void fetchGlobalData();
    }, [fetchGlobalData]);

    return (
        <AppContext.Provider value={{
            alliances,
            roster,
            features,
            globalLoading,
            refreshGlobalData: fetchGlobalData
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => useContext(AppContext);
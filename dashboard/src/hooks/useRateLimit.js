import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

export const useRateLimit = (apiCall) => {
    const [isPending, setIsPending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => clearInterval(timerRef.current);
    }, []);

    const startCooldown = (seconds) => {
        setCooldown(seconds);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const execute = async (...args) => {
        if (cooldown > 0 || isPending) return;

        setIsPending(true);
        try {
            const result = await apiCall(...args);
            startCooldown(30);
            return result;
        } catch (err) {
            if (err.response?.status === 429) {
                const retryAfter = err.response.data.retry_after || 30;
                startCooldown(retryAfter);
                toast.error(err.response.data.error || "Please wait before pinging again.");
            } else {
                throw err;
            }
        } finally {
            setIsPending(false);
        }
    };

    return { execute, isPending, cooldown };
};
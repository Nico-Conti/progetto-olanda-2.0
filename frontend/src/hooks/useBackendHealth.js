import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export const useBackendHealth = () => {
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/`);
                if (response.ok) {
                    setIsOnline(true);
                } else {
                    setIsOnline(false);
                }
            } catch {
                setIsOnline(false);
            }
        };

        // Check immediately
        checkHealth();

        // Poll every 30 seconds. This only drives an online/offline dot, so a
        // 5s cadence was six times the traffic for no extra information.
        const interval = setInterval(checkHealth, 30000);

        return () => clearInterval(interval);
    }, []);

    return isOnline;
};

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
            } catch (error) {
                setIsOnline(false);
            }
        };

        // Check immediately
        checkHealth();

        // Poll every 5 seconds
        const interval = setInterval(checkHealth, 5000);

        return () => clearInterval(interval);
    }, []);

    return isOnline;
};

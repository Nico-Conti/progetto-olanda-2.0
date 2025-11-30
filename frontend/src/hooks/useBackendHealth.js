import { useState, useEffect } from 'react';

export const useBackendHealth = () => {
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const response = await fetch('http://localhost:8000/');
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

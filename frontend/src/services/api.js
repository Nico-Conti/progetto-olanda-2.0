const API_URL = 'http://localhost:8000';

export const checkHealth = async () => {
    try {
        const response = await fetch(`${API_URL}/`);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error('Backend health check failed:', error);
        return null;
    }
};

export const analyzeMatch = async (comments, cornersData) => {
    try {
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comments,
                corners_data: cornersData
            }),
        });
        if (!response.ok) throw new Error('Analysis failed');
        return await response.json();
    } catch (error) {
        console.error('Analysis request failed:', error);
        return { error: error.message };
    }
};

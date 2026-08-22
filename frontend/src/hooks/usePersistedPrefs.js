import { useEffect, useState } from 'react';

/**
 * State backed by localStorage, for the filter/model settings the Hot Matches
 * and Safest Bets screens remember between visits.
 *
 * `selectedDate` is stored as an ISO string by JSON.stringify, so it is
 * rehydrated back into a Date on read.
 */
export const usePersistedPrefs = (storageKey, defaults) => {
    // Read once on mount; `defaults` is captured by the lazy initializer.
    const [prefs, setPrefs] = useState(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.selectedDate) parsed.selectedDate = new Date(parsed.selectedDate);
                return { ...defaults, ...parsed };
            }
        } catch (e) {
            console.error('Failed to load prefs', e);
        }
        return defaults;
    });

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(prefs));
        } catch (e) {
            console.error('Failed to save prefs', e);
        }
    }, [storageKey, prefs]);

    // Merge-style setter so callers can update one field at a time.
    const updatePrefs = (patch) => {
        setPrefs(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    };

    return [prefs, updatePrefs];
};

/**
 * Toggle one league in a multi-select filter where `['All']` is the
 * "everything" sentinel. Clearing the last explicit league falls back to 'All'.
 */
export const toggleLeagueSelection = (selected, league) => {
    if (league === 'All') return ['All'];
    const explicit = selected.filter(l => l !== 'All');
    if (explicit.includes(league)) {
        const result = explicit.filter(l => l !== league);
        return result.length === 0 ? ['All'] : result;
    }
    return [...explicit, league];
};

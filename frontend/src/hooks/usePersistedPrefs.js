import { useEffect, useState } from 'react';

/**
 * A stored date, but only while it still means something.
 *
 * `selectedDate` is written as an ISO string by JSON.stringify, so it has to be
 * rehydrated into a Date on read - but a date is the one preference here that
 * GOES OFF. `useUpcomingFixtures` only ever offers dates from today onwards, so
 * a date picked on Friday is no longer in the dropdown by Monday, yet it was
 * still being restored and still being filtered on: Hot Matches opened pinned
 * to a past day, matched no fixture, and showed "Of 0 upcoming matches" with
 * the stale day sitting in the control as though the user had just chosen it.
 *
 * Returns null for a past date, so the caller falls back to its default - which
 * for `selectedDate` is "Upcoming". Local midnight, not `now`: a date picked
 * earlier TODAY is still valid, and that is the same boundary `availableDates`
 * uses. An unparseable value is dropped too - `new Date('nonsense')` compares
 * false against everything and `.toDateString()` happily returns
 * "Invalid Date", so it would silently match nothing in exactly the same way.
 */
export const freshDate = (value, now = new Date()) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return date >= midnight ? date : null;
};

/**
 * State backed by localStorage, for the filter/model settings the Hot Matches
 * screen remembers between visits.
 */
export const usePersistedPrefs = (storageKey, defaults) => {
    // Read once on mount; `defaults` is captured by the lazy initializer.
    const [prefs, setPrefs] = useState(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if ('selectedDate' in parsed) parsed.selectedDate = freshDate(parsed.selectedDate);
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

import { useMemo } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Has this fixture already been played, according to the scraped stats? */
const isAlreadyPlayed = (fixture, stats) => {
    if (!stats || !stats[fixture.home]) return false;
    return stats[fixture.home].all_matches.some(
        m => m.opponent === fixture.away && m.location === 'Home'
    );
};

/**
 * The shared fixture pipeline behind Hot Matches and Safest Bets.
 *
 * Both screens need the same four things: which leagues can be filtered on,
 * which upcoming dates can be picked, which matchday is "next" per league, and
 * the resulting candidate fixtures. They differ only in how they rank the
 * candidates afterwards.
 *
 * @param {Array}  fixtures        Flat fixture list from useMatchData.
 * @param {Object} stats           processData output, used for the played check.
 * @param {Object} options.selectedLeagues  ['All'] or explicit league names.
 * @param {Date|null} options.selectedDate  Pin to one date instead of the next matchday.
 */
export const useUpcomingFixtures = (fixtures, stats, { selectedLeagues = ['All'], selectedDate = null } = {}) => {
    const availableLeagues = useMemo(() => {
        if (!fixtures) return [];
        return [...new Set(fixtures.map(f => f.league).filter(Boolean))].sort();
    }, [fixtures]);

    // Distinct fixture dates from today onwards, capped at the next 14.
    const availableDates = useMemo(() => {
        if (!fixtures) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dates = new Set();
        fixtures.forEach(f => {
            if (!f.date) return;
            const d = new Date(f.date);
            d.setHours(0, 0, 0, 0);
            if (d >= today) dates.add(d.toISOString());
        });

        return Array.from(dates)
            .map(d => new Date(d))
            .sort((a, b) => a - b)
            .slice(0, 14);
    }, [fixtures]);

    // Per league, the matchday of the soonest unplayed fixture.
    const upcomingMatchdays = useMemo(() => {
        if (!fixtures) return {};
        const leagues = [...new Set(fixtures.map(f => f.league).filter(Boolean))];
        const map = {};
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - DAY_MS);

        leagues.forEach(league => {
            const candidates = fixtures.filter(f => {
                if (f.league !== league) return false;
                if (isAlreadyPlayed(f, stats)) return false;
                // Must be today or future (24h grace for in-progress matches).
                if (f.date && new Date(f.date) < oneDayAgo) return false;
                return true;
            });

            if (candidates.length === 0) return;

            // Closest in time wins; TBD fixtures sort to the end.
            const soonest = candidates.slice().sort((a, b) => {
                const dateA = a.date ? new Date(a.date).getTime() : Infinity;
                const dateB = b.date ? new Date(b.date).getTime() : Infinity;
                return dateA - dateB;
            })[0];
            map[league] = soonest.matchday;
        });
        return map;
    }, [fixtures, stats]);

    const candidates = useMemo(() => {
        if (!fixtures || !stats) return [];
        const allLeagues = selectedLeagues.includes('All');

        return fixtures.filter(f => {
            if (!f.league) return false;
            if (!allLeagues && !selectedLeagues.includes(f.league)) return false;
            if (isAlreadyPlayed(f, stats)) return false;

            // Pinned to a specific date...
            if (selectedDate) {
                if (!f.date) return false;
                return new Date(f.date).toDateString() === selectedDate.toDateString();
            }

            // ...otherwise the league's upcoming matchday.
            return f.matchday === upcomingMatchdays[f.league];
        });
    }, [fixtures, stats, selectedLeagues, selectedDate, upcomingMatchdays]);

    return { availableLeagues, availableDates, upcomingMatchdays, candidates };
};

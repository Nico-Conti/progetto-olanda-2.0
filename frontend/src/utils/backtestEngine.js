import { resolveStatKey, statPair } from './statistics.js';

/**
 * Incremental replacement for calling `processData(matches.slice(0, i))` inside
 * a walk-forward loop.
 *
 * The naive version rebuilds every team's whole history at each step, which is
 * O(n^2) per parameter combination. Since the walk only ever *appends* one more
 * match to the history, we can keep a running accumulator instead and add to it
 * in O(1), which makes a full sweep linear.
 *
 * The accumulator's shape is identical to `processData`'s return value, so it
 * can be handed straight to `calculatePrediction`.
 */

const emptyTeam = () => ({
    home_for: [],
    home_ag: [],
    home_totals: [],
    away_for: [],
    away_ag: [],
    away_totals: [],
    all_matches: [],
});

export const createStatsAccumulator = () => ({});

/**
 * Appends one played match to the accumulator.
 *
 * Entries are prepended, not pushed: `processData` returns its lists sorted by
 * giornata descending (newest first), and `calculatePrediction` slices the
 * first N off the front. Feeding matches in ascending order and unshifting
 * reproduces that ordering exactly.
 */
export const addMatchToStats = (acc, match, statistic) => {
    const statKey = resolveStatKey(statistic);
    const homeTeam = match.squadre?.home ?? match.home;
    const awayTeam = match.squadre?.away ?? match.away;
    if (!homeTeam || !awayTeam) return acc;

    // Same guard as processData, whose shape this mirrors. It is not currently
    // reachable from addMatchToPredictionModel, which already tests the same key
    // before calling in - but the fabricating default sat here too, and leaving
    // one copy of a bug because today's only caller happens to shield it is how
    // it comes back.
    const pair = statPair(match, statKey);
    if (!pair) return acc;
    const { home: cHome, away: cAway, total } = pair;
    const giornata = match.giornata;

    if (!acc[homeTeam]) acc[homeTeam] = emptyTeam();
    if (!acc[awayTeam]) acc[awayTeam] = emptyTeam();

    acc[homeTeam].home_for.unshift(cHome);
    acc[homeTeam].home_ag.unshift(cAway);
    acc[homeTeam].home_totals.unshift(total);
    acc[homeTeam].all_matches.unshift({
        team: homeTeam, opponent: awayTeam, location: 'Home',
        statFor: cHome, statAg: cAway, total, giornata,
        // `season` is carried because history can now span two of them: without
        // it, "have these teams already met at home?" finds last season's
        // fixture and hides this season's.
        season: match.season ?? null,
        date: match.date,
    });

    acc[awayTeam].away_for.unshift(cAway);
    acc[awayTeam].away_ag.unshift(cHome);
    acc[awayTeam].away_totals.unshift(total);
    acc[awayTeam].all_matches.unshift({
        team: awayTeam, opponent: homeTeam, location: 'Away',
        statFor: cAway, statAg: cHome, total, giornata,
        season: match.season ?? null,
        date: match.date,
    });

    return acc;
};

/** Chronological order, oldest first: by date when available, else by giornata. */
export const sortMatchesChronologically = (matches, statistic) => {
    const statKey = resolveStatKey(statistic);
    return [...matches]
        .filter(m => m.stats && m.stats[statKey])
        .sort((a, b) => {
            if (a.date && b.date) return new Date(a.date) - new Date(b.date);
            const getG = (s) => parseInt(String(s).replace(/\D/g, '')) || 0;
            return getG(a.giornata) - getG(b.giornata);
        });
};

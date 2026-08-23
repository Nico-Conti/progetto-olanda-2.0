import { resolveStatKey } from './statistics.js';

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

    const statObj = match.stats?.[statKey] || { home: 0, away: 0 };
    const cHome = Number(statObj.home);
    const cAway = Number(statObj.away);
    const total = cHome + cAway;
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
        tldr: match.tldr, detailed_summary: match.detailed_summary, date: match.date,
    });

    acc[awayTeam].away_for.unshift(cAway);
    acc[awayTeam].away_ag.unshift(cHome);
    acc[awayTeam].away_totals.unshift(total);
    acc[awayTeam].all_matches.unshift({
        team: awayTeam, opponent: homeTeam, location: 'Away',
        statFor: cAway, statAg: cHome, total, giornata,
        season: match.season ?? null,
        tldr: match.tldr, detailed_summary: match.detailed_summary, date: match.date,
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

/**
 * Walks `matches` oldest-to-newest, calling `onMatch(match, statsBeforeMatch)`
 * for each one. The stats passed in contain history strictly *before* that
 * match, so there is no lookahead.
 */
export const walkForward = (matches, statistic, onMatch) => {
    const acc = createStatsAccumulator();
    for (let i = 0; i < matches.length; i++) {
        onMatch(matches[i], acc, i);
        addMatchToStats(acc, matches[i], statistic);
    }
    return acc;
};

/** The over/under line a prediction implies, given the user's betting params. */
export const impliedLineFor = (predictionTotal, { softBuffer = 0, maxLineCap = null } = {}) => {
    let adjusted = predictionTotal;
    if (softBuffer > 0) adjusted -= softBuffer;

    let line = Math.round(adjusted) - 0.5;
    let isCapped = false;
    if (maxLineCap !== null && maxLineCap > 0 && line > maxLineCap) {
        line = maxLineCap;
        isCapped = true;
    }
    return { line, isCapped };
};

export const actualTotalFor = (match, statistic) => {
    const s = match.stats?.[resolveStatKey(statistic)];
    if (!s) return null;
    return Number(s.home) + Number(s.away);
};

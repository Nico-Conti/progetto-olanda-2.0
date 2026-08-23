import {
    createPredictionModel,
    addMatchToPredictionModel,
    predictFromModel,
} from './predictTotal.js';
import {
    sortMatchesChronologically,
    actualTotalFor,
} from './backtestEngine.js';
import { STAT_CONFIG, resolveStatKey } from './statistics.js';

/**
 * Walk-forward evaluation of the prediction model.
 *
 * A strategy is scored by how often it calls over/under correctly at a fixed line,
 * compared against the *base rate* of simply always picking whichever side came up more
 * often. That difference - the edge - is the only number here that means anything.
 *
 * This replaced an earlier metric that measured the win rate of betting over
 * `round(prediction) - 0.5`. That line always sits below the prediction, so every model
 * scored above 50% regardless of quality and the model that under-predicted most looked
 * best. See docs/prediction-model.md for the measurements behind the change.
 */

// Model parameters to sweep
const N_GAMES_OPTIONS = [3, 5, 10, 'all'];
const FORCE_MEAN_OPTIONS = [false, true];
const USE_GENERAL_STATS_OPTIONS = [false, true];

// Only call a match when the prediction is at least this far from the line. Filtering on
// confidence improves accuracy monotonically for every statistic measured.
export const MARGIN_OPTIONS = [0, 0.5, 1, 1.5, 2, 3];

// Below this many calls a win rate is noise - goals at margin 3 scores 100% on four
// matches. The optimizer will not select a combination that calls fewer than this.
export const MIN_CALLS = 50;

/** The line a statistic is judged at, unless the caller overrides it. */
export const defaultLineFor = (statistic) =>
    STAT_CONFIG[resolveStatKey(statistic)]?.total?.default ?? null;

/**
 * The parameter combinations to sweep, in a fixed order.
 *
 * Order matters: ties are broken by "first one wins unless a later one is strictly
 * better", so changing this order changes which strategy is selected on a tie.
 */
const buildCombos = (statistic, margins = MARGIN_OPTIONS) => {
    // Goals are not volatile enough for the median to help, so only the mean is
    // worth testing there.
    const forceMeanOptions = resolveStatKey(statistic) === 'goals' ? [true] : FORCE_MEAN_OPTIONS;
    const combos = [];
    for (const nGames of N_GAMES_OPTIONS) {
        for (const forceMean of forceMeanOptions) {
            for (const useGeneralStats of USE_GENERAL_STATS_OPTIONS) {
                for (const margin of margins) {
                    combos.push({ nGames, forceMean, useGeneralStats, margin });
                }
            }
        }
    }
    return combos;
};

const summarise = ({ correct, calls, overs, seen }) => {
    const accuracy = calls > 0 ? correct / calls : 0;
    // Base rate over every match seen, not just the ones called: that is the honest
    // comparison, since always-bet-one-side needs no prediction at all.
    const overRate = seen > 0 ? overs / seen : 0;
    const baseRate = Math.max(overRate, 1 - overRate);
    return {
        accuracy,
        baseRate,
        edge: accuracy - baseRate,
        calls,
        seen,
        callRate: seen > 0 ? calls / seen : 0,
        beatsBaseRate: calls >= MIN_CALLS && accuracy > baseRate,
    };
};

/**
 * Evaluates a single strategy on a set of historical matches.
 *
 * @param {Array}  matches      Historical matches for one league.
 * @param {String} statistic    The statistic to predict, e.g. 'corners'.
 * @param {Object} modelParams  { nGames, forceMean, useGeneralStats, margin }
 * @param {Object} options      { line } - defaults to the statistic's configured line.
 * @returns {Object} { accuracy, baseRate, edge, calls, seen, callRate, beatsBaseRate }
 */
export const evaluateStrategy = (matches, statistic, modelParams, options = {}) => {
    const line = options.line ?? defaultLineFor(statistic);
    const margin = modelParams.margin ?? 0;

    let correct = 0, calls = 0, overs = 0, seen = 0;
    // The model knows which statistic actually drives this one - corners are
    // predicted from shots, goals from box touches, everything else from itself.
    const model = createPredictionModel(statistic);

    for (const match of matches) {
        const actual = actualTotalFor(match, statistic);

        if (actual !== null && line !== null) {
            const home = match.home || match.squadre?.home;
            const away = match.away || match.squadre?.away;

            const prediction = predictFromModel(model, home, away, {
                nGames: modelParams.nGames,
                useGeneralStats: modelParams.useGeneralStats,
                aggregatorOverride: modelParams.forceMean ? 'mean' : null,
                // Recency decay needs to know when "now" is. Passing the match's
                // own date keeps the walk free of lookahead: history is weighted
                // as of kickoff, not as of today.
                asOf: match.date,
            });

            if (prediction && prediction.total > 0) {
                const isOver = actual > line;
                seen++;
                if (isOver) overs++;

                // Only call the match when the model is confident enough.
                if (Math.abs(prediction.total - line) >= margin) {
                    calls++;
                    if ((prediction.total > line) === isOver) correct++;
                }
            }
        }

        addMatchToPredictionModel(model, match);
    }

    return summarise({ correct, calls, overs, seen });
};

/**
 * Finds the parameter combination with the largest edge over the base rate.
 *
 * Walks the season once and scores every combination against the same running history,
 * rather than replaying the season once per combination.
 *
 * Returns null when there is not enough data, and a result with `beatsBaseRate: false`
 * when nothing genuinely beat always betting one side - which is the honest answer for
 * some statistics, and the caller should say so rather than showing the percentage alone.
 */
export const findBestStrategy = (matches, statistic, options = {}) => {
    if (!matches || matches.length < 5) return null;

    const line = options.line ?? defaultLineFor(statistic);
    if (line === null) return null;

    const sortedMatches = sortMatchesChronologically(matches, statistic);
    const combos = buildCombos(statistic, options.margins);
    const tallies = combos.map(() => ({ correct: 0, calls: 0 }));

    let overs = 0, seen = 0;
    const model = createPredictionModel(statistic);

    for (const match of sortedMatches) {
        const actual = actualTotalFor(match, statistic);

        if (actual !== null) {
            const home = match.home || match.squadre?.home;
            const away = match.away || match.squadre?.away;
            const isOver = actual > line;
            let counted = false;

            for (let c = 0; c < combos.length; c++) {
                const { nGames, forceMean, useGeneralStats, margin } = combos[c];
                const prediction = predictFromModel(model, home, away, {
                    nGames, useGeneralStats,
                    aggregatorOverride: forceMean ? 'mean' : null,
                    asOf: match.date,
                });
                if (!prediction || !(prediction.total > 0)) continue;

                // Every combination that could predict this match sees it, so they all
                // share one base rate and stay comparable.
                if (!counted) { seen++; if (isOver) overs++; counted = true; }

                if (Math.abs(prediction.total - line) >= margin) {
                    tallies[c].calls++;
                    if ((prediction.total > line) === isOver) tallies[c].correct++;
                }
            }
        }

        addMatchToPredictionModel(model, match);
    }

    let best = null;
    for (let c = 0; c < combos.length; c++) {
        const result = summarise({ ...tallies[c], overs, seen });
        // Too few calls to mean anything, however good the percentage looks.
        if (result.calls < MIN_CALLS) continue;
        if (!best || result.edge > best.edge) best = { ...combos[c], ...result, line };
    }

    if (best) return best;

    // Nothing cleared the sample-size floor. Report the widest-sampled combination so the
    // caller has something truthful to show, flagged as not beating the base rate.
    let widest = null;
    for (let c = 0; c < combos.length; c++) {
        const result = summarise({ ...tallies[c], overs, seen });
        if (!widest || result.calls > widest.calls) widest = { ...combos[c], ...result, line };
    }
    return widest && widest.calls > 0 ? { ...widest, beatsBaseRate: false } : null;
};

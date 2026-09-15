import {
    createPredictionModel,
    addMatchToPredictionModel,
    predictFromModel,
} from './predictTotal.js';
import { actualTotalFor } from './backtestEngine.js';
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

// Only call a match when the prediction is at least this far from the line. Filtering on
// confidence improves accuracy monotonically for every statistic measured.
export const MARGIN_OPTIONS = [0, 0.5, 1, 1.5, 2, 3];

// Below this many calls a win rate is noise - goals at margin 3 scores 100% on four
// matches. A result below this is reported as noise rather than as an edge.
export const MIN_CALLS = 50;

/** The line a statistic is judged at, unless the caller overrides it. */
export const defaultLineFor = (statistic) =>
    STAT_CONFIG[resolveStatKey(statistic)]?.total?.default ?? null;

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

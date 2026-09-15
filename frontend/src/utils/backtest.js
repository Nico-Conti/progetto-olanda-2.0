import { STAT_CONFIG, resolveStatKey } from './statistics.js';

/**
 * The terms a backtest is judged on. `AccuracyReport` runs the walk itself; these are
 * the constants it shares with the rest of the app.
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

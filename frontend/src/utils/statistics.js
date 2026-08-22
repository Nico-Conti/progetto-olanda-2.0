/**
 * Single source of truth for the statistics the app can analyse.
 *
 * This list used to be copy-pasted into StatisticSelector, Predictor,
 * StatisticDistribution and ConfigurationPanel, and the four copies had already
 * drifted apart (only two of them carried the 'main' entry).
 */

export const STAT_OPTIONS = [
    { value: 'main', label: 'Main' },
    { value: 'corners', label: 'Corners' },
    { value: 'goals', label: 'Goals' },
    { value: 'shots', label: 'Shots' },
    { value: 'shots_on_target', label: 'Shots on Target' },
    { value: 'fouls', label: 'Fouls' },
    { value: 'yellow_cards', label: 'Yellow Cards' },
    { value: 'red_cards', label: 'Red Cards' },
    { value: 'possession', label: 'Possession' },
    // Scraped since the start but only served by /matches recently, so none of
    // these have ever reached the model. They are unmeasured - deliberately
    // absent from STAT_SIGNAL below rather than given a made-up badge.
    { value: 'xg', label: 'xG' },
    { value: 'xgot', label: 'xGOT' },
    { value: 'big_chances', label: 'Big Chances' },
    { value: 'box_touches', label: 'Box Touches' },
    { value: 'crosses', label: 'Crosses' },
    { value: 'goalkeeper_saves', label: 'GK Saves' },
    // Labelled for what the number *is*, not for the column it lives in: the
    // scraper reads diretta's "Palle intercettate" and the syncer writes it to
    // `blocked_shots` on purpose (backend/services/supabase_syncer.py:92). The
    // key follows the column, the label follows the data.
    { value: 'blocked_shots', label: 'Interceptions' },
];

/** Options for pickers that analyse a concrete stat and cannot express 'main'. */
export const CONCRETE_STAT_OPTIONS = STAT_OPTIONS.filter(o => o.value !== 'main');

/**
 * 'main' is a UI concept (the 1X2 / both-teams-to-score market), not a scraped
 * column. Everything that reads `match.stats[key]` must resolve it to 'goals'
 * first, otherwise the lookup misses and every value comes back 0.
 */
export const resolveStatKey = (statistic) => (statistic === 'main' ? 'goals' : statistic);

/**
 * Stats whose per-match values are spiky enough that the median is a better
 * central estimate than the mean.
 */
export const VOLATILE_STATS = ['corners', 'fouls', 'yellow_cards', 'red_cards'];
// The newly exposed statistics are deliberately absent: which of them the
// median helps is a measurement, not a guess, and the backtest optimizer
// already sweeps forceMean so it can find the median where it wins.

export const getStatLabel = (statistic) =>
    STAT_OPTIONS.find(o => o.value === statistic)?.label
    ?? String(statistic ?? '').replace(/_/g, ' ');

/**
 * How much predictive signal each statistic actually carries.
 *
 * Measured on ~2,886 predicted matches, on the model as it currently runs -
 * recency decay and two-season carryover included. See docs/prediction-model.md
 * and regenerate after a season ends, or after any change to HALF_LIFE_DAYS or
 * PREDICTOR_MODEL, which both invalidate these numbers.
 *
 *   lift  - actual average of the top-3 ranked matches of a round, minus that round's
 *           average. This is exactly what Hot Matches claims to find.
 *   edge  - over/under call accuracy at `line`, minus the base rate of always picking
 *           the majority side. Negative means the model is worse than doing nothing.
 *
 * These describe the model as it currently runs, PREDICTOR_MODEL included, so corners
 * and goals are scored as predicted from shots and box touches respectively. Changing
 * PREDICTOR_MODEL invalidates those two rows - re-measure rather than leaving them.
 *
 * Note corners: a real over/under edge (+4.1) but a weak ranking lift (+0.19). The two
 * are different claims and the tooltip reports both, because Hot Matches ranks on lift
 * while the over/under call depends on edge.
 *
 * Statistics not listed here have not been measured and deliberately show no badge
 * rather than a made-up one.
 */
export const STAT_SIGNAL = {
    fouls:        { strength: 'strong',   lift: 1.84, edge: 14.4, line: 24.5 },
    shots:        { strength: 'moderate', lift: 1.22, edge: 2.6, line: 24.5 },
    corners:      { strength: 'moderate', lift: 0.23, edge: 2.9, line: 9.5 },
    goals:        { strength: 'weak',     lift: 0.15, edge: 1.9, line: 2.5 },
    yellow_cards: { strength: 'none',     lift: 0.19, edge: -2.7, line: 4.5 },
};

/** Signal for a statistic, resolving 'main' to goals. Null when unmeasured. */
export const getStatSignal = (statistic) => STAT_SIGNAL[resolveStatKey(statistic)] ?? null;

/**
 * How fast a team's form is forgotten, in days, per statistic.
 *
 * The model used to average a team's last five matches equally - a rectangular
 * window where match five counts fully and match six counts nothing - and every
 * caller fed it only the current season. That produced a visible failure every
 * August: on 2026-08-22, five of nine leagues had no predictions at all and 65%
 * of upcoming fixtures showed a dash.
 *
 * Exponential weighting (w = 2^(-age / halfLife)) replaces the cliff with a
 * slope and lets last season's matches carry a little weight, which fixes the
 * cold start as a side effect. Measured over 30,037 matches, twelve seasons,
 * seven leagues, walked forward in time - see docs/prediction-model.md §10:
 *
 *   fouls  +1.5pp   cards +1.4pp   goals +1.2pp   shots +1.2pp   corners +0.0pp
 *
 * and in the opening 30 days of a season, coverage rises from ~54% to ~85% while
 * accuracy rises too (fouls +5.2pp, cards +4.7pp).
 *
 * The half-lives are interpretable: fouls turn over fastest, corners slowest -
 * corners carry so little short-term signal that older matches still help.
 */
export const HALF_LIFE_DAYS = {
    corners: 365,
    goals: 180,
    fouls: 90,
    shots: 120,
    yellow_cards: 180,
};

/** Days before a team's form is half-forgotten. Null means no measurement. */
export const halfLifeFor = (statistic) =>
    HALF_LIFE_DAYS[resolveStatKey(statistic)] ?? null;

/**
 * Which statistic each target is predicted from, and how far the prediction is
 * pulled toward the league mean.
 *
 * Only goals remain here. Corners used to be predicted from shots, which was
 * worth +3.6pp against the old five-match window - but once recency became a
 * slope the swap stopped paying: re-measured forward in time over 30,037
 * matches it gained -0.3pp, and the sweep picked a different predictor in every
 * fold. The blend weight went the same way, settling at 1 for every statistic.
 * Both were compensating for the crudeness of the window, and decay subsumes
 * them. See docs/prediction-model.md §10.
 *
 * Goals from box touches survives: +3.3pp on holdout before decay, +2.2pp after
 * (56.8% vs 54.6%). It is kept because box touches measure territory directly,
 * which past goals only sample very noisily.
 *
 * Anything absent predicts itself at weight 1. Emptying this object leaves a
 * model that is still perfectly reasonable - that is the regression test.
 */
export const PREDICTOR_MODEL = {
    goals: { predictor: 'box_touches', weight: 1 },
};

/** The statistic `statistic` is predicted from - itself, unless overridden. */
export const predictorFor = (statistic) => {
    const key = resolveStatKey(statistic);
    return PREDICTOR_MODEL[key]?.predictor ?? key;
};

/** How much weight the two-team model gets against the league mean. */
export const weightFor = (statistic) =>
    PREDICTOR_MODEL[resolveStatKey(statistic)]?.weight ?? 1;

export const SIGNAL_LABELS = {
    strong: 'Strong signal',
    moderate: 'Moderate signal',
    weak: 'Weak signal',
    none: 'No measurable edge',
};

/** Betting lines offered per statistic in Highest Winning Factor. */
export const STAT_CONFIG = {
    corners: {
        total: { default: 9.5, step: 1, options: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5] }
    },
    goals: {
        total: { default: 2.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    shots: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 12.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5, 14.5] }
    },
    shots_on_target: {
        total: { default: 8.5, step: 1, options: [6.5, 7.5, 8.5, 9.5, 10.5, 11.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] }
    },
    fouls: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 11.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5] }
    },
    yellow_cards: {
        total: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    red_cards: {
        total: { default: 0.5, step: 0.5, options: [0.5] },
        individual: { default: 0.5, step: 0.5, options: [0.5] }
    },
    possession: {
        total: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] },
        individual: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] }
    },
    // Lines below are anchored on the observed distribution over all 3,094
    // stored matches, not guessed: each `default` is the half-line just under
    // the median total, and `options` span roughly the 10th-90th percentile.
    // That matches how the older entries sit (corners median ~10, line 9.5).
    xg: {
        total: { default: 2.5, step: 0.5, options: [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5] },
        individual: { default: 1.25, step: 0.25, options: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0] }
    },
    xgot: {
        total: { default: 2.5, step: 0.5, options: [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5] },
        individual: { default: 1.25, step: 0.25, options: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0] }
    },
    big_chances: {
        total: { default: 3.5, step: 1, options: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5] }
    },
    box_touches: {
        total: { default: 45.5, step: 5, options: [30.5, 35.5, 40.5, 45.5, 50.5, 55.5, 60.5] },
        individual: { default: 21.5, step: 5, options: [11.5, 16.5, 21.5, 26.5, 31.5] }
    },
    crosses: {
        total: { default: 8.5, step: 1, options: [4.5, 6.5, 8.5, 10.5, 12.5, 14.5] },
        individual: { default: 3.5, step: 1, options: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] }
    },
    goalkeeper_saves: {
        total: { default: 5.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5] },
        individual: { default: 2.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] }
    },
    blocked_shots: {
        total: { default: 15.5, step: 2, options: [9.5, 11.5, 13.5, 15.5, 17.5, 19.5, 21.5] },
        individual: { default: 7.5, step: 1, options: [4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5] }
    },
};

import { t, tk } from '../i18n/index.js';

/**
 * Single source of truth for the statistics the app can analyse.
 *
 * This list used to be copy-pasted into StatisticSelector, Predictor,
 * StatisticDistribution and ConfigurationPanel, and the four copies had already
 * drifted apart (only two of them carried the 'main' entry).
 */

export const STAT_OPTIONS = [
    { value: 'main', label: tk('1X2') },
    { value: 'corners', label: tk('Corners') },
    { value: 'goals', label: tk('Goals') },
    { value: 'shots', label: tk('Shots') },
    { value: 'shots_on_target', label: tk('Shots on Target') },
    { value: 'fouls', label: tk('Fouls') },
    { value: 'yellow_cards', label: tk('Yellow Cards') },
    { value: 'red_cards', label: tk('Red Cards') },
    { value: 'card_points', label: tk('Card Points') },
    { value: 'possession', label: tk('Possession') },
    // Scraped since the start but only served by /matches recently, so none of
    // these have ever reached the model. They are unmeasured - deliberately
    // absent from STAT_SIGNAL below rather than given a made-up badge.
    { value: 'xg', label: tk('xG') },
    { value: 'xgot', label: tk('xGOT') },
    { value: 'big_chances', label: tk('Big Chances') },
    { value: 'box_touches', label: tk('Box Touches') },
    { value: 'crosses', label: tk('Crosses') },
    { value: 'goalkeeper_saves', label: tk('GK Saves') },
    // Labelled for what the number *is*, not for the column it lives in: the
    // scraper reads diretta's "Palle intercettate" and the syncer writes it to
    // `blocked_shots` on purpose (backend/services/supabase_syncer.py:92). The
    // key follows the column, the label follows the data.
    { value: 'blocked_shots', label: tk('Interceptions') },
];

/**
 * 'main' is a UI concept (the 1X2 / both-teams-to-score market), not a scraped
 * column. Everything that reads `match.stats[key]` must resolve it to 'goals'
 * first, otherwise the lookup misses and every value comes back 0.
 */
export const resolveStatKey = (statistic) => (statistic === 'main' ? 'goals' : statistic);

/**
 * App statistic -> the market name the capture stores in `odds_snapshots`.
 *
 * This is the single source of truth for "is this priced". `useOdds` reads it to
 * look up a quote, and PREDICTED_STAT_OPTIONS below derives the selector's option
 * list from it, so a market added to or removed from the capture changes what
 * the UI offers without a second list having to be kept in step.
 *
 * NOT yellow_cards: `total_card_points` settles on the book's points scale
 * (yellow 1, red 2, a second booking 3), so quoting it against a yellow-only
 * estimate prices a different quantity than the one the model predicts.
 */
export const MARKET_FOR_STAT = {
    corners: 'total_corners',
    fouls: 'total_fouls',
    goals: 'total_goals',
    card_points: 'total_card_points',
    // shots and shots_on_target are DELIBERATELY absent. The book posts both,
    // but it does not settle them on the quantity we count - measured
    // 2026-09-09 against 848 and 729 closing quotes:
    //
    //   shots            line mean 25.5, our totals mean 29.0, over-rate 69.1%
    //   shots on target  line mean  8.7, our totals mean  9.7, over-rate 60.4%
    //   corners          line mean  9.7, our totals mean 10.0, over-rate 50.5%
    //
    // Corners is what a correctly joined market looks like: the book centres its
    // line on the quantity, so the over-rate lands at ~50%. Ours run 3.5 and 1.0
    // high, and diretta's "Tiri totali" is on-target + off-target + blocked, so
    // the book is plainly counting something narrower.
    //
    // The tell is that the MARKET is miscalibrated too - 21.0% and 8.0% ECE
    // against our outcomes, and flat-betting every side of both returned +9.6%
    // and +5.3%, which is impossible against a book with overround. A bookmaker
    // is not 21% wrong about its own market; our outcome is not its outcome.
    //
    // Restore these only after confirming what the book settles on, and then
    // re-measure - do not guess an offset from 28 fixtures.
};

/**
 * Markets the book posts and we capture, but deliberately do NOT join to a
 * price. See MARKET_FOR_STAT above for the measurement: the quantity the book
 * settles is narrower than diretta's, so a price here is a price for something
 * else. We still model them - `shots` has a fitted half-life and a STAT_SIGNAL
 * entry, `shots_on_target` goes through the window estimator - so a prediction
 * for them is worth showing; an expected value is not.
 */
export const UNJOINED_STATS = new Set(['shots', 'shots_on_target']);

/** Why a line in one of those markets shows no price. Not a missing capture. */
export const UNJOINED_REASON =
    'Not priced on purpose: the bookmaker settles this on a narrower count than we measure';

/**
 * The statistics the dashboard selector offers: the ones a bookmaker puts a
 * line on, joined or not.
 *
 * Everything else in STAT_OPTIONS - xG, possession, big chances, box touches,
 * crosses, saves, interceptions, and the raw yellow/red counts - is modellable
 * but has no market at all, so a prediction for it can never be turned into a
 * bet. Offering them here invites a number nobody can act on.
 *
 * Keyed on `opt.value`, NOT on the resolved key, which is what drops `main`:
 * it resolved to goals and so appeared as a selectable "statistic" whose
 * prediction was really a goals total under a 1X2 label. 1X2 is a market, not a
 * quantity with a line - it still belongs in the per-fixture bet builder, where
 * an outcome is what you pick, and not in a selector that means "predict this".
 *
 * STAT_OPTIONS itself stays complete: Predictor's league averages iterate every
 * statistic, and getStatLabel must still name the ones that are only displayed.
 */
export const PREDICTED_STAT_OPTIONS = STAT_OPTIONS.filter(
    (opt) => MARKET_FOR_STAT[opt.value] || UNJOINED_STATS.has(opt.value),
);

/**
 * Markets we have PRICES for and no prediction.
 *
 * Captured by `domusbet.py --slip-markets` purely so a slip can be built and
 * handed over; nothing here is modelled, and that is the point of keeping them
 * in their own list rather than in STAT_OPTIONS. A statistic in STAT_OPTIONS is
 * something the model can be asked about - `getStatLabel`, the league averages
 * and `getModel` all iterate those - and putting an unmodelled market among them
 * would invite exactly the wrong question.
 *
 * `value` doubles as the `market` column in odds_snapshots, so no mapping table
 * is needed and the two cannot drift apart.
 *
 * Combos were absent until 2026-09-15 for want of outcome names - `eqs[].dsl` is
 * null and the labels are not in the JS bundle - so they would have rendered as
 * "selection 1". The names ARE in the book's own bootstrap, and `outcome_names()`
 * in domusbet.py now resolves them at ingest, so `selection` arrives as
 * "1x + ov" and these can be offered like any other market.
 */
export const SLIP_ONLY_OPTIONS = [
    { value: 'gg_ng', label: 'GG/NG' },
    { value: 'multigol', label: 'Multigol' },
    { value: 'multigol_1h', label: 'Multigol 1st Half' },
    { value: 'multigol_2h', label: 'Multigol 2nd Half' },
    { value: 'multigol_home', label: 'Multigol Home' },
    { value: 'multigol_away', label: 'Multigol Away' },
    { value: 'combo_1x2_ggng', label: '1X2 + GG/NG' },
    { value: 'combo_1x_ggng', label: '1X + GG/NG' },
    { value: 'combo_12_ggng', label: '12 + GG/NG' },
    { value: 'combo_x2_ggng', label: 'X2 + GG/NG' },
    { value: 'combo_1x2_ou', label: '1X2 + U/O' },
    { value: 'combo_1x_ou', label: '1X + U/O' },
    { value: 'combo_12_ou', label: '12 + U/O' },
    { value: 'combo_x2_ou', label: 'X2 + U/O' },
    { value: 'combo_ou_ggng', label: 'U/O + GG/NG' },
];

const SLIP_ONLY = new Set(SLIP_ONLY_OPTIONS.map((o) => o.value));

/** True for a market that carries prices but no prediction. */
export const isSlipOnly = (statistic) => SLIP_ONLY.has(statistic);

/**
 * Human name for one token of a selection.
 *
 * A slip-market selection is the book's own name, lower-cased at ingest, and a
 * combo's is composite - "1x + ov", "gg+un". Splitting on '+' and naming each
 * token covers all fifteen markets with ten words, and keeps working if the book
 * adds another combination of the same parts. Anything unrecognised (a multigol
 * band, "1-2") is passed through, which is what makes that safe.
 *
 * The names are the BOOKMAKER'S, not plain English: `1` / `X` / `2` rather than
 * Home / Draw / Away, `GG` / `NG` rather than Both score / Not both. Someone
 * about to place this bet is going to read it again on domusbet's own slip a
 * second later, and two vocabularies for one selection is how a person clicks
 * the wrong outcome. Over / Under stay spelled out because that is what the book
 * writes beside a line too.
 */
const SELECTION_TOKENS = {
    '1': '1', x: 'X', '2': '2',
    '1x': '1X', '12': '12', x2: 'X2',
    gg: 'GG', ng: 'NG',
    ov: 'Over', un: 'Under', over: 'Over', under: 'Under',
    yes: 'Yes', no: 'No',
};

/** "1x + ov" at 2.5 -> "Home/Draw + Over 2.5". The line belongs to the O/U part. */
export const formatSelection = (selection, line = null) =>
    String(selection ?? '')
        .split('+')
        .map((raw) => {
            const token = raw.trim().toLowerCase();
            const label = t(SELECTION_TOKENS[token] ?? raw.trim());
            const takesLine = token === 'ov' || token === 'un'
                || token === 'over' || token === 'under';
            return takesLine && line != null ? `${label} ${line}` : label;
        })
        .join(' + ');

/**
 * Stats whose per-match values are spiky enough that the median is a better
 * central estimate than the mean.
 */
export const VOLATILE_STATS = ['corners', 'fouls', 'yellow_cards', 'red_cards', 'card_points'];
// The newly exposed statistics are deliberately absent: which of them the
// median helps is a measurement, not a guess, and the backtest optimizer
// already sweeps forceMean so it can find the median where it wins.

/** A statistic's or market's name, in the page's language. */
export const getStatLabel = (statistic) => {
    const label = [...STAT_OPTIONS, ...SLIP_ONLY_OPTIONS].find(o => o.value === statistic)?.label;
    return label ? t(label) : String(statistic ?? '').replace(/_/g, ' ');
};

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
/**
 * Re-measured 2026-09-12 on 6,894 matches across 18 leagues, all six from ONE
 * run of `modelComparison.mjs` so the rows are comparable with each other.
 *
 * The previous table was fitted on ~3,000 matches across 9 leagues, and the
 * model has changed underneath it since - `MEAN_BIAS` now corrects the centre
 * for fouls, shots and goals, and `useGeneralStats` defaults to true. Every
 * figure moved, and every one moved DOWN: the old numbers were flattering.
 *
 *   stat           old lift/edge     new lift/edge
 *   fouls           1.84 / 14.4       1.23 / 13.4
 *   shots           1.22 /  2.6       0.96 /  1.9
 *   corners         0.23 /  2.9       0.17 /  0.1
 *   goals           0.15 /  1.9       0.08 / -1.1
 *   yellow_cards    0.19 / -2.7       0.17 / +0.6
 *
 * `lift` is the top-3-by-predicted-total actual average minus that round's
 * average. `edge` is accuracy minus the base rate **at margin 0** - calling
 * every match, which is what a badge implies. Several statistics are markedly
 * better when selective, and that is deliberately NOT in the badge: corners
 * reaches +4.9pp at margin 2 and fouls +20.3pp at margin 3.
 *
 * Strength thresholds, from `edge`, stated so the next re-measurement does not
 * have to guess: >=10 strong, 3-10 moderate, 1-3 weak, <1 none.
 *
 * Every `edge` here is measured at `STAT_CONFIG`'s default line, and that line
 * is near each statistic's median - which is the most flattering place a badge
 * could possibly be scored, because the majority-side base it is compared
 * against is weakest there. The bases bear that out: fouls 51.9%, corners 52.2%,
 * goals 54.4%, against shots 58.4% and yellow_cards 61.3%. Only fouls' edge is
 * large enough to be safe from it. Read a badge as "at this line", never as a
 * property of the statistic.
 *
 * **card_points is deliberately absent, and that is a measurement, not a gap.**
 * It was added here on 2026-09-12 at +5.2pp and removed the same day. The entry
 * was fitted on the 2,816 rows then carrying an exact `second_bookings` count,
 * and that subset is not a sample of anything: the column only exists for
 * matches scraped after migration 005, so it held LaLiga 2 (507) and Super Lig
 * (343) - the two highest-card leagues - against 20 rows of Premier League and
 * 19 of Bundesliga. Widening it to 5,885 exact outcomes (see dumpSeason.py, and
 * note 84% of matches have no red and so need no correction at all) rebalances
 * the leagues and the edge at 4.5 goes from +4.7pp to **-2.5pp**: the high-card
 * mix had lifted the over-rate at 4.5 to 47.5%, making it look like a median
 * line with a weak base, where balanced it is 38.9% over against a 61.1% base.
 * Best line is now 3.5 at +2.1pp, which is not the line the config prices.
 * Against 421 real settled prices it returns -19.4%. See docs section 28.
 */
export const STAT_SIGNAL = {
    fouls:        { strength: 'strong',   lift: 1.23, edge: 13.4, line: 24.5 },
    shots:        { strength: 'weak',     lift: 0.96, edge: 1.9, line: 24.5 },
    yellow_cards: { strength: 'none',     lift: 0.17, edge: 0.6, line: 4.5 },
    corners:      { strength: 'none',     lift: 0.17, edge: 0.1, line: 9.5 },
    goals:        { strength: 'none',     lift: 0.08, edge: -1.1, line: 2.5 },
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
    // FITTED 2026-09-12, no longer inherited. `decayComparison.mjs` over
    // 50,219 football-data matches picks 180d, worth +1.6pp of call accuracy
    // over the window estimator. It lands on the value it had been INHERITING
    // from yellow_cards, which is the outcome the old comment here guessed at
    // and asked to be checked. Note the fit is on football-data's cards, which
    // carry the same +1-per-second-booking bias ours did before migration 005 -
    // that shifts the LEVEL, and a half-life is a slope.
    //
    // This survives while the STAT_SIGNAL entry does not, and the asymmetry is
    // the point: a half-life is fitted on 50k matches from every division and
    // does not care about our card coverage, whereas the signal was fitted on
    // our own 2,816-row subset and was an artefact of which leagues it held.
    card_points: 180,
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
    strong: tk('Strong signal'),
    moderate: tk('Moderate signal'),
    weak: tk('Weak signal'),
    none: tk('No measurable edge'),
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
    // The lines domusbet posted on 2026-08-26 for `U/O CARTELLINI (T.R.)`:
    // 2.5 to 6.5. Same shape as yellow_cards, one point higher on average,
    // because every red adds two.
    card_points: {
        total: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] },
        individual: { default: 2.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5] }
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

/**
 * The two sides of one statistic for one match, or `null` when the match does
 * not carry it.
 *
 * This exists because the obvious `match.stats?.[key] || { home: 0, away: 0 }`
 * is not a default - it is a fabricated observation. A match with no statistics
 * entered the model as a genuine 0-0, so one real 10-corner match plus two
 * stat-less rows gave a mean of 3.33 instead of 10, and the callers' "do we have
 * any history?" tests counted the fabrications as history and returned a number.
 *
 * Both empty shapes have to be caught, and the second is easy to miss:
 * `{ home: null, away: null }` survives a truthiness check, and `Number(null)`
 * is 0, so it passes `Number.isFinite` as a perfectly good zero.
 *
 * `statKey` is expected to be resolved already - callers hold it across a loop.
 */
export const statPair = (match, statKey) => {
    const s = match?.stats?.[statKey];
    if (!s || s.home == null || s.away == null) return null;
    const home = Number(s.home);
    const away = Number(s.away);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    return { home, away, total: home + away };
};

/** A slip leg's market and pick as the bet slip prints them; the slip history shows the same. */
// The 'main' builder covers two markets a book keeps apart, so name the one the
// bet is actually in rather than the group it was picked from. Both names are
// the book's own and identical in either language, so neither goes through t().
export const betMarket = (bet) => {
    if (bet.stat === 'main') return /^(gg|ng)$/i.test(bet.value) ? 'GG/NG' : '1X2';
    if (isSlipOnly(bet.stat)) return getStatLabel(bet.stat);
    const side = { home: t('Home'), away: t('Away') }[bet.team] ?? (bet.team !== 'total' ? bet.team : '');
    // getStatLabel, not the raw column: "Card Points", not "card points".
    return (side ? `${side} ` : '') + (bet.stat ? getStatLabel(bet.stat) : t('Stat'));
};

// A slip-only bet's `option` is the book's own outcome name ("1x + ov"), not the
// 'O'/'U' the over/under path uses, so it needs the composite formatter. Reading
// it the other way rendered every combo as "Under <line>" - the same words for
// four different bets.
export const betPick = (bet) =>
    bet.stat === 'main' ? bet.value
        : isSlipOnly(bet.stat) ? formatSelection(bet.option, bet.value)
            : `${bet.option === 'O' ? t('Over') : t('Under')} ${bet.value}`;

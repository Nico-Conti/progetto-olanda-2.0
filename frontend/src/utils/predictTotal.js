/**
 * Predicting one statistic from another.
 *
 * The app has always forecast a statistic from its own history: to predict
 * corners it averaged past corners. Measured leave-one-league-season-out over
 * 3,094 matches, that is not the best choice for two of them - see
 * docs/prediction-model.md section 4:
 *
 *   corners, predicted from shots        52.4% -> 55.9%
 *   goals,   predicted from box touches  53.3% -> 56.6%
 *
 * Both picked the same predictor in all nine folds, in a narrow weight band.
 * Fouls, shots and cards showed no stable gain and are left exactly as they were.
 *
 * A prediction made on the predictor's history arrives in the predictor's units
 * (shots run ~26 a match, corners ~10), so it is rescaled by the running ratio
 * of past totals and then blended toward the target's league mean. Both use only
 * matches already folded into the model, so a walk-forward backtest stays free of
 * lookahead.
 *
 * IMPORTANT: this is a *prediction* improvement, not a demonstrated betting edge.
 * It was measured against a hardcoded 9.5 corner line, and only 46% of matches
 * would actually be priced there. See the caveats in section 4.
 */
import { calculatePrediction, getAvg, getMedian } from './stats.js';
import { addMatchToStats } from './backtestEngine.js';
import { fitDispersion, probOver, distribution, POISSON_LIMIT } from './countModel.js';
import {
    resolveStatKey,
    VOLATILE_STATS,
    PREDICTOR_MODEL,
    predictorFor,
    weightFor,
    halfLifeFor,
    HALF_LIFE_DAYS,
    STAT_SIGNAL,
} from './statistics.js';

/** Below this many past matches there is no usable league mean, so don't blend. */
const MIN_HISTORY_FOR_BLEND = 4;

/**
 * Total weight a team's history must carry before it can be predicted from.
 * With decay this replaces "has played at least one match": a single result from
 * fourteen months ago weighs almost nothing and should not pass for form.
 */
const MIN_EFFECTIVE_MATCHES = 0.75;

/**
 * Exponentially decayed rates for one team, as of `asOf`.
 *
 * The shipped estimator takes the last five matches and weighs them equally,
 * which is a rectangular window: match five counts fully, match six counts
 * nothing. Decay replaces the cliff with a slope, and in doing so solves the
 * cold start - last season's matches carry a small but non-zero weight, so a
 * team is predictable on matchday one instead of matchday three.
 *
 * Matches on or after `asOf` are skipped, so this cannot see the future even
 * when the model holds a whole season.
 */
/** Weights below this contribute nothing measurable and end the scan. */
const NEGLIGIBLE_WEIGHT = 1e-4;

const decayedRates = (matches, location, asOf, halfLifeDays) => {
    const lambda = Math.LN2 / halfLifeDays;
    const cutoff = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
    if (!Number.isFinite(cutoff)) return null;
    // Once a match is this old its weight is below NEGLIGIBLE_WEIGHT.
    const horizonMs = (-Math.log(NEGLIGIBLE_WEIGHT) / lambda) * 86400000;

    let weight = 0, forSum = 0, agSum = 0, forSq = 0, agSq = 0, totalSq = 0, totalSum = 0;
    for (const m of matches) {
        const when = new Date(m.date).getTime();
        if (!Number.isFinite(when)) continue;
        if (when >= cutoff) continue;
        // all_matches is newest first, so everything past the horizon is older
        // still. Without this the scan walks a decade of history per prediction.
        if (cutoff - when > horizonMs) break;
        if (location && m.location !== location) continue;

        const days = (cutoff - when) / 86400000;
        const w = Math.exp(-lambda * days);
        const total = m.statFor + m.statAg;
        weight += w;
        forSum += w * m.statFor;
        agSum += w * m.statAg;
        totalSum += w * total;
        forSq += w * m.statFor * m.statFor;
        agSq += w * m.statAg * m.statAg;
        totalSq += w * total * total;
    }
    if (weight < MIN_EFFECTIVE_MATCHES) return null;

    const sd = (sq, sum) => Math.sqrt(Math.max(sq / weight - (sum / weight) ** 2, 0));
    return {
        statFor: forSum / weight,
        statAg: agSum / weight,
        forStd: sd(forSq, forSum),
        agStd: sd(agSq, agSum),
        totalStd: sd(totalSq, totalSum),
        weight,
    };
};

/**
 * The two-team prediction, with decay in place of the fixed window.
 *
 * Same shape as calculatePrediction so the rest of the pipeline is unchanged.
 * The arithmetic is the shipped one - expHome = (hFor + aAg) / 2 - only the
 * averages underneath are weighted by recency rather than truncated.
 */
const decayedPrediction = (home, away, stats, { asOf, halfLifeDays, useGeneralStats }) => {
    const homeMatches = stats[home]?.all_matches;
    const awayMatches = stats[away]?.all_matches;
    if (!homeMatches || !awayMatches) return null;

    const h = decayedRates(homeMatches, useGeneralStats ? null : 'Home', asOf, halfLifeDays);
    const a = decayedRates(awayMatches, useGeneralStats ? null : 'Away', asOf, halfLifeDays);
    if (!h || !a) return null;

    const expHome = (h.statFor + a.statAg) / 2;
    const expAway = (a.statFor + h.statAg) / 2;
    return {
        expHome, expAway, total: expHome + expAway,
        hFor: h.statFor, hAg: h.statAg, aFor: a.statFor, aAg: a.statAg,
        hForStd: h.forStd, aForStd: a.forStd,
        expHomeStd: 0.5 * Math.sqrt(h.forStd ** 2 + a.agStd ** 2),
        expAwayStd: 0.5 * Math.sqrt(a.forStd ** 2 + h.agStd ** 2),
        totalStd: Math.sqrt((h.totalStd ** 2 + a.totalStd ** 2) / 2),
        homeMatches, awayMatches,
        effectiveMatches: Math.min(h.weight, a.weight),
    };
};

const totalOf = (match, statKey) => {
    const s = match.stats?.[statKey];
    if (!s) return null;
    const total = Number(s.home) + Number(s.away);
    return Number.isFinite(total) ? total : null;
};

/**
 * An empty model for `statistic`, to be filled by addMatchToPredictionModel.
 *
 * `stats` is an accumulator over the *predictor*, in the shape processData
 * returns, so it can go straight to calculatePrediction.
 */
/**
 * Prediction engines. Both ship; the toggle chooses.
 *
 *   classic - the measured, shipped model: a single predicted total.
 *   count   - the same total, wrapped in a distribution, so any line a
 *             bookmaker posts can be priced from one fit.
 *
 * `count` deliberately does not change the central prediction. It takes
 * classic's number as the mean and adds a fitted spread around it, so switching
 * engines can never silently move the forecast - only what can be asked of it.
 */
export const ENGINES = { CLASSIC: 'classic', COUNT: 'count' };
export const DEFAULT_ENGINE = ENGINES.CLASSIC;

/** History needed before a dispersion fit means anything. */
const MIN_RESIDUALS = 30;

/**
 * Effective matches each side needs before a prediction is trusted for money.
 *
 * A prediction is *shown* on far less than this - a rough number is better than
 * a dash. But ranking by expected value is different: EV sorts by how far the
 * model disagrees with the market, and the biggest disagreements come from the
 * thinnest history, not the sharpest insight. Without a floor, an EV table is a
 * machine for surfacing your own worst estimates.
 *
 * The failure it guards against was real: a side with no away matches produced a
 * predicted 3.3 shots on target against a league average of 8.7, which read as a
 * +75% edge. That specific hole is now closed in calculatePrediction, but the
 * general shape of the problem is not.
 */
export const MIN_EFFECTIVE_FOR_EV = 4;

/**
 * Whether this statistic's model has ever been validated.
 *
 * A statistic with no fitted half-life and no measured signal has a prediction,
 * but nobody has checked whether that prediction is any good - so an expected
 * value computed from it is arithmetic, not evidence.
 *
 * Shots on target is the live example. Its predictions are calibrated to within
 * ~2pp, yet it dominated the top of the first EV table entirely, and it is also
 * the one market where we could NOT confirm the bookmaker is pricing the same
 * quantity we measure: goals and corners could be checked by comparing the
 * book's implied median against ours (2.65 vs 3.0, 9.58 vs 10.0 - both fine),
 * while shots on target never offered enough two-sided prices to check.
 *
 * Betting into a market that may not be measuring your statistic is the most
 * expensive mistake available here, so it is gated until measured.
 */
export const isMeasured = (statistic) => {
    const key = resolveStatKey(statistic);
    return HALF_LIFE_DAYS[key] != null && STAT_SIGNAL[key] != null;
};

export const createPredictionModel = (statistic, options = {}) => {
    const target = resolveStatKey(statistic);
    return {
        target,
        predictor: predictorFor(statistic),
        weight: weightFor(statistic),
        // The count engine needs to know how wrong this model usually is, which
        // means keeping the errors it made as its history was built. Off by
        // default: it costs one extra prediction per match folded in.
        trackResiduals: options.trackResiduals ?? false,
        residuals: [],
        dispersion: null,
        // Measured per statistic; pass null explicitly to force the old
        // fixed-window estimator, which is what callers with no match date get
        // anyway since decay needs to know when "now" is.
        halfLifeDays: options.halfLifeDays !== undefined
            ? options.halfLifeDays
            : halfLifeFor(statistic),
        stats: {},
        sumTarget: 0,
        sumPredictor: 0,
        pastTargets: [],
    };
};

/** Folds one played match in. Mirrors addMatchToStats, which it wraps. */
export const addMatchToPredictionModel = (model, match) => {
    const target = totalOf(match, model.target);
    const predictor = totalOf(match, model.predictor);

    // Record what this model would have predicted for the match BEFORE folding
    // it in, so the residuals are genuinely out-of-sample - the same discipline
    // the walk-forward backtests use.
    if (model.trackResiduals && target !== null && match.date) {
        const home = match.squadre?.home ?? match.home;
        const away = match.squadre?.away ?? match.away;
        const prior = predictFromModel(model, home, away, {
            asOf: match.date, engine: ENGINES.CLASSIC,
        });
        if (prior && prior.total > 0) {
            model.residuals.push({ mu: prior.total, actual: target });
            model.dispersion = null;   // invalidated by the new observation
        }
    }

    // A match with no value for the predictor cannot inform the team histories.
    // Folding it in anyway would be worse than dropping it: addMatchToStats
    // substitutes {home: 0, away: 0} for a missing statistic, which would credit
    // both sides with a genuine zero and drag their averages down.
    if (predictor !== null) addMatchToStats(model.stats, match, model.predictor);

    if (target !== null) {
        model.pastTargets.push(target);
        // Only pair the two sums over matches where both exist, or the ratio
        // drifts whenever one statistic is missing and the other is not.
        if (predictor !== null) {
            model.sumTarget += target;
            model.sumPredictor += predictor;
        }
    }
    return model;
};

/** A model over every match in `matches`. The live app's entry point. */
/**
 * The fitted dispersion, computed once and cached until new history arrives.
 * Falls back to the Poisson limit while there is too little to fit - assuming no
 * excess variance rather than inventing some.
 */
export const dispersionFor = (model) => {
    if (model.dispersion !== null) return model.dispersion;
    model.dispersion = model.residuals.length >= MIN_RESIDUALS
        ? fitDispersion(model.residuals, { minSamples: MIN_RESIDUALS })
        : POISSON_LIMIT;
    return model.dispersion;
};

export const buildPredictionModel = (matches, statistic, options = {}) => {
    const model = createPredictionModel(statistic, options);
    // Chronological, so the accumulator's newest-first ordering holds even when
    // the set spans seasons. `giornata` restarts each August and sorting on it
    // would interleave two seasons of form - the exact trap CLAUDE.md warns about.
    const ordered = [...(matches || [])].sort(
        (a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0)
    );
    for (const match of ordered) addMatchToPredictionModel(model, match);
    return model;
};

/**
 * Predicts the total for one fixture.
 *
 * Returns the same shape as calculatePrediction. When the statistic predicts
 * itself at full weight - every statistic except corners and goals - this
 * short-circuits to calculatePrediction untouched, so those paths are provably
 * unchanged rather than merely arithmetically equivalent.
 */
export const predictFromModel = (model, home, away, options = {}) => {
    const {
        nGames = 5, useGeneralStats = false, aggregatorOverride = null, asOf = null,
        engine = DEFAULT_ENGINE,
    } = options;

    const raw = model.halfLifeDays && asOf
        ? decayedPrediction(home, away, model.stats, {
            asOf, halfLifeDays: model.halfLifeDays, useGeneralStats,
        })
        : calculatePrediction(
            home, away, model.stats, nGames,
            false, // useAdjustedMode - measured worst of every variant, never enabled
            useGeneralStats, model.predictor, aggregatorOverride,
        );

    if (model.predictor === model.target && model.weight === 1) {
        return engine === ENGINES.COUNT ? withDistribution(model, raw) : raw;
    }
    if (!raw || !(raw.total > 0)) return raw;

    // Rescale from the predictor's units onto the target's.
    const scale = model.sumPredictor > 0 ? model.sumTarget / model.sumPredictor : 1;
    const scaledTotal = raw.total * scale;

    // Blend toward the target's league mean. Without enough history there is no
    // mean worth blending toward, so fall back to the unblended prediction
    // rather than dragging it toward zero.
    const canBlend = model.pastTargets.length >= MIN_HISTORY_FOR_BLEND;
    const aggregate = VOLATILE_STATS.includes(model.target) ? getMedian : getAvg;
    const leagueMean = canBlend ? aggregate(model.pastTargets) : scaledTotal;
    const w = canBlend ? model.weight : 1;
    const total = w * scaledTotal + (1 - w) * leagueMean;

    // Keep expHome + expAway === total by carrying the same factor through.
    const factor = scaledTotal > 0 ? total / scaledTotal : 0;
    const blended = {
        ...raw,
        total,
        expHome: raw.expHome * scale * factor,
        expAway: raw.expAway * scale * factor,
        // The four rates are the estimator's own inputs, so they are in PREDICTOR
        // units as well - StatsAnalysis was labelling box touches "Avg goals in
        // favour" and showing ~23. The same factor the totals get keeps
        // expHome === (hFor + aAg) / 2 true once converted, so the panel agrees
        // with the headline instead of contradicting it.
        hFor: raw.hFor * scale * factor,
        hAg: raw.hAg * scale * factor,
        aFor: raw.aFor * scale * factor,
        aAg: raw.aAg * scale * factor,
        // Blending against a constant scales the spread by w; SafestBets ranks on
        // this, and a common factor leaves that ranking untouched.
        totalStd: raw.totalStd * scale * w,
        expHomeStd: raw.expHomeStd * scale * w,
        expAwayStd: raw.expAwayStd * scale * w,
        // Nothing reads these two today, but leaving them in predictor units
        // beside four rates that are not is exactly how this bug happened.
        hForStd: raw.hForStd * scale * w,
        aForStd: raw.aForStd * scale * w,
        // What actually produced the number, for the UI to disclose.
        derivedFrom: model.predictor,
        blendWeight: model.weight,
    };
    return engine === ENGINES.COUNT ? withDistribution(model, blended) : blended;
};

/**
 * Attaches a distribution to a prediction, leaving the prediction itself alone.
 *
 * `total` is the mean of a negative binomial whose dispersion is fitted from how
 * wrong this model has actually been. That gives `probOver` for ANY line, from
 * one fit and coherently: it cannot say over 22.5 is likelier than over 20.5.
 *
 * The classic engine calls none of this, so its output is untouched.
 */
/**
 * How much history stands behind a prediction, on the thinner of the two sides.
 *
 * The decay path already tracks a weighted count; the fixed-window path counts
 * matches. Both answer "how much do we actually know about this fixture".
 */
const effectiveHistory = (prediction) => {
    if (prediction?.effectiveMatches != null) return prediction.effectiveMatches;
    const home = prediction?.homeMatches?.length ?? 0;
    const away = prediction?.awayMatches?.length ?? 0;
    return Math.min(home, away);
};

const withDistribution = (model, prediction) => {
    if (!prediction || !(prediction.total > 0)) return prediction;
    const r = dispersionFor(model);
    const effective = effectiveHistory(prediction);
    const fitted = model.residuals.length >= MIN_RESIDUALS;
    return {
        ...prediction,
        engine: ENGINES.COUNT,
        dispersion: r,
        // Both conditions matter: enough history for the mean to mean anything,
        // and enough for the spread around it to have been measured rather than
        // assumed.
        effectiveMatches: effective,
        measured: isMeasured(model.target),
        confident: effective >= MIN_EFFECTIVE_FOR_EV && fitted && isMeasured(model.target),
        // Poisson limit means "no excess variance measured", usually because
        // there was not enough history to fit one. Worth surfacing rather than
        // presenting a default as a finding.
        dispersionFitted: fitted,
        residualCount: model.residuals.length,
        probOver: (line) => probOver(prediction.total, line, r),
        probUnder: (line) => {
            const p = probOver(prediction.total, line, r);
            return p == null ? null : 1 - p;
        },
        distribution: () => distribution(prediction.total, r),
    };
};

/** True when `statistic` is predicted from something other than itself. */
export const isDerived = (statistic) =>
    Boolean(PREDICTOR_MODEL[resolveStatKey(statistic)]);

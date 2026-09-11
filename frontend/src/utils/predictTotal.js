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
import { calculatePrediction } from './stats.js';
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
    statPair,
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

const totalOf = (match, statKey) => statPair(match, statKey)?.total ?? null;

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
 * Shrinkage applied to the total INSIDE the probability path only, per statistic.
 *
 * Section 18 calibrated the shipped `withDistribution` probabilities for the
 * first time and found corners overconfident at BOTH extremes while accurate in
 * the middle - the signature of a centre that swings too far, not of a wrong
 * spread. Corners lost to the per-line base rate outright (0.5982 against
 * 0.5883), and it is the default statistic with the best odds coverage.
 *
 * These are the weights chosen on the chronological FIRST HALF of history and
 * confirmed on the second, not the in-sample optima (0.4 and 0.6). Shots is
 * absent on purpose: it looked like the second-best case in sample (-0.0047) and
 * got worse out of sample (+0.0034). Goals and fouls gain nothing. Absent means
 * 1 - no shrinkage.
 *
 * `prediction.total` is deliberately NOT shrunk: displayed totals, rankings and
 * the classic engine must not move.
 */
export const PROB_SHRINK = { corners: 0.3, yellow_cards: 0.5 };

/**
 * Statistics whose CENTRE is corrected by its own measured bias.
 *
 * Section 18 named two offsets it could not explain: fouls overstates P(over) by
 * a flat +1.7-2.6pp across the mid-range, shots understates it by -2.6-3.2pp.
 * Neither is curvature and PROB_SHRINK does not touch either. `biasCorrection.mjs`
 * found the cause - the MEAN is biased, and the signs match exactly: over 6,866
 * matches fouls is predicted 0.337 too high and shots 0.397 too low. A one-sided
 * offset is what manufactures EV, because it makes one side of every line look
 * valuable, so this removes phantom edge rather than adding real edge.
 *
 * Only these three. Validated at three chronological split points (0.4/0.5/0.6),
 * and the verdict is the same at every one of them:
 *
 *   fouls    0.5269 / 0.5304 / 0.5363   against 0.5282 / 0.5318 / 0.5379
 *   shots    0.5805 / 0.5814 / 0.5837   against 0.5819 / 0.5833 / 0.5862
 *   goals    0.4496 / 0.4514 / 0.4556   against 0.4498 / 0.4517 / 0.4560
 *
 * corners and yellow_cards are deliberately absent: correcting them is WORSE
 * than leaving them alone at all three splits (corners 0.5882 against 0.5876,
 * and so on). Their bias is small - +0.059 and -0.078 - so the correction is
 * estimating noise. Do not add a statistic here without re-running that sweep;
 * one split is how section 19 nearly shipped a weight that reversed.
 */
export const MEAN_BIAS = ['fouls', 'shots', 'goals'];

/**
 * The centre a distribution is priced against - `total` for most statistics,
 * pulled toward the league mean for the two where that was measured to help.
 *
 * Both the probability path and the residual recording must go through this. Fit
 * the dispersion on unshrunk errors and then price a shrunk centre with it and
 * you get a pair that was never scored: neither the shipped model nor the tested
 * one.
 */
/**
 * The league mean/median over everything folded in so far, in O(1).
 *
 * `getMedian` copies and sorts the whole list. Read once per fold - building a
 * model with `trackResiduals` predicts each match before adding it - that is
 * O(n^2 log n), and it is not theoretical: it put 9.2 SECONDS on the count
 * engine's corners model over 5,844 matches, which is most of the time it takes
 * to open the Predictor.
 *
 * A length-keyed memo cannot fix it. For a statistic that is its own predictor
 * (every one but goals) `predictFromModel` returns early and never reads this,
 * so there is exactly one distinct length per fold and every lookup misses.
 *
 * So the aggregates are maintained as history is folded in: a running sum for
 * the mean, and a sorted mirror of `pastTargets` for the median. Binary-insert
 * moves memory rather than comparing, which is orders of magnitude cheaper than
 * re-sorting. The values are identical - same multiset, same definitions as
 * getAvg/getMedian, including 0 for an empty list.
 */
const insertSorted = (sorted, value) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < value) lo = mid + 1; else hi = mid;
    }
    sorted.splice(lo, 0, value);
};

const leagueAggregate = (model) => {
    const n = model.pastTargets.length;
    if (!n) return 0;
    if (!VOLATILE_STATS.includes(model.target)) return model.pastTargetSum / n;
    const sorted = model.sortedTargets;
    const mid = n >> 1;
    return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The model's own mean residual, or 0 for a statistic that is not corrected.
 *
 * Read from `model.residuals`, which are out-of-sample by construction -
 * addMatchToPredictionModel records what it WOULD have predicted before folding
 * each match in. Gated on MIN_RESIDUALS for the same reason the dispersion is:
 * a bias measured on a handful of errors is a rumour.
 *
 * This is deliberately re-derived on every model rather than being a fitted
 * constant in the source. A hardcoded number would be frozen at whenever it was
 * measured, and the bias DRIFTS - fouls ran +0.19, -0.42, -0.40, +0.23 across
 * the four seasons in the dump. Re-deriving tracks that for free.
 */
const meanBias = (model) => {
    if (!MEAN_BIAS.includes(model.target)) return 0;
    if (model.residuals.length < MIN_RESIDUALS) return 0;
    let sum = 0;
    for (const r of model.residuals) sum += r.actual - r.mu;
    return sum / model.residuals.length;
};

/**
 * Moves a finished prediction onto the corrected centre, identities intact.
 *
 * Implemented as a common factor rather than an addition on `total` alone,
 * because four other numbers have to stay consistent with it: `expHome +
 * expAway === total`, and `expHome === (hFor + aAg) / 2`, which StatsAnalysis
 * reads. Scaling all of them by the same factor preserves both - the same
 * device the predictor rescale below already uses, and the identity 046ce99
 * existed to restore.
 *
 * The spreads are deliberately NOT scaled: a bias correction shifts the centre,
 * it does not narrow or widen the distribution around it.
 */
const applyMeanBias = (model, prediction) => {
    const bias = meanBias(model);
    if (!prediction || bias === 0 || !(prediction.total > 0)) return prediction;
    const corrected = prediction.total + bias;
    // A correction large enough to invert the estimate is not a correction.
    if (!(corrected > 0)) return prediction;
    const f = corrected / prediction.total;
    return {
        ...prediction,
        total: corrected,
        expHome: prediction.expHome * f,
        expAway: prediction.expAway * f,
        hFor: prediction.hFor * f,
        hAg: prediction.hAg * f,
        aFor: prediction.aFor * f,
        aAg: prediction.aAg * f,
        // What was applied, so the residual recorder can take it back off and
        // the invariants can check it landed only where it was measured.
        meanBias: bias,
    };
};

const shrinkTotal = (model, total) => {
    const w = PROB_SHRINK[model.target] ?? 1;
    // The guard predictFromModel's own blend uses. With no history there is no
    // mean worth shrinking toward, and getAvg([]) is 0 - which would drag the
    // centre to near zero rather than leave it alone.
    if (w === 1 || model.pastTargets.length < MIN_HISTORY_FOR_BLEND) return total;
    return w * total + (1 - w) * leagueAggregate(model);
};

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
        // Maintained alongside pastTargets so leagueAggregate is O(1). See there.
        sortedTargets: [],
        pastTargetSum: 0,
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
            // Shrunk, because that is the centre the probabilities are priced
            // against - the dispersion has to be fitted on the errors of the
            // number it will actually be used with. Identity for every statistic
            // outside PROB_SHRINK. `pastTargets` excludes this match, so the mean
            // is the one a prediction made now would have seen.
            // UNCORRECTED, deliberately. meanBias() is computed FROM these
            // residuals, so recording them against the corrected centre would
            // make the estimate self-referential and collapse it toward zero
            // over successive folds. Take the correction back off first.
            const rawTotal = prior.total - (prior.meanBias ?? 0);
            model.residuals.push({ mu: shrinkTotal(model, rawTotal), actual: target });
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
        model.pastTargetSum += target;
        insertSorted(model.sortedTargets, target);
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
    // Fitted around the corrected centre. Pairing a moved mean with a spread
    // measured around the old one is neither the shipped model nor a tested one -
    // the same trap CLAUDE.md documents for shrinkage. `bias` is 0 for every
    // statistic outside MEAN_BIAS, so this is identity for them.
    const bias = meanBias(model);
    model.dispersion = model.residuals.length >= MIN_RESIDUALS
        ? fitDispersion(
            bias === 0 ? model.residuals
                       : model.residuals.map(r => ({ mu: r.mu + bias, actual: r.actual })),
            { minSamples: MIN_RESIDUALS })
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
        // Self-predicted statistics return here - fouls and shots among them -
        // so the correction has to be applied on BOTH paths, not just below.
        const corrected = applyMeanBias(model, raw);
        return engine === ENGINES.COUNT ? withDistribution(model, corrected) : corrected;
    }
    if (!raw || !(raw.total > 0)) return raw;

    // Rescale from the predictor's units onto the target's.
    const scale = model.sumPredictor > 0 ? model.sumTarget / model.sumPredictor : 1;
    const scaledTotal = raw.total * scale;

    // Blend toward the target's league mean. Without enough history there is no
    // mean worth blending toward, so fall back to the unblended prediction
    // rather than dragging it toward zero.
    const canBlend = model.pastTargets.length >= MIN_HISTORY_FOR_BLEND;
    const leagueMean = canBlend ? leagueAggregate(model) : scaledTotal;
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
    const corrected = applyMeanBias(model, blended);
    return engine === ENGINES.COUNT ? withDistribution(model, corrected) : corrected;
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
    // The centre for the probabilities only; `prediction.total` is left as it is.
    // The shrink is for the probabilities only; `prediction.total` keeps whatever
    // the estimator said. The mean-bias correction is NOT applied here - it is
    // already inside `prediction.total`, having been applied to the estimate
    // itself, so adding it again would double it.
    const mu = shrinkTotal(model, prediction.total);
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
        probOver: (line) => probOver(mu, line, r),
        probUnder: (line) => {
            const p = probOver(mu, line, r);
            return p == null ? null : 1 - p;
        },
        distribution: () => distribution(mu, r),
    };
};

/** True when `statistic` is predicted from something other than itself. */
export const isDerived = (statistic) =>
    Boolean(PREDICTOR_MODEL[resolveStatKey(statistic)]);

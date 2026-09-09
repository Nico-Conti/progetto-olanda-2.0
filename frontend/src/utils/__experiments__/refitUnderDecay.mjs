/**
 * Re-choose the predictor and blend weight, now that recency is a slope.
 *
 * PREDICTOR_MODEL's entries were fitted against a five-match rectangular window.
 * Decay changes how much history reaches the estimate and how it is weighted, so
 * both the best predictor and the best blend weight can move. Shipping decay
 * without re-measuring them would leave parameters tuned for an estimator that
 * no longer exists.
 *
 * Validated forward in time: the pair is chosen on every earlier season and
 * scored on the next one.
 *
 *   DATA_FILE=./data_fd.json node refitUnderDecay.mjs
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
} from '../predictTotal.js';
import { STAT_CONFIG, VOLATILE_STATS } from '../statistics.js';
import { getAvg, getMedian } from '../stats.js';

const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA));
const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();

/** Half-lives measured by decayComparison.mjs, best accuracy per statistic. */
const HALF_LIFE = {
    corners: 365, goals: 180, fouls: 90, shots: 120, yellow_cards: 180,
};
const CANDIDATES = {
    corners: ['corners', 'shots', 'shots_on_target', 'box_touches', 'crosses'],
    goals: ['goals', 'shots_on_target', 'box_touches', 'xg', 'shots'],
    fouls: ['fouls', 'yellow_cards'],
    shots: ['shots', 'shots_on_target', 'corners', 'box_touches'],
    yellow_cards: ['yellow_cards', 'fouls'],
};
const WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);
const totalOf = (m, s) => {
    const x = m.stats?.[s];
    return x ? Number(x.home) + Number(x.away) : null;
};

/**
 * One walk per (target, predictor), tallying every blend weight at once.
 *
 * The model runs at weight 1 so it returns the rescaled prediction unblended;
 * the blend toward the league mean is applied here, which is why eleven weights
 * cost one pass rather than eleven.
 */
function tally(target, predictor) {
    const aggregate = VOLATILE_STATS.includes(target) ? getMedian : getAvg;
    const byLeague = {};
    for (const m of data) {
        if (totalOf(m, target) === null || totalOf(m, predictor) === null || !m.date) continue;
        (byLeague[m.league] ??= []).push(m);
    }
    const rows = [];
    for (const matches of Object.values(byLeague)) {
        matches.sort((a, b) => new Date(a.date) - new Date(b.date));
        const model = createPredictionModel(target, { halfLifeDays: HALF_LIFE[target] });
        model.predictor = predictor;
        model.weight = 1;
        for (const m of matches) {
            const p = predictFromModel(model, m.squadre.home, m.squadre.away, { asOf: m.date });
            if (p && p.total > 0 && model.pastTargets.length > 3) {
                rows.push({
                    season: m.season, group: `${m.league}|${m.season}`, pred: p.total,
                    mean: aggregate(model.pastTargets), actual: totalOf(m, target),
                });
            }
            addMatchToPredictionModel(model, m);
        }
    }
    return rows;
}

console.log(`${data.length} matches\n`);

/**
 * Two fold schemes, because the two datasets cannot use the same one.
 *
 *   forward   train on every earlier season, score the next. No lookahead, which
 *             is the right question for a betting model - but it needs 4+ seasons
 *             and only data_fd.json has them.
 *   league    leave one league-season out, as predictorComparison.mjs does. Works
 *             on our own ~1.2 seasons by turning them into 29 groups, at the cost
 *             of letting the fit see the future. See docs section 8: that makes it
 *             a question about which parameters are STABLE, not about what could
 *             have been bet. Read a win here as a hypothesis, not a result.
 *
 * FOLDS=forward|league overrides the default.
 */
const SEASONS = [...new Set(data.map(m => m.season))];
const SCHEME = process.env.FOLDS ?? (SEASONS.length > 3 ? 'forward' : 'league');
if (SCHEME === 'forward' && SEASONS.length <= 3) {
    console.error(`FOLDS=forward needs 4+ seasons; this file has ${SEASONS.length} ` +
                  `(${[...SEASONS].sort().join(', ')}).`);
    process.exit(1);
}
// A held-out group smaller than this decides nothing and adds noise - the opening
// weeks of 2026/27 are ~20 matches per league.
const MIN_FOLD = 100;
console.log(`folds: ${SCHEME === 'forward'
    ? 'forward in time by season (no lookahead)'
    : 'leave-one-league-season-out (the fit sees the future - see docs section 8)'}\n`);
console.log(`${'target'.padEnd(14)}${'half-life'.padStart(10)}${'folds'.padStart(6)}${'N'.padStart(8)}` +
            `${'shipped'.padStart(9)}${'refit'.padStart(8)}${'gain'.padStart(8)}   chosen (predictor @ weight)`);

for (const [target, candidates] of Object.entries(CANDIDATES)) {
    const usable = candidates.filter(c => AVAILABLE.has(c));
    if (!AVAILABLE.has(target) || usable.length === 0) continue;
    const line = STAT_CONFIG[target].total.default;

    // rows[predictor] -> per-match predictions, shared across all weights
    const byPredictor = Object.fromEntries(usable.map(p => [p, tally(target, p)]));
    const all = Object.values(byPredictor).flat();
    // `forward` trains on everything strictly earlier; `league` trains on every
    // group but the held-out one. Only the membership test differs.
    const key = SCHEME === 'forward' ? 'season' : 'group';
    const sizes = {};
    for (const r of byPredictor[target] ?? []) sizes[r[key]] = (sizes[r[key]] ?? 0) + 1;
    const units = [...new Set(all.map(r => r[key]))].sort();
    const folds = SCHEME === 'forward'
        ? units.slice(3)
        : units.filter(u => sizes[u] >= MIN_FOLD);
    const isTraining = (r, test) =>
        SCHEME === 'forward' ? r[key] < test : r[key] !== test;

    let ok = 0, n = 0, shippedOk = 0, shippedN = 0;
    const chosen = new Set();

    for (const test of folds) {
        let best = null;
        for (const predictor of usable) {
            for (const w of WEIGHTS) {
                let hit = 0, cnt = 0;
                for (const r of byPredictor[predictor]) {
                    if (!isTraining(r, test)) continue;
                    const blended = w * r.pred + (1 - w) * r.mean;
                    if ((blended > line) === (r.actual > line)) hit++;
                    cnt++;
                }
                if (cnt > 200 && (!best || hit / cnt > best.acc)) {
                    best = { predictor, w, acc: hit / cnt };
                }
            }
        }
        if (!best) continue;
        chosen.add(`${best.predictor}@${best.w}`);

        for (const r of byPredictor[best.predictor]) {
            if (r[key] !== test) continue;
            const blended = best.w * r.pred + (1 - best.w) * r.mean;
            if ((blended > line) === (r.actual > line)) ok++;
            n++;
        }
        // Baseline: the target's own history, unblended - what ships today.
        // It needs its OWN denominator. `tally` drops a match whose predictor is
        // missing and waits for four past targets, so each predictor qualifies a
        // different set of rows; scoring these hits against the chosen
        // predictor's `n` compares two different denominators. That read as
        // goals at 63.0% here against 55.0% on the identical file under forward
        // folds - own-history accuracy cannot depend on the fold scheme.
        for (const r of byPredictor[target] ?? []) {
            if (r[key] !== test) continue;
            if ((r.pred > line) === (r.actual > line)) shippedOk++;
            shippedN++;
        }
    }
    if (!n || !shippedN) continue;

    const shippedAcc = shippedOk / shippedN;
    const gain = 100 * (ok / n - shippedAcc);
    console.log(`${target.padEnd(14)}${String(HALF_LIFE[target] + 'd').padStart(10)}` +
                `${String(folds.length).padStart(6)}${String(n).padStart(8)}` +
                `${(100 * shippedAcc).toFixed(1).padStart(8)}%${(100 * ok / n).toFixed(1).padStart(7)}%` +
                `${((gain >= 0 ? '+' : '') + gain.toFixed(1) + 'pp').padStart(8)}   ${[...chosen].join(', ')}`);
}

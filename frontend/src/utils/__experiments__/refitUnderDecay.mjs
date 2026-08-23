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
                    season: m.season, pred: p.total,
                    mean: aggregate(model.pastTargets), actual: totalOf(m, target),
                });
            }
            addMatchToPredictionModel(model, m);
        }
    }
    return rows;
}

console.log(`${data.length} matches\n`);
console.log(`${'target'.padEnd(14)}${'half-life'.padStart(10)}${'N'.padStart(8)}` +
            `${'shipped'.padStart(9)}${'refit'.padStart(8)}${'gain'.padStart(8)}   chosen (predictor @ weight)`);

for (const [target, candidates] of Object.entries(CANDIDATES)) {
    const usable = candidates.filter(c => AVAILABLE.has(c));
    if (!AVAILABLE.has(target) || usable.length === 0) continue;
    const line = STAT_CONFIG[target].total.default;

    // rows[predictor] -> per-match predictions, shared across all weights
    const byPredictor = Object.fromEntries(usable.map(p => [p, tally(target, p)]));
    const seasons = [...new Set(Object.values(byPredictor).flat().map(r => r.season))].sort();

    let ok = 0, n = 0, shippedOk = 0;
    const chosen = new Set();

    for (const test of seasons.slice(3)) {
        let best = null;
        for (const predictor of usable) {
            for (const w of WEIGHTS) {
                let hit = 0, cnt = 0;
                for (const r of byPredictor[predictor]) {
                    if (r.season >= test) continue;
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
            if (r.season !== test) continue;
            const blended = best.w * r.pred + (1 - best.w) * r.mean;
            if ((blended > line) === (r.actual > line)) ok++;
            n++;
        }
        // Baseline: the target's own history, unblended - the pre-decay default.
        for (const r of byPredictor[target] ?? []) {
            if (r.season !== test) continue;
            if ((r.pred > line) === (r.actual > line)) shippedOk++;
        }
    }
    if (!n) continue;

    const gain = 100 * (ok - shippedOk) / n;
    console.log(`${target.padEnd(14)}${String(HALF_LIFE[target] + 'd').padStart(10)}${String(n).padStart(8)}` +
                `${(100 * shippedOk / n).toFixed(1).padStart(8)}%${(100 * ok / n).toFixed(1).padStart(7)}%` +
                `${((gain >= 0 ? '+' : '') + gain.toFixed(1) + 'pp').padStart(8)}   ${[...chosen].join(', ')}`);
}

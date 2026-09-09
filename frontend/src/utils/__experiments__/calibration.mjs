/**
 * When the app says 68%, does it happen 68% of the time?
 *
 * Accuracy asks whether the model picks the right side. Calibration asks whether
 * the NUMBER is honest, and that is the one that decides bets: a bet is worth
 * making when our probability beats the price, so a probability that is 4pp off
 * invents an edge that is not there. Section 6 of prediction-model.md showed the
 * symptom - ROI negative at every EV threshold and getting WORSE as the threshold
 * rises, which is what miscalibration looks like, not a diluted edge.
 *
 * Nothing here has been measured for the shipped engine. Section 6 calibrated a
 * one-parameter logistic in marketComparison.mjs, for goals at 2.5 only; the app
 * ships a negative binomial (withDistribution / probOver). This measures that.
 *
 *   node calibration.mjs                  # our own dump, every statistic
 *   node calibration.mjs corners          # one statistic
 *   DATA_FILE=./data_fd.json node calibration.mjs
 *
 * Walk-forward and pooled, which is the canonical shipped configuration (see
 * CLAUDE.md, "every view must build its model the same way"): one model per
 * statistic over every league, each match predicted from only what came before.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
    dispersionFor, ENGINES, PROB_SHRINK,
} from '../predictTotal.js';
import { STAT_CONFIG, HALF_LIFE_DAYS, STAT_SIGNAL, VOLATILE_STATS } from '../statistics.js';
import { getAvg, getMedian } from '../stats.js';
import { fitDispersion, probOver } from '../countModel.js';

const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py first.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));
const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();

const only = process.argv[2];
const STATS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards']
    .filter(s => AVAILABLE.has(s) && (!only || s === only));

const totalOf = (m, s) => {
    const x = m.stats?.[s];
    return x ? Number(x.home) + Number(x.away) : null;
};
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

/**
 * Every (probability, outcome) pair the shipped engine would have produced.
 *
 * Predictions made before the dispersion is fitted are kept but flagged: they
 * use the Poisson default, which is an assumption rather than a measurement, and
 * lumping the two together would hide whichever one is wrong.
 */
function collect(stat) {
    const lines = STAT_CONFIG[stat]?.total?.options ?? [];
    const aggregate = VOLATILE_STATS.includes(stat) ? getMedian : getAvg;
    const rows = [];
    // (predicted total, league mean, outcome) per match, chronological - the
    // ingredients the shrinkage sweep re-scores without walking again.
    const points = [];
    const model = createPredictionModel(stat, { trackResiduals: true });
    const matches = data
        .filter(m => totalOf(m, stat) !== null && m.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const m of matches) {
        const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
            asOf: m.date, engine: ENGINES.COUNT,
        });
        const actual = totalOf(m, stat);
        if (p && p.total > 0 && p.probOver) {
            points.push({ total: p.total, mean: aggregate(model.pastTargets), actual });
            for (const line of lines) {
                const prob = p.probOver(line);
                if (prob == null || !Number.isFinite(prob)) continue;
                rows.push({
                    line, prob, over: actual > line,
                    fitted: p.dispersionFitted,
                    effective: p.effectiveMatches ?? 0,
                });
            }
        }
        addMatchToPredictionModel(model, m);
    }
    // `model.dispersion` is nulled by every fold; ask for it rather than reading it.
    return { rows, points, lines, dispersion: dispersionFor(model) };
}

/** log loss, Brier, and expected calibration error over one set of pairs. */
function score(rows) {
    if (!rows.length) return null;
    let ll = 0, brier = 0, over = 0;
    for (const r of rows) {
        const p = clamp(r.prob);
        ll += r.over ? -Math.log(p) : -Math.log(1 - p);
        brier += (r.prob - (r.over ? 1 : 0)) ** 2;
        if (r.over) over++;
    }
    const base = over / rows.length;
    // The base rate is scored PER LINE. Pooling lines whose over-rates run from
    // ~5% to ~95% into a single base rate makes the baseline hopeless and any
    // model look brilliant for merely knowing which line it is quoting - the
    // first version of this script did exactly that and scored goals at 0.449
    // against a 0.690 "base".
    const perLine = {};
    for (const r of rows) {
        const c = (perLine[r.line] ??= { n: 0, over: 0 });
        c.n++; if (r.over) c.over++;
    }
    let baseLL = 0;
    for (const r of rows) {
        const c = perLine[r.line];
        const b = clamp(c.over / c.n);
        baseLL += r.over ? -Math.log(b) : -Math.log(1 - b);
    }

    const BINS = 10;
    const bins = Array.from({ length: BINS }, () => ({ n: 0, sumP: 0, over: 0 }));
    for (const r of rows) {
        const b = bins[Math.min(BINS - 1, Math.floor(r.prob * BINS))];
        b.n++; b.sumP += r.prob; if (r.over) b.over++;
    }
    let ece = 0;
    for (const b of bins) if (b.n) ece += (b.n / rows.length) * Math.abs(b.sumP / b.n - b.over / b.n);

    return { n: rows.length, ll: ll / rows.length, brier: brier / rows.length,
             baseLL: baseLL / rows.length, base, ece, bins };
}


/**
 * Does shrinking the total toward the league mean fix the probabilities?
 *
 * Section 18 found corners overconfident at BOTH extremes while accurate in the
 * middle - the signature of predictions that swing too far, not of a wrong
 * dispersion. Shrinkage is the standard repair, and sections 1, 16 and 17 have
 * each independently fitted w < 1 and then shelved it on section 5's grounds
 * (MAE is minimised by collapsing toward the mean, which destroys a call).
 *
 * That objection does not apply to a fit against LOG LOSS, which is section 5's
 * own lesson: fit the objective you are judged on. This sweeps w and scores each
 * one on the probability, not on the error.
 *
 * The dispersion is refitted for every w - shrinking the mean changes how wrong
 * the model is, so carrying the unshrunk r over would score a mismatched pair.
 * It is refitted from strictly earlier matches only.
 */
const SWEEP_WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);
// ponytail: dispersion refitted every 50 observations rather than every match.
// Per-match is O(n^2) over the grid (~444M operations here) for a parameter that
// moves in steps; drop to 1 if a fit ever looks like it is lagging the data.
const REFIT_EVERY = 50;

function sweep(stat, points, lines) {
    const out = [];
    // Chronological midpoint. The w that wins on the whole sample was chosen on
    // the data it was scored on; fitting it on the first half and scoring it on
    // the second is what says whether it is real.
    const half = Math.floor(points.length / 2);
    for (const w of SWEEP_WEIGHTS) {
        const residuals = [];
        let r = null, sinceFit = 0, ll = 0, n = 0;
        let llEarly = 0, nEarly = 0, llLate = 0, nLate = 0;
        const BINS = 10;
        const bins = Array.from({ length: BINS }, () => ({ n: 0, sumP: 0, over: 0 }));

        for (const [idx, pt] of points.entries()) {
            const mu = w * pt.total + (1 - w) * pt.mean;
            if (mu > 0 && residuals.length >= 30) {
                if (r === null || sinceFit >= REFIT_EVERY) {
                    r = fitDispersion(residuals, { minSamples: 30 });
                    sinceFit = 0;
                }
                for (const line of lines) {
                    const prob = probOver(mu, line, r);
                    if (prob == null || !Number.isFinite(prob)) continue;
                    const over = pt.actual > line;
                    const loss = over ? -Math.log(clamp(prob)) : -Math.log(clamp(1 - prob));
                    ll += loss; n++;
                    if (idx < half) { llEarly += loss; nEarly++; } else { llLate += loss; nLate++; }
                    const b = bins[Math.min(BINS - 1, Math.floor(prob * BINS))];
                    b.n++; b.sumP += prob; if (over) b.over++;
                }
            }
            if (mu > 0) { residuals.push({ mu, actual: pt.actual }); sinceFit++; }
        }
        if (!n) continue;
        let ece = 0;
        for (const b of bins) if (b.n) ece += (b.n / n) * Math.abs(b.sumP / b.n - b.over / b.n);
        out.push({ w, ll: ll / n, ece, n, r,
                   early: nEarly ? llEarly / nEarly : null,
                   late: nLate ? llLate / nLate : null });
    }
    return out;
}

console.log(`${data.length} matches | statistics: ${STATS.join(', ')}`);
console.log('walk-forward, pooled across leagues, count engine - the shipped configuration.\n');

const summary = [];
for (const stat of STATS) {
    const { rows, points, lines, dispersion } = collect(stat);
    const fitted = rows.filter(r => r.fitted);
    const s = score(fitted);
    if (!s) { console.log(`${stat}: no fitted predictions\n`); continue; }

    const line = STAT_CONFIG[stat].total.default;
    console.log(`== ${stat} ==  half-life ${HALF_LIFE_DAYS[stat]}d, ` +
                `dispersion ${dispersion}, signal ${STAT_SIGNAL[stat]?.strength ?? 'unmeasured'}`);
    console.log(`   ${rows.length - fitted.length} of ${rows.length} predictions dropped ` +
                `(dispersion not yet fitted)\n`);

    console.log(`   reliability, all ${STAT_CONFIG[stat].total.options.length} lines pooled`);
    console.log(`   ${'we said'.padEnd(12)}${'n'.padStart(8)}${'mean claim'.padStart(12)}` +
                `${'happened'.padStart(11)}${'gap'.padStart(9)}`);
    s.bins.forEach((b, i) => {
        if (b.n < 50) return;
        const claim = b.sumP / b.n, obs = b.over / b.n;
        const gap = 100 * (claim - obs);
        console.log(`   ${`${i * 10}-${(i + 1) * 10}%`.padEnd(12)}${String(b.n).padStart(8)}` +
                    `${pct(claim).padStart(12)}${pct(obs).padStart(11)}` +
                    `${((gap >= 0 ? '+' : '') + gap.toFixed(1) + 'pp').padStart(9)}`);
    });

    // Thin vs thick history. If the miscalibration lives in the thin bucket, the
    // fix is a per-match dispersion; if it is uniform, a single correction map.
    const effs = fitted.map(r => r.effective).sort((a, b) => a - b);
    const median = effs[Math.floor(effs.length / 2)];
    const thin = score(fitted.filter(r => r.effective < median));
    const thick = score(fitted.filter(r => r.effective >= median));
    const fmt = (x) => x ? `${pct(x.ece, 2)} over ${x.n}` : 'n/a';
    console.log(`\n   log loss ${s.ll.toFixed(4)} vs base ${s.baseLL.toFixed(4)}` +
                `${s.ll < s.baseLL ? '  (beats base)' : '  (WORSE than base)'}` +
                ` | Brier ${s.brier.toFixed(4)} | ECE ${pct(s.ece, 2)}`);
    console.log(`   by history: below median (${median.toFixed(1)} effective) ECE ${fmt(thin)}` +
                ` | at or above ECE ${fmt(thick)}\n`);

    const sw = sweep(stat, points, lines);
    if (sw.length) {
        const best = sw.reduce((a, b) => (b.ll < a.ll ? b : a));
        const shipped = sw.find(x => x.w === 1);
        console.log(`   shrinkage sweep (ships at w=${PROB_SHRINK[stat] ?? 1}), scored on log loss`);
        console.log(`   ${'w'.padStart(5)}${'log loss'.padStart(11)}${'ECE'.padStart(9)}` +
                    `${'dispersion'.padStart(12)}`);
        for (const x of sw) {
            const mark = x.w === best.w ? '  <- best' : '';
            console.log(`   ${x.w.toFixed(1).padStart(5)}${x.ll.toFixed(4).padStart(11)}` +
                        `${pct(x.ece, 2).padStart(9)}${String(x.r).padStart(12)}${mark}`);
        }
        console.log(`   -> best w=${best.w.toFixed(1)}: log loss ` +
                    `${shipped.ll.toFixed(4)} -> ${best.ll.toFixed(4)} ` +
                    `(${(best.ll - shipped.ll).toFixed(4)}), ` +
                    `ECE ${pct(shipped.ece, 2)} -> ${pct(best.ece, 2)}`);

        // Out of sample: choose w on the first half, score it on the second.
        const withEarly = sw.filter(x => x.early != null && x.late != null);
        const pick = withEarly.length
            ? withEarly.reduce((a, b) => (b.early < a.early ? b : a)) : null;
        const lateShipped = sw.find(x => x.w === 1)?.late;
        if (pick && lateShipped != null) {
            const delta = pick.late - lateShipped;
            console.log(`   -> holdout: w=${pick.w.toFixed(1)} chosen on the first half; ` +
                        `on the second half ${lateShipped.toFixed(4)} -> ${pick.late.toFixed(4)} ` +
                        `(${delta >= 0 ? '+' : ''}${delta.toFixed(4)})` +
                        `${delta < 0 ? '  holds up' : '  DOES NOT HOLD'}`);
        }
        console.log('');
        summary.push({ stat, line, ...s, thin, thick, best, shipped, pick,
                       lateShipped, holdoutOk: pick && lateShipped != null && pick.late < lateShipped });
    } else {
        summary.push({ stat, line, ...s, thin, thick });
    }
}

console.log('== summary ==');
console.log(`${'stat'.padEnd(14)}${'log loss'.padStart(10)}${'base'.padStart(9)}` +
            `${'ECE'.padStart(7)}${'best w'.padStart(8)}${'LL at best w'.padStart(14)}` +
            `${'ECE at best w'.padStart(15)}${'holdout'.padStart(17)}${'verdict'.padStart(20)}`);
for (const r of summary) {
    const verdict = r.ll >= r.baseLL ? 'worse than base'
        : r.ece < 0.02 ? 'calibrated' : r.ece < 0.05 ? 'mild bias' : 'MISCALIBRATED';
    console.log(`${r.stat.padEnd(14)}${r.ll.toFixed(4).padStart(10)}` +
                `${r.baseLL.toFixed(4).padStart(9)}${pct(r.ece, 1).padStart(7)}` +
                `${(r.best ? r.best.w.toFixed(1) : '-').padStart(8)}` +
                `${(r.best ? r.best.ll.toFixed(4) : '-').padStart(14)}` +
                `${(r.best ? pct(r.best.ece, 2) : '-').padStart(15)}` +
                `${(r.pick ? (r.holdoutOk ? `holds (w=${r.pick.w.toFixed(1)})` : 'no') : '-').padStart(17)}` +
                `${verdict.padStart(20)}`);
}

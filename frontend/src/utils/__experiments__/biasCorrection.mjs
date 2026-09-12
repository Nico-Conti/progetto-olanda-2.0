/**
 * Is the model's CENTRE biased, and does correcting it fix the offsets?
 *
 *   node biasCorrection.mjs                 # every statistic
 *   node biasCorrection.mjs fouls
 *
 * Section 18 left two defects unexplained and unfixed: fouls overstates P(over)
 * by a flat +1.7-2.6pp across the mid-range and shots understates it by
 * -2.6-3.2pp. Both are OFFSETS rather than curvature, `PROB_SHRINK` explicitly
 * does not touch them, and a one-sided offset is precisely what manufactures EV -
 * it makes one side of every line look valuable.
 *
 * Section 24 then measured the per-side means and the signs lined up exactly:
 * fouls over-predicted (+0.178 home, +0.159 away), shots under-predicted
 * (-0.261, -0.136). That points at a biased MEAN, not a broken probability - and
 * a biased mean is worth fixing where it happens rather than patching downstream.
 *
 * Three questions:
 *
 *   1. How big is the bias on the total, and is it stable or does it drift by
 *      season? A decayed average LAGS a trending statistic, so a statistic that
 *      is drifting year on year would show a bias that is not constant - and a
 *      constant correction would then be fitted to the past and wrong in future.
 *   2. Does correcting it improve the probabilities on a chronological holdout,
 *      the way the PROB_SHRINK weights were validated?
 *   3. Constant correction, or a running one? The model already keeps
 *      out-of-sample residuals for the dispersion, so a running mean residual is
 *      nearly free and adapts on its own.
 *
 * The dispersion is REFITTED on corrected residuals. Pairing a moved centre with
 * a spread measured around the old one is the trap CLAUDE.md documents for
 * shrinkage, and it applies identically here.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES,
} from '../predictTotal.js';
import { STAT_CONFIG } from '../statistics.js';
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
// card_points is exempt from the AVAILABLE majority test: it is derived and
// dumpSeason emits it only where second_bookings is known (41%), which is the
// subset it must be measured on anyway.
const STATS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards', 'card_points']
    .filter(s => (AVAILABLE.has(s) || s === 'card_points') && (!only || s === only));

const totalOf = (m, s) => {
    const x = m.stats?.[s];
    if (!x) return null;
    const h = Number(x.home), a = Number(x.away);
    return Number.isFinite(h) && Number.isFinite(a) ? h + a : null;
};
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Residuals required before the running correction is trusted. */
const GATE = Number(process.env.GATE ?? 500);

/** Walk once, keeping the priced centre, the outcome, and the running bias. */
function collect(stat) {
    const rows = [];
    const model = createPredictionModel(stat, { trackResiduals: true });
    const matches = data
        .filter(m => totalOf(m, stat) !== null && m.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const m of matches) {
        const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
            asOf: m.date, engine: ENGINES.COUNT,
        });
        const actual = totalOf(m, stat);
        if (p && p.total > 0) {
            // The bias a prediction made at this moment could have known: the
            // mean residual over everything already folded in. Out-of-sample by
            // construction, because addMatchToPredictionModel records each
            // residual before folding its match in.
            const runningBias = model.residuals.length
                ? mean(model.residuals.map(r => r.actual - r.mu))
                : 0;
            rows.push({
                date: m.date, season: m.season, league: m.league,
                mu: p.total, actual, runningBias,
                residuals: model.residuals.length,
            });
        }
        addMatchToPredictionModel(model, m);
    }
    return rows;
}

/** log loss, per-line base rate and ECE for a given centre-shifting function. */
function scoreUnder(rows, lines, r, shift) {
    const pairs = [];
    for (const row of rows) {
        const mu = row.mu + shift(row);
        if (!(mu > 0)) continue;
        for (const line of lines) {
            const p = probOver(mu, line, r);
            if (p == null || !Number.isFinite(p)) continue;
            pairs.push({ line, prob: p, over: row.actual > line });
        }
    }
    if (!pairs.length) return null;
    let ll = 0;
    const perLine = {};
    for (const x of pairs) {
        ll += x.over ? -Math.log(clamp(x.prob)) : -Math.log(1 - clamp(x.prob));
        const c = (perLine[x.line] ??= { n: 0, over: 0 });
        c.n++; if (x.over) c.over++;
    }
    let baseLL = 0;
    for (const x of pairs) {
        const b = clamp(perLine[x.line].over / perLine[x.line].n);
        baseLL += x.over ? -Math.log(b) : -Math.log(1 - b);
    }
    const BINS = 10;
    const bins = Array.from({ length: BINS }, () => ({ n: 0, sumP: 0, over: 0 }));
    for (const x of pairs) {
        const b = bins[Math.min(BINS - 1, Math.floor(x.prob * BINS))];
        b.n++; b.sumP += x.prob; if (x.over) b.over++;
    }
    let ece = 0, signed = 0;
    for (const b of bins) if (b.n) {
        ece += (b.n / pairs.length) * Math.abs(b.sumP / b.n - b.over / b.n);
        signed += (b.n / pairs.length) * (b.sumP / b.n - b.over / b.n);
    }
    const mae = mean(rows.map(x => Math.abs(x.mu + shift(x) - x.actual)));
    return { n: pairs.length, ll: ll / pairs.length, baseLL: baseLL / pairs.length, ece, signed, mae };
}

console.log(`${data.length} matches in the dump\n`);

for (const stat of STATS) {
    const rows = collect(stat);
    if (rows.length < 400) { console.log(`${stat}: only ${rows.length} rows, skipping\n`); continue; }
    const lines = STAT_CONFIG[stat]?.total?.options ?? [];

    const bias = mean(rows.map(r => r.actual - r.mu));
    console.log(`=== ${stat}   ${rows.length} predictions`);
    console.log(`  overall bias (actual - predicted): ${bias >= 0 ? '+' : ''}${bias.toFixed(3)}` +
                `   mean actual ${mean(rows.map(r => r.actual)).toFixed(2)}`);

    // 1. Is it stable, or drifting? A drifting bias means decay lag on a
    //    trending statistic, and a constant correction would be fitted to history.
    const bySeason = {};
    for (const r of rows) (bySeason[r.season] ??= []).push(r.actual - r.mu);
    const seasons = Object.keys(bySeason).sort();
    console.log('  by season: ' + seasons
        .map(s => `${s} ${(mean(bySeason[s]) >= 0 ? '+' : '') + mean(bySeason[s]).toFixed(2)} (n=${bySeason[s].length})`)
        .join('   '));

    // 2/3. Holdout, repeated at several split points.
    //
    // ONE split is how section 19 nearly shipped a shots weight that reversed out
    // of sample. Choosing a different correction per statistic off a single
    // holdout is the same mistake with more degrees of freedom, so the winner has
    // to hold at every split or it is an artefact of where the cut fell.
    console.log(`  ${'split'.padEnd(8)}${'correction'.padEnd(11)}${'r'.padStart(5)}${'log loss'.padStart(11)}` +
                `${'ECE'.padStart(8)}${'signed'.padStart(9)}${'MAE'.padStart(8)}`);
    const wins = [];
    for (const frac of [0.4, 0.5, 0.6]) {
        const cut = Math.floor(rows.length * frac);
        const train = rows.slice(0, cut), test = rows.slice(cut);
        const constant = mean(train.map(r => r.actual - r.mu));
        const SHIFTS = {
            none: () => 0,
            constant: () => constant,
            running: (r) => r.runningBias,
            // Running, but silent until the bias has been measured on enough
            // matches to be a measurement rather than a rumour - the same gate
            // dispersionFor puts on the spread. Early residual counts are why
            // plain `running` is noisier than `constant` wherever the true bias
            // is small: it is averaging a handful of errors.
            gated: (r) => (r.residuals >= GATE ? r.runningBias : 0),
        };
        let best = null;
        for (const [name, shift] of Object.entries(SHIFTS)) {
            // Refit the dispersion around the CORRECTED centre - pairing a moved
            // mean with the old spread is neither the shipped model nor a tested one.
            const r = fitDispersion(train.map(x => ({ mu: x.mu + shift(x), actual: x.actual })));
            const sc = scoreUnder(test, lines, r, shift);
            if (!sc) continue;
            console.log(`  ${String(frac).padEnd(8)}${name.padEnd(11)}${String(r).padStart(5)}` +
                        `${sc.ll.toFixed(4).padStart(11)}${pct(sc.ece, 2).padStart(8)}` +
                        `${((sc.signed >= 0 ? '+' : '') + pct(sc.signed, 2)).padStart(9)}${sc.mae.toFixed(3).padStart(8)}`);
            if (!best || sc.ll < best.ll) best = { name, ll: sc.ll };
        }
        if (best) wins.push(best.name);
    }
    const stable = wins.every(w => w === wins[0]);
    console.log(`  winner by log loss at each split: ${wins.join(', ')}` +
                `   -> ${stable ? `STABLE (${wins[0]})` : 'UNSTABLE - do not ship a choice made here'}`);
    console.log();
}

console.log(`'signed' is the mean signed calibration gap - the offset section 18 named.
Negative means the model says LESS than happens. A correction earns its place only
if it moves 'signed' toward zero AND does not cost log loss on the holdout.`);

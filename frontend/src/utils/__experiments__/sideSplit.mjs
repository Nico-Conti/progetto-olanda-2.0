/**
 * Does the model know WHICH SIDE gets the corners, or only how many there are?
 *
 * Every side market - team corners, corner handicap, most corners, and 1x2 or
 * BTTS built out of goals - is a bet on `expHome` / `expAway`, not on the total.
 * Everything this project has calibrated is the TOTAL: section 18, section 19
 * and PROB_SHRINK all score `probOver(total)`. The split has never been measured
 * as a claim about anything, so no side market can be priced yet.
 *
 *   node sideSplit.mjs                 # every statistic
 *   node sideSplit.mjs corners         # one
 *
 * Three questions, in the order that matters:
 *
 *   1. SKILL.  Does the split beat splitting the predicted total by a constant
 *      home share? That constant is the null hypothesis and it is a strong one -
 *      home advantage is most of what a split looks like. If knowing the two
 *      teams adds nothing on top of it, there is no side market to sell, however
 *      good the total is.
 *
 *   2. BIAS.   Is either side systematically over- or under-predicted? A flat
 *      offset is what manufactures EV on one side of a market - see the fouls
 *      and shots offsets in section 18, which shrinkage does not touch.
 *
 *   3. CALIBRATION.  Fit a per-side dispersion on the chronological first half
 *      and score P(side over line) on the second, the way the PROB_SHRINK
 *      weights were validated. Also asks whether the total's dispersion can be
 *      reused per side, since one fitted spread is cheaper than two.
 *
 * Walk-forward and pooled, the canonical shipped configuration. Nothing here
 * writes anything or changes the app.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
    dispersionFor, ENGINES,
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
const STATS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards']
    .filter(s => AVAILABLE.has(s) && (!only || s === only));

/** A team-corner line is roughly half a total line; keep them plausible per stat. */
const SIDE_LINES = {
    corners: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
    goals: [0.5, 1.5, 2.5, 3.5],
    fouls: [8.5, 10.5, 12.5, 14.5, 16.5],
    shots: [9.5, 11.5, 13.5, 15.5, 17.5],
    yellow_cards: [0.5, 1.5, 2.5, 3.5],
};

const pair = (m, s) => {
    const x = m.stats?.[s];
    if (!x) return null;
    const home = Number(x.home), away = Number(x.away);
    return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
};
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Walk the real shipped path once, keeping both sides of every prediction. */
function collect(stat) {
    const rows = [];
    const model = createPredictionModel(stat, { trackResiduals: true });
    const matches = data
        .filter(m => pair(m, stat) && m.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Running home share of everything already seen. This is the null model:
    // it knows the league's home advantage and nothing about the two teams.
    let seenHome = 0, seenTotal = 0;

    for (const m of matches) {
        const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
            asOf: m.date, engine: ENGINES.COUNT,
        });
        const actual = pair(m, stat);
        if (p && p.total > 0 && Number.isFinite(p.expHome) && Number.isFinite(p.expAway)
            && seenTotal > 0) {
            const share = seenHome / seenTotal;
            rows.push({
                date: m.date,
                predHome: p.expHome, predAway: p.expAway, predTotal: p.total,
                // The null split: the model's own total, divided by the league's
                // home share rather than by anything about these two teams.
                nullHome: p.total * share, nullAway: p.total * (1 - share),
                actHome: actual.home, actAway: actual.away,
                dispersionTotal: p.dispersion,
                effective: p.effectiveMatches ?? 0,
                fitted: p.dispersionFitted,
            });
        }
        seenHome += actual.home;
        seenTotal += actual.home + actual.away;
        addMatchToPredictionModel(model, m);
    }
    return { rows, dispersion: dispersionFor(model) };
}

/** log loss, per-line base rate, and ECE - the same scoring calibration.mjs uses. */
function score(pairs) {
    if (!pairs.length) return null;
    let ll = 0, over = 0;
    const perLine = {};
    for (const r of pairs) {
        const p = clamp(r.prob);
        ll += r.over ? -Math.log(p) : -Math.log(1 - p);
        if (r.over) over++;
        const c = (perLine[r.line] ??= { n: 0, over: 0 });
        c.n++; if (r.over) c.over++;
    }
    // Leave-one-out - `perLine` is built from the rows it scores, and an
    // in-sample base rate grades itself. See priceComparison.mjs for what that
    // cost on a thin sample.
    let baseLL = 0;
    for (const r of pairs) {
        const c = perLine[r.line];
        const b = c.n > 1 ? clamp((c.over - (r.over ? 1 : 0)) / (c.n - 1)) : 0.5;
        baseLL += r.over ? -Math.log(b) : -Math.log(1 - b);
    }
    const BINS = 10;
    const bins = Array.from({ length: BINS }, () => ({ n: 0, sumP: 0, over: 0 }));
    for (const r of pairs) {
        const b = bins[Math.min(BINS - 1, Math.floor(r.prob * BINS))];
        b.n++; b.sumP += r.prob; if (r.over) b.over++;
    }
    let ece = 0;
    for (const b of bins) if (b.n) ece += (b.n / pairs.length) * Math.abs(b.sumP / b.n - b.over / b.n);
    return { n: pairs.length, ll: ll / pairs.length, baseLL: baseLL / pairs.length, ece, base: over / pairs.length };
}

/** P(side over line) for every row and line, under a given dispersion. */
const probsFor = (rows, lines, r, pick) => {
    const out = [];
    for (const row of rows) {
        for (const line of lines) {
            const mu = pick.mu(row);
            if (!(mu > 0)) continue;
            const p = probOver(mu, line, r);
            if (p == null || !Number.isFinite(p)) continue;
            out.push({ line, prob: p, over: pick.actual(row) > line });
        }
    }
    return out;
};

console.log(`${data.length} matches in the dump\n`);

for (const stat of STATS) {
    const { rows, dispersion } = collect(stat);
    if (rows.length < 200) { console.log(`${stat}: only ${rows.length} rows, skipping\n`); continue; }

    console.log(`=== ${stat}  (${rows.length} predictions, total dispersion r=${dispersion})`);

    // ---- 1. SKILL: does the split beat a constant home share? ----------------
    const maeModel = mean(rows.map(r => Math.abs(r.predHome - r.actHome) + Math.abs(r.predAway - r.actAway))) / 2;
    const maeNull = mean(rows.map(r => Math.abs(r.nullHome - r.actHome) + Math.abs(r.nullAway - r.actAway))) / 2;
    // Correlation between the share we predict and the share that happened, over
    // matches where the total was non-zero. This is the cleanest statement of
    // "does it know which side", independent of how good the total is.
    const shares = rows
        .map(r => ({ p: r.predHome / (r.predHome + r.predAway),
                     a: (r.actHome + r.actAway) > 0 ? r.actHome / (r.actHome + r.actAway) : null }))
        .filter(s => s.a != null);
    const mp = mean(shares.map(s => s.p)), ma = mean(shares.map(s => s.a));
    const cov = mean(shares.map(s => (s.p - mp) * (s.a - ma)));
    const sdp = Math.sqrt(mean(shares.map(s => (s.p - mp) ** 2)));
    const sda = Math.sqrt(mean(shares.map(s => (s.a - ma) ** 2)));
    const corr = sdp > 0 && sda > 0 ? cov / (sdp * sda) : 0;

    console.log(`  1. skill    MAE per side  model ${maeModel.toFixed(3)}   constant-share null ${maeNull.toFixed(3)}` +
                `   delta ${(maeNull - maeModel >= 0 ? '-' : '+')}${Math.abs(maeNull - maeModel).toFixed(3)}`);
    console.log(`              predicted vs actual home share: corr ${corr.toFixed(3)}` +
                `   (predicted sd ${sdp.toFixed(3)}, actual sd ${sda.toFixed(3)})`);

    // ---- 2. BIAS -------------------------------------------------------------
    const biasH = mean(rows.map(r => r.predHome - r.actHome));
    const biasA = mean(rows.map(r => r.predAway - r.actAway));
    console.log(`  2. bias     home ${biasH >= 0 ? '+' : ''}${biasH.toFixed(3)}   away ${biasA >= 0 ? '+' : ''}${biasA.toFixed(3)}` +
                `   (mean actual home ${mean(rows.map(r => r.actHome)).toFixed(2)}, away ${mean(rows.map(r => r.actAway)).toFixed(2)})`);

    // ---- 3. CALIBRATION on a chronological holdout ---------------------------
    const half = Math.floor(rows.length / 2);
    const train = rows.slice(0, half), test = rows.slice(half);
    const samples = [];
    for (const r of train) {
        samples.push({ mu: r.predHome, actual: r.actHome });
        samples.push({ mu: r.predAway, actual: r.actAway });
    }
    const rSide = fitDispersion(samples);
    const lines = SIDE_LINES[stat] ?? STAT_CONFIG[stat]?.total?.options ?? [];

    const both = (r) => [
        ...probsFor(test, lines, r, { mu: x => x.predHome, actual: x => x.actHome }),
        ...probsFor(test, lines, r, { mu: x => x.predAway, actual: x => x.actAway }),
    ];
    const sideFit = score(both(rSide));
    const totalFit = score(both(dispersion));

    console.log(`  3. calib    per-side r=${rSide} (fitted on first half, scored on second)`);
    if (sideFit) {
        console.log(`              log loss ${sideFit.ll.toFixed(4)}   per-line base ${sideFit.baseLL.toFixed(4)}` +
                    `   ${sideFit.ll < sideFit.baseLL ? 'BEATS' : 'LOSES TO'} base by ${Math.abs(sideFit.ll - sideFit.baseLL).toFixed(4)}` +
                    `   ECE ${pct(sideFit.ece, 2)}   n=${sideFit.n}`);
        console.log(`              reusing the TOTAL's r=${dispersion}: log loss ${totalFit.ll.toFixed(4)}   ECE ${pct(totalFit.ece, 2)}`);
    }
    console.log();
}

console.log(`Read it in this order: if MAE does not beat the constant-share null and the
share correlation is near zero, the model does not know which side - and no side
market is priceable no matter how well the total calibrates.`);

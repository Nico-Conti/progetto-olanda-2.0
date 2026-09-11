/**
 * Can the model price 1x2 and BTTS, and can it beat a closing line doing it?
 *
 *   DATA_FILE=./data_fd.json node matchOddsComparison.mjs
 *
 * This is the only statistically POWERED test this project can run. Our own
 * capture holds 353 fixtures with corner prices over three weeks, and section 21
 * showed corrections flipping sign between halves on 328 - too thin to tell an
 * edge from noise. football-data gives 57,784 matches with Pinnacle and Betfair
 * CLOSING 1x2 prices, which is the one sample where a small edge would be
 * visible at all.
 *
 * The model already produces `expHome` and `expAway`; a scoreline market needs
 * only a joint distribution over the two. Two are tried:
 *
 *   independent   P(h,a) = P(H=h) P(A=a), the honest baseline
 *   Dixon-Coles   the same, with the four low-score cells corrected by rho.
 *                 Independent Poisson is known to misprice draws, and rho is
 *                 fitted on the chronological first half rather than assumed.
 *
 * Read the ROI table the way priceComparison.mjs says to: flat-betting EVERY
 * side must lose roughly the overround. If it does not, the join is wrong and
 * nothing below it means anything.
 *
 * Caveat carried from the data: football-data has no `box_touches`, so goals are
 * predicted from goals here, not through PREDICTOR_MODEL. That is a different -
 * and by section 17 a weaker - model than the one that ships.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES,
} from '../predictTotal.js';
import { fitDispersion, countPmf } from '../countModel.js';

const DATA = new URL(process.env.DATA_FILE ?? './data_fd.json', import.meta.url);
const ODDS = new URL(process.env.ODDS_FILE ?? './odds_fd.json', import.meta.url);
for (const f of [DATA, ODDS]) {
    if (!fs.existsSync(f)) { console.error(`${f.pathname} not found.`); process.exit(1); }
}
// The walk is superlinear: every prediction decays over both teams' whole
// history, so 8x the matches costs far more than 8x the time. The full
// 2014->2026 dump ran over an hour without reaching the join. A recent window is
// plenty - even four seasons is ~70x the 353 fixtures our own capture has
// priced, which is the sample this script exists to improve on.
const FROM_SEASON = process.env.FROM_SEASON ?? '2022/2023';
const seasonKey = (s) => String(s ?? '').slice(0, 4);
const all = JSON.parse(fs.readFileSync(DATA));
const data = all.filter(m => seasonKey(m.season) >= seasonKey(FROM_SEASON));
const odds = JSON.parse(fs.readFileSync(ODDS))
    .filter(r => seasonKey(r.season) >= seasonKey(FROM_SEASON));
console.log(`seasons from ${FROM_SEASON}: ${data.length} of ${all.length} matches`);

const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const key = (m) => `${m.league}|${m.season}|${m.squadre?.home ?? m.home}|${m.squadre?.away ?? m.away}`;

// Best price per (fixture, selection). Betfair first - an exchange price carries
// no bookmaker margin - then Pinnacle, then the market average.
const BOOK_RANK = { betfair_exchange: 0, pinnacle: 1, average: 2, bet365: 3 };
const priceBook = new Map();
for (const r of odds) {
    if (r.market !== '1x2') continue;
    const k = `${r.league}|${r.season}|${r.home}|${r.away}`;
    const cur = priceBook.get(k) ?? {};
    const prev = cur[r.selection];
    if (!prev || (BOOK_RANK[r.bookmaker] ?? 9) < (BOOK_RANK[prev.bookmaker] ?? 9)) {
        cur[r.selection] = { price: r.price, bookmaker: r.bookmaker };
    }
    priceBook.set(k, cur);
}

const MAX_GOALS = 10;

/** Marginal P(k goals) for a side, under mean mu and dispersion r. */
const sideVector = (mu, r) => {
    const v = [];
    let sum = 0;
    for (let k = 0; k <= MAX_GOALS; k++) { const p = countPmf(mu, k, r); v.push(p); sum += p; }
    return v.map(p => p / (sum || 1));
};

/**
 * Dixon-Coles low-score correction. rho = 0 is plain independence.
 * Only the four cells where both sides are under 2 goals are touched.
 */
const dcTau = (h, a, muH, muA, rho) => {
    if (rho === 0) return 1;
    if (h === 0 && a === 0) return 1 - muH * muA * rho;
    if (h === 0 && a === 1) return 1 + muH * rho;
    if (h === 1 && a === 0) return 1 + muA * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
};

/**
 * P(home), P(draw), P(away), P(btts) from two PRE-COMPUTED side vectors.
 *
 * The vectors are the expensive part and do not depend on rho, so they are built
 * once per match and reused across the whole rho grid. Rebuilding them inside
 * the sweep made this ten times slower - it was killed at 50 minutes unfinished.
 */
function outcomes(H, A, muH, muA, rho) {
    let home = 0, draw = 0, away = 0, btts = 0, total = 0;
    for (let h = 0; h <= MAX_GOALS; h++) {
        for (let a = 0; a <= MAX_GOALS; a++) {
            const p = H[h] * A[a] * dcTau(h, a, muH, muA, rho);
            if (!(p > 0)) continue;
            total += p;
            if (h > a) home += p; else if (h === a) draw += p; else away += p;
            if (h > 0 && a > 0) btts += p;
        }
    }
    return { home: home / total, draw: draw / total, away: away / total, btts: btts / total };
}

// ---- walk the shipped path once, keeping the two means -----------------------
const model = createPredictionModel('goals', { trackResiduals: true });
// football-data carries no `box_touches`, so the shipped `goals <- box_touches`
// model has no predictor here and produces nothing at all. Fall back to goals as
// its own predictor, the same way decayComparison.mjs does on this dump. This is
// the caveat in the header made concrete: a weaker model than ships.
const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();
if (!AVAILABLE.has(model.predictor)) {
    console.log(`(no '${model.predictor}' in this dump - predicting goals from goals)`);
    model.predictor = 'goals';
    model.weight = 1;
}
const matches = data
    .filter(m => m.stats?.goals && m.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

const rows = [];
for (const m of matches) {
    const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
        asOf: m.date, engine: ENGINES.COUNT,
    });
    const g = m.stats.goals;
    const gh = Number(g.home), ga = Number(g.away);
    if (p && Number.isFinite(p.expHome) && Number.isFinite(p.expAway)
        && p.expHome > 0 && p.expAway > 0 && Number.isFinite(gh) && Number.isFinite(ga)) {
        rows.push({
            k: key(m), muH: p.expHome, muA: p.expAway,
            gh, ga,
            result: gh > ga ? 'home' : gh === ga ? 'draw' : 'away',
            btts: gh > 0 && ga > 0,
        });
    }
    addMatchToPredictionModel(model, m);
}

console.log(`${data.length} matches in the dump, ${rows.length} predicted`);
const priced = rows.filter(r => {
    const p = priceBook.get(r.k);
    return p && p.home && p.draw && p.away;
});
console.log(`${priced.length} of them have a closing 1x2 price\n`);

const half = Math.floor(priced.length / 2);
const train = priced.slice(0, half), test = priced.slice(half);

// Per-side dispersion, fitted on the first half (sideSplit.mjs measured goals at
// essentially Poisson, but fit it here rather than assume it).
const rSide = fitDispersion(train.flatMap(r => [
    { mu: r.muH, actual: r.gh }, { mu: r.muA, actual: r.ga },
]));

// Cache each match's two side vectors once - see outcomes().
for (const r of priced) { r.H = sideVector(r.muH, rSide); r.A = sideVector(r.muA, rSide); }

// rho on the same first half, by log likelihood over the three outcomes.
let bestRho = 0, bestLL = -Infinity;
for (const rho of [-0.20, -0.15, -0.12, -0.10, -0.08, -0.05, -0.02, 0, 0.02, 0.05]) {
    let ll = 0;
    for (const r of train) ll += Math.log(clamp(outcomes(r.H, r.A, r.muH, r.muA, rho)[r.result]));
    if (ll > bestLL) { bestLL = ll; bestRho = rho; }
}
console.log(`per-side dispersion r=${rSide}, Dixon-Coles rho=${bestRho} (both fitted on the first half)\n`);

/** Market implied probabilities, overround removed proportionally. */
const implied = (p) => {
    const raw = { home: 1 / p.home.price, draw: 1 / p.draw.price, away: 1 / p.away.price };
    const s = raw.home + raw.draw + raw.away;
    return { home: raw.home / s, draw: raw.draw / s, away: raw.away / s, overround: s - 1 };
};

function report(label, rho) {
    let llModel = 0, llMarket = 0, llBase = 0;
    const base = { home: 0, draw: 0, away: 0 };
    for (const r of test) base[r.result]++;
    const baseP = { home: base.home / test.length, draw: base.draw / test.length, away: base.away / test.length };

    const bins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hit: 0 }));
    const bets = [];
    for (const r of test) {
        const p = priceBook.get(r.k);
        const mkt = implied(p);
        const ours = outcomes(r.H, r.A, r.muH, r.muA, rho);
        llModel += -Math.log(clamp(ours[r.result]));
        llMarket += -Math.log(clamp(mkt[r.result]));
        llBase += -Math.log(clamp(baseP[r.result]));
        for (const sel of ['home', 'draw', 'away']) {
            const b = bins[Math.min(9, Math.floor(ours[sel] * 10))];
            b.n++; b.sumP += ours[sel]; if (r.result === sel) b.hit++;
            bets.push({ sel, prob: ours[sel], price: p[sel].price,
                        ev: ours[sel] * p[sel].price - 1, won: r.result === sel });
        }
    }
    let ece = 0;
    const nb = bins.reduce((a, b) => a + b.n, 0);
    for (const b of bins) if (b.n) ece += (b.n / nb) * Math.abs(b.sumP / b.n - b.hit / b.n);

    console.log(`--- ${label}`);
    console.log(`    log loss   model ${(llModel / test.length).toFixed(4)}` +
                `   market ${(llMarket / test.length).toFixed(4)}` +
                `   base rate ${(llBase / test.length).toFixed(4)}` +
                `   ECE ${pct(ece, 2)}`);
    const verdict = llModel < llMarket ? 'MODEL beats the closing line'
                  : llModel < llBase ? 'model beats the base rate, LOSES to the market'
                  : 'model loses to the base rate';
    console.log(`    verdict    ${verdict}`);

    console.log(`    ${'threshold'.padEnd(12)}${'bets'.padStart(8)}${'ROI'.padStart(9)}${'hit'.padStart(8)}`);
    for (const t of [-Infinity, 0, 0.02, 0.05, 0.10]) {
        const sel = bets.filter(b => b.ev >= t);
        if (!sel.length) continue;
        const ret = sel.reduce((a, b) => a + (b.won ? b.price - 1 : -1), 0);
        const hit = sel.filter(b => b.won).length / sel.length;
        const name = t === -Infinity ? '(all)' : `EV >= ${pct(t, 0)}`;
        console.log(`    ${name.padEnd(12)}${String(sel.length).padStart(8)}${pct(ret / sel.length, 1).padStart(9)}${pct(hit, 1).padStart(8)}`);
    }
    console.log();
}

const meanOverround = test.reduce((a, r) => a + implied(priceBook.get(r.k)).overround, 0) / test.length;
console.log(`test set ${test.length} matches, mean overround ${pct(meanOverround, 2)}`);
console.log(`(the "(all)" row must lose roughly this much, or the join is wrong)\n`);

report('independent', 0);
report(`Dixon-Coles rho=${bestRho}`, bestRho);

// ---- BTTS: no prices in this dataset, so calibration only --------------------
let llB = 0, hit = 0;
const bbins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hit: 0 }));
for (const r of test) {
    const p = outcomes(r.H, r.A, r.muH, r.muA, bestRho).btts;
    llB += r.btts ? -Math.log(clamp(p)) : -Math.log(clamp(1 - p));
    if (r.btts) hit++;
    const b = bbins[Math.min(9, Math.floor(p * 10))];
    b.n++; b.sumP += p; if (r.btts) b.hit++;
}
const rate = hit / test.length;
const baseLL = -(rate * Math.log(clamp(rate)) + (1 - rate) * Math.log(clamp(1 - rate)));
let bece = 0;
for (const b of bbins) if (b.n) bece += (b.n / test.length) * Math.abs(b.sumP / b.n - b.hit / b.n);
console.log(`--- BTTS (no price in this dataset - calibration only)`);
console.log(`    log loss ${(llB / test.length).toFixed(4)}   base rate ${baseLL.toFixed(4)}` +
            `   observed ${pct(rate)}   ECE ${pct(bece, 2)}`);

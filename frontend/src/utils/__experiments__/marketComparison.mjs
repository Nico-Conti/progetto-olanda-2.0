/**
 * Does the model beat the market?
 *
 * Every accuracy figure this project has produced was measured against a
 * hardcoded line - corners at 9.5, goals at 2.5 - which no bookmaker
 * necessarily offered. This scores the model against real CLOSING prices
 * instead, so "56% accurate" becomes a statement about money or stops being
 * made at all.
 *
 * Prices come from football-data.co.uk, mostly Betfair Exchange closing, which
 * carries no bookmaker margin: the price *is* the market's own probability.
 * Only goals are priced there. Corners and cards - the markets this project
 * actually targets - are not sold by anyone and have to be captured going
 * forward. This exists to get the machinery right before they arrive.
 *
 *   node marketComparison.mjs
 *
 * Needs data.json (dumpSeason.py all) and odds.json
 * (python -m backend.odds.footballdata --season 2025/2026 --json .../odds.json).
 */
import fs from 'fs';
import {
    createPredictionModel,
    addMatchToPredictionModel,
    predictFromModel,
} from '../predictTotal.js';

const here = (f) => new URL(f, import.meta.url);
for (const f of ['./data.json', './odds.json']) {
    if (!fs.existsSync(here(f))) {
        console.error(`${f} not found - see the header of this file.`);
        process.exit(1);
    }
}
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const odds = JSON.parse(fs.readFileSync(here('./odds.json')));

const STAT = 'goals', LINE = 2.5, MARKET = 'total_goals';

// --- pricing -----------------------------------------------------------------

/** Decimal odds -> implied probability, margin included. */
const implied = (price) => 1 / price;

/**
 * Strip the overround from a two-way market.
 *
 * Proportional scaling (p / sum) is the standard first cut. On an exchange the
 * sum is already ~1.00 so this is close to a no-op, which is exactly why
 * exchange prices are the cleaner benchmark.
 */
const devig = (over, under) => {
    const [a, b] = [implied(over), implied(under)];
    return { over: a / (a + b), under: b / (a + b), overround: a + b - 1 };
};

/** Expected value per unit staked at decimal odds `price`, given true prob `p`. */
const ev = (p, price) => p * (price - 1) - (1 - p);

// --- index the prices --------------------------------------------------------

const key = (league, home, away) => `${league}|${home}|${away}`;
const priced = {};
for (const o of odds) {
    if (o.market !== MARKET || Number(o.line) !== LINE) continue;
    const k = key(o.league, o.home, o.away);
    (priced[k] ??= {})[o.selection] = Number(o.price);
    priced[k].bookmaker = o.bookmaker;
}

// --- walk the season, predicting and pricing ---------------------------------

const groups = {};
for (const m of data) {
    if (!m.stats?.[STAT]) continue;
    (groups[`${m.league}|${m.season}`] ??= []).push(m);
}

const rows = [];
for (const [, matches] of Object.entries(groups)) {
    matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    const model = createPredictionModel(STAT);
    for (const m of matches) {
        const home = m.squadre.home, away = m.squadre.away;
        const market = priced[key(m.league, home, away)];
        if (market?.over && market?.under && model.stats[home] && model.stats[away]
            && model.pastTargets.length > 3) {
            const p = predictFromModel(model, home, away, { nGames: 5 });
            if (p && p.total > 0) {
                rows.push({
                    pred: p.total,
                    actual: Number(m.stats[STAT].home) + Number(m.stats[STAT].away),
                    over: market.over, under: market.under, book: market.bookmaker,
                });
            }
        }
        addMatchToPredictionModel(model, m);
    }
}

console.log(`${rows.length} matches with both a prediction and a closing price\n`);

// --- 1. what the market itself is worth --------------------------------------

const overround = rows.reduce((s, r) => s + devig(r.over, r.under).overround, 0) / rows.length;
const books = [...new Set(rows.map(r => r.book))].join(', ');
console.log(`Prices from: ${books}   mean overround ${(100 * overround).toFixed(2)}%`);

let mktLogLoss = 0, mktBrier = 0, mktRight = 0;
for (const r of rows) {
    const { over } = devig(r.over, r.under);
    const isOver = r.actual > LINE ? 1 : 0;
    mktLogLoss -= isOver ? Math.log(over) : Math.log(1 - over);
    mktBrier += (over - isOver) ** 2;
    if ((over > 0.5) === (isOver === 1)) mktRight++;
}
console.log(`Market      log loss ${(mktLogLoss / rows.length).toFixed(4)}   ` +
            `Brier ${(mktBrier / rows.length).toFixed(4)}   ` +
            `accuracy ${(100 * mktRight / rows.length).toFixed(1)}%`);

// --- 2. the model, calibrated into a probability -----------------------------
//
// The model emits a total, not a probability, so it cannot be scored by log loss
// as-is. A one-parameter logistic on (prediction - line) turns it into one. The
// slope is fitted on the FIRST HALF of the sample and scored on the second, so
// the fit never sees what it is judged on.

const half = Math.floor(rows.length / 2);
const fitRows = rows.slice(0, half), testRows = rows.slice(half);

let bestB = 0, bestLoss = Infinity;
for (let b = 0.05; b <= 3; b += 0.05) {
    let loss = 0;
    for (const r of fitRows) {
        const p = 1 / (1 + Math.exp(-b * (r.pred - LINE)));
        const isOver = r.actual > LINE ? 1 : 0;
        loss -= isOver ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9));
    }
    if (loss < bestLoss) { bestLoss = loss; bestB = b; }
}
const modelProb = (pred) => 1 / (1 + Math.exp(-bestB * (pred - LINE)));

const score = (rs, probOf, label) => {
    let ll = 0, brier = 0, right = 0;
    for (const r of rs) {
        const p = probOf(r);
        const isOver = r.actual > LINE ? 1 : 0;
        ll -= isOver ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9));
        brier += (p - isOver) ** 2;
        if ((p > 0.5) === (isOver === 1)) right++;
    }
    console.log(`${label.padEnd(12)}log loss ${(ll / rs.length).toFixed(4)}   ` +
                `Brier ${(brier / rs.length).toFixed(4)}   ` +
                `accuracy ${(100 * right / rs.length).toFixed(1)}%`);
    return ll / rs.length;
};

console.log(`\nHeld-out second half (${testRows.length} matches), logistic slope b=${bestB.toFixed(2)}:`);
const mLoss = score(testRows, (r) => modelProb(r.pred), 'Model');
const kLoss = score(testRows, (r) => devig(r.over, r.under).over, 'Market');
const baseRate = fitRows.filter(r => r.actual > LINE).length / fitRows.length;
score(testRows, () => baseRate, 'Base rate');
console.log(`\nModel minus market log loss: ${(mLoss - kLoss >= 0 ? '+' : '')}${(mLoss - kLoss).toFixed(4)}` +
            `  (positive = worse than the market)`);

// --- 3. would betting it have made money? ------------------------------------

console.log('\nFlat-stake return, betting only where the model sees value:');
console.log(`  ${'EV >'.padEnd(8)}${'bets'.padStart(7)}${'won'.padStart(7)}${'ROI'.padStart(9)}`);
for (const threshold of [0, 0.02, 0.05, 0.10]) {
    let bets = 0, won = 0, profit = 0;
    for (const r of testRows) {
        const p = modelProb(r.pred);
        for (const [sel, prob, price] of [['over', p, r.over], ['under', 1 - p, r.under]]) {
            if (ev(prob, price) > threshold) {
                bets++;
                const hit = (sel === 'over') === (r.actual > LINE);
                if (hit) { won++; profit += price - 1; } else { profit -= 1; }
            }
        }
    }
    console.log(`  ${String(threshold).padEnd(8)}${String(bets).padStart(7)}${String(won).padStart(7)}` +
                `${(bets ? (100 * profit / bets).toFixed(1) + '%' : '-').padStart(9)}`);
}

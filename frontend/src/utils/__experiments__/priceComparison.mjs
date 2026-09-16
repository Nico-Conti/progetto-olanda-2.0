/**
 * Does the model beat a real posted price?
 *
 * Section 6 asked this once, against football-data closing odds, for GOALS at
 * 2.5 only - the one market football-data prices - and the model lost: ROI
 * negative at every EV threshold and getting WORSE as the threshold rose, which
 * is the signature of miscalibration rather than a diluted edge.
 *
 * Two things have changed since. Corners are now captured (`odds_snapshots`,
 * every three hours), so the market this project actually targets can be scored
 * at last. And section 18 shrank the corners probability path, taking its ECE
 * from 1.66% to 0.52% - the defect that produced section 6's shape.
 *
 * This re-asks the question against the SHIPPED model: pooled history, count
 * engine, walk-forward, `PROB_SHRINK` as deployed.
 *
 *   node priceComparison.mjs                 # every priced market
 *   node priceComparison.mjs corners
 *
 * Needs data.json (dumpSeason.py all) and odds_closing.json.
 *
 * The test that matters is not "is ROI positive" on a few hundred bets - it is
 * whether ROI RISES with the EV threshold. A real edge concentrates in the bets
 * the model is most sure about; a miscalibrated model does the opposite, and
 * that is what section 6 saw.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES,
} from '../predictTotal.js';
import { MARKET_FOR_STAT, UNJOINED_STATS, resolveStatKey } from '../statistics.js';
import { expectedValue, devig } from '../countModel.js';

const here = (f) => new URL(f, import.meta.url);
for (const f of ['./data.json', './odds_closing.json']) {
    if (!fs.existsSync(here(f))) { console.error(`${f} not found - see the header.`); process.exit(1); }
}
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const quotes = JSON.parse(fs.readFileSync(here('./odds_closing.json')));

const only = process.argv[2];
// The unjoined markets (shots, shots on target) are scoreable here even though
// nothing prices them in the app. That is the point: "should this market be
// reopened?" is a question only this script can answer, and leaving them out
// meant the evidence that closed them could never be re-examined. Naming one on
// the command line is required - they are absent from the no-argument run, so a
// sweep still reports only what actually ships.
const STAT_FOR_MARKET = Object.fromEntries([
    ...Object.entries(MARKET_FOR_STAT).map(([s, m]) => [m, s]),
    ...[...UNJOINED_STATS].map((s) => [`total_${s}`, s]),
]);

const totalOf = (m, s) => {
    // card_points is emitted by dumpSeason.py since 2026-09-12, and it is EXACT -
    // `yellows + 2*reds - second_bookings`, on the rows where that column is
    // known. The fallback below is what this used to do unconditionally, and it
    // overstates a second-yellow dismissal by one point (~1.4% upward, always).
    // Scoring against a real settled price is the one place that bias cannot be
    // waved through: it shifts every outcome the same direction as the market's
    // over side, which is how a systematic error reads as an edge.
    const x = m.stats?.[s];
    return x && x.home != null && x.away != null ? Number(x.home) + Number(x.away) : null;
};
const dayKey = (league, home, away, date) => `${league}|${home}|${away}|${String(date).slice(0, 10)}`;

// Outcomes, keyed the way a quote identifies its fixture.
const outcome = new Map();
for (const m of data) {
    if (!m.date) continue;
    outcome.set(dayKey(m.league, m.squadre?.home, m.squadre?.away, m.date), m);
}

const THRESHOLDS = [0, 0.02, 0.05, 0.10, 0.15, 0.20];
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

for (const market of [...new Set(quotes.map(q => q.market))].sort()) {
    const stat = STAT_FOR_MARKET[market];
    if (!stat || (only && stat !== only)) continue;
    if (!only && UNJOINED_STATS.has(stat)) continue;

    // Group quotes into fixture -> line -> {over, under}
    const byFixture = new Map();
    let unmatched = 0;
    for (const q of quotes) {
        if (q.market !== market) continue;
        const k = dayKey(q.league, q.home, q.away, q.date);
        const m = outcome.get(k);
        if (!m || totalOf(m, resolveStatKey(stat)) === null) { unmatched++; continue; }
        if (!byFixture.has(k)) byFixture.set(k, { match: m, date: m.date, lines: new Map() });
        const lines = byFixture.get(k).lines;
        if (!lines.has(q.line)) lines.set(q.line, {});
        lines.get(q.line)[q.selection] = q.price;
    }
    if (!byFixture.size) { console.log(`\n== ${market} ==  no joinable fixtures\n`); continue; }

    // Walk forward: fold history in date order, price a fixture using only what
    // came before it. Same discipline as calibration.mjs.
    const model = createPredictionModel(stat, { trackResiduals: true });
    const ordered = [...data].filter(m => m.date && totalOf(m, resolveStatKey(stat)) !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const targets = [...byFixture.values()].sort((a, b) => new Date(a.date) - new Date(b.date));

    const bets = [], paired = [];
    let ti = 0;
    for (const m of ordered) {
        while (ti < targets.length && new Date(targets[ti].date) <= new Date(m.date)) {
            const t = targets[ti++];
            const p = predictFromModel(model, t.match.squadre.home, t.match.squadre.away,
                { asOf: t.date, engine: ENGINES.COUNT });
            if (!p || !p.probOver) continue;
            const actual = totalOf(t.match, resolveStatKey(stat));
            for (const [line, side] of t.lines) {
                const pOver = p.probOver(line);
                if (pOver == null || !Number.isFinite(pOver)) continue;
                const dv = (side.over > 1 && side.under > 1) ? devig(side.over, side.under) : null;
                const market_p = dv ? dv.over : null;
                if (market_p != null) paired.push({ line, model: pOver, market: market_p, over: actual > line });
                for (const [sel, price] of Object.entries(side)) {
                    if (!(price > 1)) continue;
                    const prob = sel === 'over' ? pOver : 1 - pOver;
                    const ev = expectedValue(prob, price);
                    if (ev == null) continue;
                    const won = sel === 'over' ? actual > line : actual < line;
                    bets.push({ ev, prob, price, won, confident: !!p.confident,
                                edge: market_p == null ? null
                                    : prob - (sel === 'over' ? market_p : 1 - market_p) });
                }
            }
        }
        addMatchToPredictionModel(model, m);
    }

    // Forecast quality against the market's own opinion. This is the diagnostic
    // that explains an ROI table: a model can be calibrated overall while being
    // biased inside each side of its disagreement with the price, and EV only
    // ever buys one side of that disagreement.
    const cl = x => Math.min(1 - 1e-9, Math.max(1e-9, x));
    const ll = (rs, f) => rs.reduce((a, r) => a - Math.log(cl(r.over ? f(r) : 1 - f(r))), 0) / rs.length;
    const eceOf = (rs, f) => { const B = 10, b = Array.from({ length: B }, () => ({ n: 0, p: 0, o: 0 }));
        for (const r of rs) { const x = b[Math.max(0, Math.min(B - 1, Math.floor(f(r) * B)))];
            x.n++; x.p += f(r); if (r.over) x.o++; }
        return b.reduce((a, x) => x.n ? a + (x.n / rs.length) * Math.abs(x.p / x.n - x.o / x.n) : a, 0); };
    if (paired.length > 50) {
        // Leave-one-out: a per-line base rate must never be told the outcome it
        // is scoring. In-sample it was worth 0.146 of log loss on fouls (75
        // quotes over 10 lines, thinnest bucket ONE row, which then predicts
        // itself perfectly) and 0.079 on cards - enough to report that the model
        // loses to its own baseline when it beats it by 0.066. Corners, with
        // 1,650 rows, moved 0.005. The bug is invisible exactly where the
        // samples are large and decisive where they are thin.
        const pl = {}; for (const r of paired) { const c = (pl[r.line] ??= { n: 0, o: 0 }); c.n++; if (r.over) c.o++; }
        const baseLL = paired.reduce((a, r) => { const c = pl[r.line];
            const b = c.n > 1 ? cl((c.o - (r.over ? 1 : 0)) / (c.n - 1)) : 0.5;
            return a - Math.log(r.over ? b : 1 - b); }, 0) / paired.length;
        console.log(`\n== ${market} ==  forecast quality on ${paired.length} two-sided lines`);
        console.log(`   model  log loss ${ll(paired, r => r.model).toFixed(4)}  ECE ${(100*eceOf(paired, r => r.model)).toFixed(2)}%`);
        console.log(`   market log loss ${ll(paired, r => r.market).toFixed(4)}  ECE ${(100*eceOf(paired, r => r.market)).toFixed(2)}%`);
        console.log(`   per-line base   ${baseLL.toFixed(4)}`);
        for (const [label, sub] of [['we say HIGHER (EV buys over)', paired.filter(r => r.model > r.market)],
                                    ['we say LOWER  (EV buys under)', paired.filter(r => r.model < r.market)],
                                    ['all', paired]]) {
            if (!sub.length) continue;
            const claim = sub.reduce((a, r) => a + r.model, 0) / sub.length;
            const hap = sub.filter(r => r.over).length / sub.length;
            console.log(`      ${label.padEnd(30)} n=${String(sub.length).padStart(5)}` +
                        `  claim ${pct(claim)}  happened ${pct(hap)}` +
                        `  gap ${((hap - claim) * 100 >= 0 ? '+' : '')}${((hap - claim) * 100).toFixed(1)}pp`);
        }
    }

    console.log(`\n== ${market} ==  ${byFixture.size} fixtures, ${bets.length} priced sides` +
                `  (${unmatched} quotes with no settled match)`);
    console.log(`   ${'EV >='.padEnd(8)}${'bets'.padStart(7)}${'win rate'.padStart(11)}` +
                `${'ROI'.padStart(9)}${'profit'.padStart(10)}   confident-only ROI (n)`);
    for (const th of THRESHOLDS) {
        const sub = bets.filter(b => b.ev >= th);
        if (!sub.length) { console.log(`   ${String(th).padEnd(8)}${'0'.padStart(7)}`); continue; }
        const profit = sub.reduce((a, b) => a + (b.won ? b.price - 1 : -1), 0);
        const wins = sub.filter(b => b.won).length;
        const conf = sub.filter(b => b.confident);
        const cProfit = conf.reduce((a, b) => a + (b.won ? b.price - 1 : -1), 0);
        console.log(`   ${String(th).padEnd(8)}${String(sub.length).padStart(7)}` +
                    `${pct(wins / sub.length).padStart(11)}${pct(profit / sub.length).padStart(9)}` +
                    `${profit.toFixed(1).padStart(10)}   ` +
                    `${conf.length ? pct(cProfit / conf.length) : '-'} (${conf.length})`);
    }
    // Flat-betting every side is the null strategy: it must lose the overround.
    const all = bets.reduce((a, b) => a + (b.won ? b.price - 1 : -1), 0);
    console.log(`   ${'(all)'.padEnd(8)}${String(bets.length).padStart(7)}` +
                `${pct(bets.filter(b => b.won).length / bets.length).padStart(11)}` +
                `${pct(all / bets.length).padStart(9)}${all.toFixed(1).padStart(10)}`);
}

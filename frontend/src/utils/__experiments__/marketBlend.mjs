/**
 * Two corrections for the adverse selection section 20 measured, both fitted.
 *
 *   blend   p = w*p_model + (1-w)*p_market. Because EV = p*price - 1, this is
 *           linear in EV too: EV_blend = w*EV_model + (1-w)*EV_market, and
 *           EV_market is just minus the book's margin on that side. So `w` is
 *           literally "how much do we believe the model over the price".
 *   cap     refuse any bet where |p_model - p_market| exceeds a threshold.
 *           Section 20's bands say small disagreements carry signal (+4.3pp at
 *           2-5pp) and large ones are error (-20.9pp beyond 10pp).
 *
 * Both are fitted on the chronological FIRST half and scored on the second,
 * which is the only part that counts. `w` is fitted on log loss rather than on
 * ROI: ROI over a few hundred bets is far too noisy to optimise against, and
 * section 5's lesson is to fit the objective, not the outcome you hope for.
 *
 *   node marketBlend.mjs [corners|goals|...]
 *
 * Needs data.json and odds_closing.json.
 */
import fs from 'fs';
import { createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES }
    from '../predictTotal.js';
import { MARKET_FOR_STAT, resolveStatKey } from '../statistics.js';
import { devig } from '../countModel.js';

const here = f => new URL(f, import.meta.url);
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const allQuotes = JSON.parse(fs.readFileSync(here('./odds_closing.json')));
const only = process.argv[2];

const totalOf = (m, s) => {
    if (s === 'card_points') {
        const y = m.stats?.yellow_cards, r = m.stats?.red_cards;
        if (!y || !r || y.home == null || r.home == null) return null;
        return +y.home + +y.away + 2 * (+r.home + +r.away);
    }
    const x = m.stats?.[s];
    return x && x.home != null && x.away != null ? +x.home + +x.away : null;
};
const key = (l, h, a, d) => `${l}|${h}|${a}|${String(d).slice(0, 10)}`;
const cl = x => Math.min(1 - 1e-9, Math.max(1e-9, x));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

const outcome = new Map();
for (const m of data) if (m.date) outcome.set(key(m.league, m.squadre?.home, m.squadre?.away, m.date), m);

for (const [stat, market] of Object.entries(MARKET_FOR_STAT)) {
    if (only && stat !== only) continue;
    const statKey = resolveStatKey(stat);
    const byFx = new Map();
    for (const q of allQuotes) {
        if (q.market !== market) continue;
        const k = key(q.league, q.home, q.away, q.date);
        const m = outcome.get(k);
        if (!m || totalOf(m, statKey) === null) continue;
        if (!byFx.has(k)) byFx.set(k, { match: m, date: m.date, lines: new Map() });
        const L = byFx.get(k).lines;
        if (!L.has(q.line)) L.set(q.line, {});
        L.get(q.line)[q.selection] = q.price;
    }
    if (byFx.size < 40) { console.log(`\n== ${stat} ==  only ${byFx.size} fixtures, skipped\n`); continue; }

    const model = createPredictionModel(stat, { trackResiduals: true });
    const ordered = [...data].filter(m => m.date && totalOf(m, statKey) !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const targets = [...byFx.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
    const bets = [];
    let ti = 0;
    for (const m of ordered) {
        while (ti < targets.length && new Date(targets[ti].date) <= new Date(m.date)) {
            const t = targets[ti++];
            const p = predictFromModel(model, t.match.squadre.home, t.match.squadre.away,
                { asOf: t.date, engine: ENGINES.COUNT });
            if (!p?.probOver) continue;
            const actual = totalOf(t.match, statKey);
            for (const [line, side] of t.lines) {
                if (!(side.over > 1) || !(side.under > 1)) continue;
                const pOver = p.probOver(line);
                const dv = devig(side.over, side.under);
                if (pOver == null || !Number.isFinite(pOver) || !dv) continue;
                for (const sel of ['over', 'under']) {
                    const price = side[sel];
                    const pm = sel === 'over' ? pOver : 1 - pOver;
                    const mk = sel === 'over' ? dv.over : dv.under;
                    bets.push({ date: t.date, pm, mk, price,
                        gap: Math.abs(pOver - dv.over),
                        won: sel === 'over' ? actual > line : actual < line });
                }
            }
        }
        addMatchToPredictionModel(model, m);
    }
    if (!bets.length) continue;
    bets.sort((a, b) => new Date(a.date) - new Date(b.date));
    const half = Math.floor(bets.length / 2);
    const [fit, test] = [bets.slice(0, half), bets.slice(half)];
    const roi = rs => rs.length ? rs.reduce((a, b) => a + (b.won ? b.price - 1 : -1), 0) / rs.length : null;
    const ll = (rs, w) => rs.reduce((a, b) =>
        a - Math.log(cl(b.won ? w * b.pm + (1 - w) * b.mk : 1 - (w * b.pm + (1 - w) * b.mk))), 0) / rs.length;

    console.log(`\n== ${stat} ==  ${byFx.size} fixtures, ${bets.length} sides ` +
                `(fit ${fit.length} / test ${test.length}), all-in ROI ${pct(roi(bets))}`);

    console.log(`\n   blend weight w, fitted on log loss over the FIRST half`);
    console.log(`      ${'w'.padStart(5)}${'fit LL'.padStart(10)}${'test LL'.padStart(10)}` +
                `${'bets EV>0'.padStart(11)}${'test ROI'.padStart(10)}`);
    let bestW = null, bestLL = Infinity;
    for (let w = 0; w <= 1.0001; w += 0.1) {
        const f = ll(fit, w), t = ll(test, w);
        const sel = test.filter(b => w * (b.pm * b.price - 1) + (1 - w) * (b.mk * b.price - 1) > 0);
        if (f < bestLL) { bestLL = f; bestW = w; }
        console.log(`      ${w.toFixed(1).padStart(5)}${f.toFixed(4).padStart(10)}${t.toFixed(4).padStart(10)}` +
                    `${String(sel.length).padStart(11)}${(sel.length ? pct(roi(sel)) : '-').padStart(10)}`);
    }
    const selBest = test.filter(b => bestW * (b.pm * b.price - 1) + (1 - bestW) * (b.mk * b.price - 1) > 0);
    console.log(`   -> w=${bestW.toFixed(1)} wins the fit half; on the test half it selects ` +
                `${selBest.length} bets at ROI ${selBest.length ? pct(roi(selBest)) : 'n/a'}`);

    console.log(`\n   cap on |our p - market p|, model EV>0 only`);
    console.log(`      ${'cap'.padStart(6)}${'fit n'.padStart(8)}${'fit ROI'.padStart(10)}` +
                `${'test n'.padStart(8)}${'test ROI'.padStart(10)}`);
    for (const cap of [0.02, 0.03, 0.05, 0.08, 0.10, 1]) {
        const pick = rs => rs.filter(b => b.gap <= cap && b.pm * b.price - 1 > 0);
        const f = pick(fit), t = pick(test);
        console.log(`      ${(cap === 1 ? 'none' : cap.toFixed(2)).padStart(6)}${String(f.length).padStart(8)}` +
                    `${(f.length ? pct(roi(f)) : '-').padStart(10)}${String(t.length).padStart(8)}` +
                    `${(t.length ? pct(roi(t)) : '-').padStart(10)}`);
    }
}

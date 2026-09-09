/**
 * Does congestion explain any of what the model gets wrong?
 *
 * The first per-match covariate tried on this model, and the point is as much
 * methodological as it is about fatigue: if a free, well-understood feature
 * moves nothing, the residuals are dominated by irreducible variance and the
 * expensive features (referee, lineups) are not worth the scrape.
 *
 * Rest is computed from our own match dates, so it costs nothing - but we only
 * see the 16 leagues we scrape. A cup tie or a European match is invisible, so
 * recorded rest is always >= true rest, and the error lands hardest on the clubs
 * that play in Europe. Feeding raw days would let the fit learn "big club"
 * instead of "tired".
 *
 * The blind spot is one-directional, which is what makes this usable: a 3-day
 * gap is definitely a 3-day gap, while a 14-day gap might be a 3-day gap we
 * cannot see. So the feature only reads the SHORT end -
 * `shortRest = max(0, 5 - days)` - and is flat everywhere we cannot trust.
 *
 *   node restDays.mjs [corners|goals|...]
 *
 * Fitted on the chronological first half, scored on the second.
 */
import fs from 'fs';
import { createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES }
    from '../predictTotal.js';
import { STAT_CONFIG, resolveStatKey } from '../statistics.js';
import { probOver } from '../countModel.js';

const data = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url)));
const only = process.argv[2];
const STATS = (only ? [only] : ['corners', 'goals', 'fouls', 'shots', 'yellow_cards']);

const totalOf = (m, s) => {
    const x = m.stats?.[s];
    return x && x.home != null && x.away != null ? +x.home + +x.away : null;
};
const day = d => new Date(String(d).slice(0, 10)).getTime() / 86400000;

// Rest, keyed on team NAME alone - a relegated side changes league and its rest
// does not reset. Same-day duplicates cannot happen for one team.
const seen = new Map();
const dated = [...data].filter(m => m.date).sort((a, b) => new Date(a.date) - new Date(b.date));
const restOf = new Map();
for (const m of dated) {
    const d = day(m.date);
    const out = {};
    for (const side of ['home', 'away']) {
        const team = m.squadre?.[side];
        const prev = seen.get(team);
        out[side] = prev == null ? null : d - prev;
    }
    restOf.set(m, out);
    for (const side of ['home', 'away']) seen.set(m.squadre?.[side], d);
}
const shortOf = days => days == null ? 0 : Math.max(0, 5 - days);
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

for (const stat of STATS) {
    const key = resolveStatKey(stat);
    const line = STAT_CONFIG[stat]?.total?.default;
    const model = createPredictionModel(stat, { trackResiduals: true });
    const rows = [];
    for (const m of dated) {
        if (totalOf(m, key) === null) { continue; }
        const p = predictFromModel(model, m.squadre.home, m.squadre.away,
            { asOf: m.date, engine: ENGINES.COUNT });
        if (p && p.total > 0 && p.dispersionFitted) {
            const r = restOf.get(m);
            rows.push({ pred: p.total, actual: totalOf(m, key), disp: p.dispersion,
                        s: shortOf(r.home) + shortOf(r.away), date: m.date });
        }
        addMatchToPredictionModel(model, m);
    }
    if (rows.length < 500) { console.log(`\n== ${stat} ==  only ${rows.length} rows, skipped`); continue; }

    console.log(`\n== ${stat} ==  ${rows.length} matches, line ${line}`);
    console.log(`   combined short-rest  n      mean actual/predicted`);
    for (const s of [0, 1, 2, 3, 4]) {
        const sub = rows.filter(r => r.s === s);
        if (sub.length < 40) continue;
        const ratio = sub.reduce((a, r) => a + r.actual / r.pred, 0) / sub.length;
        console.log(`   ${String(s).padStart(10)}  ${String(sub.length).padStart(7)}` +
                    `           ${ratio.toFixed(4)}  ${ratio > 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(2)}%`);
    }

    // Fit ratio ~ 1 + b*s on the first half, apply on the second.
    const half = Math.floor(rows.length / 2);
    const [fit, test] = [rows.slice(0, half), rows.slice(half)];
    const xs = fit.map(r => r.s), ys = fit.map(r => r.actual / r.pred - 1);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const b = den ? num / den : 0;
    const a0 = my - b * mx;
    const adj = r => r.pred * (1 + a0 + b * r.s);

    const mae = (rs, f) => rs.reduce((acc, r) => acc + Math.abs(f(r) - r.actual), 0) / rs.length;
    const call = (rs, f) => rs.filter(r => (f(r) > line) === (r.actual > line)).length / rs.length;
    const cl = x => Math.min(1 - 1e-9, Math.max(1e-9, x));
    const ll = (rs, f) => rs.reduce((acc, r) => {
        const p = probOver(f(r), line, r.disp);
        return acc - Math.log(cl(r.actual > line ? p : 1 - p));
    }, 0) / rs.length;

    console.log(`   fitted on first half: adjustment = 1 ${a0 >= 0 ? '+' : '-'} ${Math.abs(a0).toFixed(4)}` +
                ` ${b >= 0 ? '+' : '-'} ${Math.abs(b).toFixed(4)}*shortRest` +
                `   (max effect ${pct(Math.abs(a0 + 4 * b), 2)})`);
    console.log(`   ${'test half'.padEnd(14)}${'MAE'.padStart(9)}${'call'.padStart(9)}${'log loss'.padStart(11)}`);
    console.log(`   ${'shipped'.padEnd(14)}${mae(test, r => r.pred).toFixed(4).padStart(9)}` +
                `${pct(call(test, r => r.pred)).padStart(9)}${ll(test, r => r.pred).toFixed(4).padStart(11)}`);
    console.log(`   ${'+ rest'.padEnd(14)}${mae(test, adj).toFixed(4).padStart(9)}` +
                `${pct(call(test, adj)).padStart(9)}${ll(test, adj).toFixed(4).padStart(11)}`);
    const d = ll(test, adj) - ll(test, r => r.pred);
    console.log(`   -> log loss ${d >= 0 ? '+' : ''}${d.toFixed(5)} ${d < -0.0005 ? 'BETTER' : d > 0.0005 ? 'WORSE' : '(no change)'}`);
}

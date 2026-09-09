/**
 * `useGeneralStats`: the one model knob that still does anything.
 *
 * `nGames` and `forceMean` parameterise the window estimator, which section 10
 * measured against recency decay and lost. Every statistic with a fitted
 * half-life takes the decay path, which receives neither - so for all four
 * priced markets they are inert. This one is not: it drops the home/away split,
 * roughly doubling each side's effective sample at the cost of the location
 * effect, and flipping it moved the EV of every priced fixture (mean |delta|
 * 3.6pp on corners, up to 22.1pp on shots on target).
 *
 * It ships at `false` because that was chosen, not measured. This measures it.
 *
 *   node generalStats.mjs [corners|goals|...]
 *
 * One model per statistic serves both settings: `useGeneralStats` is a
 * prediction option, not a build option, so the accumulated history is common.
 *
 * CAVEAT, and it cuts toward `false`: residuals are recorded by
 * addMatchToPredictionModel with default options, so the dispersion is always
 * fitted from SPLIT-location predictions. The log-loss column therefore pairs a
 * general-stats mean with a split-fitted spread - the same mismatched pair
 * PROB_SHRINK had to fix. MAE and call accuracy do not depend on dispersion and
 * are clean; read those first.
 */
import fs from 'fs';
import { createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES }
    from '../predictTotal.js';
import { STAT_CONFIG, resolveStatKey } from '../statistics.js';
import { probOver } from '../countModel.js';

const data = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url)));
const only = process.argv[2];
const STATS = only ? [only] : ['corners', 'goals', 'fouls', 'shots', 'yellow_cards'];
const totalOf = (m, s) => { const x = m.stats?.[s];
    return x && x.home != null && x.away != null ? +x.home + +x.away : null; };
const cl = x => Math.min(1 - 1e-9, Math.max(1e-9, x));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

for (const stat of STATS) {
    const key = resolveStatKey(stat);
    const line = STAT_CONFIG[stat]?.total?.default;
    const model = createPredictionModel(stat, { trackResiduals: true });
    const ordered = [...data].filter(m => m.date && totalOf(m, key) !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const rows = [];
    for (const m of ordered) {
        const opts = { asOf: m.date, engine: ENGINES.COUNT };
        const split = predictFromModel(model, m.squadre.home, m.squadre.away, { ...opts, useGeneralStats: false });
        const gen = predictFromModel(model, m.squadre.home, m.squadre.away, { ...opts, useGeneralStats: true });
        if (split?.total > 0 && gen?.total > 0 && split.dispersionFitted) {
            rows.push({ split: split.total, gen: gen.total, disp: split.dispersion,
                        actual: totalOf(m, key) });
        }
        addMatchToPredictionModel(model, m);
    }
    if (rows.length < 500) { console.log(`\n== ${stat} ==  ${rows.length} rows, skipped`); continue; }
    const half = Math.floor(rows.length / 2);
    const [fit, test] = [rows.slice(0, half), rows.slice(half)];
    const mae = (rs, f) => rs.reduce((a, r) => a + Math.abs(f(r) - r.actual), 0) / rs.length;
    const call = (rs, f) => rs.filter(r => (f(r) > line) === (r.actual > line)).length / rs.length;
    const ll = (rs, f) => rs.reduce((a, r) =>
        a - Math.log(cl(r.actual > line ? probOver(f(r), line, r.disp) : 1 - probOver(f(r), line, r.disp))), 0) / rs.length;
    const S = r => r.split, G = r => r.gen;

    const moved = rows.reduce((a, r) => a + Math.abs(r.gen - r.split), 0) / rows.length;
    console.log(`\n== ${stat} ==  ${rows.length} matches, line ${line}   mean |change to the total| ${moved.toFixed(3)}`);
    console.log(`   ${'half'.padEnd(7)}${'setting'.padEnd(10)}${'MAE'.padStart(9)}${'call'.padStart(9)}${'log loss'.padStart(11)}`);
    for (const [label, rs] of [['fit', fit], ['test', test]]) {
        console.log(`   ${label.padEnd(7)}${'split'.padEnd(10)}${mae(rs, S).toFixed(4).padStart(9)}` +
                    `${pct(call(rs, S)).padStart(9)}${ll(rs, S).toFixed(4).padStart(11)}   <- ships`);
        console.log(`   ${label.padEnd(7)}${'general'.padEnd(10)}${mae(rs, G).toFixed(4).padStart(9)}` +
                    `${pct(call(rs, G)).padStart(9)}${ll(rs, G).toFixed(4).padStart(11)}`);
    }
    const dM = mae(test, G) - mae(test, S), dC = call(test, G) - call(test, S);
    console.log(`   -> test half: MAE ${dM >= 0 ? '+' : ''}${dM.toFixed(4)}, call ` +
                `${dC >= 0 ? '+' : ''}${(100 * dC).toFixed(1)}pp  ` +
                `${dC > 0.005 && dM < 0 ? 'GENERAL WINS' : dC < -0.005 && dM > 0 ? 'SPLIT WINS' : 'mixed / no change'}`);
}

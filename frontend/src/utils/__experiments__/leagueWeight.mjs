/**
 * How much should a fixture's OWN league count, relative to the other fifteen?
 *
 * Section 11 measured the two endpoints - fully pooled beats fully per-league on
 * every statistic - and nothing between them. This sweeps the interpolation.
 *
 * Team histories are identical either way (a team only plays in its own league),
 * so pooling controls exactly three accumulated quantities, and because
 * `weightFor` is 1 everywhere and only goals has a predictor, they do not all
 * matter for every statistic:
 *
 *   goals              the box_touches -> goals SCALE (sumTarget / sumPredictor)
 *   corners, cards     the shrink target that PROB_SHRINK pulls toward
 *   fouls, shots       dispersion only - not swept here
 *
 * Both quantities enter linearly and their formulas are known, so this recomputes
 * them exactly rather than re-implementing the model:
 *
 *   scale(w)  = (own_T + w*(all_T - own_T)) / (own_P + w*(all_P - own_P))
 *   median(w) = weighted median, own-league values at 1, others at w
 *
 * w=1 reproduces what ships. The dispersion stays pooled throughout, so this
 * isolates the mean rather than the spread - a limitation, not an oversight.
 *
 *   node leagueWeight.mjs [goals|corners|...]
 *
 * Fitted on the chronological first half, scored on the second.
 */
import fs from 'fs';
import { createPredictionModel, addMatchToPredictionModel, predictFromModel, ENGINES, PROB_SHRINK }
    from '../predictTotal.js';
import { STAT_CONFIG, resolveStatKey, VOLATILE_STATS, PREDICTOR_MODEL } from '../statistics.js';
import { probOver } from '../countModel.js';

const data = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url)));
const only = process.argv[2];
const STATS = only ? [only] : ['goals', 'corners', 'yellow_cards'];
const WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);
const totalOf = (m, s) => { const x = m.stats?.[s];
    return x && x.home != null && x.away != null ? +x.home + +x.away : null; };
const cl = x => Math.min(1 - 1e-9, Math.max(1e-9, x));

/** Weighted median: own-league values at weight 1, everything else at w. */
const wMedian = (own, other, w) => {
    if (!own.length && !other.length) return 0;
    const all = [...own.map(v => [v, 1]), ...other.map(v => [v, w])].sort((a, b) => a[0] - b[0]);
    const half = all.reduce((a, [, wt]) => a + wt, 0) / 2;
    let acc = 0;
    for (const [v, wt] of all) { acc += wt; if (acc >= half) return v; }
    return all[all.length - 1][0];
};
const wMean = (own, other, w) => {
    const n = own.length + w * other.length;
    if (!n) return 0;
    return (own.reduce((a, b) => a + b, 0) + w * other.reduce((a, b) => a + b, 0)) / n;
};

for (const stat of STATS) {
    const key = resolveStatKey(stat);
    const predictor = PREDICTOR_MODEL[key]?.predictor ?? key;
    const scaled = predictor !== key;                 // goals only
    const shrunk = PROB_SHRINK[key] != null;          // corners, yellow_cards
    if (!scaled && !shrunk) { console.log(`\n== ${stat} ==  neither scale nor shrink applies, skipped`); continue; }
    const line = STAT_CONFIG[stat]?.total?.default;
    const useMedian = VOLATILE_STATS.includes(key);

    const model = createPredictionModel(stat, { trackResiduals: true });
    const ordered = [...data].filter(m => m.date && totalOf(m, key) !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Own-league accumulators alongside the model's pooled ones.
    const per = new Map();          // league -> { sumT, sumP, targets[] }
    const glob = { sumT: 0, sumP: 0, targets: [] };
    const rows = [];
    for (const m of ordered) {
        const p = predictFromModel(model, m.squadre.home, m.squadre.away,
            { asOf: m.date, engine: ENGINES.COUNT });
        const lg = m.league;
        const o = per.get(lg);
        if (p && p.total > 0 && p.dispersionFitted && o && o.targets.length > 20) {
            const otherT = glob.targets.length - o.targets.length;
            rows.push({
                total: p.total, actual: totalOf(m, key), disp: p.dispersion, date: m.date,
                ownT: o.sumT, ownP: o.sumP, allT: glob.sumT, allP: glob.sumP,
                own: o.targets.slice(), otherCount: otherT, league: lg,
            });
        }
        addMatchToPredictionModel(model, m);
        const t = totalOf(m, key), pr = totalOf(m, predictor);
        if (!per.has(lg)) per.set(lg, { sumT: 0, sumP: 0, targets: [] });
        const acc = per.get(lg);
        if (t !== null) { acc.targets.push(t); glob.targets.push(t);
            if (pr !== null) { acc.sumT += t; acc.sumP += pr; glob.sumT += t; glob.sumP += pr; } }
    }
    if (rows.length < 500) { console.log(`\n== ${stat} ==  only ${rows.length} rows, skipped`); continue; }

    const muFor = (r, w) => {
        if (scaled) {
            const sPooled = r.allP > 0 ? r.allT / r.allP : 1;
            const sW = (r.ownP + w * (r.allP - r.ownP)) > 0
                ? (r.ownT + w * (r.allT - r.ownT)) / (r.ownP + w * (r.allP - r.ownP)) : sPooled;
            return sPooled > 0 ? r.total * (sW / sPooled) : r.total;
        }
        return r.total;   // corners / cards: the total itself does not move
    };
    const probFor = (r, w) => {
        const mu = muFor(r, w);
        if (!shrunk) return probOver(mu, line, r.disp);
        const sw = PROB_SHRINK[key];
        // Weighted aggregate over own-league values (1) and the rest (w).
        const other = r.otherAll ?? null;
        const agg = useMedian ? wMedian(r.own, other ?? [], w) : wMean(r.own, other ?? [], w);
        return probOver(sw * mu + (1 - sw) * agg, line, r.disp);
    };

    // Other-league history per row = everything seen before it, minus that
    // league's own values. Done by subtraction so the weighted median is exact
    // rather than approximated.
    { const seenAll = [];
      const seenOwn = new Map();
      let ri = 0;
      for (const m of ordered) {
          while (ri < rows.length && rows[ri].date === m.date && rows[ri].league === m.league) {
              const own = seenOwn.get(m.league) ?? [];
              const counts = new Map();
              for (const v of own) counts.set(v, (counts.get(v) ?? 0) + 1);
              const other = [];
              for (const v of seenAll) {
                  const c = counts.get(v) ?? 0;
                  if (c > 0) counts.set(v, c - 1); else other.push(v);
              }
              rows[ri].otherAll = other;
              ri++;
          }
          const t = totalOf(m, key);
          if (t !== null) { seenAll.push(t);
              if (!seenOwn.has(m.league)) seenOwn.set(m.league, []);
              seenOwn.get(m.league).push(t); }
      } }

    const half = Math.floor(rows.length / 2);
    const [fit, test] = [rows.slice(0, half), rows.slice(half)];
    const ll = (rs, w) => rs.reduce((a, r) => {
        const p = probFor(r, w);
        return a - Math.log(cl(r.actual > line ? p : 1 - p));
    }, 0) / rs.length;
    const mae = (rs, w) => rs.reduce((a, r) => a + Math.abs(muFor(r, w) - r.actual), 0) / rs.length;

    console.log(`\n== ${stat} ==  ${rows.length} matches (fit ${fit.length} / test ${test.length}), line ${line}` +
                `  [${scaled ? 'scale' : ''}${scaled && shrunk ? ' + ' : ''}${shrunk ? 'shrink target' : ''}]`);
    console.log(`      ${'w'.padStart(5)}${'fit LL'.padStart(10)}${'test LL'.padStart(10)}${'test MAE'.padStart(11)}`);
    let bestW = 1, bestLL = Infinity;
    for (const w of WEIGHTS) {
        const f = ll(fit, w);
        if (f < bestLL - 1e-9) { bestLL = f; bestW = w; }
        console.log(`      ${w.toFixed(1).padStart(5)}${f.toFixed(4).padStart(10)}` +
                    `${ll(test, w).toFixed(4).padStart(10)}${mae(test, w).toFixed(4).padStart(11)}`);
    }
    const d = ll(test, bestW) - ll(test, 1);
    console.log(`   -> fit picks w=${bestW.toFixed(1)}; on the test half ${ll(test, 1).toFixed(4)} -> ${ll(test, bestW).toFixed(4)}` +
                ` (${d >= 0 ? '+' : ''}${d.toFixed(5)}) ${d < -0.0005 ? 'HOLDS UP' : d > 0.0005 ? 'DOES NOT HOLD' : 'no change'}`);
}

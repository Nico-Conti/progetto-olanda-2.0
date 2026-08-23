/**
 * Does a statistic predict itself better than something else predicts it?
 *
 * The shipped model always predicts a statistic from its own history: to
 * forecast goals it averages past goals. That is an assumption, not a finding,
 * and it was never testable before - /matches did not serve xG, big chances,
 * box touches or crosses, so the model could not see them.
 *
 * This walks each league-season forward in time and, for each target statistic,
 * scores every candidate predictor against it. Predictions are rescaled onto
 * the target's units by the running ratio of past totals, so a predictor on a
 * different scale (box touches ~46 a match vs shots ~26) competes fairly.
 * Only matches played before the one being predicted ever enter the estimate.
 *
 *   node predictorComparison.mjs           # all reports
 *   node predictorComparison.mjs mae       # just one
 *
 * Data comes from dumpSeason.py (run it with `all`).
 */
import fs from 'fs';
import { calculatePrediction, getAvg, getMedian } from '../stats.js';
import { createStatsAccumulator, addMatchToStats } from '../backtestEngine.js';
import { VOLATILE_STATS, STAT_CONFIG } from '../statistics.js';

// DATA_FILE lets the same reports run over a different dataset - our own
// Supabase dump (data.json, ~3k matches, every scraped statistic) or the
// football-data.co.uk history (data_fd.json, ~30k matches but only the seven
// statistics that source publishes).
const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py or backend.odds.history first.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));

/** Statistics present on most matches. Datasets carry different columns. */
const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();

/** Target statistic -> the predictors worth trying for it, own history first. */
const ALL_CANDIDATES = {
    goals:        ['goals', 'xg', 'xgot', 'big_chances', 'shots_on_target', 'box_touches'],
    corners:      ['corners', 'crosses', 'box_touches', 'shots', 'shots_on_target'],
    shots:        ['shots', 'box_touches', 'big_chances', 'blocked_shots', 'corners', 'shots_on_target'],
    fouls:        ['fouls', 'yellow_cards'],
    yellow_cards: ['yellow_cards', 'fouls'],
};
const CANDIDATES = Object.fromEntries(
    Object.entries(ALL_CANDIDATES)
        .filter(([target]) => AVAILABLE.has(target))
        .map(([target, list]) => [target, list.filter(p => AVAILABLE.has(p))])
        .filter(([, list]) => list.length > 1)
);

const aggFor = (stat) => (VOLATILE_STATS.includes(stat) ? getMedian : getAvg);
const lineFor = (stat) => STAT_CONFIG[stat]?.total?.default ?? 0;
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const totalOf = (m, stat) => {
    const s = m.stats?.[stat];
    return s ? Number(s.home) + Number(s.away) : null;
};

/**
 * Walk every league-season forward, predicting `target` from `predictor`.
 *
 * Grouping is by league *and* season: giornata restarts each year and team
 * strength is not carried across, so blending them would compare a matchday 3
 * side against a matchday 3 side a year apart.
 */
function walk(target, predictor, nGames, onMatch) {
    const agg = aggFor(target);
    const groups = {};
    for (const m of data) {
        if (!m.stats?.[target] || !m.stats?.[predictor]) continue;
        (groups[`${m.league}|${m.season}`] ??= []).push(m);
    }

    for (const [group, rows] of Object.entries(groups)) {
        rows.sort((a, b) => new Date(a.date) - new Date(b.date));

        const acc = createStatsAccumulator();
        const pastTargets = [];
        // Running totals over every past match, used to rescale a prediction
        // made in the predictor's units into the target's. When predictor ===
        // target this ratio is exactly 1 and the model is left untouched.
        let sumTarget = 0, sumPredictor = 0;

        for (const match of rows) {
            const actual = totalOf(match, target);
            const home = match.squadre.home;
            const away = match.squadre.away;

            if (acc[home] && acc[away] && pastTargets.length > 3 && sumPredictor > 0) {
                const p = calculatePrediction(home, away, acc, nGames, false, false, predictor, null);
                if (p && p.total > 0) {
                    onMatch({
                        pred: p.total * (sumTarget / sumPredictor),
                        actual,
                        leagueMean: agg(pastTargets),
                        group, giornata: match.giornata,
                    });
                }
            }

            addMatchToStats(acc, match, predictor);
            pastTargets.push(actual);
            sumTarget += actual;
            sumPredictor += totalOf(match, predictor);
        }
    }
}

// --- mae: which predictor forecasts the target most accurately? -------------
function mae() {
    console.log('\n== Predictor accuracy (MAE on the target total) ==');
    console.log('Each row predicts the target from a different statistic, rescaled onto the');
    console.log('target\'s units. "own" is the shipped model. "mean" ignores the teams.\n');

    for (const [target, predictors] of Object.entries(CANDIDATES)) {
        console.log(`${target}  (line ${lineFor(target)})`);
        console.log(`  ${'predictor'.padEnd(18)}${'N'.padStart(6)}${'MAE'.padStart(9)}${'vs own'.padStart(9)}${'vs mean'.padStart(9)}`);

        let ownMae = null;
        for (const predictor of predictors) {
            let ae = 0, meanAe = 0, n = 0;
            walk(target, predictor, 5, ({ pred, actual, leagueMean }) => {
                ae += Math.abs(pred - actual);
                meanAe += Math.abs(leagueMean - actual);
                n++;
            });
            if (!n) { console.log(`  ${predictor.padEnd(18)}${'-'.padStart(6)}`); continue; }

            const m = ae / n, mm = meanAe / n;
            if (ownMae === null) ownMae = m;
            const vsOwn = ((ownMae - m) / ownMae) * 100;
            const vsMean = ((mm - m) / mm) * 100;
            const tag = predictor === target ? ' (own)' : '';
            console.log(
                `  ${(predictor + tag).padEnd(18)}${String(n).padStart(6)}${m.toFixed(3).padStart(9)}` +
                `${(vsOwn >= 0 ? '+' : '') + vsOwn.toFixed(1) + '%'}`.padStart(9) +
                `${(vsMean >= 0 ? '+' : '') + vsMean.toFixed(1) + '%'}`.padStart(9)
            );
        }
        console.log();
    }
}

// --- ou: does the better predictor also call over/under better? -------------
const MARGINS = [0, 1, 2];

function ou() {
    console.log('\n== Over/under calls at the target\'s line ==');
    console.log('Accuracy / calls, only calling when |prediction - line| >= margin.');
    console.log('"base" = always picking the majority side, over every match seen.\n');

    for (const [target, predictors] of Object.entries(CANDIDATES)) {
        const line = lineFor(target);
        console.log(`${target} @ ${line}`);
        console.log(`  ${'predictor'.padEnd(18)}${'base'.padStart(7)}  ${MARGINS.map(m => `m=${m}`.padStart(14)).join('')}`);

        for (const predictor of predictors) {
            const cells = MARGINS.map(() => ({ ok: 0, n: 0 }));
            let over = 0, seen = 0;

            walk(target, predictor, 5, ({ pred, actual }) => {
                const isOver = actual > line;
                seen++; if (isOver) over++;
                MARGINS.forEach((m, i) => {
                    if (Math.abs(pred - line) >= m) {
                        cells[i].n++;
                        if ((pred > line) === isOver) cells[i].ok++;
                    }
                });
            });
            if (!seen) continue;

            const base = Math.max(over / seen, 1 - over / seen);
            const tag = predictor === target ? ' (own)' : '';
            console.log(
                `  ${(predictor + tag).padEnd(18)}${pct(base).padStart(7)}  ` +
                cells.map(c => (c.n ? `${pct(c.ok / c.n)}/${c.n}` : '-').padStart(14)).join('')
            );
        }
        console.log();
    }
}

// --- blend: predictor choice and shrinkage, together ------------------------
//
// Every predictor scores worse than the league mean on its own, so comparing
// them at full team-weighting ranks them on a setting none of them should run
// at. This sweeps the blend weight per pair and reports each predictor at its
// own best weight - the only comparison that says which to actually ship.
const WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);

function blend() {
    console.log('\n== Predictor x shrinkage ==');
    console.log('pred = w * (two-team model on the predictor) + (1-w) * (league mean).');
    console.log('w=1 is the shipped model. "best MAE" is each predictor at its own best w.\n');

    for (const [target, predictors] of Object.entries(CANDIDATES)) {
        console.log(`${target}`);
        console.log(`  ${'predictor'.padEnd(18)}${'MAE w=1'.padStart(9)}${'best w'.padStart(8)}${'best MAE'.padStart(10)}${'gain'.padStart(8)}${'vs own'.padStart(9)}`);

        let ownBest = null;
        for (const predictor of predictors) {
            const err = WEIGHTS.map(() => ({ ae: 0, n: 0 }));
            walk(target, predictor, 5, ({ pred, actual, leagueMean }) => {
                WEIGHTS.forEach((w, i) => {
                    err[i].ae += Math.abs(w * pred + (1 - w) * leagueMean - actual);
                    err[i].n++;
                });
            });
            if (!err[0].n) continue;

            const maes = err.map(e => e.ae / e.n);
            const bi = maes.indexOf(Math.min(...maes));
            const best = maes[bi], full = maes[maes.length - 1];
            if (ownBest === null) ownBest = best;

            const tag = predictor === target ? ' (own)' : '';
            const vsOwn = ((ownBest - best) / ownBest) * 100;
            console.log(
                `  ${(predictor + tag).padEnd(18)}${full.toFixed(3).padStart(9)}` +
                `${('w=' + WEIGHTS[bi]).padStart(8)}${best.toFixed(3).padStart(10)}` +
                `${((full - best) / full * 100).toFixed(1) + '%'}`.padStart(8) +
                `${(vsOwn >= 0 ? '+' : '') + vsOwn.toFixed(1) + '%'}`.padStart(9)
            );
        }
        console.log();
    }
}

// --- objective: MAE and the betting call want opposite things ---------------
//
// Shrinking toward the league mean minimises MAE - and at w=0 every match in a
// round gets the same prediction, so the over/under call is the same side every
// time and lands exactly on the base rate. Minimising MAE therefore optimises
// straight towards zero betting value. This report shows both curves side by
// side so the objective is chosen with eyes open.
function objective() {
    console.log('\n== MAE vs call accuracy, as shrinkage increases ==');
    console.log('Left: MAE (lower better). Right: over/under accuracy at margin 0 (higher better).');
    console.log('w=0 is the pure league mean, w=1 the shipped model.\n');

    const SHOWN = [0, 0.25, 0.5, 0.75, 1];

    for (const [target, predictors] of Object.entries(CANDIDATES)) {
        const line = lineFor(target);
        console.log(`${target} @ ${line}`);
        console.log(`  ${'predictor'.padEnd(18)}${SHOWN.map(w => `MAE w=${w}`.padStart(11)).join('')}` +
                    `   ${SHOWN.map(w => `acc w=${w}`.padStart(11)).join('')}`);

        for (const predictor of predictors) {
            const cells = SHOWN.map(() => ({ ae: 0, ok: 0, n: 0 }));
            walk(target, predictor, 5, ({ pred, actual, leagueMean }) => {
                const isOver = actual > line;
                SHOWN.forEach((w, i) => {
                    const blended = w * pred + (1 - w) * leagueMean;
                    cells[i].ae += Math.abs(blended - actual);
                    if ((blended > line) === isOver) cells[i].ok++;
                    cells[i].n++;
                });
            });
            if (!cells[0].n) continue;

            const tag = predictor === target ? ' (own)' : '';
            console.log(
                `  ${(predictor + tag).padEnd(18)}` +
                cells.map(c => (c.ae / c.n).toFixed(3).padStart(11)).join('') + '   ' +
                cells.map(c => pct(c.ok / c.n).padStart(11)).join('')
            );
        }
        console.log();
    }
}

// --- holdout: does the chosen predictor survive out-of-sample? --------------
//
// Sections 4 and 5 pick the best (predictor, weight) cell after seeing every
// result, which flatters it. Here the pair is chosen on all league-seasons but
// one and scored on the one held out, so the reported number is never one the
// choice was made on. Small groups (the opening weeks of 2026/27) are excluded
// as test folds - a few dozen matches cannot score anything - but still count
// as training data.
const MIN_FOLD = 100;

function holdout() {
    console.log('\n== Leave-one-league-season-out ==');
    console.log('(predictor, weight) chosen on every group but one, scored on the one held out.');
    console.log('"shipped" is the current model: the target\'s own history at w=1.\n');
    console.log(`${'target'.padEnd(14)}${'folds'.padStart(6)}${'N'.padStart(7)}${'base'.padStart(8)}` +
                `${'shipped'.padStart(9)}${'holdout'.padStart(9)}${'gain'.padStart(8)}   chosen`);

    for (const [target, predictors] of Object.entries(CANDIDATES)) {
        const line = lineFor(target);
        // tally[predictor][w][group] = { ok, n }
        const tally = {};
        const baseTally = {};

        for (const predictor of predictors) {
            tally[predictor] = WEIGHTS.map(() => ({}));
            walk(target, predictor, 5, ({ pred, actual, leagueMean, group }) => {
                const isOver = actual > line;
                WEIGHTS.forEach((w, i) => {
                    const cell = (tally[predictor][i][group] ??= { ok: 0, n: 0 });
                    if (((w * pred + (1 - w) * leagueMean) > line) === isOver) cell.ok++;
                    cell.n++;
                });
                if (predictor === target) {
                    const b = (baseTally[group] ??= { over: 0, n: 0 });
                    if (isOver) b.over++;
                    b.n++;
                }
            });
        }

        const groups = Object.keys(baseTally);
        const folds = groups.filter(g => baseTally[g].n >= MIN_FOLD);
        if (!folds.length) continue;

        let ok = 0, n = 0, shippedOk = 0, baseOk = 0;
        const chosen = new Set();

        for (const test of folds) {
            let best = null;
            for (const predictor of predictors) {
                WEIGHTS.forEach((w, i) => {
                    let tOk = 0, tN = 0;
                    for (const g of groups) {
                        if (g === test) continue;
                        const c = tally[predictor][i][g];
                        if (c) { tOk += c.ok; tN += c.n; }
                    }
                    if (tN && (!best || tOk / tN > best.acc)) best = { predictor, w, i, acc: tOk / tN };
                });
            }
            if (!best) continue;
            chosen.add(`${best.predictor}@w=${best.w}`);

            const cell = tally[best.predictor][best.i][test];
            if (cell) { ok += cell.ok; n += cell.n; }

            const ship = tally[target][WEIGHTS.length - 1][test];
            if (ship) shippedOk += ship.ok;

            const b = baseTally[test];
            baseOk += Math.max(b.over, b.n - b.over);
        }
        if (!n) continue;

        const acc = ok / n, ship = shippedOk / n, base = baseOk / n;
        console.log(
            `${target.padEnd(14)}${String(folds.length).padStart(6)}${String(n).padStart(7)}` +
            `${pct(base).padStart(8)}${pct(ship).padStart(9)}${pct(acc).padStart(9)}` +
            `${((acc - ship) >= 0 ? '+' : '') + ((acc - ship) * 100).toFixed(1) + 'pp'}`.padStart(8) +
            `   ${[...chosen].join(', ')}`
        );
    }
    console.log();
}

const REPORTS = { mae, blend, ou, objective, holdout };
const requested = process.argv[2];
if (requested && !REPORTS[requested]) {
    console.error(`Unknown report "${requested}". Available: ${Object.keys(REPORTS).join(', ')}`);
    process.exit(1);
}
console.log(`${data.length} matches | ${new Set(data.map(m => `${m.league}|${m.season}`)).size} league-seasons`);
console.log(`statistics available: ${[...AVAILABLE].sort().join(', ')}`);
for (const [name, fn] of Object.entries(REPORTS)) {
    if (!requested || requested === name) fn();
}

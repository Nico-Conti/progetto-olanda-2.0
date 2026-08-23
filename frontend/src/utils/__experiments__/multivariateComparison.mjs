/**
 * Is there signal in the other statistics too?
 *
 * The shipped model uses exactly one statistic to predict a target: corners
 * from shots, goals from box touches. That choice came from a grid search over
 * single predictors, which cannot see whether two statistics together beat
 * either alone.
 *
 * This fits a ridge regression over ALL of them. The feature for statistic s is
 * the two-team model's predicted total in s's own units - literally what
 * calculatePrediction returns for s - so the regression is a strict
 * generalisation of the shipped scheme: putting weight 1 on a single feature and
 * 0 elsewhere reproduces it.
 *
 *   y ~ b0 + sum_s b_s * impliedTotal_s + b_m * leagueMean(target)
 *
 * Ridge, not OLS, because the features are badly collinear - shots, box touches,
 * big chances and corners all measure roughly "who had the run of play". OLS
 * would hand out enormous cancelling coefficients and not survive a holdout.
 *
 * Validated leave-one-league-season-out, with the penalty chosen by an inner
 * leave-one-out over the training groups only, so nothing is tuned on the fold
 * being scored.
 *
 *   node multivariateComparison.mjs
 */
import fs from 'fs';
import { calculatePrediction } from '../stats.js';
import { createStatsAccumulator, addMatchToStats } from '../backtestEngine.js';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
} from '../predictTotal.js';
import { STAT_CONFIG, VOLATILE_STATS } from '../statistics.js';
import { getAvg, getMedian } from '../stats.js';

// DATA_FILE selects the dataset: our Supabase dump (data.json, ~3k matches with
// every scraped statistic) or the football-data.co.uk history (data_fd.json,
// ~30k matches but only seven statistics).
const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py or backend.odds.history first.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));

const ALL_FEATURES = [
    'goals', 'corners', 'shots', 'shots_on_target', 'fouls', 'yellow_cards',
    'xg', 'xgot', 'big_chances', 'box_touches', 'crosses',
    'goalkeeper_saves', 'blocked_shots',
];
const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();
const FEATURES = ALL_FEATURES.filter(s => AVAILABLE.has(s));
const TARGETS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards'].filter(s => AVAILABLE.has(s));
const LAMBDAS = [0.01, 0.1, 1, 3, 10, 30, 100, 300, 1000, 3000];
const N_GAMES = 5;

const totalOf = (m, s) => {
    const x = m.stats?.[s];
    return x ? Number(x.home) + Number(x.away) : null;
};

// --- linear algebra ----------------------------------------------------------

/** Solves (A + lambda I) b = c by Gaussian elimination with partial pivoting. */
function solveRidge(A, c, lambda) {
    const n = c.length;
    const M = A.map((row, i) => [...row.map((v, j) => v + (i === j ? lambda : 0)), c[i]]);
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-12) return null;
        [M[col], M[piv]] = [M[piv], M[col]];
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
        }
    }
    // Gauss-Jordan zeroed every off-diagonal, so each row is just d_i * b_i = c_i.
    return M.map((row, i) => row[n] / row[i]);
}

/**
 * Ridge fit on standardised features with a centred target, so the penalty
 * treats every feature alike regardless of its natural scale (box touches run
 * ~46 a match, goals ~2.7).
 */
function fit(rows, lambda) {
    const p = rows[0].x.length, n = rows.length;
    const mean = Array(p).fill(0), sd = Array(p).fill(0);
    for (const r of rows) for (let j = 0; j < p; j++) mean[j] += r.x[j] / n;
    for (const r of rows) for (let j = 0; j < p; j++) sd[j] += (r.x[j] - mean[j]) ** 2 / n;
    for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;

    const yMean = rows.reduce((s, r) => s + r.y, 0) / n;
    const A = Array.from({ length: p }, () => Array(p).fill(0));
    const c = Array(p).fill(0);
    for (const r of rows) {
        const z = r.x.map((v, j) => (v - mean[j]) / sd[j]);
        for (let i = 0; i < p; i++) {
            c[i] += z[i] * (r.y - yMean);
            for (let j = i; j < p; j++) A[i][j] += z[i] * z[j];
        }
    }
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];

    const beta = solveRidge(A, c, lambda);
    if (!beta) return null;
    return { beta, mean, sd, yMean };
}

/**
 * L2-penalised logistic regression by IRLS, predicting P(total > line).
 *
 * This is the same feature set as the ridge above, fitted on the objective that
 * actually matters. Squared error is minimised by collapsing toward the league
 * mean - which is why the ridge picked the largest penalty on offer and lost
 * accuracy at the line while improving MAE. Log loss has no such incentive: a
 * prediction pinned to the mean scores the base rate and nothing better.
 *
 * The intercept is carried separately and left unpenalised, so shrinkage acts on
 * the slopes rather than dragging the base rate around.
 */
function fitLogistic(rows, lambda, line, iterations = 25) {
    const p = rows[0].x.length, n = rows.length;
    const mean = Array(p).fill(0), sd = Array(p).fill(0);
    for (const r of rows) for (let j = 0; j < p; j++) mean[j] += r.x[j] / n;
    for (const r of rows) for (let j = 0; j < p; j++) sd[j] += (r.x[j] - mean[j]) ** 2 / n;
    for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;

    const Z = rows.map(r => [1, ...r.x.map((v, j) => (v - mean[j]) / sd[j])]);
    const y = rows.map(r => (r.y > line ? 1 : 0));
    let beta = Array(p + 1).fill(0);
    beta[0] = Math.log((y.reduce((a, b) => a + b, 0) + 0.5) / (n - y.reduce((a, b) => a + b, 0) + 0.5));

    for (let it = 0; it < iterations; it++) {
        const A = Array.from({ length: p + 1 }, () => Array(p + 1).fill(0));
        const g = Array(p + 1).fill(0);
        for (let i = 0; i < n; i++) {
            const eta = Z[i].reduce((acc, v, j) => acc + v * beta[j], 0);
            const mu = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
            const w = Math.max(mu * (1 - mu), 1e-6);
            const resid = y[i] - mu;
            for (let a = 0; a <= p; a++) {
                g[a] += Z[i][a] * resid;
                for (let b = a; b <= p; b++) A[a][b] += w * Z[i][a] * Z[i][b];
            }
        }
        for (let a = 0; a <= p; a++) for (let b = 0; b < a; b++) A[a][b] = A[b][a];
        // Penalise slopes only; the intercept keeps the base rate honest.
        for (let a = 1; a <= p; a++) { A[a][a] += lambda; g[a] -= lambda * beta[a]; }

        const step = solveRidge(A, g, 0);
        if (!step || step.some(v => !Number.isFinite(v))) break;
        beta = beta.map((b, j) => b + step[j]);
        if (Math.max(...step.map(Math.abs)) < 1e-8) break;
    }
    return { beta, mean, sd };
}

const applyLogistic = (model, x) => {
    const z = [1, ...x.map((v, j) => (v - model.mean[j]) / model.sd[j])];
    const eta = z.reduce((acc, v, j) => acc + v * model.beta[j], 0);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
};

const apply = (model, x) =>
    model.yMean + x.reduce((s, v, j) => s + model.beta[j] * ((v - model.mean[j]) / model.sd[j]), 0);

// --- build the feature table -------------------------------------------------

/**
 * For each match, the two-team implied total in every statistic's own units,
 * computed from matches played before it only.
 */
function buildRows(target) {
    const groups = {};
    for (const m of data) {
        if (FEATURES.every(s => m.stats?.[s]) && totalOf(m, target) !== null) {
            (groups[`${m.league}|${m.season}`] ??= []).push(m);
        }
    }
    const aggregate = VOLATILE_STATS.includes(target) ? getMedian : getAvg;
    const out = [];

    for (const [group, matches] of Object.entries(groups)) {
        matches.sort((a, b) => new Date(a.date) - new Date(b.date));
        const accs = Object.fromEntries(FEATURES.map(s => [s, createStatsAccumulator()]));
        // The shipped model may be configured to predict this target from a
        // statistic this dataset does not carry - goals from box touches, which
        // football-data.co.uk does not publish. Fall back to the target's own
        // history at full weight, which is what shipped before PREDICTOR_MODEL,
        // rather than silently producing no baseline at all.
        const shipped = createPredictionModel(target);
        if (!AVAILABLE.has(shipped.predictor)) {
            shipped.predictor = target;
            shipped.weight = 1;
        }
        const pastTargets = [];

        for (const m of matches) {
            const home = m.squadre.home, away = m.squadre.away;
            const ready = FEATURES.every(s => accs[s][home] && accs[s][away]);

            if (ready && pastTargets.length > 3) {
                const x = [];
                let ok = true;
                for (const s of FEATURES) {
                    const p = calculatePrediction(home, away, accs[s], N_GAMES, false, false, s, null);
                    if (!p || !(p.total > 0)) { ok = false; break; }
                    x.push(p.total);
                }
                if (ok) {
                    x.push(aggregate(pastTargets));          // the shrinkage anchor
                    const base = predictFromModel(shipped, home, away, { nGames: N_GAMES });
                    out.push({
                        group, season: m.season, league: m.league,
                        home, away, x, y: totalOf(m, target),
                        shipped: base && base.total > 0 ? base.total : null,
                    });
                }
            }

            for (const s of FEATURES) addMatchToStats(accs[s], m, s);
            addMatchToPredictionModel(shipped, m);
            pastTargets.push(totalOf(m, target));
        }
    }
    return out.filter(r => r.shipped !== null);
}

// --- evaluate ----------------------------------------------------------------

const COLS = [...FEATURES, 'leagueMean'];

function run(target) {
    const line = STAT_CONFIG[target].total.default;
    const rows = buildRows(target);
    const seasons = [...new Set(rows.map(r => r.season))].sort();

    // With several seasons available, validate FORWARD IN TIME: train on every
    // earlier season, test on the next. Leaving one league-season out lets the
    // fit see the future, which for a betting model is the wrong question - the
    // only thing that matters is whether it works on matches not yet played.
    // With one season there is no time axis, so fall back to leaving one
    // league-season out.
    const chronological = seasons.length >= 5;
    const splits = chronological
        ? seasons.slice(3).map(season => ({
            label: season,
            train: rows.filter(r => r.season < season),
            test: rows.filter(r => r.season === season),
        }))
        : [...new Set(rows.map(r => r.group))]
            .filter(g => rows.filter(r => r.group === g).length >= 100)
            .map(group => ({
                label: group,
                train: rows.filter(r => r.group !== group),
                test: rows.filter(r => r.group === group),
            }));
    const folds = splits.filter(s => s.test.length >= 100 && s.train.length >= 500);

    let ridgeOk = 0, shipOk = 0, meanOk = 0, logOk = 0, n = 0;
    let ridgeAE = 0, shipAE = 0;
    let logLoss = 0, shipLoss = 0, baseLoss = 0;
    const chosen = [], chosenLog = [];
    const coefSum = Array(COLS.length).fill(0);

    for (const fold of folds) {
        const { train, test: testRows } = fold;
        // Inner validation groups: for a chronological split the most recent
        // training season stands in as the validation set, so the penalty is
        // chosen the same way it will be used - fitted on the past, judged on
        // what came next.
        const innerGroups = chronological
            ? [[...new Set(train.map(r => r.season))].sort().slice(-1)[0]]
            : [...new Set(train.map(r => r.group))];
        const innerKey = chronological ? (r => r.season) : (r => r.group);

        // Inner leave-one-out over the training groups only: the penalty never
        // sees the fold it will be scored on.
        let bestLambda = LAMBDAS[0], bestErr = Infinity;
        for (const lambda of LAMBDAS) {
            let err = 0, cnt = 0;
            for (const inner of innerGroups) {
                const innerTrain = train.filter(r => innerKey(r) !== inner);
                const innerTest = train.filter(r => innerKey(r) === inner);
                const model = fit(innerTrain, lambda);
                if (!model) continue;
                for (const r of innerTest) { err += (apply(model, r.x) - r.y) ** 2; cnt++; }
            }
            if (cnt && err / cnt < bestErr) { bestErr = err / cnt; bestLambda = lambda; }
        }
        chosen.push(bestLambda);

        const model = fit(train, bestLambda);
        if (!model) continue;

        // The logistic penalty is chosen the same way, but scored on log loss -
        // the objective it is actually being asked to optimise.
        let bestLogLambda = LAMBDAS[0], bestLogLoss = Infinity;
        for (const lambda of LAMBDAS) {
            let loss = 0, cnt = 0;
            for (const inner of innerGroups) {
                const lm = fitLogistic(train.filter(r => innerKey(r) !== inner), lambda, line);
                for (const r of train.filter(r => innerKey(r) === inner)) {
                    const pr = Math.min(Math.max(applyLogistic(lm, r.x), 1e-9), 1 - 1e-9);
                    loss -= (r.y > line) ? Math.log(pr) : Math.log(1 - pr);
                    cnt++;
                }
            }
            if (cnt && loss / cnt < bestLogLoss) { bestLogLoss = loss / cnt; bestLogLambda = lambda; }
        }
        chosenLog.push(bestLogLambda);
        const logModel = fitLogistic(train, bestLogLambda, line);
        logModel.beta.slice(1).forEach((b, j) => { coefSum[j] += b / folds.length; });

        // A shipped-model baseline on the same scale: one logistic parameter on
        // (prediction - line), so the comparison is feature count, not calibration.
        let bestB = 0.1, bestBLoss = Infinity;
        for (let b = 0.05; b <= 4; b += 0.05) {
            let loss = 0;
            for (const r of train) {
                const pr = 1 / (1 + Math.exp(-b * (r.shipped - line)));
                loss -= (r.y > line) ? Math.log(Math.max(pr, 1e-9)) : Math.log(Math.max(1 - pr, 1e-9));
            }
            if (loss < bestBLoss) { bestBLoss = loss; bestB = b; }
        }
        const baseRate = train.filter(r => r.y > line).length / train.length;

        for (const r of testRows) {
            const pred = apply(model, r.x);
            const isOver = r.y > line;
            if ((pred > line) === isOver) ridgeOk++;
            if ((r.shipped > line) === isOver) shipOk++;
            if ((r.x[r.x.length - 1] > line) === isOver) meanOk++;
            ridgeAE += Math.abs(pred - r.y);
            shipAE += Math.abs(r.shipped - r.y);

            const pLog = Math.min(Math.max(applyLogistic(logModel, r.x), 1e-9), 1 - 1e-9);
            if ((pLog > 0.5) === isOver) logOk++;
            logLoss -= isOver ? Math.log(pLog) : Math.log(1 - pLog);

            const pShip = Math.min(Math.max(1 / (1 + Math.exp(-bestB * (r.shipped - line))), 1e-9), 1 - 1e-9);
            shipLoss -= isOver ? Math.log(pShip) : Math.log(1 - pShip);
            baseLoss -= isOver ? Math.log(baseRate) : Math.log(1 - baseRate);
            n++;
        }
    }

    console.log(`\n${target} @ ${line}   ${n} held-out matches, ${folds.length} ` +
                `${chronological ? 'forward-in-time' : 'leave-one-league-season-out'} folds` +
                `   lambda ${[...new Set(chosen)].sort((a, b) => a - b).join('/')}`);
    console.log(`  ${'model'.padEnd(22)}${'accuracy'.padStart(10)}${'MAE'.padStart(9)}`);
    console.log(`  ${'league mean only'.padEnd(22)}${(100 * meanOk / n).toFixed(1).padStart(9)}%${'-'.padStart(9)}`);
    console.log(`  ${'shipped (1 predictor)'.padEnd(22)}${(100 * shipOk / n).toFixed(1).padStart(9)}%${(shipAE / n).toFixed(3).padStart(9)}`);
    console.log(`  ${'ridge (all stats)'.padEnd(22)}${(100 * ridgeOk / n).toFixed(1).padStart(9)}%${(ridgeAE / n).toFixed(3).padStart(9)}` +
                `   ${ridgeOk > shipOk ? `+${(100 * (ridgeOk - shipOk) / n).toFixed(1)}pp` : `${(100 * (ridgeOk - shipOk) / n).toFixed(1)}pp`}`);
    console.log(`  ${'logistic (all stats)'.padEnd(22)}${(100 * logOk / n).toFixed(1).padStart(9)}%${'-'.padStart(9)}` +
                `   ${logOk > shipOk ? `+${(100 * (logOk - shipOk) / n).toFixed(1)}pp` : `${(100 * (logOk - shipOk) / n).toFixed(1)}pp`}` +
                `   lambda ${[...new Set(chosenLog)].sort((a, b) => a - b).join('/')}`);
    console.log(`  log loss:  base ${(baseLoss / n).toFixed(4)}   ` +
                `shipped ${(shipLoss / n).toFixed(4)}   ` +
                `logistic ${(logLoss / n).toFixed(4)}` +
                `   ${logLoss < shipLoss ? 'multivariate wins' : 'single predictor wins'}`);

    const ranked = COLS.map((c, j) => [c, coefSum[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    console.log('  strongest coefficients (standardised, averaged over folds):');
    console.log('    ' + ranked.slice(0, 6).map(([c, b]) => `${c} ${b >= 0 ? '+' : ''}${b.toFixed(2)}`).join('   '));
}

// --- count models: predict the number, not the side --------------------------
//
// The logistic above throws information away. A 20-corner match and a 10-corner
// match are both just "over 9.5" to it, and it never learns the difference. It
// also answers exactly one question - P(over 9.5) - so pricing 8.5 and 10.5
// means refitting, and nothing ties those fits together: they can happily imply
// P(over 8.5) < P(over 10.5), which is impossible.
//
// A count model fits the whole distribution instead. One fit gives a coherent
// probability at every line, and it uses the magnitude of each result.
//
// This is NOT the ridge from earlier. That fitted a point estimate by squared
// error and collapsed toward the league mean. These maximise the likelihood of
// the observed count under a distribution, which is a proper scoring rule.

const LANCZOS = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                 -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
function lgamma(x) {
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += LANCZOS[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Negative binomial (NB2) regression with a log link, by IRLS.
 *
 * `r` is the dispersion: variance is mu + mu^2/r, so a large r approaches the
 * Poisson. Corners, fouls and cards are all overdispersed relative to Poisson -
 * their variance exceeds their mean - so a Poisson would price the tails too
 * confidently. Passing r = Infinity gives the Poisson for comparison.
 */
function fitCount(rows, lambda, r, iterations = 30) {
    const p = rows[0].x.length, n = rows.length;
    const mean = Array(p).fill(0), sd = Array(p).fill(0);
    for (const row of rows) for (let j = 0; j < p; j++) mean[j] += row.x[j] / n;
    for (const row of rows) for (let j = 0; j < p; j++) sd[j] += (row.x[j] - mean[j]) ** 2 / n;
    for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;

    const Z = rows.map(row => [1, ...row.x.map((v, j) => (v - mean[j]) / sd[j])]);
    const y = rows.map(row => row.y);
    const beta = Array(p + 1).fill(0);
    beta[0] = Math.log(Math.max(y.reduce((a, b) => a + b, 0) / n, 1e-6));

    for (let it = 0; it < iterations; it++) {
        const A = Array.from({ length: p + 1 }, () => Array(p + 1).fill(0));
        const b = Array(p + 1).fill(0);
        for (let i = 0; i < n; i++) {
            const eta = Z[i].reduce((acc, v, j) => acc + v * beta[j], 0);
            const mu = Math.exp(Math.max(-20, Math.min(20, eta)));
            const variance = Number.isFinite(r) ? mu + (mu * mu) / r : mu;
            const w = Math.max((mu * mu) / Math.max(variance, 1e-9), 1e-9);
            const z = eta + (y[i] - mu) / Math.max(mu, 1e-9);
            for (let a = 0; a <= p; a++) {
                b[a] += w * Z[i][a] * z;
                for (let c = a; c <= p; c++) A[a][c] += w * Z[i][a] * Z[i][c];
            }
        }
        for (let a = 0; a <= p; a++) for (let c = 0; c < a; c++) A[a][c] = A[c][a];
        // Slopes are penalised; the intercept carries the overall level.
        for (let a = 1; a <= p; a++) { A[a][a] += lambda; }

        const next = solveRidge(A, b, 0);
        if (!next || next.some(v => !Number.isFinite(v))) break;
        const delta = Math.max(...next.map((v, j) => Math.abs(v - beta[j])));
        for (let j = 0; j <= p; j++) beta[j] = next[j];
        if (delta < 1e-9) break;
    }
    return { beta, mean, sd, r };
}

const countMu = (model, x) => {
    const z = [1, ...x.map((v, j) => (v - model.mean[j]) / model.sd[j])];
    return Math.exp(Math.max(-20, Math.min(20, z.reduce((a, v, j) => a + v * model.beta[j], 0))));
};

/** P(count = k) under the fitted distribution. */
function countPmf(mu, k, r) {
    if (!Number.isFinite(r)) return Math.exp(-mu + k * Math.log(Math.max(mu, 1e-12)) - lgamma(k + 1));
    return Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1)
        + r * Math.log(r / (r + mu)) + k * Math.log(Math.max(mu, 1e-12) / (r + mu)));
}

/** P(count > line), by summing the mass at or below it. */
function countOver(mu, line, r) {
    let below = 0;
    for (let k = 0; k <= Math.floor(line); k++) below += countPmf(mu, k, r);
    return Math.min(Math.max(1 - below, 1e-9), 1 - 1e-9);
}

/** Mean log-likelihood of the observed counts - how the dispersion is chosen. */
const countLogLik = (model, rows) => rows.reduce((acc, row) =>
    acc + Math.log(Math.max(countPmf(countMu(model, row.x), row.y, model.r), 1e-300)), 0) / rows.length;

const DISPERSIONS = [2, 4, 8, 16, 32, 64, 128, Infinity];

function counts() {
    console.log('\n== Count models: fitting the number instead of the side ==');
    console.log('Same features. The logistic predicts P(over the line); the count models fit the');
    console.log('whole distribution and read that probability off it.\n');

    for (const target of TARGETS) {
        const line = STAT_CONFIG[target].total.default;
        const rows = buildRows(target);
        const seasons = [...new Set(rows.map(r => r.season))].sort();
        const chronological = seasons.length >= 5;
        const splits = chronological
            ? seasons.slice(3).map(season => ({
                train: rows.filter(r => r.season < season),
                test: rows.filter(r => r.season === season),
            }))
            : [...new Set(rows.map(r => r.group))].map(group => ({
                train: rows.filter(r => r.group !== group),
                test: rows.filter(r => r.group === group),
            }));
        const folds = splits.filter(s => s.test.length >= 100 && s.train.length >= 500);
        if (!folds.length) continue;

        let logLL = 0, poisLL = 0, nbLL = 0, n = 0;
        const chosenR = [];
        // Extra lines either side of the default: one count fit prices them all.
        const ladder = [line - 2, line - 1, line, line + 1, line + 2].filter(l => l > 0);
        const ladderLoss = { nb: ladder.map(() => 0), logit: ladder.map(() => 0) };
        let monotoneViolations = 0;

        for (const { train, test } of folds) {
            const valid = chronological
                ? [[...new Set(train.map(r => r.season))].sort().slice(-1)[0]]
                : [[...new Set(train.map(r => r.group))][0]];
            const key = chronological ? (r => r.season) : (r => r.group);
            const inner = train.filter(r => !valid.includes(key(r)));
            const innerTest = train.filter(r => valid.includes(key(r)));

            // Penalty and dispersion chosen together, on held-out training data.
            let bestLambda = LAMBDAS[0], bestR = DISPERSIONS[0], bestLL = -Infinity;
            for (const lambda of LAMBDAS) {
                for (const r of DISPERSIONS) {
                    const m = fitCount(inner, lambda, r);
                    const ll = countLogLik(m, innerTest);
                    if (Number.isFinite(ll) && ll > bestLL) { bestLL = ll; bestLambda = lambda; bestR = r; }
                }
            }
            chosenR.push(bestR === Infinity ? 'Poisson' : bestR);

            const nb = fitCount(train, bestLambda, bestR);
            const pois = fitCount(train, bestLambda, Infinity);

            let bestLogLambda = LAMBDAS[0], bestLogLoss = Infinity;
            for (const lambda of LAMBDAS) {
                const lm = fitLogistic(inner, lambda, line);
                let loss = 0;
                for (const r of innerTest) {
                    const pr = Math.min(Math.max(applyLogistic(lm, r.x), 1e-9), 1 - 1e-9);
                    loss -= (r.y > line) ? Math.log(pr) : Math.log(1 - pr);
                }
                if (loss / innerTest.length < bestLogLoss) {
                    bestLogLoss = loss / innerTest.length; bestLogLambda = lambda;
                }
            }
            const logit = fitLogistic(train, bestLogLambda, line);
            // The logistic must be refitted per line; the count models are not.
            const ladderLogits = ladder.map(l => fitLogistic(train, bestLogLambda, l));

            for (const row of test) {
                const isOver = row.y > line;
                const pl = Math.min(Math.max(applyLogistic(logit, row.x), 1e-9), 1 - 1e-9);
                const mu = countMu(nb, row.x), muP = countMu(pois, row.x);
                const pn = countOver(mu, line, bestR), pp = countOver(muP, line, Infinity);
                logLL -= isOver ? Math.log(pl) : Math.log(1 - pl);
                nbLL -= isOver ? Math.log(pn) : Math.log(1 - pn);
                poisLL -= isOver ? Math.log(pp) : Math.log(1 - pp);
                n++;

                let previous = 1;
                ladder.forEach((l, i) => {
                    const over = row.y > l;
                    const pNb = countOver(mu, l, bestR);
                    if (pNb > previous + 1e-12) monotoneViolations++;
                    previous = pNb;
                    ladderLoss.nb[i] -= over ? Math.log(pNb) : Math.log(1 - pNb);
                    const pLg = Math.min(Math.max(applyLogistic(ladderLogits[i], row.x), 1e-9), 1 - 1e-9);
                    ladderLoss.logit[i] -= over ? Math.log(pLg) : Math.log(1 - pLg);
                });
            }
        }

        console.log(`${target} @ ${line}   ${n} held-out matches   dispersion chosen: ` +
                    `${[...new Set(chosenR)].join('/')}`);
        console.log(`  ${'logistic (binary)'.padEnd(24)}${(logLL / n).toFixed(4).padStart(10)}`);
        console.log(`  ${'Poisson (count)'.padEnd(24)}${(poisLL / n).toFixed(4).padStart(10)}`);
        console.log(`  ${'negative binomial'.padEnd(24)}${(nbLL / n).toFixed(4).padStart(10)}` +
                    `   ${nbLL < logLL ? 'count wins' : 'binary wins'}`);
        console.log(`  across lines ${ladder.join('/')}:  ` +
                    `NB ${(ladder.reduce((a, _, i) => a + ladderLoss.nb[i], 0) / (n * ladder.length)).toFixed(4)}   ` +
                    `logistic refit per line ${(ladder.reduce((a, _, i) => a + ladderLoss.logit[i], 0) / (n * ladder.length)).toFixed(4)}` +
                    `   monotonicity violations: ${monotoneViolations}`);
    }
}

// --- per-league vs pooled ----------------------------------------------------
//
// Leagues obviously differ - Serie A concedes more fouls than the Premier
// League, the Eredivisie scores more goals. But the feature set already carries
// the target's running league mean, which absorbs those LEVEL differences. A
// per-league fit only earns its place if the SLOPES differ too: if shots predict
// corners more strongly in one league than another.
//
// Against that sits sample size. Pooled, a fit sees ~15,000 matches; per league
// it sees roughly a seventh of that, for the same 14 coefficients. Splitting
// buys specificity and pays for it in variance.
//
// A third option is partial pooling - fit per league but shrink each league's
// coefficients toward the pooled ones. That is what the ridge penalty already
// does relative to zero, so it is approximated here by giving the per-league fit
// its own penalty search: a league with little signal of its own will select a
// heavy penalty and collapse toward the intercept.
function perLeague() {
    console.log('\n== Per-league vs pooled fits ==');
    console.log('Both forward in time: trained on earlier seasons, scored on the next one.');
    console.log('Penalty chosen separately for each, on held-out training data.\n');

    for (const target of TARGETS) {
        const line = STAT_CONFIG[target].total.default;
        const rows = buildRows(target);
        const seasons = [...new Set(rows.map(r => r.season))].sort();
        const leagues = [...new Set(rows.map(r => r.league))];
        if (seasons.length < 5) { console.log(`${target}: too few seasons`); continue; }

        let pooledLoss = 0, leagueLoss = 0, n = 0;
        const perLeagueTally = {};

        for (const test of seasons.slice(3)) {
            const train = rows.filter(r => r.season < test);
            const testRows = rows.filter(r => r.season === test);
            if (train.length < 500 || !testRows.length) continue;
            const valid = [...new Set(train.map(r => r.season))].sort().slice(-1)[0];

            const pickLambda = (subset) => {
                const inner = subset.filter(r => r.season !== valid);
                const innerTest = subset.filter(r => r.season === valid);
                if (inner.length < 200 || !innerTest.length) return LAMBDAS[LAMBDAS.length - 1];
                let best = LAMBDAS[0], bestLoss = Infinity;
                for (const lambda of LAMBDAS) {
                    const m = fitLogistic(inner, lambda, line);
                    let loss = 0;
                    for (const r of innerTest) {
                        const pr = Math.min(Math.max(applyLogistic(m, r.x), 1e-9), 1 - 1e-9);
                        loss -= (r.y > line) ? Math.log(pr) : Math.log(1 - pr);
                    }
                    if (loss / innerTest.length < bestLoss) { bestLoss = loss / innerTest.length; best = lambda; }
                }
                return best;
            };

            const pooled = fitLogistic(train, pickLambda(train), line);

            for (const league of leagues) {
                const lTest = testRows.filter(r => r.league === league);
                const lTrain = train.filter(r => r.league === league);
                if (!lTest.length || lTrain.length < 300) continue;
                const local = fitLogistic(lTrain, pickLambda(lTrain), line);

                const tally = (perLeagueTally[league] ??= { pooled: 0, local: 0, n: 0 });
                for (const r of lTest) {
                    const isOver = r.y > line;
                    const pp = Math.min(Math.max(applyLogistic(pooled, r.x), 1e-9), 1 - 1e-9);
                    const pl = Math.min(Math.max(applyLogistic(local, r.x), 1e-9), 1 - 1e-9);
                    const lp = isOver ? -Math.log(pp) : -Math.log(1 - pp);
                    const ll = isOver ? -Math.log(pl) : -Math.log(1 - pl);
                    pooledLoss += lp; leagueLoss += ll; n++;
                    tally.pooled += lp; tally.local += ll; tally.n++;
                }
            }
        }
        if (!n) { console.log(`${target}: no usable folds`); continue; }

        const verdict = leagueLoss < pooledLoss ? 'per-league wins' : 'pooled wins';
        console.log(`${target} @ ${line}   ${n} held-out matches`);
        console.log(`  ${'pooled'.padEnd(14)}${(pooledLoss / n).toFixed(4)}`);
        console.log(`  ${'per-league'.padEnd(14)}${(leagueLoss / n).toFixed(4)}   ${verdict}`);
        for (const [lg, t] of Object.entries(perLeagueTally).sort()) {
            const d = (t.local - t.pooled) / t.n;
            console.log(`     ${lg.padEnd(17)}n=${String(t.n).padStart(5)}  pooled ${(t.pooled/t.n).toFixed(4)}` +
                        `  local ${(t.local/t.n).toFixed(4)}  ${d < 0 ? 'local better' : 'pooled better'} (${d >= 0 ? '+' : ''}${d.toFixed(4)})`);
        }
        console.log();
    }
}

// --- market: does any of this beat the closing price? ------------------------
//
// Everything above is scored against a fixed line. This scores the multivariate
// model against what the market actually charged. Prices are closing, mostly
// Betfair Exchange, whose overround is near zero - so the de-vigged price is the
// market's own probability with nothing to strip out.
function market() {
    const ODDS = new URL(process.env.ODDS_FILE ?? './odds_fd.json', import.meta.url);
    if (!fs.existsSync(ODDS)) {
        console.log('\nNo odds file - skipping the market report. Generate it with:');
        console.log('  python -m backend.odds.history --matches ... --odds ...');
        return;
    }
    const odds = JSON.parse(fs.readFileSync(ODDS));
    const line = 2.5, target = 'goals';

    const priced = {};
    for (const o of odds) {
        if (o.market !== 'total_goals' || Number(o.line) !== line) continue;
        const k = `${o.league}|${o.season}|${o.home}|${o.away}`;
        (priced[k] ??= {})[o.selection] = Number(o.price);
    }

    const rows = buildRows(target).filter(r => {
        const m = priced[`${r.league}|${r.season}|${r.home}|${r.away}`];
        if (!m?.over || !m?.under) return false;
        r.over = m.over; r.under = m.under;
        return true;
    });
    if (!rows.length) { console.log('\nNo matches joined to a price.'); return; }

    const seasons = [...new Set(rows.map(r => r.season))].sort();
    const devig = (o, u) => (1 / o) / (1 / o + 1 / u);

    let mLL = 0, kLL = 0, bLL = 0, n = 0, overround = 0;
    const staked = {};
    for (const season of seasons.slice(3)) {
        const train = rows.filter(r => r.season < season);
        const test = rows.filter(r => r.season === season);
        if (train.length < 500 || !test.length) continue;

        // Penalty chosen on the most recent training season, never on the test one.
        const valid = [...new Set(train.map(r => r.season))].sort().slice(-1)[0];
        let best = LAMBDAS[0], bestLoss = Infinity;
        for (const lambda of LAMBDAS) {
            const lm = fitLogistic(train.filter(r => r.season !== valid), lambda, line);
            let loss = 0, cnt = 0;
            for (const r of train.filter(r => r.season === valid)) {
                const pr = Math.min(Math.max(applyLogistic(lm, r.x), 1e-9), 1 - 1e-9);
                loss -= (r.y > line) ? Math.log(pr) : Math.log(1 - pr);
                cnt++;
            }
            if (cnt && loss / cnt < bestLoss) { bestLoss = loss / cnt; best = lambda; }
        }
        const model = fitLogistic(train, best, line);
        const baseRate = train.filter(r => r.y > line).length / train.length;

        for (const r of test) {
            const isOver = r.y > line;
            const p = Math.min(Math.max(applyLogistic(model, r.x), 1e-9), 1 - 1e-9);
            const q = devig(r.over, r.under);
            mLL -= isOver ? Math.log(p) : Math.log(1 - p);
            kLL -= isOver ? Math.log(q) : Math.log(1 - q);
            bLL -= isOver ? Math.log(baseRate) : Math.log(1 - baseRate);
            overround += 1 / r.over + 1 / r.under - 1;
            n++;

            for (const threshold of [0, 0.02, 0.05]) {
                const cell = (staked[threshold] ??= { bets: 0, profit: 0 });
                for (const [sel, prob, price] of [['over', p, r.over], ['under', 1 - p, r.under]]) {
                    if (prob * (price - 1) - (1 - prob) > threshold) {
                        cell.bets++;
                        cell.profit += ((sel === 'over') === isOver) ? price - 1 : -1;
                    }
                }
            }
        }
    }

    console.log(`\n== Against the closing price ==`);
    console.log(`${n} held-out matches with a price, mean overround ${(100 * overround / n).toFixed(2)}%\n`);
    console.log(`  ${'model'.padEnd(24)}${'log loss'.padStart(10)}`);
    console.log(`  ${'market (de-vigged)'.padEnd(24)}${(kLL / n).toFixed(4).padStart(10)}`);
    console.log(`  ${'multivariate logistic'.padEnd(24)}${(mLL / n).toFixed(4).padStart(10)}`);
    console.log(`  ${'base rate'.padEnd(24)}${(bLL / n).toFixed(4).padStart(10)}`);
    console.log(`\n  ${'bet when EV >'.padEnd(16)}${'bets'.padStart(8)}${'ROI'.padStart(9)}`);
    for (const [threshold, c] of Object.entries(staked)) {
        console.log(`  ${threshold.padEnd(16)}${String(c.bets).padStart(8)}` +
                    `${(c.bets ? (100 * c.profit / c.bets).toFixed(1) + '%' : '-').padStart(9)}`);
    }
}

console.log(`${data.length} matches | features: ${FEATURES.length} implied totals + league mean`);
for (const t of TARGETS) {
    const configured = createPredictionModel(t);
    if (!AVAILABLE.has(configured.predictor)) {
        console.log(`  note: ${t} normally predicts from ${configured.predictor}, absent here - ` +
                    `baseline falls back to ${t} at w=1`);
    }
}
const only = process.argv[2];
if (only === 'market') market();
else if (only === 'counts') counts();
else if (only === 'perleague') perLeague();
else {
    for (const t of TARGETS) run(t);
    counts();
    market();
}

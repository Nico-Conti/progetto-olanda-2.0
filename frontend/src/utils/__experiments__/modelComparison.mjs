/**
 * How well does the prediction model actually work?
 *
 * Every report below walks each league forward in time, predicting each match from only
 * the matches played before it, so there is no lookahead. They import the app's real
 * `calculatePrediction` rather than a copy, so the numbers describe the shipped model.
 *
 *   node modelComparison.mjs           # all reports
 *   node modelComparison.mjs blend     # just one
 *
 * Data comes from dumpSeason.py (writes data.json next to this file).
 * Results are written up in docs/prediction-model.md.
 */
import fs from 'fs';
import {
    calculatePrediction,
    calculateLeagueAverages,
    getAvg,
    getMedian,
} from '../stats.js';
import {
    createStatsAccumulator,
    addMatchToStats,
    sortMatchesChronologically,
} from '../backtestEngine.js';
import { VOLATILE_STATS, STAT_CONFIG } from '../statistics.js';

// DATA_FILE points this at the football-data dump (./data_fd.json) instead of
// our scraped season, same as decayComparison.mjs.
const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py first (see README.md).`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));

const STATS = ['corners', 'goals', 'shots', 'fouls', 'yellow_cards'];
const N_LEAGUES = new Set(data.map(m => m.league)).size;
const aggFor = (stat) => (VOLATILE_STATS.includes(stat) ? getMedian : getAvg);
const lineFor = (stat) => STAT_CONFIG[stat]?.total?.default ?? 0;
const pct = (x) => `${(100 * x).toFixed(1)}%`;

/**
 * Walk one statistic forward through every league.
 *
 * `onMatch({ pred, actual, leagueMean, acc, home, away, league, giornata })` is called for
 * each match that has enough history to predict, before that match is folded into the
 * accumulator.
 */
function walk(stat, nGames, onMatch) {
    const agg = aggFor(stat);
    const byLeague = {};
    for (const m of sortMatchesChronologically(data, stat)) {
        (byLeague[m.league] ??= []).push(m);
    }

    for (const [league, rows] of Object.entries(byLeague)) {
        const acc = createStatsAccumulator();
        const pastTotals = [];

        for (const match of rows) {
            const s = match.stats?.[stat];
            const actual = s ? Number(s.home) + Number(s.away) : null;
            const home = match.squadre.home;
            const away = match.squadre.away;

            // Needs both sides seen before, and enough league history for a mean.
            if (actual !== null && acc[home] && acc[away] && pastTotals.length > 3) {
                const p = calculatePrediction(home, away, acc, nGames, false, false, stat, null);
                if (p && p.total > 0) {
                    onMatch({
                        pred: p.total, actual, leagueMean: agg(pastTotals),
                        acc, home, away, league, giornata: match.giornata,
                    });
                }
            }

            addMatchToStats(acc, match, stat);
            if (actual !== null) pastTotals.push(actual);
        }
    }
}

// --- blend: how much weight should the two-team model get? ------------------
const WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);

function blend() {
    console.log('\n== Blend weight ==');
    console.log('pred = w * (two-team model) + (1-w) * (league mean).');
    console.log('w=0 ignores the teams entirely; w=1 is the shipped model.\n');
    console.log(`${'stat'.padEnd(14)}${'N'.padEnd(5)}${WEIGHTS.map(w => `w=${w}`.padStart(7)).join('')}   best`);

    for (const stat of STATS) {
        for (const n of [5, 'all']) {
            const err = WEIGHTS.map(() => ({ ae: 0, n: 0 }));
            walk(stat, n, ({ pred, actual, leagueMean }) => {
                WEIGHTS.forEach((w, i) => {
                    err[i].ae += Math.abs(w * pred + (1 - w) * leagueMean - actual);
                    err[i].n++;
                });
            });
            const maes = err.map(e => e.ae / e.n);
            const best = WEIGHTS[maes.indexOf(Math.min(...maes))];
            console.log(
                `${stat.padEnd(14)}${String(n).padEnd(5)}` +
                maes.map(m => m.toFixed(3).padStart(7)).join('') + `   w=${best}`
            );
        }
    }
}

// --- holdout: does that weight survive out-of-sample? -----------------------
function holdout() {
    console.log('\n== Leave-one-league-out ==');
    console.log(`Weight fitted on ${N_LEAGUES - 1} leagues, scored on the remaining one.\n`);
    console.log(`${'stat'.padEnd(14)}${'fitted w'.padEnd(26)}${'MAE w=1'.padStart(9)}${'MAE oos'.padStart(9)}${'gain'.padStart(8)}`);

    for (const stat of STATS) {
        const per = {};
        walk(stat, 5, ({ pred, actual, leagueMean, league }) => {
            per[league] ??= WEIGHTS.map(() => ({ ae: 0, n: 0 }));
            WEIGHTS.forEach((w, i) => {
                per[league][i].ae += Math.abs(w * pred + (1 - w) * leagueMean - actual);
                per[league][i].n++;
            });
        });

        const leagues = Object.keys(per);
        let oosAE = 0, oosN = 0, curAE = 0, curN = 0;
        const chosen = new Set();
        for (const test of leagues) {
            const totals = WEIGHTS.map((_, i) =>
                leagues.filter(l => l !== test).reduce((s, l) => s + per[l][i].ae, 0));
            const bi = totals.indexOf(Math.min(...totals));
            chosen.add(WEIGHTS[bi]);
            oosAE += per[test][bi].ae; oosN += per[test][bi].n;
            const last = WEIGHTS.length - 1;
            curAE += per[test][last].ae; curN += per[test][last].n;
        }
        const oos = oosAE / oosN, cur = curAE / curN;
        console.log(
            `${stat.padEnd(14)}${[...chosen].sort((a, b) => a - b).join(', ').padEnd(26)}` +
            `${cur.toFixed(3).padStart(9)}${oos.toFixed(3).padStart(9)}` +
            `${((cur - oos) / cur * 100).toFixed(1).padStart(7)}%`
        );
    }
}

// --- rank: do the top-ranked "hot" matches actually score higher? -----------
function rank() {
    console.log('\n== Hot Matches ranking ==');
    console.log('Top 3 by predicted total per matchday vs that round\'s average.\n');
    console.log(`${'stat'.padEnd(14)}${'top3 actual'.padStart(13)}${'round avg'.padStart(11)}${'lift'.padStart(8)}`);

    for (const stat of STATS) {
        const rounds = {};
        walk(stat, 5, ({ pred, actual, league, giornata }) => {
            (rounds[`${league}|${giornata}`] ??= []).push({ pred, actual });
        });

        let topSum = 0, topN = 0, allSum = 0, allN = 0;
        for (const cands of Object.values(rounds)) {
            if (cands.length < 5) continue;
            const sorted = [...cands].sort((a, b) => b.pred - a.pred);
            for (const c of sorted.slice(0, 3)) { topSum += c.actual; topN++; }
            for (const c of cands) { allSum += c.actual; allN++; }
        }
        const top = topSum / topN, all = allSum / allN;
        console.log(
            `${stat.padEnd(14)}${top.toFixed(2).padStart(13)}${all.toFixed(2).padStart(11)}` +
            `${((top - all) >= 0 ? '+' : '') + (top - all).toFixed(2).padStart(7)}`
        );
    }
}

// --- ou / margin: does the model call over/under better than the base rate? --
const MARGINS = [0, 0.5, 1, 1.5, 2, 3];

function margin() {
    console.log('\n== Over/under calls at a fixed line ==');
    console.log('Only call when |prediction - line| >= margin. "base" = always picking the');
    console.log('majority side. Cells show accuracy / how many matches pass the filter.\n');
    console.log(`${'stat @ line'.padEnd(22)}${'base'.padStart(7)}  ${MARGINS.map(m => `m=${m}`.padStart(14)).join('')}`);

    for (const stat of STATS) {
        const line = lineFor(stat);
        const cells = MARGINS.map(() => ({ ok: 0, n: 0 }));
        let over = 0, total = 0;

        walk(stat, 5, ({ pred, actual }) => {
            const isOver = actual > line;
            total++; if (isOver) over++;
            MARGINS.forEach((m, i) => {
                if (Math.abs(pred - line) >= m) {
                    cells[i].n++;
                    if ((pred > line) === isOver) cells[i].ok++;
                }
            });
        });

        const base = Math.max(over / total, 1 - over / total);
        const rendered = cells.map(c => (c.n ? `${pct(c.ok / c.n)}/${c.n}` : '-').padStart(14));
        console.log(`${`${stat} @ ${line}`.padEnd(22)}${pct(base).padStart(7)}  ${rendered.join('')}`);
    }
}

const REPORTS = { blend, holdout, rank, ou: margin, margin };
const requested = process.argv[2];
if (requested && !REPORTS[requested]) {
    console.error(`Unknown report "${requested}". Available: ${Object.keys(REPORTS).join(', ')}`);
    process.exit(1);
}
console.log(`${data.length} matches | ${N_LEAGUES} leagues | season ${data[0]?.season}`);
for (const [name, fn] of Object.entries(REPORTS)) {
    if (name === 'ou') continue; // alias of margin
    if (!requested || requested === name || (requested === 'ou' && name === 'margin')) fn();
}

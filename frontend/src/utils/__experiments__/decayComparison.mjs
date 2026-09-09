/**
 * Should recency be a window or a slope, and does carrying seasons over help?
 *
 * NOTE: decay WON this comparison and now ships. The window rows below are the
 * pre-decay baseline, kept so the gain stays attributable - they are not what
 * the app does. Re-running this refits HALF_LIFE_DAYS; it does not re-argue
 * window-vs-decay.
 *
 * The old estimator averaged a team's last five matches equally: match five
 * counted fully, match six counted nothing. It also never saw the previous
 * season, because every caller filtered history to the current one. The result
 * was visible every August - on 2026-08-22, five of nine leagues had no
 * predictions at all and 65% of upcoming fixtures showed a dash.
 *
 * Exponential decay replaces the cliff with a slope and lets last season's
 * matches carry a small weight, which fixes the cold start as a side effect.
 * This measures what that costs or gains once the season is running, and how
 * much it recovers at the start of one.
 *
 *   DATA_FILE=./data_fd.json node decayComparison.mjs
 */
import fs from 'fs';
import {
    buildPredictionModel, createPredictionModel,
    addMatchToPredictionModel, predictFromModel,
} from '../predictTotal.js';
import { STAT_CONFIG, HALF_LIFE_DAYS } from '../statistics.js';

const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));

const AVAILABLE = (() => {
    const counts = {};
    for (const m of data) for (const k of Object.keys(m.stats ?? {})) counts[k] = (counts[k] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(k => counts[k] > data.length / 2));
})();
const TARGETS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards'].filter(s => AVAILABLE.has(s));
const HALF_LIVES = [30, 60, 90, 120, 180, 365, 730];
const totalOf = (m, s) => {
    const x = m.stats?.[s];
    return x ? Number(x.home) + Number(x.away) : null;
};

/**
 * Three estimators, so the gain can be attributed rather than just observed:
 *
 *   window-reset  the pre-decay baseline - last 5 matches, history wiped each August
 *   window-carry  last 5 matches, but carried across the summer
 *   decay         exponential recency weighting, carried across the summer
 *
 * window-carry exists because calculatePrediction sorts a team's history by
 * `giornata`, which restarts every season. Fed two seasons it would rank
 * matchday 38 of last year above matchday 37 of this one and silently pick the
 * wrong five matches. Renumbering giornata as a running counter makes that sort
 * chronological again, which isolates carryover from decay instead of letting a
 * broken baseline flatter the decay numbers.
 */
const MODES = [
    { key: 'window-reset', label: 'last 5, per season (pre-decay)', reset: true },
    { key: 'window-carry', label: 'last 5, carried over', reset: false },
    ...HALF_LIVES.map(hl => ({ key: `decay-${hl}`, label: `decay ${hl}d, carried over`, halfLife: hl })),
];

function walkLeague(target, mode, onMatch) {
    const byLeague = {};
    for (const m of data) {
        if (totalOf(m, target) === null || !m.date) continue;
        (byLeague[m.league] ??= []).push(m);
    }

    for (const rows of Object.values(byLeague)) {
        rows.sort((a, b) => new Date(a.date) - new Date(b.date));
        let model = null, season = null, counter = 0;

        for (const m of rows) {
            if (!model || (mode.reset && m.season !== season)) {
                model = createPredictionModel(target, { halfLifeDays: mode.halfLife ?? null });
                // A statistic configured to predict from a column this dataset
                // lacks - goals from box touches - falls back to itself, or the
                // model never warms up and every prediction is null.
                if (!AVAILABLE.has(model.predictor)) { model.predictor = target; model.weight = 1; }
                season = m.season;
            }
            const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
                nGames: 5, asOf: m.date,
            });
            onMatch(m, p);
            // Renumber only when carrying a window across seasons; the decay
            // path reads dates and does not care.
            addMatchToPredictionModel(model, mode.reset ? m : { ...m, giornata: ++counter });
        }
    }
}

// --- 1. accuracy and coverage, by half-life ---------------------------------

console.log(`${data.length} matches | targets: ${TARGETS.join(', ')}\n`);
console.log('== Fixed window vs exponential decay ==');
console.log('Every league walked forward across all its seasons, so form crosses the summer.');
console.log('"covered" is the share of matches the model could predict at all.\n');

const best = {};
for (const target of TARGETS) {
    const line = STAT_CONFIG[target].total.default;
    console.log(`${target} @ ${line}`);
    console.log(`  ${'estimator'.padEnd(22)}${'covered'.padStart(9)}${'accuracy'.padStart(10)}${'MAE'.padStart(9)}`);

    const score = (mode) => {
        // Mark the half-life the app actually runs, so a winner one rung away
        // reads as "this curve is flat" rather than "change the app".
        const label = mode.label +
            (mode.halfLife === HALF_LIFE_DAYS[target] ? '  <- shipped' : '');
        let ok = 0, n = 0, seen = 0, ae = 0;
        walkLeague(target, mode, (m, p) => {
            seen++;
            if (!p || !(p.total > 0)) return;
            const actual = totalOf(m, target);
            n++;
            ae += Math.abs(p.total - actual);
            if ((p.total > line) === (actual > line)) ok++;
        });
        const acc = n ? ok / n : 0;
        console.log(`  ${label.padEnd(22)}${(100 * n / seen).toFixed(1).padStart(8)}%` +
                    `${(100 * acc).toFixed(1).padStart(9)}%${(ae / n).toFixed(3).padStart(9)}`);
        return { acc, n, mae: ae / n };
    };

    let baseline = null, carry = null, winner = null;
    const byHalfLife = {};
    for (const mode of MODES) {
        const r = score(mode);
        if (mode.key === 'window-reset') baseline = r;
        if (mode.key === 'window-carry') carry = r;
        if (mode.halfLife) byHalfLife[mode.halfLife] = r;
        if (mode.halfLife && (!winner || r.acc > winner.acc)) winner = { mode, ...r };
    }
    best[target] = winner;
    const pp = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}pp`;
    const shipped = HALF_LIFE_DAYS[target];
    console.log(`  -> carryover alone ${pp(carry.acc - baseline.acc)}; ` +
                `best decay ${winner.mode.halfLife}d ${pp(winner.acc - baseline.acc)} ` +
                `(${pp(winner.acc - carry.acc)} beyond carryover)` +
                (winner.mode.halfLife === shipped ? '; shipped value wins'
                    : byHalfLife[shipped]
                        ? `; shipped ${shipped}d costs ${pp(winner.acc - byHalfLife[shipped].acc)}`
                        : `; shipped ${shipped}d not in the sweep`) + '\n');
}

// --- 2. the cold start: what happens in the opening weeks --------------------

console.log('== Opening weeks of a season ==');
console.log('Matches in the first 30 days of each season - where the app currently shows dashes.\n');
console.log(`${'target'.padEnd(14)}${'window covered'.padStart(16)}${'decay covered'.padStart(15)}` +
            `${'window acc'.padStart(12)}${'decay acc'.padStart(11)}`);

for (const target of TARGETS) {
    const line = STAT_CONFIG[target].total.default;
    const seasonStart = {};
    for (const m of data) {
        const k = `${m.league}|${m.season}`;
        const t = new Date(m.date).getTime();
        if (!seasonStart[k] || t < seasonStart[k]) seasonStart[k] = t;
    }
    const isEarly = (m) =>
        new Date(m.date).getTime() - seasonStart[`${m.league}|${m.season}`] < 30 * 86400000;

    const measure = (mode) => {
        let ok = 0, n = 0, seen = 0;
        walkLeague(target, mode, (m, p) => {
            if (!isEarly(m)) return;
            seen++;
            if (!p || !(p.total > 0)) return;
            n++;
            if ((p.total > line) === (totalOf(m, target) > line)) ok++;
        });
        return { cover: seen ? n / seen : 0, acc: n ? ok / n : 0, n };
    };

    const w = measure(MODES[0]), d = measure(best[target].mode);
    console.log(`${target.padEnd(14)}${(100 * w.cover).toFixed(1).padStart(15)}%` +
                `${(100 * d.cover).toFixed(1).padStart(14)}%` +
                `${(100 * w.acc).toFixed(1).padStart(11)}%${(100 * d.acc).toFixed(1).padStart(10)}%`);
}

/**
 * What shrinkage was NOT allowed to move.
 *
 * `PROB_SHRINK` (predictTotal.js) pulls the total toward the league mean before
 * the probability is read off it, for corners and yellow cards only. That fixed
 * a real defect - see prediction-model.md section 18 - but it sits in the middle
 * of the prediction path, and three properties around it must survive untouched:
 *
 *   1. the count engine still returns classic's central prediction, exactly
 *   2. the shrink applies to the statistics in PROB_SHRINK and to no others
 *   3. ordering by P(over) still equals ordering by expected total
 *
 * Runs in seconds against data.json, where `calibration.mjs` takes ~20 minutes -
 * so this is the check to run while changing the probability path, and the
 * calibration sweep is the one to run once at the end.
 *
 *   node probabilityInvariants.mjs
 *   DATA_FILE=./data_fd.json node probabilityInvariants.mjs
 *
 * Exits non-zero on any failure.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
    dispersionFor, ENGINES, PROB_SHRINK,
} from '../predictTotal.js';
import { STAT_CONFIG } from '../statistics.js';
import { probOver } from '../countModel.js';

const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py first.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));
const matches = data.filter(m => m.date).sort((a, b) => new Date(a.date) - new Date(b.date));

const STATS = ['corners', 'goals', 'fouls', 'shots', 'yellow_cards'];

/**
 * The weights section 18 actually validated, held OUTSIDE PROB_SHRINK on purpose.
 *
 * Deriving this from PROB_SHRINK would make the test agree with whatever the map
 * says - it would pass just as happily with goals shrunk at 0.5, which nothing
 * measured and which the holdout rejected for shots. Adding a statistic here
 * without re-running calibration.mjs is exactly the mistake worth failing on.
 */
const MEASURED = { corners: 0.3, yellow_cards: 0.5 };
const lineFor = (stat) => {
    const cfg = STAT_CONFIG[stat]?.total;
    return cfg?.default ?? cfg?.options?.[Math.floor((cfg?.options?.length ?? 1) / 2)];
};

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`  FAIL ${msg}`); } };

const fmt = (m) => Object.entries(m).map(([k, w]) => `${k}@${w}`).sort().join(', ') || 'nothing';
console.log(`${matches.length} matches | ships: ${fmt(PROB_SHRINK)} | measured: ${fmt(MEASURED)}\n`);

// 0. The shipped map is the measured map. A weight that drifted, or a statistic
// added to PROB_SHRINK without a holdout behind it, fails here before anything
// else is checked.
check(fmt(PROB_SHRINK) === fmt(MEASURED),
    `PROB_SHRINK is ${fmt(PROB_SHRINK)}, section 18 measured ${fmt(MEASURED)}`);

for (const stat of STATS) {
    const line = lineFor(stat);
    if (line == null) { console.log(`${stat}: no configured line, skipped`); continue; }

    const model = createPredictionModel(stat, { trackResiduals: true });
    for (const m of matches) addMatchToPredictionModel(model, m);
    const r = dispersionFor(model);

    // A spread of real matchups rather than every pair: the properties are
    // structural, so a few hundred exercise them as well as tens of thousands.
    const teams = [...new Set(matches.flatMap(m => [m.squadre?.home, m.squadre?.away]))].filter(Boolean);
    const pairs = [];
    for (let i = 0; i < teams.length && pairs.length < 400; i++)
        for (let j = i + 1; j < teams.length && pairs.length < 400; j += 7)
            pairs.push([teams[i], teams[j]]);

    const rows = [];
    for (const [h, a] of pairs) {
        const classic = predictFromModel(model, h, a, { engine: ENGINES.CLASSIC });
        const count = predictFromModel(model, h, a, { engine: ENGINES.COUNT });
        if (!classic || !count || !(classic.total > 0)) continue;

        // 1. Switching engines must not move the forecast, only what can be asked
        // of it. Exact equality: classic is the measured baseline every finding in
        // prediction-model.md is stated against.
        check(classic.total === count.total, `${stat}: total moved, ${classic.total} vs ${count.total}`);
        check(classic.expHome === count.expHome, `${stat}: expHome moved`);
        check(classic.expAway === count.expAway, `${stat}: expAway moved`);
        rows.push({ total: count.total, p: count.probOver(line) });
    }
    if (!rows.length) { console.log(`${stat}: no usable matchups`); continue; }

    // 2. Priced off the unshrunk total for everything outside PROB_SHRINK. Both
    // directions matter: a leak silently changes statistics nothing measured
    // (shots got WORSE under shrinkage out of sample), and a shrink that does not
    // apply leaves corners broken while the docs say it is fixed.
    const shrunk = MEASURED[stat] != null;
    const identical = rows.every(x => x.p === probOver(x.total, line, r));
    check(identical !== shrunk, `${stat}: expected shrink=${shrunk}, got identical=${identical}`);

    // 3. One dispersion is shared by every match, so probOver is monotone in the
    // total and a P(over) ranking is the same ranking as expected total - the
    // standing "do not add a rank by P(over) mode" note rests on this.
    //
    // Compared with a tolerance, NOT exactly: two totals equal to 13 decimal
    // places and not to 16 give probabilities differing by ~3e-15, which an exact
    // comparison reports as a reordering in statistics that are not even shrunk.
    // probOver itself was checked monotone on a 0.01 grid before this was loosened.
    const sorted = [...rows].sort((a, b) => a.total - b.total);
    let inversions = 0;
    for (let i = 1; i < sorted.length; i++)
        if (sorted[i].p < sorted[i - 1].p - 1e-9) inversions++;
    check(inversions === 0, `${stat}: P(over) reordered vs expected total, ${inversions} inversions`);

    console.log(`${stat.padEnd(13)} n=${String(rows.length).padStart(4)}  line ${String(line).padStart(5)}` +
        `  shrunk=${shrunk ? `w=${MEASURED[stat]}` : 'no  '}  dispersion=${r}` +
        `  ordering=${inversions === 0 ? 'same' : `${inversions} MOVED`}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall invariants hold');
process.exit(failures ? 1 : 0);

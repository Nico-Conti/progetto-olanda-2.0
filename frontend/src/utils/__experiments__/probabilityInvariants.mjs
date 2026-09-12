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
 * `MEAN_BIAS` (section 26) also moves the centre for fouls, shots and goals - but
 * it moves `prediction.total` ITSELF, not just the number the probability is read
 * off. So it does NOT break property 2: those three still price off their own
 * total exactly. What has to hold instead is that the correction is applied to
 * exactly those three and to nothing else, which is property 4 below.
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
    dispersionFor, ENGINES, PROB_SHRINK, MEAN_BIAS, isMeasured,
} from '../predictTotal.js';
import { STAT_CONFIG, STAT_SIGNAL } from '../statistics.js';
import { probOver } from '../countModel.js';
import { getAvg, getMedian } from '../stats.js';

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

/**
 * The statistics `biasCorrection.mjs` validated a centre correction for, held
 * outside MEAN_BIAS for the same reason MEASURED is held outside PROB_SHRINK.
 *
 * corners and yellow_cards are NOT here and must not be added: correcting them
 * scored worse than leaving them alone at all three chronological splits.
 */
const BIAS_MEASURED = ['fouls', 'shots', 'goals'];

/**
 * The statistics entitled to a signal badge, and therefore to EV ranking -
 * `isMeasured` is `HALF_LIFE_DAYS[k] != null && STAT_SIGNAL[k] != null`.
 *
 * `card_points` is NOT here and adding it back needs docs section 28 read first.
 * It was admitted at edge +5.2pp and withdrawn hours later: the figure
 * reproduces exactly and is an artefact of which leagues had been rescraped
 * since migration 005, and on the widened sample it is -2.5pp at the same line
 * and -19.4% ROI against real prices. It has a fitted half-life, so the ONLY
 * thing keeping it out of EV ranking is its absence from STAT_SIGNAL.
 */
const SIGNAL_MEASURED = ['corners', 'fouls', 'goals', 'shots', 'yellow_cards'];
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

// 0b. Same for the centre correction.
const sortJoin = (xs) => [...xs].sort().join(', ');
check(sortJoin(MEAN_BIAS) === sortJoin(BIAS_MEASURED),
    `MEAN_BIAS is [${sortJoin(MEAN_BIAS)}], section 26 measured [${sortJoin(BIAS_MEASURED)}]`);

// 0c. And for the badges, which gate EV ranking through isMeasured.
check(sortJoin(Object.keys(STAT_SIGNAL)) === sortJoin(SIGNAL_MEASURED),
    `STAT_SIGNAL is [${sortJoin(Object.keys(STAT_SIGNAL))}], sections 27-28 measured ` +
    `[${sortJoin(SIGNAL_MEASURED)}]`);
for (const stat of SIGNAL_MEASURED)
    check(isMeasured(stat), `${stat} has a badge but does not pass isMeasured`);
check(!isMeasured('card_points'),
    'card_points passes isMeasured - it has a half-life, so a STAT_SIGNAL entry puts it ' +
    'straight back into EV ranking at -19.4% ROI (docs section 28)');

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
        rows.push({ total: count.total, p: count.probOver(line), bias: count.meanBias ?? 0,
                    classicBias: classic.meanBias ?? 0 });
    }
    if (!rows.length) { console.log(`${stat}: no usable matchups`); continue; }

    // 1b. The incrementally maintained aggregates must equal the batch ones.
    // `leagueAggregate` keeps a running sum and a sorted mirror of pastTargets
    // rather than re-sorting per fold (that cost 9.2s on corners). Cheaper is
    // only worth having if it is the same number.
    const n = model.pastTargets.length;
    check(model.sortedTargets.length === n, `${stat}: sorted mirror out of step (${model.sortedTargets.length} vs ${n})`);
    check(Math.abs(model.pastTargetSum / n - getAvg(model.pastTargets)) < 1e-9,
        `${stat}: running mean drifted from getAvg`);
    const mid = n >> 1;
    const incrementalMedian = n % 2 !== 0
        ? model.sortedTargets[mid]
        : (model.sortedTargets[mid - 1] + model.sortedTargets[mid]) / 2;
    check(incrementalMedian === getMedian(model.pastTargets),
        `${stat}: incremental median ${incrementalMedian} != getMedian ${getMedian(model.pastTargets)}`);

    // 2. Priced off the unshrunk total for everything outside PROB_SHRINK. Both
    // directions matter: a leak silently changes statistics nothing measured
    // (shots got WORSE under shrinkage out of sample), and a shrink that does not
    // apply leaves corners broken while the docs say it is fixed.
    const shrunk = MEASURED[stat] != null;
    const identical = rows.every(x => x.p === probOver(x.total, line, r));
    check(identical !== shrunk, `${stat}: expected shrink=${shrunk}, got identical=${identical}`);

    // 4. The centre correction lands on exactly the statistics it was measured
    // for. Both directions: a leak moves a statistic nothing validated, and a
    // correction that silently stops applying leaves the section 18 offsets in
    // place while the docs say they are fixed.
    const biased = BIAS_MEASURED.includes(stat);
    check(rows.every(x => (x.bias !== 0) === biased),
        `${stat}: expected mean-bias applied=${biased}, got ${rows.filter(x => x.bias !== 0).length}/${rows.length} corrected`);
    // 4b. It is applied to the ESTIMATE, so the classic engine carries it too -
    // otherwise the two engines would disagree on the central prediction, which
    // property 1 already forbids but for a reason worth stating separately.
    check(rows.every(x => x.classicBias === x.bias),
        `${stat}: classic and count disagree on the correction`);

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

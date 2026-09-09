/**
 * The fabricated zero, and the line between "missing" and "genuinely 0-0".
 *
 * `match.stats?.[key] || { home: 0, away: 0 }` read a match with no statistics
 * as a real 0-0 observation. It is a one-sided error, so it surfaces as an edge
 * rather than as noise - the +74.7% expected value in section 3 of
 * prediction-model.md came from the same family of bug.
 *
 * Kept inert for a long time only because the scraped data happened to be clean.
 * It stops being inert the moment stat-partial rows arrive in bulk, which is
 * exactly what a football-data CSV import or `season_importer --insert-missing`
 * would write.
 *
 * The opposite mistake matters just as much: red cards are a genuine 0-0 in 84%
 * of matches, and skipping those would delete most of the data.
 *
 *   node fabricatedZero.mjs
 */
import assert from 'assert';
import { statPair } from '../statistics.js';
import { processData, calculatePrediction } from '../stats.js';
import { addMatchToStats } from '../backtestEngine.js';

const match = (home, away, stats, giornata = 1) => ({
    squadre: { home, away }, giornata, season: '2025/2026',
    date: `2026-01-0${giornata}`, stats,
});

// --- statPair itself ---------------------------------------------------------
assert.strictEqual(statPair(match('a', 'b', {}), 'corners'), null, 'key absent');
assert.strictEqual(statPair(match('a', 'b', { corners: null }), 'corners'), null, 'null object');
assert.strictEqual(statPair(match('a', 'b', { corners: { home: null, away: null } }), 'corners'),
    null, 'null values - survives truthiness, and Number(null) is a finite 0');
assert.strictEqual(statPair(match('a', 'b', { corners: { home: 'x', away: 2 } }), 'corners'),
    null, 'non-numeric');
assert.strictEqual(statPair({}, 'corners'), null, 'no stats object at all');

// A real 0-0 is DATA, not a gap. Red cards are 0-0 in 84% of matches.
assert.deepStrictEqual(statPair(match('a', 'b', { red_cards: { home: 0, away: 0 } }), 'red_cards'),
    { home: 0, away: 0, total: 0 }, 'a genuine 0-0 must survive');
assert.deepStrictEqual(statPair(match('a', 'b', { corners: { home: '6', away: 4 } }), 'corners'),
    { home: 6, away: 4, total: 10 }, 'numeric strings are values');

// --- processData: the documented failure ------------------------------------
// One real 10-corner match plus two stat-less rows used to give a mean of 3.33.
const history = [
    match('Ajax', 'PSV', { corners: { home: 6, away: 4 } }, 3),
    match('Ajax', 'Feyenoord', {}, 2),
    match('Ajax', 'Twente', { corners: { home: null, away: null } }, 1),
];
const stats = processData(history, 'corners');
assert.deepStrictEqual(stats.Ajax.home_totals, [10],
    `stat-less rows entered as observations: ${JSON.stringify(stats.Ajax.home_totals)}`);
assert.strictEqual(stats.Ajax.all_matches.length, 1, 'stat-less rows entered the match list');

// --- addMatchToStats: the same shape, the same guard ------------------------
const acc = {};
for (const m of history) addMatchToStats(acc, m, 'corners');
assert.deepStrictEqual(acc.Ajax.home_totals, [10], 'accumulator fabricated a zero');
assert.deepStrictEqual(acc.Ajax.home_totals, stats.Ajax.home_totals,
    'the two accumulators disagree - they are meant to be interchangeable');

// --- no usable history must stay null, not become a confident 0 -------------
const blind = processData([match('Ajax', 'PSV', {}, 1), match('Ajax', 'Twente', {}, 2)], 'corners');
assert.strictEqual(calculatePrediction(blind, 'Ajax', 'PSV', 5, false, false), null,
    'a model with nothing but stat-less rows returned a number');

console.log('fabricated zero: all guards hold');

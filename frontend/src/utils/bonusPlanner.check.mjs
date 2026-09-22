// node src/utils/bonusPlanner.check.mjs
import assert from 'node:assert/strict';
import { planSlips } from './bonusPlanner.js';

const now = new Date('2026-09-18T10:00:00');
const row = (home, market, line, selection, price, when = '2026-09-18T20:45:00') => ({
    league: 'L', home_team: home, away_team: `${home}B`, match_date: when, market, line, selection, price,
});
const rows = [
    row('A', 'total_goals', 2.5, 'over', 1.6), row('A', 'total_goals', 2.5, 'under', 2.3),
    row('A', 'total_goals', 1.5, 'over', 1.2), row('A', 'total_goals', 1.5, 'under', 4.5),
    row('B', 'total_corners', 8.5, 'over', 1.55), row('B', 'total_corners', 8.5, 'under', 2.35),
    row('C', 'gg_ng', null, 'gg', 1.9), row('C', 'gg_ng', null, 'ng', 1.85),
    row('D', 'total_goals', 2.5, 'over', 1.5, '2026-09-19T15:00:00'), row('D', 'total_goals', 2.5, 'under', 2.5, '2026-09-19T15:00:00'),
    row('E', 'total_goals', 2.5, 'over', 1.5, '2026-09-18T09:00:00'), // already kicked off
    row('F', 'combo_1x_ggng', null, 'gg', 1.5),                     // market not allowed
    row('C', 'gg_ng', null, 'gg', 1.9),                             // served twice
];
const markets = ['total_goals', 'total_corners', 'gg_ng'];

const all = planSlips(rows, { events: 2, minOdds: 1.5, sameDay: false, markets, now });
assert.equal(all.eligible, 4); // A, B, C, D - not E (started), not F (combo)
assert.equal(all.slips.length, 2);
// Every side at 1.50 or more is listed, once: A x3, B x2, C x2 (the duplicate gg folded), D x2.
assert.equal(all.legs.length, 9);
assert.ok(all.legs.every((l, i) => i === 0 || all.legs[i - 1].prob >= l.prob));
// Highest devigged chance first: D over 2.5 (0.625), B over 8.5 (0.603), then A (0.590); 1.20 is under the minimum.
assert.deepEqual(all.slips[0].legs.map(l => l.home_team).sort(), ['B', 'D']);
assert.ok(all.slips[0].legs.every(l => l.price >= 1.5));
assert.ok(Math.abs(all.slips[0].odds - 1.5 * 1.55) < 1e-9);

const today = planSlips(rows, { events: 2, minOdds: 1.5, sameDay: true, markets, now });
assert.equal(today.eligible, 3); // D is tomorrow

const c = planSlips(rows, { events: 4, minOdds: 1.5, sameDay: false, markets, now }).slips[0].legs.find(l => l.home_team === 'C');
assert.ok(Math.abs(c.prob - (1 / 1.85) / (1 / 1.9 + 1 / 1.85)) < 1e-9); // duplicate row not double-counted
assert.equal(planSlips(rows, { events: 5, minOdds: 1.5, sameDay: false, markets, now }).slips.length, 0);
// The model overrides the book where it has a number: B's corners at 80% now lead.
const withModel = planSlips(rows, { events: 1, minOdds: 1.5, sameDay: false, markets, now,
    modelProb: (r) => (r.market === 'total_corners' && r.selection === 'over' ? 0.8 : null) });
assert.equal(withModel.slips[0].legs[0].home_team, 'B');
assert.equal(withModel.slips[0].legs[0].model, 0.8);
console.log('bonusPlanner ok');

// node src/utils/recap.check.mjs
import assert from 'node:assert/strict';
import { settleSlip } from './settle.js';
import { recapLeg, recapSlip, flipDistance, bandOf } from './recap.js';
import { settleLeg, WON, LOST, VOID } from './settle.js';

const match = (stats) => ({ squadre: { home: 'Milan', away: 'Roma' }, date: '2026-09-12T18:00:00Z', stats });
const corners = (h, a) => match({ corners: { home: h, away: a }, goals: { home: 1, away: 1 } });
const score = (h, a) => match({ goals: { home: h, away: a } });
const leg = (o) => ({ game: 'Milan vs Roma', date: '2026-09-12T18:00:00Z', team: 'total', ...o });
const recap = (l, m) => recapLeg({ leg: l, match: m, status: settleLeg(l, m) });

// Over 9.5 corners, 9 happened: lost, one short.
let r = recap(leg({ stat: 'corners', option: 'O', value: 9.5 }), corners(5, 4));
assert.equal(r.status, LOST);
assert.deepEqual(r.flip, { steps: 1, direction: 1, side: null });
assert.equal(r.band, 'hair');
assert.equal(r.actual, 9);
assert.equal(r.line, 9.5);

// Over 9.5 corners, 14 happened: won, five from losing.
r = recap(leg({ stat: 'corners', option: 'O', value: 9.5 }), corners(8, 6));
assert.equal(r.status, WON);
assert.deepEqual(r.flip, { steps: 5, direction: -1, side: null });
assert.equal(r.band, 'wide');

// Under 2.5 goals at 2-0: won by a hair.
r = recap(leg({ stat: 'goals', option: 'U', value: 2.5 }), score(2, 0));
assert.equal(r.status, WON);
assert.equal(r.flip.steps, 1);
assert.equal(r.flip.direction, 1);
assert.equal(r.band, 'hair');

// 1 (home win) at 1-1: one HOME goal short - additions are tried before removals.
r = recap(leg({ stat: 'main', option: 'Result', value: '1', team: 'match' }), score(1, 1));
assert.equal(r.status, LOST);
assert.deepEqual(r.flip, { steps: 1, direction: 1, side: 'home' });
assert.equal(r.numeric, false);
assert.equal(r.actual, null);

// 1 at 2-1: one more AWAY goal and it was a draw.
r = recap(leg({ stat: 'main', option: 'Result', value: '1', team: 'match' }), score(2, 1));
assert.deepEqual(r.flip, { steps: 1, direction: 1, side: 'away' });

// GG at 2-0: one away goal short.
r = recap(leg({ stat: 'main', option: 'Result', value: 'GG', team: 'match' }), score(2, 0));
assert.equal(r.status, LOST);
assert.deepEqual(r.flip, { steps: 1, direction: 1, side: 'away' });

// Multigol 1-2 at 1-1: a goal by EITHER side breaks it, so no team is named.
r = recap(leg({ stat: 'multigol', option: '1-2', value: null }), score(1, 1));
assert.equal(r.status, WON);
assert.deepEqual(r.flip, { steps: 1, direction: 1, side: null });

// A team's own line: home over 4.5 corners with 2 - three short, on the home side only.
r = recap(leg({ stat: 'corners', option: 'O', value: 4.5, team: 'home' }), corners(2, 9));
assert.equal(r.status, LOST);
assert.deepEqual(r.flip, { steps: 3, direction: 1, side: null });
assert.equal(r.band, 'clear');
assert.equal(r.actual, 2);

// A whole line landed on exactly: void, no distance.
r = recap(leg({ stat: 'corners', option: 'O', value: 9 }), corners(5, 4));
assert.equal(r.status, VOID);
assert.equal(r.flip, null);
assert.equal(r.band, null);

// Ungradeable: nothing at all, never a distance on our own shot count.
r = recap(leg({ stat: 'shots', option: 'O', value: 25.5 }), match({ shots: { home: 10, away: 10 } }));
assert.equal(r.status, null);

// The model, where recorded: error is actual - expected; the result went against it.
r = recap(leg({ stat: 'corners', option: 'O', value: 9.5, model: { expected: 11.2, pWin: 0.58 } }), corners(5, 4));
assert.ok(Math.abs(r.model.error - -2.2) < 1e-9);
assert.equal(r.model.withModel, false);
r = recap(leg({ stat: 'corners', option: 'O', value: 9.5, model: { expected: 11.2, pWin: 0.58 } }), corners(8, 6));
assert.equal(r.model.withModel, true);
// A coin flip leans nowhere.
r = recap(leg({ stat: 'corners', option: 'O', value: 9.5, model: { expected: 9.5, pWin: 0.5 } }), corners(8, 6));
assert.equal(r.model.withModel, null);

assert.equal(bandOf(1), 'hair');
assert.equal(bandOf(3), 'clear');
assert.equal(bandOf(4), 'wide');
assert.equal(bandOf(null), 'wide');
assert.equal(flipDistance(leg({ stat: 'corners', option: 'O', value: 9.5 }), corners(40, 40), WON), null);

// The slip: lost on one leg -> that leg is the decisive one; old slip -> missingModel.
const matches = [corners(5, 4)];
const slip = { created_at: '2026-09-12T10:00:00Z', legs: [
    leg({ stat: 'corners', option: 'O', value: 9.5 }),
    leg({ stat: 'main', option: 'Result', value: 'X', team: 'match' }),
] };
let s = recapSlip(settleSlip(slip, matches));
assert.equal(s.status, LOST);
assert.equal(s.lostCount, 1);
assert.equal(s.decisive.leg.stat, 'corners');
assert.equal(s.missingModel, true);

// Won: the closest call is the leg nearest to losing.
const won = { created_at: '2026-09-12T10:00:00Z', legs: [
    leg({ stat: 'corners', option: 'O', value: 3.5, model: { expected: 10, pWin: 0.9 } }),
    leg({ stat: 'corners', option: 'U', value: 9.5, model: { expected: 10, pWin: 0.4 } }),
] };
s = recapSlip(settleSlip(won, matches));
assert.equal(s.status, WON);
assert.equal(s.closest.leg.option, 'U');
assert.equal(s.missingModel, false);

console.log('recap: ok');

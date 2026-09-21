// A stored date goes off; the other preferences do not. Exit code 1 on failure.
//   node src/hooks/usePersistedPrefs.check.mjs
//
// Guards the boundary itself, which is the part that is easy to get subtly
// wrong: "still valid" means TODAY or later, not "later than right now".
import assert from 'node:assert/strict';
import { freshDate } from './usePersistedPrefs.js';

const now = new Date('2026-09-21T14:30:00');
const day = (iso) => new Date(iso);

// Past dates are dropped - the bug this exists for. Hot Matches opened pinned
// to 18 Sept on 21 Sept and matched no fixture.
assert.equal(freshDate(day('2026-09-18T00:00:00'), now), null, 'three days ago survived');
assert.equal(freshDate(day('2026-09-20T23:59:59'), now), null, 'yesterday survived');

// Today survives even though its midnight is BEHIND `now` - picking a date at
// 09:00 must not expire it by 14:30. This is the case a naive `date >= now`
// gets wrong.
assert.ok(freshDate(day('2026-09-21T00:00:00'), now), 'today was dropped');
assert.ok(freshDate(day('2026-09-21T20:00:00'), now), 'later today was dropped');
assert.ok(freshDate(day('2026-09-28T00:00:00'), now), 'next week was dropped');

// Round-trips as a real Date, since callers call .toDateString() on it.
const revived = freshDate(day('2026-09-28T00:00:00').toISOString(), now);
assert.ok(revived instanceof Date, 'an ISO string did not come back as a Date');
assert.equal(revived.toDateString(), 'Mon Sep 28 2026');

// Absent and corrupted values both mean "no date", not "a date that matches
// nothing": new Date('nonsense').toDateString() is the string "Invalid Date",
// which would filter every fixture out in silence.
assert.equal(freshDate(null, now), null);
assert.equal(freshDate(undefined, now), null);
assert.equal(freshDate('', now), null);
assert.equal(freshDate('nonsense', now), null, 'an unparseable date survived');

console.log('usePersistedPrefs: freshDate ok');

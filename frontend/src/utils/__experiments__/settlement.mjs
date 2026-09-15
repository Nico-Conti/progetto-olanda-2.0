/**
 * Settlement check. `node frontend/src/utils/__experiments__/settlement.mjs`
 *
 * Pins the three things that would silently cost money if they broke:
 *   - a market we must NOT grade stays ungraded (shots, half-time multigol),
 *   - a push is a push and not a win,
 *   - an unknown selection returns null rather than a guess.
 *
 * Plus the ordinary cases, which is what makes the first three meaningful.
 */
import assert from 'node:assert/strict';
import {
    settleLeg, settleSlip, slipReturn, matchForLeg, WON, LOST, VOID,
} from '../settle.js';

const match = (home, away, extra = {}, date = '2026-09-13T18:00:00Z') => ({
    squadre: { home: 'Milan', away: 'Lecce' },
    date,
    stats: {
        goals: { home, away },
        corners: { home: 6, away: 4 },
        fouls: { home: 11, away: 10 },
        shots: { home: 14, away: 9 },
        ...extra,
    },
});

const leg = (over) => ({ game: 'Milan vs Lecce', team: 'total', ...over });
const one = (l, m) => settleLeg(l, m);

// ---------------------------------------------------------------- over/under
{
    const m = match(2, 1);
    assert.equal(one(leg({ stat: 'corners', option: 'O', value: 9.5 }), m), WON);
    assert.equal(one(leg({ stat: 'corners', option: 'U', value: 9.5 }), m), LOST);
    // A whole line the total lands on is a PUSH - stake back, not a loss.
    assert.equal(one(leg({ stat: 'corners', option: 'O', value: 10 }), m), VOID);
    // Per-team lines read one side, not the sum.
    assert.equal(one({ ...leg({ stat: 'corners', option: 'O', value: 5.5 }), team: 'home' }, m), WON);
    assert.equal(one({ ...leg({ stat: 'corners', option: 'O', value: 5.5 }), team: 'away' }, m), LOST);
    // A missing statistic is not a zero - this is the fabricated-zero rule.
    const noFouls = match(2, 1, { fouls: { home: null, away: null } });
    assert.equal(one(leg({ stat: 'fouls', option: 'U', value: 25.5 }), noFouls), null);
}

// ------------------------------------------------- markets we must not grade
{
    const m = match(2, 1);
    // The book settles shots on a narrower count than diretta's `Tiri totali`
    // (25.5 posted against 29.0 measured). Grading it here would book wins the
    // bookmaker called losses.
    assert.equal(one(leg({ stat: 'shots', option: 'O', value: 22.5 }), m), null);
    // No half-time score is stored, so these cannot be answered at all.
    assert.equal(one(leg({ stat: 'multigol_1h', option: '1-2', value: null }), m), null);
    assert.equal(one(leg({ stat: 'multigol_2h', option: '1-2', value: null }), m), null);
}

// ------------------------------------------------------------ 1X2 and GG/NG
{
    const homeWin = match(2, 1), draw = match(1, 1), nilNil = match(0, 0);
    const main = (v) => leg({ stat: 'main', option: 'Result', value: v, team: 'match' });
    assert.equal(one(main('1'), homeWin), WON);
    assert.equal(one(main('2'), homeWin), LOST);
    assert.equal(one(main('X'), draw), WON);
    assert.equal(one(main('1X'), draw), WON);
    assert.equal(one(main('12'), draw), LOST);
    assert.equal(one(main('X2'), homeWin), LOST);
    assert.equal(one(main('GG'), homeWin), WON);
    assert.equal(one(main('NG'), nilNil), WON);
    // 0-0 is a real result, not a missing one.
    assert.equal(one(main('GG'), nilNil), LOST);
}

// ------------------------------------------------------- slip-only and combos
{
    const m = match(2, 1);            // home win, both scored, 3 goals
    const s = (stat, option, value = null) => leg({ stat, option, value });
    assert.equal(one(s('gg_ng', 'gg'), m), WON);
    assert.equal(one(s('gg_ng', 'ng'), m), LOST);
    // Multigol: the band is the selection, ends included.
    assert.equal(one(s('multigol', '1-3'), m), WON);
    assert.equal(one(s('multigol', '1-2'), m), LOST);
    assert.equal(one(s('multigol_home', '2-3'), m), WON);
    assert.equal(one(s('multigol_away', '2-3'), m), LOST);
    // Combos: every part must hold.
    assert.equal(one(s('combo_1x2_ggng', '1+gg'), m), WON);
    assert.equal(one(s('combo_1x2_ggng', '1+ng'), m), LOST);
    assert.equal(one(s('combo_1x_ou', '1x + ov', 2.5), m), WON);
    assert.equal(one(s('combo_1x_ou', '1x + un', 2.5), m), LOST);
    assert.equal(one(s('combo_ou_ggng', 'gg+ov', 2.5), m), WON);
    assert.equal(one(s('combo_ou_ggng', 'ng+ov', 2.5), m), LOST);
    assert.equal(one(s('combo_x2_ou', 'x2 + ov', 2.5), m), LOST);   // right goals, wrong result
    // A push on the goals half voids the whole leg.
    assert.equal(one(s('combo_1x_ou', '1x + ov', 3), m), VOID);
    // An outcome word we do not know must NOT be guessed at.
    assert.equal(one(s('combo_1x_ou', '1x + zz', 2.5), m), null);
}

// --------------------------------------------------------- whole-slip grading
{
    const played = match(2, 1);
    const unplayed = { squadre: { home: 'Roma', away: 'Como' }, date: '2026-09-20T18:00:00Z', stats: {} };
    const matches = [played, unplayed];
    const win = { game: 'Milan vs Lecce', stat: 'corners', option: 'O', value: 9.5, team: 'total', price: 2 };
    const lose = { game: 'Milan vs Lecce', stat: 'corners', option: 'U', value: 9.5, team: 'total', price: 2 };
    const open = { game: 'Roma vs Como', stat: 'corners', option: 'O', value: 9.5, team: 'total', price: 2 };

    // One unknown leg leaves the whole accumulator pending...
    assert.equal(settleSlip({ legs: [win, open] }, matches).status, 'pending');
    // ...unless another leg has already lost, which settles it whatever the rest do.
    assert.equal(settleSlip({ legs: [lose, open] }, matches).status, LOST);
    assert.equal(settleSlip({ legs: [win] }, matches).status, WON);

    // Profit and loss.
    assert.deepEqual(slipReturn({ stake: 10, odds: 2.5, legs: [win] },
        settleSlip({ legs: [win] }, matches)), { profit: 15, returned: 25 });
    assert.deepEqual(slipReturn({ stake: 10, odds: 2.5, legs: [lose] },
        settleSlip({ legs: [lose] }, matches)), { profit: -10, returned: 0 });

    // A void leg is refunded: it leaves the accumulator at 1.00 rather than
    // losing it, so the stored ticket price has to be rebuilt from the legs.
    const push = { game: 'Milan vs Lecce', stat: 'corners', option: 'O', value: 10, team: 'total', price: 2 };
    const mixed = settleSlip({ legs: [win, push] }, matches);
    assert.equal(mixed.status, WON);
    assert.deepEqual(slipReturn({ stake: 10, odds: 4, legs: [win, push] }, mixed),
        { profit: 10, returned: 20 });          // 2.00 survives, the push does not
    // Without every leg's price that division cannot be done, so refuse.
    assert.equal(slipReturn({ stake: 10, odds: 4, legs: [win, push] },
        settleSlip({ legs: [win, { ...push, price: null }] }, matches)), null);
    // No stake means no ledger entry, however the legs landed.
    assert.equal(slipReturn({ stake: null, odds: 2.5, legs: [win] },
        settleSlip({ legs: [win] }, matches)), null);
}

// ------------------------------------------------- picking the right fixture
{
    // The same ordered pair twice, months apart - a two-legged tie. The leg's
    // own kickoff is what tells them apart; `(home, away)` cannot.
    const first = match(1, 0, {}, '2026-02-10T20:00:00Z');
    const second = match(3, 0, {}, '2026-05-14T20:00:00Z');
    const dated = { game: 'Milan vs Lecce', date: '2026-05-14T20:00:00Z' };
    assert.equal(matchForLeg(dated, [first, second]), second);
    assert.equal(matchForLeg({ game: 'Milan vs Lecce', date: '2026-02-10T20:00:00Z' },
        [first, second]), first);
    // With no date on the leg, the slip's own timestamp picks the next meeting.
    assert.equal(matchForLeg({ game: 'Milan vs Lecce' }, [first, second],
        '2026-05-01T00:00:00Z'), second);
    // And with nothing to go on at all, it refuses rather than picking one.
    assert.equal(matchForLeg({ game: 'Milan vs Lecce' }, [first, second]), null);
}

console.log('settlement: all checks passed');

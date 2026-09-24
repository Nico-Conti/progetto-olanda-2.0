/**
 * The recap of a settled slip: for each leg, how close it came to going the
 * other way, and - where the slip recorded one - what the model had said.
 *
 * "How close" is measured by RE-GRADING, not by per-market arithmetic: the
 * real match is nudged one event at a time on the statistic the leg is decided
 * by, and `settleLeg` is asked again. The first nudge that changes the verdict
 * is the distance. One function therefore covers over/under, a team's own
 * line, 1X2, GG/NG, multigol and the combos, and a market `settleLeg` learns
 * tomorrow is covered the same day. It also inherits every refusal: a leg
 * `settleLeg` cannot grade has no distance either.
 *
 * Pure, no React: numbers in, verdicts and figures out. The words are the
 * component's, through t().
 */
import { settleLeg, WON, LOST, VOID } from './settle.js';
import { statPair, resolveStatKey, isSlipOnly } from './statistics.js';

/** Bands on the event count. Deliberately not scaled per statistic: one corner
 *  short and one goal short both read as "almost", which is all a recap says. */
export const HAIR = 1;
export const CLEAR = 3;

/** How far to look. Past this a leg is simply "comfortable" / "clearly lost". */
const MAX_STEPS = 20;

/** Score-decided markets vary the goals; everything else its own statistic. */
export const isScoreLeg = (leg) => leg?.stat === 'main' || isSlipOnly(leg?.stat);
const deciderKey = (leg) => (isScoreLeg(leg) ? 'goals' : resolveStatKey(leg.stat));

/** The match with `k` events added to (or taken from) one side. */
const nudged = (match, key, side, k) => {
    const pair = statPair(match, key);
    if (!pair) return null;
    const next = { home: pair.home, away: pair.away };
    next[side] += k;
    if (next[side] < 0) return null;
    return { ...match, stats: { ...match.stats, [key]: next } };
};

/**
 * The smallest nudge that changes the verdict: `{ steps, side, direction }`,
 * or null when nothing within MAX_STEPS does. `side` is set only when exactly
 * one team's goals would have done it - "one more Roma goal" - and left null
 * where either side would, which is every plain total.
 */
export const flipDistance = (leg, match, status) => {
    const key = deciderKey(leg);
    const sides = leg.team === 'home' || leg.team === 'away' ? [leg.team] : ['home', 'away'];
    for (let steps = 1; steps <= MAX_STEPS; steps++) {
        for (const direction of [1, -1]) {
            const flips = sides.filter((side) => {
                const m = nudged(match, key, side, direction * steps);
                const verdict = m && settleLeg(leg, m);
                return verdict != null && verdict !== status;
            });
            if (flips.length) {
                const named = isScoreLeg(leg) && flips.length === 1 && sides.length === 2;
                return { steps, direction, side: named ? flips[0] : null };
            }
        }
    }
    return null;
};

export const bandOf = (steps) =>
    steps == null ? 'wide' : steps <= HAIR ? 'hair' : steps <= CLEAR ? 'clear' : 'wide';

/**
 * One leg's recap. `settledLeg` is an entry of `settleSlip().legs`.
 *
 * `actual` and `line` are numbers for an over/under leg - what the scale is
 * drawn from - and null for a score-decided one, which shows the score.
 * `model` is present only when the slip recorded one AND the leg was graded.
 */
export const recapLeg = ({ leg, match, status }) => {
    if (status == null) return { status: null };
    const numeric = !isScoreLeg(leg);
    let actual = null;
    if (numeric) {
        const pair = statPair(match, resolveStatKey(leg.stat));
        actual = !pair ? null
            : leg.team === 'home' ? pair.home : leg.team === 'away' ? pair.away : pair.total;
    }
    const line = numeric && Number.isFinite(Number(leg.value)) ? Number(leg.value) : null;
    const flip = status === VOID ? null : flipDistance(leg, match, status);

    const m = leg.model;
    const model = m && Number.isFinite(m.expected)
        ? {
            expected: m.expected,
            error: actual == null ? null : actual - m.expected,
            pWin: Number.isFinite(m.pWin) ? m.pWin : null,
            // Whether the result went the side the model leaned, never whether
            // the model was "right": a 58% call that loses is not a mistake.
            withModel: Number.isFinite(m.pWin) && m.pWin !== 0.5
                ? (m.pWin > 0.5) === (status === WON) : null,
        }
        : null;

    return {
        status, numeric, actual, line, model,
        isOver: String(leg.option ?? '').toUpperCase().startsWith('O'),
        flip,
        band: status === VOID ? null : bandOf(flip?.steps),
    };
};

/**
 * The slip's headline. For a loss: how many legs went down, and when it was
 * one, that leg - the one to look at. For a win: the leg that came closest to
 * losing it. `legs` pairs each settled leg with its recap.
 */
export const recapSlip = (settled) => {
    const legs = settled.legs.map((l) => ({ ...l, recap: recapLeg(l) }));
    const lost = legs.filter((l) => l.status === LOST);
    const won = legs.filter((l) => l.status === WON && l.recap.flip);
    const closest = won.length
        ? won.reduce((a, b) => (b.recap.flip.steps < a.recap.flip.steps ? b : a))
        : null;
    return {
        status: settled.status,
        legs,
        lostCount: lost.length,
        decisive: lost.length === 1 ? lost[0] : null,
        closest,
        // A graded numeric leg with no model is a slip saved before the model
        // was recorded, which the recap says rather than leaving a blank.
        missingModel: legs.some((l) => l.recap.numeric && l.status != null && !l.leg.model),
    };
};

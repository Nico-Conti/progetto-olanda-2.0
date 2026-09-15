/**
 * Grading a played slip against what actually happened.
 *
 * Every outcome here is derived from `matchData`, which already carries all
 * fifteen stat columns plus the score - so settlement costs no request and no
 * stored result. It is computed on read rather than written back, which also
 * means a re-scraped correction (a match rescued from the fabricated-zero
 * audit, say) flows straight through instead of leaving a wrong grade behind.
 *
 * The contract is three-valued and the third value is the important one:
 * `null` means "cannot say", and a slip with any `null` leg stays pending
 * rather than being guessed at. Money is the one place in this app where a
 * plausible answer is worse than no answer.
 */
import { statPair } from './statistics.js';
import { resolveStatKey, isSlipOnly } from './statistics.js';

export const WON = 'won';
export const LOST = 'lost';
export const VOID = 'void';

/**
 * Markets we take prices on but must NOT grade against our own numbers.
 *
 * The book does not settle these on the quantity we measure: its posted shot
 * lines average 25.5 against our 29.0 totals with a 69.1% over-rate, and shots
 * on target 8.7 against 9.7, at every line - diretta's `Tiri totali` counts
 * on-target + off-target + blocked, and the book counts something narrower.
 * Grading them here would book wins the bookmaker called losses, silently and
 * in our favour, which is the worst direction for an error in a ledger.
 *
 * Half-time markets are here for a duller reason: `matches` stores full-time
 * goals only, so there is nothing to grade them against.
 */
export const UNGRADEABLE = new Set([
    'shots', 'shots_on_target', 'multigol_1h', 'multigol_2h',
]);

/** The total a leg is judged on: one side for a team bet, both for a match bet. */
const totalFor = (match, statKey, team) => {
    const pair = statPair(match, statKey);
    if (!pair) return null;
    if (team === 'home') return Number(pair.home);
    if (team === 'away') return Number(pair.away);
    return Number(pair.home) + Number(pair.away);
};

/**
 * One token of a selection, as a verdict.
 *
 * The ten tokens below cover all fifteen slip markets and the 1X2 builder,
 * because a combo's name is composed of exactly these parts - "1x + ov",
 * "gg+un", "1+gg". Composing predicates rather than enumerating 30 outcomes
 * means a combination the book adds tomorrow out of the same parts grades
 * itself; anything built from a part we do not know returns null and stays
 * pending, which is the safe direction.
 */
const token = (name, { home, away, line }) => {
    const total = home + away;
    switch (name) {
        case '1': return home > away;
        case 'x': return home === away;
        case '2': return away > home;
        case '1x': return home >= away;
        case '12': return home !== away;
        case 'x2': return away >= home;
        case 'gg': return home > 0 && away > 0;
        case 'ng': return !(home > 0 && away > 0);
        case 'ov': case 'over': return line == null ? null : total > line;
        case 'un': case 'under': return line == null ? null : total < line;
        default: {
            // A multigol band: "1-2" means the total landed inside it, ends
            // included. Bands are the one selection that is not a word.
            const band = /^(\d+)-(\d+)$/.exec(name);
            if (!band) return null;
            return total >= Number(band[1]) && total <= Number(band[2]);
        }
    }
};

/** A whole-number line that the total lands exactly on is a push, not a loss. */
const pushesOn = (name, total, line) =>
    (name === 'ov' || name === 'over' || name === 'un' || name === 'under')
    && line != null && total === line;

/**
 * Which goals a multigol variant counts. Full-time only: the halves are in
 * UNGRADEABLE because we do not store a half-time score.
 */
const MULTIGOL_SIDE = {
    multigol: 'total', multigol_home: 'home', multigol_away: 'away',
};

/** Grade a slip-only leg (GG/NG, multigol, the combos) from the score. */
const settleSlipOnly = (leg, match) => {
    const goals = statPair(match, 'goals');
    if (!goals || goals.home == null || goals.away == null) return null;
    const home = Number(goals.home);
    const away = Number(goals.away);
    const line = leg.value == null ? null : Number(leg.value);

    if (leg.stat in MULTIGOL_SIDE) {
        const side = MULTIGOL_SIDE[leg.stat];
        const scored = side === 'home' ? home : side === 'away' ? away : home + away;
        const band = /^(\d+)-(\d+)$/.exec(String(leg.option ?? '').trim());
        if (!band) return null;
        return scored >= Number(band[1]) && scored <= Number(band[2]) ? WON : LOST;
    }

    const parts = String(leg.option ?? '').split('+').map(p => p.trim().toLowerCase());
    if (!parts.length || parts.some(p => !p)) return null;

    // A push on the goals half of a combo voids the whole leg, exactly as the
    // book does - there is no "half won" here because the other half is not a
    // separate bet.
    if (parts.some(p => pushesOn(p, home + away, line))) return VOID;

    const verdicts = parts.map(p => token(p, { home, away, line }));
    if (verdicts.some(v => v == null)) return null;
    return verdicts.every(Boolean) ? WON : LOST;
};

/** Grade a 1X2 / double-chance / GG-NG bet from the builder's `main` market. */
const settleMain = (leg, match) => {
    const goals = statPair(match, 'goals');
    if (!goals || goals.home == null || goals.away == null) return null;
    const verdict = token(String(leg.value ?? '').toLowerCase(),
        { home: Number(goals.home), away: Number(goals.away), line: null });
    return verdict == null ? null : (verdict ? WON : LOST);
};

/** Grade an over/under leg on a measured statistic. */
const settleTotal = (leg, match) => {
    const statKey = resolveStatKey(leg.stat);
    const total = totalFor(match, statKey, leg.team);
    const line = Number(leg.value);
    if (total == null || !Number.isFinite(total) || !Number.isFinite(line)) return null;
    if (total === line) return VOID;
    const isOver = String(leg.option ?? '').toUpperCase().startsWith('O');
    return (total > line) === isOver ? WON : LOST;
};

/**
 * Grade one leg. `null` whenever we cannot answer honestly: the match has not
 * been played or scraped, the statistic is missing, the market is one we do not
 * settle on the book's basis, or the selection uses a word we do not know.
 */
export const settleLeg = (leg, match) => {
    if (!leg || !match) return null;
    if (UNGRADEABLE.has(leg.stat)) return null;
    if (isSlipOnly(leg.stat)) return settleSlipOnly(leg, match);
    if (leg.stat === 'main') return settleMain(leg, match);
    return settleTotal(leg, match);
};

/** "Milan vs Lecce" -> the two names, or null if it is not that shape. */
export const teamsOf = (game) => {
    const parts = String(game ?? '').split(' vs ');
    return parts.length === 2 ? { home: parts[0].trim(), away: parts[1].trim() } : null;
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * The played match a leg refers to.
 *
 * `(home, away)` is NOT a key - a two-legged tie puts the same ordered pair on
 * the pitch twice, 320 Belgian rows over 240 distinct pairs - so the leg's own
 * kickoff decides between candidates when it has one. Legs saved before that
 * field existed carry no date, and for those the nearest meeting on or after
 * the slip's own timestamp is the best available answer; it is right for every
 * ordinary fixture and can only be wrong where the same pair meets twice.
 */
export const matchForLeg = (leg, matches, savedAt = null) => {
    const teams = teamsOf(leg?.game);
    if (!teams || !matches?.length) return null;
    const candidates = matches.filter(m =>
        norm(m.squadre?.home) === norm(teams.home)
        && norm(m.squadre?.away) === norm(teams.away));
    if (candidates.length <= 1) return candidates[0] ?? null;

    const anchor = leg.date ? new Date(leg.date) : (savedAt ? new Date(savedAt) : null);
    if (!anchor || Number.isNaN(anchor.getTime())) return null;
    // Nearest by kickoff when the leg names one; otherwise the first meeting at
    // or after the slip was saved, since you cannot bet on a played match.
    const dated = candidates.filter(m => m.date).map(m => ({ m, t: new Date(m.date) }));
    if (!dated.length) return null;
    if (leg.date) {
        return dated.reduce((best, c) =>
            Math.abs(c.t - anchor) < Math.abs(best.t - anchor) ? c : best).m;
    }
    const after = dated.filter(c => c.t >= anchor).sort((a, b) => a.t - b.t);
    return after.length ? after[0].m : null;
};

/**
 * Grade a whole slip. Returns `{ status, legs, graded, total }`.
 *
 * A slip is only called once EVERY leg has an answer; one unknown leg leaves it
 * pending, because an accumulator is a conjunction and a single ungraded leg
 * can still turn a "won" into a loss. The one exception is a leg already lost:
 * an accumulator with a losing leg is lost whatever the rest did, so that is
 * safe to call early and is what the bookmaker does too.
 *
 * Void legs drop out of the return rather than losing it, which is why the
 * effective odds are recomputed from the surviving legs' prices.
 */
export const settleSlip = (slip, matches) => {
    const legs = (slip?.legs ?? []).map((leg) => {
        const match = matchForLeg(leg, matches, slip?.created_at);
        return { leg, match, status: settleLeg(leg, match) };
    });
    const graded = legs.filter(l => l.status != null).length;

    let status = 'pending';
    if (legs.length && legs.some(l => l.status === LOST)) status = LOST;
    else if (legs.length && graded === legs.length) {
        status = legs.every(l => l.status === VOID) ? VOID : WON;
    }
    return { status, legs, graded, total: legs.length };
};

/**
 * What a settled slip returned, in stake units.
 *
 * Void legs are refunded, so they leave the accumulator at their own price of
 * 1.00 rather than removing the slip. The stored `odds` is what the user
 * actually got on the bookmaker's ticket and is preferred; the per-leg prices
 * are the fallback, and only usable when every surviving leg carries one.
 */
export const slipReturn = (slip, settled) => {
    const stake = Number(slip?.stake);
    if (!(stake > 0)) return null;
    if (settled.status === VOID) return { profit: 0, returned: stake };
    if (settled.status === LOST) return { profit: -stake, returned: 0 };
    if (settled.status !== WON) return null;

    let odds = Number(slip?.odds);
    const voided = settled.legs.filter(l => l.status === VOID);
    if (voided.length) {
        // A stored price is for the whole ticket as struck, so a voided leg has
        // to be divided back out of it. Without every leg's own price that
        // cannot be done, and overstating a return is not an option.
        const prices = settled.legs.map(l => Number(l.leg?.price));
        if (prices.some(p => !(p > 1))) return null;
        odds = settled.legs.reduce((acc, l) =>
            acc * (l.status === VOID ? 1 : Number(l.leg.price)), 1);
    }
    if (!(odds > 1)) return null;
    const returned = stake * odds;
    return { profit: returned - stake, returned };
};

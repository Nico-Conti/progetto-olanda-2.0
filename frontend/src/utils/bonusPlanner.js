/**
 * Bonus planner: the best slips a bonus's rules allow, from the prices on the
 * board right now.
 *
 * A bonus slip is usually "N events, every leg at least X" - and a punter may
 * cap each leg too (`maxOdds`), to keep long shots off the slip. One leg per
 * fixture, because the book counts a fixture as one event.
 *
 * A leg's chance is OUR MODEL'S where `modelProb` has one (goals, corners,
 * fouls, card points, and only when the prediction is confident), and the
 * book's own otherwise, devigged across the outcomes that share its line - so
 * 1.60 on a 1.60/2.30 pair reads as 59%, not 62.5%. Book-only ranking always
 * favoured goals and GG/NG: their ladders sit right at 1.50 with a thin margin,
 * while corners and cards step past it and carry more margin, so by the book's
 * own numbers they could never be the likelier leg.
 *
 * Two ways to rank:
 *   safe  - most likely to land: the highest-probability leg per fixture, and
 *           the fixtures with the highest ones.
 *   value - chance x price: expected return per unit staked. Against the
 *           model that is its EV; against the book, the thinnest margin.
 *
 * Only markets whose outcomes partition the result devig honestly. The combos
 * (1X + GG ...) overlap, so their inverse prices sum far past 1 and are left out.
 */

export const PLANNER_MARKETS = [
    { id: 'total_goals', stat: 'goals' },
    { id: 'total_corners', stat: 'corners' },
    { id: 'total_fouls', stat: 'fouls' },
    { id: 'total_card_points', stat: 'card_points' },
];

const localDay = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const planSlips = (rows, { events, minOdds, maxOdds = Infinity, sameDay, markets, mode = 'safe', now = new Date(), count = 3, modelProb = null }) => {
    const allowed = new Set(markets);
    const today = localDay(now);

    // Every outcome of one line, for the devig. Keyed by selection, so a row
    // served twice (a market fetched twice) is not counted twice.
    const lineKey = (r) => `${r.league}|${r.home_team}|${r.away_team}|${r.market}|${r.line ?? ''}`;
    const sides = new Map();
    for (const r of rows) {
        if (!allowed.has(r.market) || /^\d+$/.test(String(r.selection ?? ''))) continue;
        const price = Number(r.price);
        if (!(price > 1)) continue;
        const k = lineKey(r);
        if (!sides.has(k)) sides.set(k, new Map());
        sides.get(k).set(r.selection, 1 / price);
    }
    const books = new Map([...sides].map(([k, m]) => [k, [...m.values()].reduce((a, b) => a + b, 0)]));

    // Every leg the rules allow - the pick-your-own list.
    const all = [];
    for (const r of rows) {
        const price = Number(r.price);
        const kickoff = new Date(r.match_date);
        const book = books.get(lineKey(r));
        // A line with only this side captured cannot be devigged, and would read as margin-free.
        if (!book || book <= 1 / price + 1e-9 || price < minOdds || price > maxOdds || !(kickoff > now)) continue;
        if (sameDay && localDay(kickoff) !== today) continue;
        const bookProb = (1 / price) / book;
        const model = modelProb?.(r) ?? null;
        const prob = model ?? bookProb;
        all.push({ ...r, price, prob, bookProb, model, kickoff, value: prob * price,
                   key: `${lineKey(r)}|${r.selection}`, fixture: `${r.league}|${r.home_team}|${r.away_team}` });
    }
    // A row served twice is one leg.
    const legs = [...new Map(all.map(l => [l.key, l])).values()].sort(mode === 'value'
        ? (a, b) => b.value - a.value || b.prob - a.prob
        : (a, b) => b.prob - a.prob || b.price - a.price);

    // The best leg per fixture: the first one met, the list being sorted.
    const seen = new Set();
    const best = legs.filter(l => !seen.has(l.fixture) && seen.add(l.fixture));

    // Disjoint slips: the best N fixtures, then the next N, and so on.
    const slips = [];
    for (let i = 0; i + events <= best.length && slips.length < count; i += events) {
        const chosen = best.slice(i, i + events).sort((a, b) => a.kickoff - b.kickoff);
        const odds = chosen.reduce((p, l) => p * l.price, 1);
        const prob = chosen.reduce((p, l) => p * l.prob, 1);
        slips.push({ legs: chosen, odds, prob });
    }
    return { slips, legs, eligible: best.length };
};

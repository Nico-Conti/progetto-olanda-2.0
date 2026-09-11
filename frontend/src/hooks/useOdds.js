import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';
import { MARKET_FOR_STAT, resolveStatKey, isSlipOnly } from '../utils/statistics';

/**
 * Current bookmaker prices, indexed for lookup by bet.
 *
 * Team names are already resolved to ours at capture time (see
 * backend/odds/domusbet.py), so this is a straight key lookup rather than a
 * fuzzy match. The bookmaker's own slugs never reach the app.
 *
 * Odds are optional: the app works without them, showing predictions and no
 * prices. A failed fetch is therefore not an error state, just an empty index.
 */


const norm = (s) => String(s ?? '').trim().toLowerCase();
const fixtureKey = (home, away, market) => `${norm(home)}|${norm(away)}|${market}`;
/**
 * A line is usually a number (10.5) but not always: a multigol band is "1-2".
 * `Number("1-2")` is NaN, and NaN stringifies the same for every band - so
 * coercing here would collapse 1-2, 2-3 and 1-4 onto ONE key and hand back
 * whichever price was indexed last. Numbers are still normalised through
 * `Number` so "10.5" and 10.5 agree; anything else is kept verbatim.
 */
const lineKey = (line) => {
    if (line == null) return '';
    const n = Number(line);
    return Number.isFinite(n) ? String(n) : String(line);
};
const keyOf = (home, away, market, line, selection) =>
    `${fixtureKey(home, away, market)}|${lineKey(line)}|${selection}`;

export const useOdds = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(`${API_BASE_URL}/odds`);
                if (!resp.ok) throw new Error(resp.statusText);
                const data = await resp.json();
                if (!cancelled) setRows(Array.isArray(data) ? data : []);
            } catch (err) {
                // Prices are an enhancement, not a dependency.
                console.warn('Odds unavailable:', err.message);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const index = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            map.set(keyOf(r.home_team, r.away_team, r.market, r.line, r.selection), Number(r.price));
        }
        return map;
    }, [rows]);

    /**
     * The same key, pointing at domusbet's own id for the selection instead of
     * its price. Kept as a sibling index rather than folded into `index` so the
     * price path stays a plain number lookup.
     */
    const refIndex = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            if (!r.selection_ref) continue;
            map.set(keyOf(r.home_team, r.away_team, r.market, r.line, r.selection), r.selection_ref);
        }
        return map;
    }, [rows]);

    /**
     * Which lines a fixture actually has a price at, per market.
     *
     * The book does not restrict itself to the lines `STAT_CONFIG` lists: on
     * 2026-08-24 both Serie A fixtures were priced for total fouls at 25.5 and
     * nowhere else, a line the foul ladder (20.5, 22.5, 24.5, 26.5, 28.5, 30.5)
     * steps straight over - so the one priced foul bet of the day was invisible.
     * Callers union this with the configured lines rather than replacing them,
     * because an unpriced ladder is still worth showing.
     */
    const linesIndex = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const line = Number(r.line);
            if (!Number.isFinite(line)) continue;
            const key = fixtureKey(r.home_team, r.away_team, r.market);
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(line);
        }
        return map;
    }, [rows]);

    /**
     * The stored price for one fixture/statistic/line/side.
     *
     * `undefined` while the fetch is still in flight, `null` once we know there
     * is no price. The distinction matters: `/odds` is 2.4 MB and Render's free
     * tier sleeps, so a cold load waits ~57s - during which every row used to
     * render a definitive em dash titled "No price captured for this line",
     * which is a claim about the bookmaker rather than about us still loading.
     */
    const priceFor = useMemo(() => (home, away, statistic, line, over) => {
        const market = MARKET_FOR_STAT[resolveStatKey(statistic)];
        if (!market || line == null) return null;
        const hit = index.get(keyOf(home, away, market, line, over ? 'over' : 'under'));
        if (hit != null) return hit;
        return loading ? undefined : null;
    }, [index, loading]);

    /** Lines with a captured price for this fixture/statistic, ascending. */
    const pricedLines = useMemo(() => (home, away, statistic) => {
        const market = MARKET_FOR_STAT[resolveStatKey(statistic)];
        if (!market) return [];
        const set = linesIndex.get(fixtureKey(home, away, market));
        return set ? [...set].sort((a, b) => a - b) : [];
    }, [linesIndex]);

    /**
     * Price for a bet-slip entry. Slip bets store `game` as "Home vs Away" and
     * carry the line in `value`; 'main' markets are 1X2 and are not captured, so
     * they price as null rather than being silently matched to a totals line.
     */
    /**
     * The (market, line, selection) a slip entry points at.
     *
     * Two shapes share the slip. A predicted bet names a statistic and an
     * over/under; a slip-only bet names the market directly and carries the
     * book's own selection in `option` - yes/no for a multigol band, gg/ng for
     * both-teams-to-score. Resolving both here keeps priceForBet and refForBet
     * from drifting apart, which is how the same leg would end up priced one way
     * and linked another.
     */
    const betTarget = (bet) => {
        if (!bet || bet.team !== 'total') return null;
        const [home, away] = String(bet.game ?? '').split(' vs ');
        if (!home || !away) return null;
        if (isSlipOnly(bet.stat)) {
            return { home, away, market: bet.stat, line: bet.value, selection: bet.option };
        }
        if (bet.stat === 'main') return null;
        const market = MARKET_FOR_STAT[resolveStatKey(bet.stat)];
        if (!market || bet.value == null) return null;
        return { home, away, market, line: Number(bet.value),
                 selection: bet.option === 'O' ? 'over' : 'under' };
    };

    const priceForBet = useMemo(() => (bet) => {
        const t = betTarget(bet);
        if (!t) return null;
        const hit = index.get(keyOf(t.home, t.away, t.market, t.line, t.selection));
        if (hit != null) return hit;
        return loading ? undefined : null;
    }, [index, loading]);

    /**
     * Every captured outcome for a fixture in a slip-only market.
     *
     * Those markets have no line ladder to walk - multigol's "line" is a band
     * like "1-2" and its selection is yes/no - so the caller is handed whatever
     * was actually captured rather than a configured list to look prices up
     * against. Sorted so the display order is stable between renders.
     */
    /**
     * Pull one slip-only market on demand.
     *
     * `/odds` serves the modelled markets only: the slip-only ones are ~75% of
     * the rows for upcoming fixtures and nobody sees them until they choose one,
     * so putting them on the first paint would undo the payload work in e22929c.
     * Fetched once per market and merged in - a second request for the same
     * market is a no-op.
     */
    const [loadedMarkets, setLoadedMarkets] = useState(() => new Set());
    const loadMarket = useMemo(() => async (market) => {
        if (!market || loadedMarkets.has(market)) return;
        setLoadedMarkets((prev) => new Set(prev).add(market));
        try {
            const resp = await fetch(`${API_BASE_URL}/odds?market=${encodeURIComponent(market)}`);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            if (Array.isArray(data) && data.length) setRows((prev) => [...prev, ...data]);
        } catch (err) {
            // Same rule as the first fetch: prices are an enhancement. The table
            // says "no prices captured" rather than the screen failing.
            console.warn(`Odds for ${market} unavailable:`, err.message);
        }
    }, [loadedMarkets]);

    const outcomesFor = useMemo(() => (home, away, market) => {
        const want = fixtureKey(home, away, market);
        return rows
            .filter((r) => fixtureKey(r.home_team, r.away_team, r.market) === want)
            .map((r) => ({ line: r.line, selection: r.selection, price: Number(r.price),
                           ref: r.selection_ref }))
            .sort((a, b) => String(a.line ?? '').localeCompare(String(b.line ?? ''))
                            || String(a.selection).localeCompare(String(b.selection)));
    }, [rows]);

    /** domusbet's id for a slip entry, resolved exactly as its price is. */
    const refForBet = useMemo(() => (bet) => {
        const t = betTarget(bet);
        if (!t) return null;
        return refIndex.get(keyOf(t.home, t.away, t.market, t.line, t.selection)) ?? null;
    }, [refIndex]);

    /**
     * The slip as a domusbet link, or null if no leg can be linked.
     *
     * Their web app loads a betslip from the URL, so the whole accumulator can be
     * handed over in one click:
     *
     *   /betslip?selectionsData=<leg>|<leg>&lingua=IT&systemCode=DOMUSBET
     *
     * `|` is the separator and the only one that works - `;`, `,` and `-` each
     * load the FIRST leg and silently drop the rest, which would hand someone a
     * single bet while the slip on screen showed five.
     *
     * Returns `linked` and `total` so the caller can say so out loud when only
     * some legs carry an id. Rows captured before migration 007 have no
     * `selection_ref`, and 1X2 is not a market we capture at all.
     *
     * Deliberately NOT `playDirectly`: that parameter exists and places the bet
     * outright. This opens the slip and stops, leaving the confirmation - and the
     * repriced odds, which move between capture and arrival - with the person.
     */
    const betslipUrl = useMemo(() => (bets) => {
        const legs = (bets ?? []).map(refForBet).filter(Boolean);
        if (!legs.length) return null;
        const params = new URLSearchParams({
            selectionsData: legs.join('|'), lingua: 'IT', systemCode: 'DOMUSBET',
        });
        return {
            url: `https://www.domusbet.it/betslip?${params}`,
            linked: legs.length,
            total: (bets ?? []).length,
        };
    }, [refForBet]);

    return { priceFor, priceForBet, pricedLines, outcomesFor, loadMarket, betslipUrl, loading, count: rows.length };
};

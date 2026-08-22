import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';
import { resolveStatKey } from '../utils/statistics';

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

/** App statistic -> the market name the capture stores. */
const MARKET_FOR_STAT = {
    corners: 'total_corners',
    fouls: 'total_fouls',
    goals: 'total_goals',
    shots: 'total_shots',
    shots_on_target: 'total_shots_on_target',
    yellow_cards: 'total_card_points',
};

const norm = (s) => String(s ?? '').trim().toLowerCase();
const keyOf = (home, away, market, line, selection) =>
    `${norm(home)}|${norm(away)}|${market}|${Number(line)}|${selection}`;

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

    /** The stored price for one fixture/statistic/line/side, or null. */
    const priceFor = useMemo(() => (home, away, statistic, line, over) => {
        const market = MARKET_FOR_STAT[resolveStatKey(statistic)];
        if (!market || line == null) return null;
        return index.get(keyOf(home, away, market, line, over ? 'over' : 'under')) ?? null;
    }, [index]);

    /**
     * Price for a bet-slip entry. Slip bets store `game` as "Home vs Away" and
     * carry the line in `value`; 'main' markets are 1X2 and are not captured, so
     * they price as null rather than being silently matched to a totals line.
     */
    const priceForBet = useMemo(() => (bet) => {
        if (!bet || bet.stat === 'main' || bet.team !== 'total') return null;
        const [home, away] = String(bet.game ?? '').split(' vs ');
        if (!home || !away) return null;
        return priceFor(home, away, bet.stat, Number(bet.value), bet.option === 'O');
    }, [priceFor]);

    return { priceFor, priceForBet, loading, count: rows.length };
};

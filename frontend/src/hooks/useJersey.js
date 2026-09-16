import { useEffect, useReducer } from 'react';

// TheSportsDB's public test key, and its CORS-open search. The team row carries
// `strEquipment`, an image of the club's current kit.
const SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';
const STORAGE_KEY = 'olanda_jerseys';

// team name -> kit image URL, or null for "looked, none". Misses are kept too,
// so a team without a kit is not searched again on every visit.
const cache = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; }
})();
const inflight = new Map();

/** Accent-blind, for "Lilleström" against "Lillestrøm". */
const norm = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
    .toLowerCase().trim();

/**
 * The kit for `team`, from an EXACT name match only (the name or one of the
 * listed alternates). The search is fuzzy - "Bayern" finds Bayern Hof, "Celta
 * Vigo B" finds Gran Peña - and a wrong club's shirt is worse than none.
 * A network failure is not cached, so it is tried again next time.
 */
const lookup = (team) => {
    if (!inflight.has(team)) {
        inflight.set(team, fetch(SEARCH + encodeURIComponent(team))
            .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
            .then(({ teams }) => {
                const want = norm(team);
                const hit = (teams ?? []).find(t => t.strSport === 'Soccer' && t.strEquipment && (
                    norm(t.strTeam) === want
                    || String(t.strTeamAlternate ?? '').split(',').some(alt => norm(alt) === want)));
                cache[team] = hit?.strEquipment ?? null;
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* private mode */ }
            })
            .catch(() => {})
            .finally(() => inflight.delete(team)));
    }
    return inflight.get(team);
};

/** The kit image URL for a team, or null while unknown or when there is none. */
export function useJersey(team) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        if (!team || team in cache) return;
        let live = true;
        lookup(team).then(() => { if (live) rerender(); });
        return () => { live = false; };
    }, [team]);
    return (team && cache[team]) || null;
}

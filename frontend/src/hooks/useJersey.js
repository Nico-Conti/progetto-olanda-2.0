import { useEffect, useReducer } from 'react';

// TheSportsDB's public test key, and its CORS-open search. The team row carries
// `strEquipment`, an image of the club's current kit, and `idVenue`, whose
// venue row has a photo of the stadium (`strThumb`).
const API = 'https://www.thesportsdb.com/api/v1/json/3/';
const TEAMS_KEY = 'olanda_teams';
const VENUES_KEY = 'olanda_venues';

const load = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
};
const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
try { localStorage.removeItem('olanda_jerseys'); } catch { /* the kit-only cache this one replaced */ }

// team name -> { kit, venue } or null for "looked, not found"; venue id ->
// { photo, name, capacity, location } or null. Misses are kept too, so a team
// is not searched again on every visit.
const teams = load(TEAMS_KEY);
const venues = load(VENUES_KEY);
const inflight = new Map();

/** Accent-blind, for "Lilleström" against "Lillestrøm". */
const norm = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
    .toLowerCase().trim();

/** One request per key at a time; a network failure is not cached, so it is tried again next time. */
const once = (key, run) => {
    if (!inflight.has(key)) inflight.set(key, run().catch(() => {}).finally(() => inflight.delete(key)));
    return inflight.get(key);
};
const getJson = (path) => fetch(API + path).then(res => (res.ok ? res.json() : Promise.reject(res.status)));

/**
 * The club's row, from an EXACT name match only (the name or one of the
 * listed alternates). The search is fuzzy - "Bayern" finds Bayern Hof, "Celta
 * Vigo B" finds Gran Peña - and a wrong club's shirt is worse than none.
 */
const lookupTeam = (team) => once(`team:${team}`, () => getJson('searchteams.php?t=' + encodeURIComponent(team))
    .then(({ teams: rows }) => {
        const want = norm(team);
        const hit = (rows ?? []).find(r => r.strSport === 'Soccer' && (
            norm(r.strTeam) === want
            || String(r.strTeamAlternate ?? '').split(',').some(alt => norm(alt) === want)));
        teams[team] = hit ? { kit: hit.strEquipment || null, venue: hit.idVenue || null } : null;
        save(TEAMS_KEY, teams);
    }));

const lookupVenue = (id) => once(`venue:${id}`, () => getJson('lookupvenue.php?id=' + encodeURIComponent(id))
    .then(({ venues: rows }) => {
        const v = rows?.[0];
        const photo = v && (v.strThumb || v.strFanart1);
        venues[id] = photo ? {
            photo,
            name: v.strVenue,
            capacity: Number(v.intCapacity) || null,
            location: v.strLocation || null,
        } : null;
        save(VENUES_KEY, venues);
    }));

/** Re-renders the caller once `ready()` holds, running `fetchIt` when it does not yet. */
const useLookup = (key, ready, fetchIt) => {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        if (!key || ready()) return;
        let live = true;
        fetchIt().then(() => { if (live) rerender(); });
        return () => { live = false; };
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
};

/** The kit image URL for a team, or null while unknown or when there is none. */
export function useJersey(team) {
    useLookup(team, () => team in teams, () => lookupTeam(team));
    return (team && teams[team]?.kit) || null;
}

/** The team's stadium `{ photo, name, capacity, location }`, or null while unknown or when there is none. */
export function useStadium(team) {
    useJersey(team);
    const id = team && teams[team]?.venue;
    useLookup(id, () => id in venues, () => lookupVenue(id));
    return (id && venues[id]) || null;
}

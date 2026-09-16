import { useEffect, useReducer } from 'react';

// TheSportsDB's public test key, and its CORS-open search. The team row carries
// `strEquipment`, an image of the club's current kit, and `idVenue`, whose
// venue row has a photo of the stadium (`strThumb`).
const API = 'https://www.thesportsdb.com/api/v1/json/3/';
const TEAMS_KEY = 'olanda_teams';
const VENUES_KEY = 'olanda_venues';

/**
 * Our league names against TheSportsDB's, because the per-team search cannot
 * reach some clubs at all: it answers with ONE best match, so "Inter" returns
 * Intercity and "Milan" returns Milan Youth, and the right club never appears
 * for any matching rule to accept. Asked by LEAGUE instead, both come back
 * correctly - Inter Milan with the alternate "Inter", AC Milan with "Milan".
 *
 * Each name was verified by fetching it, not guessed: all eighteen return
 * teams. The free key caps the answer at TEN per league, so this is a partial
 * source by design - it resolves 134 of our 364 teams - and the per-team search
 * below remains the fallback for the rest.
 */
const SDB_LEAGUE = {
    'Serie A': 'Italian Serie A', 'Serie B': 'Italian Serie B',
    'Premier League': 'English Premier League', Championship: 'English League Championship',
    'La Liga': 'Spanish La Liga', 'LaLiga 2': 'Spanish La Liga 2',
    Bundesliga: 'German Bundesliga', '2. Bundesliga': 'German 2. Bundesliga',
    'Ligue 1': 'French Ligue 1', 'Ligue 2': 'French Ligue 2',
    Eredivisie: 'Dutch Eredivisie', 'Eerste Divisie': 'Dutch Eerste Divisie',
    'Liga Portugal': 'Portuguese Primeira Liga', Premiership: 'Scottish Premier League',
    Eliteserien: 'Norwegian Eliteserien', 'Jupiler League': 'Belgian Pro League',
    'Super Lig': 'Turkish Super Lig', 'Serie A Betano': 'Brazilian Serie A',
};

const load = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
};
const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
// The kit-only caches this one replaces. A miss is cached and never retried, so
// a matching rule that changes has to drop the old store or the fix reaches
// nobody - the same reason the model settings key was bumped.
for (const old of ['olanda_jerseys', 'olanda_jerseys_v3']) {
    try { localStorage.removeItem(old); } catch { /* private mode */ }
}

// team name -> { kit, venue } or null for "looked, not found"; venue id ->
// { photo, name, capacity, location } or null. Misses are kept too, so a team
// is not searched again on every visit.
const teams = load(TEAMS_KEY);
const venues = load(VENUES_KEY);
const inflight = new Map();
const leagueLists = new Map();

/** Accent-blind, for "Lilleström" against "Lillestrøm". */
const norm = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
    .toLowerCase().trim();

const words = (s) => norm(s).replace(/\./g, ' ').split(/\s+/).filter(Boolean);
const flat = (s) => words(s).join(' ');

/**
 * Is this plainly the same club under a fuller or shorter name?
 *
 * The search returns ONE best match, so our name is often a shortening of the
 * club's full name: "Hull" for Hull City, "Leverkusen" for Bayer Leverkusen,
 * "Breda" for NAC Breda. Requiring exact equality threw all of those away - 14
 * of the 16 kits we were missing on teams that DO have one were this.
 *
 * Two forms, both cheap. Either name contains the other outright, or our words
 * appear in order as prefixes of theirs ("Ath. Bilbao" -> "Athletic Bilbao").
 * Deliberately loose, because on its own it would also accept Bayern Hof for
 * Bayern - the caller's gates are what make it safe, not this.
 */
const sameClub = (ours, theirs) => {
    const a = flat(ours);
    const b = flat(theirs);
    if (!a || !b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    const mine = words(ours);
    let i = 0;
    for (const w of words(theirs)) if (i < mine.length && w.startsWith(mine[i])) i += 1;
    return i === mine.length;
};

/**
 * Our nations, as TheSportsDB spells them. `League.country` is Italian and
 * hand-maintained in Supabase; this is the only place the two meet.
 *
 * The gate is the COUNTRY and not the league, because TheSportsDB's `strLeague`
 * is stale: Hull City is filed under the English Premier League while playing
 * in the Championship, so a league gate rejected a correct club. A nation does
 * not go out of date.
 */
const COUNTRY_EN = {
    Belgio: 'Belgium', Brasile: 'Brazil', Francia: 'France', Germania: 'Germany',
    Inghilterra: 'England', Italia: 'Italy', Norvegia: 'Norway', Olanda: 'Netherlands',
    Portogallo: 'Portugal', Scozia: 'Scotland', Spagna: 'Spain', Turchia: 'Turkey',
};

/** Containment, so "Netherlands" still matches their "The Netherlands". */
const sameCountry = (ours, theirs) => {
    const a = flat(COUNTRY_EN[ours] ?? ours);
    return Boolean(a) && flat(theirs).includes(a);
};

/** Does this row name the team, by its own name or one of its alternates? */
const named = (row, team) => norm(row.strTeam) === norm(team)
    || String(row.strTeamAlternate ?? '').split(',').some(alt => norm(alt) === norm(team));

/** One request per key at a time; a network failure is not cached, so it is tried again next time. */
const once = (key, run) => {
    if (!inflight.has(key)) inflight.set(key, run().catch(() => {}).finally(() => inflight.delete(key)));
    return inflight.get(key);
};
const getJson = (path) => fetch(API + path).then(res => (res.ok ? res.json() : Promise.reject(res.status)));

/**
 * The ten clubs TheSportsDB lists for a league. Fetched once per league and
 * shared by every team in it, which is also far cheaper than one request per
 * team - the public key rate-limits hard, and a per-team sweep of our 364 teams
 * lost 219 of them to throttling.
 *
 * A failure is not cached: the entry is dropped so the next team retries.
 */
const leagueTeams = (league) => {
    const name = SDB_LEAGUE[league];
    if (!name) return Promise.resolve([]);
    if (!leagueLists.has(league)) {
        leagueLists.set(league, getJson('search_all_teams.php?l=' + encodeURIComponent(name))
            .then(({ teams: rows }) => rows ?? [])
            .catch(() => { leagueLists.delete(league); return []; }));
    }
    return leagueLists.get(league);
};

/**
 * EXACT across the whole list before any loose match, and the order is not
 * cosmetic: Scotland lists both Dundee and Dundee United, so taking the first
 * loose hit gave "Dundee Utd" Dundee's shirt - a different club - while the
 * correct row was sitting two places later with "Dundee Utd" as an alternate.
 *
 * A kitted row is preferred over a kitless one of the same name, but a kitless
 * exact match is still taken: the row carries `idVenue` too, so rejecting it
 * would cost the club its stadium as well as its shirt.
 */
const fromLeague = (rows, team) => rows.find(x => named(x, team) && x.strEquipment)
    ?? rows.find(x => named(x, team))
    ?? rows.find(x => x.strGender !== 'Female' && x.strEquipment && sameClub(team, x.strTeam));

/**
 * The club's row. An EXACT name match (the name or one of the listed
 * alternates) is taken on its own, as it always was.
 *
 * Anything looser has to clear two gates, and both earn their place: the club
 * must be MALE - otherwise "Brighton" takes Brighton WFC's shirt - and it must
 * be in the same COUNTRY, which is what rejects Newcastle Jets of Australia for
 * "Newcastle". Without a country we do not relax at all, because then only one
 * gate remains - a fixture whose league is missing from the `League` table
 * arrives with neither, and keeps the strict rule.
 *
 * A wrong club's shirt is worse than none, so when in doubt this stores null.
 */
const fromSearch = (rows, team, country) => {
    const soccer = (rows ?? []).filter(x => x.strSport === 'Soccer');
    return soccer.find(x => named(x, team))
        ?? (country && soccer.find(x => x.strGender === 'Male'
            && sameCountry(country, x.strCountry) && sameClub(team, x.strTeam)))
        ?? null;
};

const lookupTeam = (team, league, country) => once(`team:${team}`, () => leagueTeams(league)
    .then(rows => fromLeague(rows, team)
        ?? getJson('searchteams.php?t=' + encodeURIComponent(team))
            .then(({ teams: rows2 }) => fromSearch(rows2, team, country)))
    .then(row => {
        teams[team] = row ? { kit: row.strEquipment || null, venue: row.idVenue || null } : null;
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
export function useJersey(team, league, country) {
    useLookup(team, () => team in teams, () => lookupTeam(team, league, country));
    return (team && teams[team]?.kit) || null;
}

/** The team's stadium `{ photo, name, capacity, location }`, or null while unknown or when there is none. */
export function useStadium(team, league, country) {
    useJersey(team, league, country);
    const id = team && teams[team]?.venue;
    useLookup(id, () => id in venues, () => lookupVenue(id));
    return (id && venues[id]) || null;
}

export const __test = { sameClub, sameCountry, fromLeague, fromSearch, SDB_LEAGUE };

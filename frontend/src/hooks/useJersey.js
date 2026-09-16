import { useEffect, useReducer } from 'react';

// TheSportsDB's public test key, and its CORS-open search. The team row carries
// `strEquipment`, an image of the club's current kit.
const SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';
const LEAGUE = 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=';

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
// v2: the matching rule below changed, and the old key holds `null` for every
// team it used to reject - a cached miss is never retried, so without a new key
// the fix would reach nobody. Same reason the model settings key was bumped.
const STORAGE_KEY = 'olanda_jerseys_v3';

// team name -> kit image URL, or null for "looked, none". Misses are kept too,
// so a team without a kit is not searched again on every visit.
const cache = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; }
})();
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

/**
 * The ten clubs TheSportsDB lists for a league, kitted ones only. Fetched once
 * per league and shared by every team in it, which is also far cheaper than one
 * request per team - the public key rate-limits hard, and a per-team sweep of
 * our 364 teams lost 219 of them to throttling.
 *
 * A failure is not cached: the entry is dropped so the next team retries.
 */
const leagueTeams = (league) => {
    const name = SDB_LEAGUE[league];
    if (!name) return Promise.resolve([]);
    if (!leagueLists.has(league)) {
        leagueLists.set(league, fetch(LEAGUE + encodeURIComponent(name))
            .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
            .then(({ teams }) => (teams ?? []).filter(x => x.strEquipment))
            .catch(() => { leagueLists.delete(league); return []; }));
    }
    return leagueLists.get(league);
};

/**
 * The kit for `team`. An EXACT name match (the name or one of the listed
 * alternates) is taken on its own, as it always was.
 *
 * Anything looser has to clear two gates, and both earn their place: the club
 * must be MALE - otherwise "Brighton" takes Brighton WFC's shirt - and it must
 * be in the same COUNTRY, which is what rejects Newcastle Jets of Australia for
 * "Newcastle". Without a country we do not relax at all, because then only one
 * gate remains; a custom matchup has no league and keeps the strict rule.
 *
 * A wrong club's shirt is worse than none, so when in doubt this returns null.
 * A network failure is not cached, so it is tried again next time.
 */
const remember = (team, row) => {
    cache[team] = row?.strEquipment ?? null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* private mode */ }
    return row;
};

/**
 * EXACT across the whole list before any loose match, and the order is not
 * cosmetic: Scotland lists both Dundee and Dundee United, so taking the first
 * loose hit gave "Dundee Utd" Dundee's shirt - a different club - while the
 * correct row was sitting two places later with "Dundee Utd" as an alternate.
 */
const fromLeague = (rows, team) => rows.find(x => named(x, team))
    ?? rows.find(x => x.strGender !== 'Female' && sameClub(team, x.strTeam));

const lookup = (team, league, country) => {
    if (!inflight.has(team)) {
        inflight.set(team, leagueTeams(league)
            .then(rows => fromLeague(rows, team) ?? fetch(SEARCH + encodeURIComponent(team))
                .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
                .then(({ teams }) => {
                    const kitted = (teams ?? []).filter(x => x.strSport === 'Soccer' && x.strEquipment);
                    return kitted.find(x => named(x, team))
                        ?? (country && kitted.find(x => x.strGender === 'Male'
                            && sameCountry(country, x.strCountry) && sameClub(team, x.strTeam)))
                        ?? null;
                }))
            .then(row => remember(team, row))
            .catch(() => {})
            .finally(() => inflight.delete(team)));
    }
    return inflight.get(team);
};

/** The kit image URL for a team, or null while unknown or when there is none. */
export function useJersey(team, league, country) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        if (!team || team in cache) return;
        let live = true;
        lookup(team, league, country).then(() => { if (live) rerender(); });
        return () => { live = false; };
    }, [team, league, country]);
    return (team && cache[team]) || null;
}

export const __test = { sameClub, sameCountry, fromLeague, SDB_LEAGUE };

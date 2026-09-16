import { useEffect, useReducer } from 'react';

// TheSportsDB's public test key, and its CORS-open search. The team row carries
// `strEquipment`, an image of the club's current kit.
const SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';
// v2: the matching rule below changed, and the old key holds `null` for every
// team it used to reject - a cached miss is never retried, so without a new key
// the fix would reach nobody. Same reason the model settings key was bumped.
const STORAGE_KEY = 'olanda_jerseys_v2';

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
const lookup = (team, country) => {
    if (!inflight.has(team)) {
        inflight.set(team, fetch(SEARCH + encodeURIComponent(team))
            .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
            .then(({ teams }) => {
                const want = norm(team);
                const kitted = (teams ?? []).filter(x => x.strSport === 'Soccer' && x.strEquipment);
                const exact = kitted.find(x => norm(x.strTeam) === want
                    || String(x.strTeamAlternate ?? '').split(',').some(alt => norm(alt) === want));
                const loose = country && kitted.find(x => x.strGender === 'Male'
                    && sameCountry(country, x.strCountry) && sameClub(team, x.strTeam));
                cache[team] = (exact ?? loose)?.strEquipment ?? null;
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* private mode */ }
            })
            .catch(() => {})
            .finally(() => inflight.delete(team)));
    }
    return inflight.get(team);
};

/** The kit image URL for a team, or null while unknown or when there is none. */
export function useJersey(team, country) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        if (!team || team in cache) return;
        let live = true;
        lookup(team, country).then(() => { if (live) rerender(); });
        return () => { live = false; };
    }, [team, country]);
    return (team && cache[team]) || null;
}

export const __test = { sameClub, sameCountry };

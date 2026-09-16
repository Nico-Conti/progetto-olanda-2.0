import { statPair } from './statistics';

/*
   League-table arithmetic, shared by the Standings tab and the team page.
*/

export const newestFirst = (a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? '')) || (b.giornata ?? 0) - (a.giornata ?? 0);

/** Every team's matches seen from its own side, newest first. Matches without `statKey` are skipped. */
export const teamGames = (matches, statKey) => {
    const games = {};
    for (const m of matches) {
        const s = statPair(m, statKey);
        if (!s) continue;
        const { home, away } = m.squadre;
        (games[home] ??= []).push({ match: m, opponent: away, home: true, for: s.home, ag: s.away });
        (games[away] ??= []).push({ match: m, opponent: home, home: false, for: s.away, ag: s.home });
    }
    Object.values(games).forEach(list => list.sort((a, b) => newestFirst(a.match, b.match)));
    return games;
};

export const sampleOf = (list, limit, venue) => {
    const here = venue === 'all' ? list : list.filter(g => g.home === (venue === 'home'));
    return limit === 'all' ? here : here.slice(0, Number(limit));
};

export const leagueTable = (games, limit, venue) => Object.entries(games)
    .map(([team, list]) => {
        const played = sampleOf(list, limit, venue);
        const r = { team, mp: played.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: played.slice(0, 5).reverse() };
        for (const g of played) {
            r.gf += g.for;
            r.ga += g.ag;
            if (g.for > g.ag) r.w++;
            else if (g.for === g.ag) r.d++;
            else r.l++;
        }
        return { ...r, gd: r.gf - r.ga, pts: 3 * r.w + r.d };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));

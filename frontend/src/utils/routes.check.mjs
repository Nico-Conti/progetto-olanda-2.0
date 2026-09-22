// The URL scheme's invariants. Exit code 1 on failure.
//   node src/utils/routes.check.mjs
//
// Slugs are lossy and their failure modes are quiet: a collision silently sends
// two leagues to one page, a non-idempotent slug makes the canonical-rewrite
// effect loop, and a match slug built through `Date` breaks for half the people
// a link is shared with. None of that shows up in a build.
import assert from 'node:assert/strict';
import {
    slug, resolveBySlug, matchSlug, parseRoute, buildPath,
    withStat, statFromSearch, transitionFor, backTargetFor, titleFor, isNoIndex, SITE_TITLE,
} from './routes.js';

// The real 18, from backend/scraper/config.py - the single source of truth for
// leagues. If one is added there and its name collides, this fails.
const LEAGUES = [
    '2. Bundesliga', 'Bundesliga', 'Championship', 'Eerste Divisie', 'Eliteserien',
    'Eredivisie', 'Jupiler League', 'La Liga', 'LaLiga 2', 'Liga Portugal',
    'Ligue 1', 'Ligue 2', 'Premier League', 'Premiership', 'Serie A',
    'Serie A Betano', 'Serie B', 'Super Lig',
];

// ---- slug -------------------------------------------------------------------
assert.equal(slug('Serie A Betano'), 'serie-a-betano');
assert.equal(slug('2. Bundesliga'), '2-bundesliga', 'a leading digit and a dot');
assert.equal(slug('LaLiga 2'), 'laliga-2');
assert.equal(slug('Atlético Madrid'), 'atletico-madrid', 'accents are stripped, not dropped');
assert.equal(slug('  spaced  out  '), 'spaced-out', 'no leading or trailing dashes');
assert.equal(slug(''), '');
assert.equal(slug(null), '');

// Idempotence. Without it the "rewrite to the canonical URL" effect can push a
// new path every render, which under StrictMode's double invocation is a loop.
for (const name of [...LEAGUES, 'Atlético Madrid', '  spaced  out  ', 'Milan']) {
    assert.equal(slug(slug(name)), slug(name), `slug is not idempotent for ${name}`);
}

// Every league slugs to something, and to something DIFFERENT.
const slugs = LEAGUES.map(slug);
assert.ok(slugs.every(Boolean), 'a league slugged to the empty string');
assert.equal(new Set(slugs).size, LEAGUES.length, `league slugs collide: ${slugs.join(', ')}`);
// The two that come closest, spelled out so a future rename is caught here.
assert.notEqual(slug('Serie A'), slug('Serie A Betano'));
assert.notEqual(slug('La Liga'), slug('LaLiga 2'));

assert.equal(resolveBySlug(LEAGUES, 'serie-a-betano'), 'Serie A Betano');
assert.equal(resolveBySlug(LEAGUES, '2-bundesliga'), '2. Bundesliga');
assert.equal(resolveBySlug(LEAGUES, 'nope'), null);
assert.equal(resolveBySlug(LEAGUES, ''), null);

// ---- match slug -------------------------------------------------------------
const leg1 = { home: 'Milan', away: 'Lecce', date: '2026-09-27T18:45:00+00:00' };
const leg2 = { home: 'Lecce', away: 'Milan', date: '2026-10-04T13:00:00+00:00' };
assert.equal(matchSlug(leg1), 'milan-vs-lecce-2026-09-27');
assert.notEqual(matchSlug(leg1), matchSlug(leg2), 'a two-legged tie must give two slugs');

// The timezone trap: a 21:00Z kickoff is the NEXT day in Rome. Slicing the raw
// string keeps one fixture at one URL for everyone; formatting through Date
// would not, and the break would only show for people in other timezones.
assert.equal(
    matchSlug({ home: 'A', away: 'B', date: '2026-09-27T21:00:00+00:00' }),
    'a-vs-b-2026-09-27',
    'the date must come off the raw ISO string, never through Date',
);

// ---- parse / build round trip ----------------------------------------------
const cases = [
    ['/', { view: 'landing' }],
    ['/hot-matches', { view: 'hot-matches' }],
    ['/market-moves', { view: 'market-moves' }],
    ['/winning-factor', { view: 'highest-winning-factor' }],
    ['/bonus-planner', { view: 'bonus-planner' }],
    ['/league/serie-a', { view: 'dashboard', tab: 'predictor', league: 'serie-a' }],
    ['/league/serie-a/standings', { view: 'dashboard', tab: 'standings', league: 'serie-a' }],
    ['/league/serie-a/team/milan', { view: 'dashboard', tab: 'team-details', league: 'serie-a', team: 'milan' }],
    ['/league/serie-a/match/milan-vs-lecce-2026-09-27',
        { view: 'dashboard', tab: 'predictor', league: 'serie-a', match: 'milan-vs-lecce-2026-09-27' }],
];
for (const [path, expected] of cases) {
    assert.deepEqual(parseRoute(path), expected, `parseRoute('${path}')`);
    // Trailing slashes are stripped by the filter(Boolean), so /x and /x/ are
    // one route - otherwise a shared link with a stray slash would 404.
    assert.deepEqual(parseRoute(`${path}/`), expected, `a trailing slash changed '${path}'`);
}
for (const junk of ['/nope', '/league', '/league/serie-a/nope', '/league/serie-a/team', '/privacy']) {
    assert.equal(parseRoute(junk).view, 'not-found', `'${junk}' should not resolve`);
}

assert.equal(buildPath({ view: 'landing' }), '/');
assert.equal(buildPath({ view: 'hot-matches' }), '/hot-matches');
assert.equal(buildPath({ view: 'highest-winning-factor' }), '/winning-factor');
assert.equal(buildPath({ view: 'dashboard', league: 'Serie A Betano' }), '/league/serie-a-betano');
assert.equal(buildPath({ view: 'dashboard', league: 'Serie A', tab: 'standings' }), '/league/serie-a/standings');
assert.equal(buildPath({ view: 'dashboard', league: 'Serie A', team: 'Milan' }), '/league/serie-a/team/milan');
assert.equal(buildPath({ view: 'dashboard', league: 'Serie A', match: leg1 }),
    '/league/serie-a/match/milan-vs-lecce-2026-09-27');

// build -> parse -> the same identity back
for (const built of [
    buildPath({ view: 'dashboard', league: 'Serie A Betano' }),
    buildPath({ view: 'dashboard', league: 'Serie A', tab: 'standings' }),
    buildPath({ view: 'dashboard', league: '2. Bundesliga', team: 'Bayern Munich' }),
    buildPath({ view: 'dashboard', league: 'Serie A', match: leg1 }),
]) {
    assert.equal(buildPath({ ...parseRoute(built), league: parseRoute(built).league }), built,
        `round trip failed for ${built}`);
}

// ---- the statistic, a dimension not an identity -----------------------------
const STATS = ['corners', 'goals', 'fouls'];
assert.equal(withStat('/league/serie-a', 'corners'), '/league/serie-a', 'the default is omitted');
assert.equal(withStat('/league/serie-a', 'goals'), '/league/serie-a?stat=goals');
assert.equal(statFromSearch('?stat=goals', STATS), 'goals');
assert.equal(statFromSearch('?stat=bogus', STATS), null, 'an unknown statistic falls back, it does not 404');
assert.equal(statFromSearch('', STATS), null);

// ---- transitions ------------------------------------------------------------
const at = (pathname) => ({ pathname });
assert.equal(transitionFor(at('/'), at('/league/serie-a')).kind, 'stinger', 'entering a league');
assert.equal(transitionFor(at('/'), at('/hot-matches')).kind, 'spiral', 'entering a section');
assert.equal(transitionFor(at('/league/serie-a'), at('/')), null, 'leaving is instant');
assert.equal(transitionFor(at('/league/serie-a'), at('/league/serie-a/standings')), null,
    'moving inside a league is instant');
assert.equal(transitionFor(at('/league/serie-a'), at('/hot-matches')), null,
    'only the landing page animates');
assert.equal(transitionFor(at('/'), at('/')), null);
assert.equal(transitionFor(at('/'), at('/nope')), null, 'not-found does not animate');

// ---- back targets -----------------------------------------------------------
const back = (pathname, from) => backTargetFor({ pathname, state: from ? { from } : undefined });
assert.equal(back('/league/serie-a/match/a-vs-b-2026-01-01', '/hot-matches').labelKey, 'Back to Hot Matches');
assert.equal(back('/league/serie-a/match/a-vs-b-2026-01-01', '/market-moves').labelKey, 'Back to Market Moves');
assert.equal(back('/league/serie-a/match/a-vs-b-2026-01-01', '/winning-factor').labelKey, 'Back to Winning Factor');

const fromTeam = backTargetFor(
    { pathname: '/league/serie-a/match/a-vs-b-2026-01-01', state: { from: '/league/serie-a/team/milan' } },
    { fromTeam: 'Milan' },
);
assert.equal(fromTeam.labelKey, 'Back to {team}');
assert.equal(fromTeam.vars.team, 'Milan', 'the label uses the resolved name, not the slug');

// Opened from the league's own fixture list: there IS an entry behind us, so
// Back must STEP BACK onto it. Returning history:false here pushed a new entry
// instead, and the next Back went forwards again.
const fromList = back('/league/serie-a/match/a-vs-b-2026-01-01', '/league/serie-a');
assert.equal(fromList.history, true, 'an origin means navigate(-1), never a push');
assert.equal(fromList.to, '/league/serie-a');
assert.equal(fromList.labelKey, 'Back to Fixtures');

// A team opened FROM a match returns to that match, not to the standings.
const teamFromMatch = back('/league/serie-a/team/roma', '/league/serie-a/match/a-vs-b-2026-01-01');
assert.equal(teamFromMatch.history, true);
assert.equal(teamFromMatch.to, '/league/serie-a/match/a-vs-b-2026-01-01');

// A pasted link has no history behind it: fall back to the parent, and say so
// with `history: false` so the caller pushes instead of calling navigate(-1).
const pasted = back('/league/serie-a/match/a-vs-b-2026-01-01');
assert.equal(pasted.history, false);
assert.equal(pasted.to, '/league/serie-a');
assert.equal(pasted.labelKey, 'Back to Fixtures');
assert.equal(back('/league/serie-a/team/milan').to, '/league/serie-a/standings');
assert.equal(back('/hot-matches'), null, 'a section has no contextual back');
assert.equal(back('/league/serie-a'), null, 'nor does a league root');
assert.equal(back('/league/serie-a/match/x', '/hot-matches').history, true,
    'with history behind us, Back means navigate(-1)');

// ---- titles and indexing ----------------------------------------------------
assert.equal(titleFor({ view: 'landing' }), SITE_TITLE, 'the landing title must match index.html exactly');
assert.equal(titleFor(parseRoute('/league/serie-a'), { league: 'Serie A' }), `Serie A — ${SITE_TITLE}`);
assert.equal(titleFor(parseRoute('/league/serie-a/team/milan'), { league: 'Serie A', team: 'Milan' }),
    `Milan — Serie A — ${SITE_TITLE}`);
assert.equal(titleFor(parseRoute('/league/serie-a'), {}), SITE_TITLE,
    'unresolved names keep the static title rather than showing a slug');

assert.equal(isNoIndex(parseRoute('/league/serie-a/team/milan')), true);
assert.equal(isNoIndex(parseRoute('/league/serie-a/match/a-vs-b-2026-01-01')), true);
assert.equal(isNoIndex(parseRoute('/league/serie-a')), false, 'league roots stay indexable');
assert.equal(isNoIndex(parseRoute('/hot-matches')), false);

console.log('routes: ok');

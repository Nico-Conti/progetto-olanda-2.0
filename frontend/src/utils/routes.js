// `../i18n/index.js`, not `../i18n`: Vite resolves the directory but node does
// not, and routes.check.mjs imports this module directly. `tk` is the identity
// marker that keeps a label literal visible to `src/i18n/check.mjs`, so the
// keys below stay translated even though nothing calls `t()` on them here.
import { tk } from '../i18n/index.js';

/**
 * The URL scheme, as pure functions. No React, no router import.
 *
 * The app used to be one URL: every destination was React state in App.jsx, so
 * nothing could be shared, Back left the site, and a refresh always returned to
 * the landing page. This is the parsing half of fixing that. App keeps its own
 * conditional rendering and simply reads `parseRoute(pathname)` where it used to
 * read `useState` - the router supplies history and links, not layout.
 *
 * Keeping it pure and React-free is what lets `routes.check.mjs` exercise it in
 * node, which matters: slugs are lossy and the failure modes are quiet.
 */

/** `/league/...`, never a bare `/:league`. The prefix is load-bearing.
 *
 * `netlify.toml` rewrites /privacy, /privacy/en, /terms and /terms/en to real
 * static files before React ever sees them - but **`vite dev` does not read
 * netlify.toml**, so in dev those paths fall through to the SPA. A top-level
 * `/:league` would swallow them there and not in production, and the only
 * defence would be a blocklist that someone has to extend for every new file
 * dropped in `public/`. Seven characters removes the whole class of bug. */
export const LEAGUE_PREFIX = 'league';

/** URL segment -> App's existing `view` string. The names differ on purpose:
 *  `/winning-factor` reads better than the internal 'highest-winning-factor',
 *  and renaming the view would touch far more than this table. */
const SECTIONS = {
    'hot-matches': 'hot-matches',
    'market-moves': 'market-moves',
    'winning-factor': 'highest-winning-factor',
    'bonus-planner': 'bonus-planner',
};
const SECTION_PATH = Object.fromEntries(Object.entries(SECTIONS).map(([path, view]) => [view, path]));

/**
 * A display name as a URL segment.
 *
 * DELIBERATELY LOSSY AND NOT REVERSIBLE. There is no slug column on the
 * frontend and the `League` table is hand-maintained in Supabase, so a
 * reversible encoding would mean inventing an identifier the backend does not
 * have - and this project has been bitten repeatedly by parallel lists of
 * leagues drifting apart. Resolution is therefore always "slugify the
 * candidates and compare", never "parse the slug back". See `resolveBySlug`.
 *
 *   Serie A Betano -> serie-a-betano      2. Bundesliga -> 2-bundesliga
 *   La Liga        -> la-liga             LaLiga 2      -> laliga-2
 */
export const slug = (value) => String(value ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The one candidate whose name slugifies to `wanted`, or null.
 *  First match wins: two hand-maintained rows could in principle collide, and
 *  picking one is better than crashing. */
export const resolveBySlug = (names, wanted) => {
    if (!wanted) return null;
    for (const name of names) if (slug(name) === wanted) return name;
    return null;
};

/**
 * A fixture as a URL segment.
 *
 * league + home + away + KICKOFF DATE, because (home, away) does not identify a
 * fixture - two-legged ties exist, which is why a saved bet leg records the
 * date separately.
 *
 * The date is sliced off the RAW ISO string, never formatted through `Date`.
 * `match_date` is a UTC instant, so a 21:00Z kickoff renders as the next day
 * east of Greenwich: formatting it locally would give two different slugs for
 * one fixture and every shared link would break for half the people who got it.
 */
export const matchSlug = (match) => (match
    ? `${slug(match.home)}-vs-${slug(match.away)}-${String(match.date ?? '').slice(0, 10)}`
    : '');

/** Identity only. The statistic is a dimension and rides in the query string. */
export const parseRoute = (pathname) => {
    const [first, second, third, fourth, ...rest] = String(pathname || '/')
        .split('/').filter(Boolean).map(decodeURIComponent);

    if (!first) return { view: 'landing' };
    if (SECTIONS[first] && !second) return { view: SECTIONS[first] };

    if (first === LEAGUE_PREFIX && second) {
        const league = second;
        if (!third) return { view: 'dashboard', tab: 'predictor', league };
        if (third === 'standings' && !fourth) return { view: 'dashboard', tab: 'standings', league };
        if (third === 'team' && fourth && !rest.length) return { view: 'dashboard', tab: 'team-details', league, team: fourth };
        if (third === 'match' && fourth && !rest.length) return { view: 'dashboard', tab: 'predictor', league, match: fourth };
    }
    return { view: 'not-found' };
};

/**
 * The inverse, from DISPLAY values - callers hold names, not slugs.
 * `buildPath({ view:'dashboard', league:'Serie A', team:'Milan' })`
 */
export const buildPath = ({ view, tab, league, team, match } = {}) => {
    if (!view || view === 'landing') return '/';
    if (SECTION_PATH[view]) return `/${SECTION_PATH[view]}`;
    if (view !== 'dashboard' || !league) return '/';

    const base = `/${LEAGUE_PREFIX}/${slug(league)}`;
    if (match) return `${base}/match/${typeof match === 'string' ? match : matchSlug(match)}`;
    if (team || tab === 'team-details') return `${base}/team/${slug(team)}`;
    if (tab === 'standings') return `${base}/standings`;
    return base;
};

/** `?stat=` if it differs from the default, dropped otherwise, so the common
 *  URL stays clean and the canonical tag has one form to point at. */
export const withStat = (path, statistic, fallback = 'corners') =>
    (statistic && statistic !== fallback ? `${path}?stat=${encodeURIComponent(statistic)}` : path);

/** The statistic a URL asks for, or null when absent or not one we predict.
 *  A dimension that does not resolve falls back silently - only IDENTITY that
 *  does not resolve is an error. */
export const statFromSearch = (search, valid) => {
    const asked = new URLSearchParams(search || '').get('stat');
    return asked && valid.includes(asked) ? asked : null;
};

/**
 * Which entry animation a navigation should play, if any.
 *
 * Every animated transition starts at the landing page and always has: only the
 * league picker ever set `pendingLeague`, opening a match is deliberately
 * instant, and leaving a section is instant too. Expressed as one predicate,
 * that is "where you came from", which keeps the round trip honest - and makes
 * the FORWARD button replay the stinger, which the old click-driven machine
 * could not do.
 */
export const transitionFor = (from, to) => {
    if (!from || !to || from.pathname === to.pathname) return null;
    if (from.pathname !== '/') return null;
    const target = parseRoute(to.pathname);
    if (target.view === 'dashboard') return { kind: 'stinger', league: target.league };
    if (SECTION_PATH[target.view]) return { kind: 'spiral' };
    return null;
};

/**
 * Where the contextual Back button goes, and what it says.
 *
 * The ORIGIN PATH is what gets stored, in `location.state.from`, never the
 * rendered label: the label is a translation key resolved at render time, and a
 * stored string would go stale the moment someone switched language.
 *
 * `history` true means the caller should `navigate(-1)` rather than push `to` -
 * correct for opponent-hopping, where pushing forward would record a new
 * `from` and bounce between the same two pages for ever. `to` is still returned
 * so the button can be a real <a href> that middle-clicks.
 */
export const backTargetFor = ({ pathname, state } = {}, names = {}) => {
    const here = parseRoute(pathname);
    if (here.view !== 'dashboard' || (!here.match && !here.team)) return null;
    const league = here.league;
    const from = state?.from;
    const origin = from ? parseRoute(from) : null;

    if (origin && SECTION_PATH[origin.view]) {
        return {
            to: from,
            history: true,
            labelKey: {
                'hot-matches': tk('Back to Hot Matches'),
                'market-moves': tk('Back to Market Moves'),
                'highest-winning-factor': tk('Back to Winning Factor'),
                'bonus-planner': tk('Back to Previous'),
            }[origin.view],
        };
    }
    // From a team page: name it, using the RESOLVED display name rather than
    // the slug - "Back to Milan", not "Back to milan".
    if (origin?.team) {
        return { to: from, history: true, labelKey: tk('Back to {team}'), vars: { team: names.fromTeam ?? origin.team } };
    }
    if (origin?.match && here.team) {
        return { to: from, history: true, labelKey: tk('Back to Previous') };
    }
    // No origin: a pasted link, so there is nothing behind us in this session.
    // Fall back to the parent, matching what the old empty-trail case did.
    return here.match
        ? { to: `/${LEAGUE_PREFIX}/${league}`, history: false, labelKey: tk('Back to Fixtures') }
        : { to: `/${LEAGUE_PREFIX}/${league}/standings`, history: false, labelKey: tk('Back to Standings') };
};

const SECTION_TITLE = {
    'hot-matches': tk('Hot Matches'),
    'market-moves': tk('Market Moves'),
    'highest-winning-factor': tk('Winning Factor'),
    'bonus-planner': tk('Best Bonus Slips'),
};

/**
 * `document.title` for a route. Built from RESOLVED display names, never slugs,
 * so it waits for resolution and the caller keeps the static title until then.
 * The landing page's title is byte-identical to index.html's, so the first
 * paint never flickers.
 */
export const SITE_TITLE = 'Progetto Olanda 2.0';
export const titleFor = (route, names = {}) => {
    if (!route || route.view === 'landing') return SITE_TITLE;
    if (SECTION_TITLE[route.view]) return `${names.section ?? ''} — ${SITE_TITLE}`.replace(/^ — /, '');
    if (route.view !== 'dashboard') return SITE_TITLE;

    const league = names.league;
    if (!league) return SITE_TITLE;
    if (names.match) return `${names.match} — ${league} — ${SITE_TITLE}`;
    if (names.team) return `${names.team} — ${league} — ${SITE_TITLE}`;
    if (route.tab === 'standings') return `${names.standings ?? 'Standings'} — ${league} — ${SITE_TITLE}`;
    return `${league} — ${SITE_TITLE}`;
};

/** Thin pages that churn: a match is stale within the week and a team page is
 *  a handful of numbers. Thousands of soft-thin URLs is an SEO liability, and
 *  given this site's Safe Browsing history it is not a risk worth running. */
export const isNoIndex = (route) => Boolean(route?.match || route?.team);

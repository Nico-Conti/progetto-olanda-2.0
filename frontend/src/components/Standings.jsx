import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, ChevronDown, ChevronRight, ChevronUp, Crown, ListOrdered, Trophy } from 'lucide-react';
import Select from './ui/Select';
import SlidingTabs from './ui/SlidingTabs';
import SeasonResults from './SeasonResults';
import { getStatLabel, resolveStatKey } from '../utils/statistics';
import { teamGames, sampleOf, leagueTable } from '../utils/standings';
import { staggerDelay } from '../utils/stagger';
import { motionAllowed } from '../utils/leaguePickerFx';
import { t, tk, dateLocale } from '../i18n';

const VIEWS = [
    { id: 'table', label: tk('Table'), Icon: Trophy },
    { id: 'results', label: tk('Results'), Icon: ListOrdered },
];
// "Last" drops on phones, where four "Last N" tabs do not fit the width.
const SAMPLES = ['all', '5', '10', '15'].map(id => ({
    id,
    label: id === 'all' ? tk('All') : id,
}));
const VENUES = [
    { id: 'all', label: tk('Total') },
    { id: 'home', label: tk('Home') },
    { id: 'away', label: tk('Away') },
];

const ZONE = {
    ucl: { label: tk('Champions League'), text: 'text-sky-400' },
    uel: { label: tk('Europa League'), text: 'text-orange-400' },
    uecl: { label: tk('Conference League'), text: 'text-emerald-400' },
    eplay: { label: tk('European play-offs'), text: 'text-teal-300' },
    lib: { label: tk('Libertadores'), text: 'text-sky-400' },
    libq: { label: tk('Libertadores qualifiers'), text: 'text-sky-200' },
    sud: { label: tk('Sudamericana'), text: 'text-orange-400' },
    promo: { label: tk('Promotion'), text: 'text-emerald-400' },
    pplay: { label: tk('Promotion play-offs'), text: 'text-lime-300' },
    rplay: { label: tk('Relegation play-off'), text: 'text-amber-400' },
    rel: { label: tk('Relegation'), text: 'text-red-500' },
};

// Where each place leads: `top` counts down from 1st, `bottom` lists the last
// places in table order. 2026/27 formats, simplified - cup winners and UEFA
// coefficients shift places every year, so this is indicative. Leagues missing
// here (Jupiler League's play-off split, for one) get no stripes.
const ZONES = {
    'Premier League': { top: [['ucl', 4], ['uel', 1], ['uecl', 1]], bottom: [['rel', 3]] },
    'La Liga': { top: [['ucl', 4], ['uel', 1], ['uecl', 1]], bottom: [['rel', 3]] },
    'Serie A': { top: [['ucl', 4], ['uel', 1], ['uecl', 1]], bottom: [['rel', 3]] },
    'Bundesliga': { top: [['ucl', 4], ['uel', 1], ['uecl', 1]], bottom: [['rplay', 1], ['rel', 2]] },
    'Ligue 1': { top: [['ucl', 4], ['uel', 1], ['uecl', 1]], bottom: [['rplay', 1], ['rel', 2]] },
    'Eredivisie': { top: [['ucl', 2], ['uel', 1], ['uecl', 1], ['eplay', 4]], bottom: [['rplay', 1], ['rel', 2]] },
    'Liga Portugal': { top: [['ucl', 2], ['uel', 1], ['uecl', 1]], bottom: [['rplay', 1], ['rel', 2]] },
    'Super Lig': { top: [['ucl', 2], ['uel', 1], ['uecl', 1]], bottom: [['rel', 3]] },
    'Eliteserien': { top: [['ucl', 1], ['uecl', 2]], bottom: [['rplay', 1], ['rel', 2]] },
    'Premiership': { bottom: [['rplay', 1], ['rel', 1]] },
    'Serie A Betano': { top: [['lib', 4], ['libq', 2], ['sud', 6]], bottom: [['rel', 4]] },
    'Serie B': { top: [['promo', 2], ['pplay', 6]], bottom: [['rplay', 2], ['rel', 3]] },
    'Championship': { top: [['promo', 2], ['pplay', 4]], bottom: [['rel', 3]] },
    '2. Bundesliga': { top: [['promo', 2], ['pplay', 1]], bottom: [['rplay', 1], ['rel', 2]] },
    'LaLiga 2': { top: [['promo', 2], ['pplay', 4]], bottom: [['rel', 4]] },
    'Ligue 2': { top: [['promo', 2], ['pplay', 3]], bottom: [['rplay', 1], ['rel', 2]] },
    'Eerste Divisie': { top: [['promo', 2]] },
};

const zoneAt = (league, pos, size) => {
    const z = ZONES[league];
    if (!z) return null;
    let edge = 0;
    for (const [kind, n] of z.top ?? []) if (pos <= (edge += n)) return kind;
    edge = size + 1;
    for (const [kind, n] of [...(z.bottom ?? [])].reverse()) if (pos >= (edge -= n)) return kind;
    return null;
};

const statTable = (games, limit, venue, sort) => Object.entries(games)
    .map(([team, list]) => {
        const played = sampleOf(list, limit, venue);
        const n = played.length || 1;
        const f = played.reduce((s, g) => s + g.for, 0) / n;
        const a = played.reduce((s, g) => s + g.ag, 0) / n;
        return { team, mp: played.length, for: f, ag: a, tot: f + a };
    })
    .sort((a, b) => (a.mp === 0) - (b.mp === 0)
        || (sort.dir === 'desc' ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key])
        || a.team.localeCompare(b.team));

/**
 * FLIP for rows that reorder: call the returned `capture()` just before a
 * change, and every `[data-flip]` row then glides from where it was to where
 * it lands. Measures on screen, so a row caught mid-glide carries on smoothly.
 */
const useFlip = (ref) => {
    const first = useRef(null);
    useLayoutEffect(() => {
        const before = first.current;
        first.current = null;
        if (!before || !ref.current) return;
        ref.current.querySelectorAll('[data-flip]').forEach(el => {
            if (!before.has(el.dataset.flip)) return;
            el.getAnimations().forEach(a => a.cancel());
            const dy = before.get(el.dataset.flip) - el.getBoundingClientRect().top;
            if (Math.abs(dy) < 1) return;
            el.animate(
                [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
                { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
        });
    });
    return () => {
        if (!ref.current || !motionAllowed()) return;
        first.current = new Map([...ref.current.querySelectorAll('[data-flip]')]
            .map(el => [el.dataset.flip, el.getBoundingClientRect().top]));
    };
};

const FORM = {
    W: 'bg-emerald-500 md:bg-emerald-500/15 md:text-emerald-400 md:border-emerald-500/30',
    D: 'bg-zinc-500 md:bg-zinc-500/15 md:text-zinc-300 md:border-zinc-500/30',
    L: 'bg-red-500 md:bg-red-500/15 md:text-red-400 md:border-red-500/30',
};
const outcome = (g) => (g.for > g.ag ? 'W' : g.for === g.ag ? 'D' : 'L');
const shortDate = (d) => {
    const when = d ? new Date(d) : null;
    return when && !isNaN(when) ? when.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short' }) : '';
};
/** "Home 2-1 Away", always in fixture order. */
const scoreline = (team, g) => g.home
    ? `${team} ${g.for}-${g.ag} ${g.opponent}`
    : `${g.opponent} ${g.ag}-${g.for} ${team}`;

// Pos, Team, [MP], [W, D, L], [GF, GA], GD, Pts, Form, chevron - bracketed ones
// drop out below md / lg, and grid auto-placement closes the gaps.
const TABLE_COLS = 'grid-cols-[2rem_minmax(0,1fr)_2rem_2.25rem_2.75rem_1rem] md:grid-cols-[3rem_minmax(0,1fr)_repeat(6,2.5rem)_8.5rem_1.25rem] lg:grid-cols-[3.5rem_minmax(0,1fr)_repeat(8,2.75rem)_8.5rem_1.25rem]';
// Pos, Team, [MP], For, Against, Total, chevron.
const STAT_COLS = 'grid-cols-[2rem_minmax(0,1fr)_2.75rem_2.75rem_3.25rem_1rem] md:grid-cols-[3rem_minmax(0,1fr)_3rem_5rem_5rem_10rem_1.25rem]';

const Movement = ({ n }) => {
    if (n == null) return null;
    if (n === 0) return <span className="hidden md:block w-2 h-px bg-zinc-700" aria-hidden="true" />;
    const Icon = n > 0 ? ChevronUp : ChevronDown;
    return (
        <span
            className={`flex items-center text-[10px] font-bold tabular-nums ${n > 0 ? 'text-emerald-400' : 'text-red-400'}`}
            title={n > 0 ? t('Up {n} since the previous matchday', { n }) : t('Down {n} since the previous matchday', { n: -n })}
        >
            <Icon className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
            <span className="hidden md:inline">{Math.abs(n)}</span>
            <span className="sr-only">{n > 0 ? t('up {n}', { n }) : t('down {n}', { n: -n })}</span>
        </span>
    );
};

const Group = ({ label, children }) => (
    <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
        {children}
    </div>
);

const Chip = ({ label, value, tone = 'text-white' }) => (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 py-1.5 text-center">
        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t(label)}</div>
        <div className={`text-sm font-black tabular-nums ${tone}`}>{value}</div>
    </div>
);

/**
 * The Standings tab: season, table/results switch and the sample filters in
 * one toolbar that sticks under the app header (md and up) together with the
 * column names. The table ranks by points, or - "rank by" - by the selected
 * statistic's per-game averages. Changing any of it slides the rows to their
 * new places. Below md a row taps open into its details instead of leaving
 * for the team page.
 */
const Standings = ({
    matchData,
    teamLogos,
    onTeamClick,
    league,
    seasons,
    season,
    latestSeason,
    onSeasonChange,
    view,
    onViewChange,
    selectedStatistic,
}) => {
    const [limit, setLimit] = useState('all');
    const [venue, setVenue] = useState('all');
    const [rankBy, setRankBy] = useState('points');
    const [sort, setSort] = useState({ key: 'tot', dir: 'desc' });
    const [openTeam, setOpenTeam] = useState(null);
    const listRef = useRef(null);
    const capture = useFlip(listRef);
    const glide = (set) => (value) => { capture(); set(value); };

    const statKey = resolveStatKey(selectedStatistic);
    // Ranking by goals would only repeat GF and GA, so the switch hides for it.
    const byStat = rankBy === 'stat' && statKey !== 'goals';
    const fullTable = !byStat && limit === 'all' && venue === 'all';

    const games = useMemo(() => teamGames(matchData, 'goals'), [matchData]);

    // Position a matchday ago, under the same filters: the table without each
    // team's latest match. Per team rather than by giornata, which is patchy
    // for postponed games.
    const previous = useMemo(() => {
        const latest = new Set(Object.values(games).map(list => list[0].match));
        const table = leagueTable(teamGames(matchData.filter(m => !latest.has(m)), 'goals'), limit, venue);
        return new Map(table.map((r, i) => [r.team, i]));
    }, [games, matchData, limit, venue]);

    const rows = useMemo(() => (byStat
        ? statTable(teamGames(matchData, statKey), limit, venue, sort)
        : leagueTable(games, limit, venue)
    ), [byStat, matchData, statKey, games, limit, venue, sort]);
    // After the memo: handing statKey to a function first reads, to the React
    // Compiler, as a possible mutation of a memo dependency.
    const statLabel = getStatLabel(statKey);

    const finished = season && latestSeason && season !== latestSeason;
    const zones = new Set();

    const onSort = (key) => {
        capture();
        setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    };
    const onRow = (team) => {
        if (window.matchMedia('(min-width: 768px)').matches) onTeamClick?.(team);
        else setOpenTeam(t => (t === team ? null : team));
    };

    // A function, not a component: a component declared in here would remount
    // on every render and drop keyboard focus after each sort.
    const sortHeader = (id, label) => (
        <div role="columnheader" aria-sort={sort.key === id ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
            <button
                type="button"
                onClick={() => onSort(id)}
                className={`w-full flex items-center justify-center gap-0.5 uppercase tracking-wider transition-colors hover:text-zinc-200 ${sort.key === id ? 'text-emerald-400' : ''}`}
            >
                {label}
                {sort.key === id && (sort.dir === 'desc'
                    ? <ArrowDown className="w-3 h-3" aria-hidden="true" />
                    : <ArrowUp className="w-3 h-3" aria-hidden="true" />)}
            </button>
        </div>
    );

    const cols = byStat ? STAT_COLS : TABLE_COLS;
    const num = 'text-center tabular-nums text-sm';

    return (
        <div>
            {/* z-30 keeps the Select's dropdown and the stuck bar above the rows. */}
            <div className="relative z-30 md:sticky md:top-[var(--app-header-h,0px)]">
                <div className={`bg-zinc-900 border border-white/10 shadow-xl px-3 py-3 md:px-4 flex flex-wrap items-center gap-x-6 gap-y-3 ${view === 'table' ? 'rounded-t-xl' : 'rounded-xl'}`}>
                    <Group label={t('Season')}>
                        {seasons.length > 1 ? (
                            <Select
                                value={season}
                                onChange={glide(onSeasonChange)}
                                options={seasons.map(sn => ({ value: sn, label: sn === latestSeason ? t('{season} (current)', { season: sn }) : sn }))}
                                className="w-[200px]"
                            />
                        ) : (
                            <span className="text-sm font-bold text-white px-1">{season ?? '-'}</span>
                        )}
                    </Group>
                    <SlidingTabs items={VIEWS.map(v => ({ ...v, label: t(v.label) }))} value={view} onChange={onViewChange} className="border border-white/5" tabClassName="font-bold whitespace-nowrap" />

                    {view === 'table' && (
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:ml-auto animate-in fade-in duration-300">
                            {statKey !== 'goals' && (
                                <Group label={t('Rank by')}>
                                    <SlidingTabs
                                        items={[
                                            { id: 'points', label: t('Points'), Icon: Trophy },
                                            { id: 'stat', label: statLabel, Icon: BarChart3 },
                                        ]}
                                        value={rankBy}
                                        onChange={glide(setRankBy)}
                                        className="border border-white/5"
                                        tabClassName="font-bold whitespace-nowrap"
                                    />
                                </Group>
                            )}
                            <Group label={t('Sample')}>
                                <SlidingTabs items={SAMPLES.map(s => ({ ...s, label: s.id === 'all' ? t(s.label) : <><span className="hidden sm:inline">{t('Last')} </span>{s.id}</> }))} value={limit} onChange={glide(setLimit)} className="border border-white/5" tabClassName="font-bold whitespace-nowrap" />
                            </Group>
                            <Group label={t('Venue')}>
                                <SlidingTabs items={VENUES.map(v => ({ ...v, label: t(v.label) }))} value={venue} onChange={glide(setVenue)} className="border border-white/5" tabClassName="font-bold whitespace-nowrap" />
                            </Group>
                        </div>
                    )}
                </div>

                {view === 'table' && rows.length > 0 && (
                    <div role="row" className={`grid ${cols} items-center gap-x-1.5 px-3 md:px-4 h-9 bg-zinc-950 border-x border-b border-white/10 text-[10px] font-bold text-zinc-500 uppercase tracking-wider`}>
                        <div role="columnheader" className="text-center">#</div>
                        <div role="columnheader">{t('Team')}</div>
                        {byStat ? (
                            <>
                                <div role="columnheader" className="hidden md:block text-center">{t('MP')}</div>
                                {sortHeader('for', t('For'))}
                                {sortHeader('ag', t('Ag'))}
                                {sortHeader('tot', t('Total'))}
                            </>
                        ) : (
                            <>
                                <div role="columnheader" className="hidden md:block text-center">{t('MP')}</div>
                                <div role="columnheader" className="hidden md:block text-center">{t('W')}</div>
                                <div role="columnheader" className="hidden md:block text-center">{t('D')}</div>
                                <div role="columnheader" className="hidden md:block text-center">{t('L')}</div>
                                <div role="columnheader" className="hidden lg:block text-center">{t('GF')}</div>
                                <div role="columnheader" className="hidden lg:block text-center">{t('GA')}</div>
                                <div role="columnheader" className="text-center">{t('GD')}</div>
                                <div role="columnheader" className="text-center text-white">{t('Pts')}</div>
                                <div role="columnheader" className="text-center" title={t('Oldest to latest, left to right')}>{t('Form')}</div>
                            </>
                        )}
                        <div aria-hidden="true" />
                    </div>
                )}
            </div>

            {view === 'results' ? (
                <div className="mt-4">
                    <SeasonResults matchData={matchData} teamLogos={teamLogos} season={season} onTeamClick={onTeamClick} />
                </div>
            ) : rows.length === 0 ? (
                <div className="bg-zinc-900/50 border-x border-b border-white/10 rounded-b-xl p-10 text-center">
                    <p className="text-zinc-300 text-sm font-bold">{season ? t('No matches played yet in {season}', { season }) : t('No matches played yet this season')}</p>
                    <p className="text-zinc-500 text-xs mt-2 max-w-sm mx-auto">
                        {t('The table fills in as results come in. Pick an earlier season above to see a finished one.')}
                    </p>
                </div>
            ) : (
                <div role="table" aria-label={byStat ? t('{stat} per game', { stat: statLabel }) : t('League table')} className="bg-zinc-900/50 backdrop-blur-md border-x border-b border-white/10 rounded-b-xl shadow-xl">
                    <div ref={listRef} className="divide-y divide-white/5">
                        {rows.map((row, i) => {
                            const zone = fullTable ? zoneAt(league, i + 1, rows.length) : null;
                            if (zone) zones.add(zone);
                            const move = byStat || !previous.size || !previous.has(row.team) ? null : previous.get(row.team) - i;
                            const open = openTeam === row.team;
                            return (
                                <div key={row.team} data-flip={row.team} role="rowgroup" className="relative animate-waterfall" style={{ animationDelay: staggerDelay(i) }}>
                                    <div
                                        role="row"
                                        onClick={() => onRow(row.team)}
                                        className={`group relative grid ${cols} items-center gap-x-1.5 px-3 md:px-4 h-12 md:h-14 cursor-pointer transition-colors duration-200 hover:bg-white/[0.04] ${open ? 'bg-white/[0.04]' : ''}`}
                                    >
                                        {zone && (
                                            <span
                                                aria-hidden="true"
                                                className={`zone-stripe absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-current shadow-[0_0_10px_currentColor] ${ZONE[zone].text}`}
                                                style={{ animationDelay: staggerDelay(i) }}
                                            />
                                        )}

                                        <div role="cell" className="flex items-center justify-center gap-1">
                                            <span className={`w-4 md:w-5 text-right font-mono text-sm tabular-nums transition-colors ${zone ? ZONE[zone].text : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                                {i + 1}
                                            </span>
                                            <Movement n={move} />
                                        </div>

                                        <div role="cell" className="min-w-0">
                                            <button type="button" className="flex items-center gap-2.5 md:gap-3 min-w-0 max-w-full text-left rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                                                <img
                                                    src={teamLogos[row.team]}
                                                    alt=""
                                                    className="w-6 h-6 md:w-7 md:h-7 object-contain flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                                                />
                                                <span className="truncate text-sm md:text-[15px] font-bold text-zinc-200 group-hover:text-white transition-colors">
                                                    {row.team}
                                                </span>
                                                {zone && <span className="sr-only">, {t(ZONE[zone].label)}</span>}
                                                {finished && fullTable && i === 0 && (
                                                    <span className="champion-pill flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/30 px-1.5 md:px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                                                        <Crown className="w-3 h-3" aria-hidden="true" />
                                                        <span className="hidden sm:inline">{t('Champions')}</span>
                                                    </span>
                                                )}
                                            </button>
                                        </div>

                                        {byStat ? (
                                            <>
                                                <div role="cell" className={`${num} hidden md:block text-zinc-500`}>{row.mp}</div>
                                                <div role="cell" className={`${num} ${sort.key === 'for' ? 'text-white font-bold' : 'text-zinc-400'}`}>{row.for.toFixed(1)}</div>
                                                <div role="cell" className={`${num} ${sort.key === 'ag' ? 'text-white font-bold' : 'text-zinc-400'}`}>{row.ag.toFixed(1)}</div>
                                                <div role="cell" className="flex flex-col items-center">
                                                    <span key={row.tot.toFixed(1)} className={`pop-in text-sm md:text-base tabular-nums ${sort.key === 'tot' ? 'font-black text-white' : 'font-bold text-zinc-300'}`}>
                                                        {row.tot.toFixed(1)}
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div role="cell" className={`${num} hidden md:block text-zinc-400`}>{row.mp}</div>
                                                <div role="cell" className={`${num} hidden md:block text-emerald-400/80 font-medium`}>{row.w}</div>
                                                <div role="cell" className={`${num} hidden md:block text-zinc-400 font-medium`}>{row.d}</div>
                                                <div role="cell" className={`${num} hidden md:block text-red-400/80 font-medium`}>{row.l}</div>
                                                <div role="cell" className={`${num} hidden lg:block text-zinc-400`}>{row.gf}</div>
                                                <div role="cell" className={`${num} hidden lg:block text-zinc-400`}>{row.ga}</div>
                                                <div role="cell" className={`${num} font-bold ${row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                                                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                                                </div>
                                                <div role="cell" className="flex flex-col items-center">
                                                    <span key={row.pts} className="pop-in text-base font-black text-white tabular-nums">{row.pts}</span>
                                                </div>
                                                <div role="cell" className="flex items-center justify-center gap-[3px] md:gap-1">
                                                    {row.form.map((g, k) => {
                                                        const res = outcome(g);
                                                        const latest = k === row.form.length - 1;
                                                        return (
                                                            <span key={k} className="t-tt-wrap">
                                                                <span className={`flex items-center justify-center rounded-full md:rounded-md md:border md:w-6 md:h-6 text-[10px] font-black ${latest ? 'w-2 h-2 md:ring-2 md:ring-white/20 md:ring-offset-1 md:ring-offset-zinc-900' : 'w-1.5 h-1.5'} ${FORM[res]}`}>
                                                                    <span className="hidden md:inline">{t(res)}</span>
                                                                    <span className="sr-only md:hidden">{t(res)}</span>
                                                                </span>
                                                                <span className="t-tt hidden md:block text-xs font-bold z-10">
                                                                    {scoreline(row.team, g)}
                                                                    <span className="block text-[10px] font-medium text-zinc-400 text-center">
                                                                        {[latest && t('Latest'), shortDate(g.match.date)].filter(Boolean).join(' · ')}
                                                                    </span>
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}

                                        <div role="cell" className="flex items-center justify-end text-zinc-600">
                                            <ChevronDown aria-hidden="true" className={`md:hidden w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180 text-emerald-400' : ''}`} />
                                            <ChevronRight aria-hidden="true" className="hidden md:block w-4 h-4 opacity-0 -translate-x-1 transition duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-emerald-400" />
                                        </div>
                                    </div>

                                    {/* Phone-only details, opened by tapping the row. */}
                                    <div role="row" inert={!open} className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                        <div role="cell" className="overflow-hidden">
                                            <div className="px-3 pb-3 pt-1 space-y-3">
                                                {byStat ? (
                                                    <div className="grid grid-cols-4 gap-1.5">
                                                        <Chip label="MP" value={row.mp} />
                                                        <Chip label="For" value={row.for.toFixed(1)} />
                                                        <Chip label="Ag" value={row.ag.toFixed(1)} />
                                                        <Chip label="Total" value={row.tot.toFixed(1)} tone="text-emerald-400" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="grid grid-cols-6 gap-1.5">
                                                            <Chip label="MP" value={row.mp} />
                                                            <Chip label="W" value={row.w} tone="text-emerald-400" />
                                                            <Chip label="D" value={row.d} tone="text-zinc-300" />
                                                            <Chip label="L" value={row.l} tone="text-red-400" />
                                                            <Chip label="GF" value={row.gf} />
                                                            <Chip label="GA" value={row.ga} />
                                                        </div>
                                                        {row.form.length > 0 && (
                                                            <ul className="space-y-1">
                                                                {[...row.form].reverse().map((g, k) => {
                                                                    const res = outcome(g);
                                                                    return (
                                                                        <li key={k} className="flex items-center gap-2 text-xs">
                                                                            <span className={`w-5 h-5 flex-shrink-0 rounded flex items-center justify-center text-[10px] font-black text-zinc-950 ${FORM[res].split(' ')[0]}`}>{t(res)}</span>
                                                                            <span className="w-3 text-[10px] font-bold text-zinc-500">{g.home ? t('H') : t('A')}</span>
                                                                            {teamLogos[g.opponent] && <img src={teamLogos[g.opponent]} alt="" className="w-4 h-4 object-contain" />}
                                                                            <span className="flex-1 truncate text-zinc-300">{g.opponent}</span>
                                                                            <span className="font-black text-white tabular-nums">{g.for}-{g.ag}</span>
                                                                            <span className="w-12 text-right text-[10px] text-zinc-500">{shortDate(g.match.date)}</span>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                        )}
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => onTeamClick?.(row.team)}
                                                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 py-2 text-xs font-bold uppercase tracking-wider text-emerald-400 active:bg-emerald-500/20"
                                                >
                                                    {t('Team details')} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="px-4 py-3 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500">
                        {byStat ? (
                            <span>
                                {t('{stat} per game over the sample, for and against each team.', { stat: statLabel })} <span className="hidden md:inline">{t('Click a column to sort.')}</span><span className="md:hidden">{t('Tap a column to sort.')}</span>
                            </span>
                        ) : zones.size > 0 ? (
                            <>
                                {[...zones].map(z => (
                                    <span key={z} className="flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full bg-current ${ZONE[z].text}`} aria-hidden="true" />
                                        {t(ZONE[z].label)}
                                    </span>
                                ))}
                                <span className="text-zinc-600">{t('Indicative: cup winners and coefficients can move places.')}</span>
                            </>
                        ) : (
                            <span>
                                {fullTable ? t('Arrows show movement since the previous matchday.') : t('{sample} · {venue}: points from these matches only. Arrows compare with a matchday earlier.', { sample: limit === 'all' ? t('All matches') : t('Last {n}', { n: limit }), venue: t(VENUES.find(v => v.id === venue).label) })}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Standings;

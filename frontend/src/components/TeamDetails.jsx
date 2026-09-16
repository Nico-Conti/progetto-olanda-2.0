import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ChevronLeft, History, Target } from 'lucide-react';
import { leagueMeta, flagWash } from '../utils/leaguePickerFx';
import { teamGames, leagueTable, sampleOf } from '../utils/standings';
import { STAT_CONFIG, getStatLabel, resolveStatKey, statPair } from '../utils/statistics';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { useJersey } from '../hooks/useJersey';
import { useCountUp } from '../hooks/useCountUp';
import { LeagueLogo, FlagTile } from './LeagueTag';
import StatisticSelector from './StatisticSelector';
import MatchStatsModal from './MatchStatsModal';
import TeamBadge from './TeamBadge';
import { staggerDelay } from '../utils/stagger';
import { t, dateLocale, countryName, getLanguage } from '../i18n';

// The statistics the profile compares against the league, per match.
const PROFILE = ['goals', 'shots', 'shots_on_target', 'corners', 'fouls', 'yellow_cards'];
const RESULT = {
    W: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    D: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    L: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const outcome = (g) => (g.for > g.ag ? 'W' : g.for === g.ag ? 'D' : 'L');
const mean = (list, f) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0);
const ordinal = (n) => {
    if (getLanguage() === 'it') return `${n}º`;
    const suffix = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
};
const validDate = (d) => (d && !isNaN(new Date(d)) ? new Date(d) : null);
const shortDay = (d) => validDate(d)?.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) ?? '';
const kickoff = (d) => {
    const when = validDate(d);
    if (!when) return t('Date to be confirmed');
    const day = when.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return String(d).includes('T') ? `${day} · ${when.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}` : day;
};

const CountUp = ({ value }) => Math.round(useCountUp(value));

// A clickable row that can hold a badge button (a <button> inside a <button> is
// not allowed), reachable and operable from the keyboard all the same.
const clickable = (onClick) => ({
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
});

const Panel = ({ title, icon, action, children, className = '', delay = '0ms' }) => (
    <section className={`glass-panel rounded-2xl border border-white/10 p-5 animate-waterfall ${className}`} style={{ animationDelay: delay }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
                {icon}
                {title}
            </h3>
            {action}
        </div>
        {children}
    </section>
);

const HeroStat = ({ label, children, sub, accent = false }) => (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${accent ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-white/[0.04] border-white/10'}`}>
        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
        <div className={`text-xl md:text-2xl font-black tabular-nums leading-tight ${accent ? 'text-emerald-300' : 'text-white'}`}>{children}</div>
        {sub && <div className="text-[10px] font-bold text-zinc-500 tabular-nums">{sub}</div>}
    </div>
);

/** A value against the league's average: a bar out of the middle, right when above, left when below. */
const VsLeague = ({ value, avg }) => {
    const diff = avg > 0 ? value / avg - 1 : 0;
    const width = `${(Math.min(Math.abs(diff), 0.6) / 0.6) * 50}%`;
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
                <span className="text-sm font-black text-white">{value.toFixed(value < 10 ? 2 : 1)}</span>
                <span className={`text-[10px] font-bold ${diff > 0.03 ? 'text-amber-400' : diff < -0.03 ? 'text-sky-400' : 'text-zinc-500'}`}>
                    {diff >= 0 ? '+' : ''}{(100 * diff).toFixed(0)}%
                </span>
            </div>
            <div className="relative mt-1 h-1.5 rounded-full bg-zinc-800/80">
                <span className="absolute left-1/2 top-[-2px] bottom-[-2px] w-px bg-white/25" aria-hidden="true" />
                <span
                    className={`bar-grow absolute top-0 h-full ${diff >= 0 ? 'left-1/2 rounded-r-full bg-amber-400/80' : 'right-1/2 rounded-l-full bg-sky-400/80'}`}
                    style={{ width, transformOrigin: diff >= 0 ? 'left' : 'right' }}
                />
            </div>
        </div>
    );
};

/**
 * A team's page: who they are and where they stand, what comes next and what
 * the model expects of it, how a statistic has gone match by match against its
 * betting line, their latest results, and a profile of what they produce and
 * concede against the league average. Everything is this league and season,
 * except the prediction, which reads the pooled model history like the Predictor.
 */
const TeamDetails = ({ team, teamLogos, matches, fixtures, leagues, league, season, modelMatchData, modelSettings, selectedStatistic, onBack, onMatchClick, onTeamClick }) => {
    const [stat, setStat] = useState(selectedStatistic);
    const [openMatch, setOpenMatch] = useState(null);
    const jersey = useJersey(team);
    const meta = leagueMeta(leagues, league);
    const logo = teamLogos[team];
    const statKey = resolveStatKey(stat);
    const statLabel = getStatLabel(stat);
    const line = STAT_CONFIG[statKey]?.total?.default ?? null;

    const { table, row, pos, results, homeRow, awayRow } = useMemo(() => {
        const games = teamGames(matches, 'goals');
        const table = leagueTable(games, 'all', 'all');
        const pos = table.findIndex(r => r.team === team);
        const venueRow = (venue) => leagueTable(games, 'all', venue).find(r => r.team === team);
        return {
            table, pos, row: table[pos],
            results: games[team] ?? [],
            homeRow: venueRow('home'),
            awayRow: venueRow('away'),
        };
    }, [matches, team]);

    // Still to play: this team's fixtures with no result against the same
    // opponent at the same venue this season, soonest first.
    const upcoming = useMemo(() => fixtures
        .filter(f => (f.home === team || f.away === team) && f.status !== 'PLAYED'
            && !matches.some(m => m.squadre.home === f.home && m.squadre.away === f.away))
        .sort((a, b) => (validDate(a.date)?.getTime() ?? Infinity) - (validDate(b.date)?.getTime() ?? Infinity)),
    [fixtures, matches, team]);
    const next = upcoming[0] ?? null;

    // The model only for the fixture that needs it, and only once there is one.
    const model = useMemo(
        () => (next ? buildPredictionModel(modelMatchData, statKey, { trackResiduals: true }) : null),
        [next, modelMatchData, statKey]
    );
    const prediction = model && predictFromModel(model, next.home, next.away, {
        nGames: modelSettings.nGames,
        useGeneralStats: modelSettings.useGeneralStats,
        aggregatorOverride: modelSettings.forceMean ? 'mean' : null,
        asOf: next.date ?? new Date(),
        engine: ENGINES.COUNT,
    });

    const statGames = useMemo(() => teamGames(matches, statKey)[team] ?? [], [matches, statKey, team]);
    const over = (list) => (line == null ? 0 : list.filter(g => g.for + g.ag > line).length);
    const rates = [
        { label: t('All'), list: statGames },
        { label: t('Home'), list: sampleOf(statGames, 'all', 'home') },
        { label: t('Away'), list: sampleOf(statGames, 'all', 'away') },
        { label: t('Last {n}', { n: 10 }), list: statGames.slice(0, 10) },
    ];
    const chart = [...statGames.slice(0, 20)].reverse();
    const chartMax = Math.max(line ?? 0, ...chart.map(g => g.for + g.ag), 1) * 1.1;

    const profile = useMemo(() => PROFILE.map(key => {
        let sum = 0, n = 0;
        for (const m of matches) {
            const p = statPair(m, key);
            if (p) { sum += p.home + p.away; n += 2; }
        }
        const own = teamGames(matches, key)[team] ?? [];
        return {
            key,
            leagueAvg: n ? sum / n : 0,
            produces: mean(own, g => g.for),
            concedes: mean(own, g => g.ag),
            played: own.length,
        };
    }).filter(r => r.played > 0), [matches, team]);

    const gd = row ? row.gf - row.ga : 0;

    return (
        <div className="space-y-6">
            <MatchStatsModal match={openMatch} teamLogos={teamLogos} onClose={() => setOpenMatch(null)} />

            <button
                onClick={onBack}
                className="group inline-flex items-center gap-2 pl-2.5 pr-4 py-1.5 rounded-full border border-white/10 bg-zinc-900/60 text-zinc-300 hover:text-white hover:border-white/20 hover:bg-zinc-800/80 transition-colors"
            >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                <span className="font-bold text-xs uppercase tracking-wider">{t('Back')}</span>
            </button>

            {/* Hero: the club, its league, and where it stands. */}
            <div className="relative rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-md shadow-xl overflow-hidden">
                {(meta.flag || meta.bands) && (
                    <div aria-hidden="true" className="absolute inset-y-0 left-0 w-2/3 opacity-[0.10]" style={flagWash(meta, 'linear-gradient(to right, black, transparent 85%)')} />
                )}
                {/* The badge, huge and blurred: the club's own colours as ambient light. */}
                {logo && <img src={logo} alt="" aria-hidden="true" className="absolute -right-20 -top-24 w-[28rem] h-[28rem] object-contain opacity-[0.14] blur-3xl pointer-events-none" />}

                <div className="relative p-5 md:p-8 flex flex-col xl:flex-row xl:items-center gap-6 xl:gap-10">
                    <div className="flex items-center gap-4 md:gap-6 min-w-0 hero-in-left">
                        <div className="relative flex items-end gap-2 md:gap-3 shrink-0">
                            <img src={logo} alt={team} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" />
                            {jersey && (
                                <img src={jersey} alt={t('{team} kit', { team })} loading="lazy" className="jersey w-14 h-14 md:w-20 md:h-20 object-contain drop-shadow-xl" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none break-words">{team}</h1>
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-bold text-zinc-300">
                                <span className="inline-flex items-center gap-2">
                                    <LeagueLogo meta={meta} className="w-7 h-7" />
                                    {meta.name}
                                </span>
                                {meta.country && (
                                    <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-zinc-400">
                                        <FlagTile meta={meta} />
                                        {countryName(meta.country)}
                                    </span>
                                )}
                                {season && <span className="text-[10px] uppercase tracking-wider text-zinc-500">{t('Season {season}', { season })}</span>}
                            </div>
                        </div>
                    </div>

                    {row ? (
                        <div className="xl:ml-auto grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 hero-in-right">
                            <HeroStat label={t('Position')} sub={t('of {n}', { n: table.length })} accent>{ordinal(pos + 1)}</HeroStat>
                            <HeroStat label={t('Points')} sub={t('{n} played', { n: row.mp })}><CountUp value={row.pts} /></HeroStat>
                            <HeroStat label={`${t('W')} · ${t('D')} · ${t('L')}`} sub={homeRow && awayRow ? t('{home} home · {away} away pts', { home: homeRow.pts, away: awayRow.pts }) : null}>
                                {row.w}<span className="text-zinc-600">·</span>{row.d}<span className="text-zinc-600">·</span>{row.l}
                            </HeroStat>
                            <HeroStat label={t('Goals')} sub={t('{gd} difference', { gd: `${gd > 0 ? '+' : ''}${gd}` })}>{row.gf}:{row.ga}</HeroStat>
                            <div className="col-span-2 sm:col-span-4 flex items-center justify-center gap-2 pt-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mr-1">{t('Form')}</span>
                                {row.form.map((g, i) => {
                                    const r = outcome(g);
                                    return (
                                        // pop-in sets display: inline-block, so it goes on a
                                        // wrapper and the chip keeps its flex centring.
                                        <span key={i} className="pop-in" style={{ animationDelay: `${300 + i * 70}ms` }}>
                                            <span
                                                title={`${g.home ? t('vs') : t('at')} ${g.opponent} ${g.for}-${g.ag}`}
                                                className={`w-7 h-7 rounded-md border flex items-center justify-center text-[11px] font-black ${RESULT[r]} ${i === row.form.length - 1 ? 'ring-2 ring-white/20 ring-offset-1 ring-offset-zinc-900' : ''}`}
                                            >
                                                {t(r)}
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <p className="xl:ml-auto text-sm text-zinc-500">{t('No results yet this season.')}</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Next match, with what the model expects of it. */}
                <Panel title={t('Next match')} icon={<CalendarDays className="w-4 h-4 text-emerald-400" />} delay="80ms">
                    {next ? (
                        <div
                            {...clickable(() => onMatchClick?.(next))}
                            className="group w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-500/30 p-4 transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        >
                            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-zinc-400">
                                <span>{kickoff(next.date)}</span>
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${next.home === team
                                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                    : 'bg-blue-500/10 border-blue-500/25 text-blue-400'}`}>
                                    {next.home === team ? t('Home') : t('Away')}
                                </span>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                                <TeamBadge team={next.home === team ? next.away : next.home} logo={teamLogos[next.home === team ? next.away : next.home]} onOpen={onTeamClick} className="w-12 h-12 drop-shadow-lg" />
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{next.home === team ? t('vs') : t('at')}</div>
                                    <div className="text-lg font-black text-white leading-tight truncate">{next.home === team ? next.away : next.home}</div>
                                </div>
                            </div>
                            {prediction && (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className="rounded-lg bg-zinc-950/40 border border-white/5 px-3 py-2">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('Exp. {stat}', { stat: statLabel })}</div>
                                        <div className="text-xl font-black text-white tabular-nums">{prediction.total.toFixed(1)}</div>
                                    </div>
                                    {prediction.probOver && line != null && (
                                        <div className="rounded-lg bg-zinc-950/40 border border-white/5 px-3 py-2">
                                            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('Over {line}', { line })}</div>
                                            <div className="text-xl font-black text-emerald-400 tabular-nums">{(100 * prediction.probOver(line)).toFixed(0)}%</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="mt-4 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-emerald-400">
                                {t('Open match analysis')}
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-zinc-500 text-center py-6">{t('No upcoming fixtures scheduled.')}</p>
                    )}

                    {upcoming.length > 1 && (
                        <ul className="mt-4 space-y-1.5">
                            {upcoming.slice(1, 5).map(f => {
                                const home = f.home === team;
                                const opp = home ? f.away : f.home;
                                return (
                                    <li key={`${f.home}-${f.away}`}>
                                        <div {...clickable(() => onMatchClick?.(f))} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer">
                                            <span className="w-14 text-[10px] font-bold text-zinc-500 tabular-nums">{shortDay(f.date) || t('TBD')}</span>
                                            <span className="w-4 text-[10px] font-bold text-zinc-500">{home ? t('H') : t('A')}</span>
                                            <TeamBadge team={opp} logo={teamLogos[opp]} onOpen={onTeamClick} className="w-5 h-5" />
                                            <span className="flex-1 truncate text-sm font-semibold text-zinc-200">{opp}</span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>

                {/* One statistic, match by match, against its betting line. */}
                <Panel
                    title={t('{stat} focus', { stat: statLabel })}
                    icon={<Target className="w-4 h-4 text-emerald-400" />}
                    delay="160ms"
                    className="lg:col-span-2 relative z-20"
                    action={<StatisticSelector value={stat} onChange={(e) => setStat(e.target.value)} className="w-[160px]" />}
                >
                    {statGames.length === 0 ? (
                        <p className="text-sm text-zinc-500 text-center py-10">{t('No {stat} recorded for {team} this season.', { stat: statLabel.toLowerCase(), team })}</p>
                    ) : (
                        <>
                            {line != null && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                                    {rates.map(({ label, list }) => {
                                        const hits = over(list);
                                        const rate = list.length ? hits / list.length : 0;
                                        return (
                                            <div key={label} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
                                                <div className="flex items-baseline justify-between">
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
                                                    <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{hits}/{list.length}</span>
                                                </div>
                                                <div className="text-xl font-black text-white tabular-nums">{(100 * rate).toFixed(0)}%</div>
                                                <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                                    <div className="h-full" style={{ width: `${100 * rate}%` }}>
                                                        <div className="bar-grow h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ transformOrigin: 'left' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                                <span>{t('Total {stat} per match, last {n}', { stat: statLabel.toLowerCase(), n: chart.length })}</span>
                                {line != null && (
                                    <span className="flex items-center gap-3">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /> {t('Over {line}', { line })}</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-600" /> {t('Under')}</span>
                                    </span>
                                )}
                            </div>
                            <div className="relative h-40 flex items-end gap-1 md:gap-1.5 border-b border-white/10">
                                {line != null && (
                                    <div className="absolute inset-x-0 border-t border-dashed border-white/30 pointer-events-none" style={{ bottom: `${100 * line / chartMax}%` }}>
                                        <span className="absolute right-0 -top-4 text-[9px] font-bold text-zinc-400 tabular-nums">{line}</span>
                                    </div>
                                )}
                                {chart.map((g, i) => {
                                    const total = g.for + g.ag;
                                    const isOver = line != null && total > line;
                                    return (
                                        <button
                                            key={`${g.match.date}-${g.opponent}`}
                                            onClick={() => setOpenMatch(g.match)}
                                            title={`${shortDay(g.match.date)} · ${g.home ? t('vs') : t('at')} ${g.opponent} · ${total} (${g.for}-${g.ag})`}
                                            className="group relative flex-1 h-full flex flex-col justify-end items-center"
                                        >
                                            <span className="mb-1 text-[9px] font-bold text-zinc-400 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{total}</span>
                                            <span
                                                className={`bar-rise w-full max-w-7 rounded-t-md transition-colors ${isOver
                                                    ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-500 group-hover:to-emerald-300'
                                                    : 'bg-zinc-700 group-hover:bg-zinc-500'}`}
                                                style={{ height: `${100 * total / chartMax}%`, animationDelay: `${i * 30}ms` }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1 flex justify-between text-[10px] font-bold text-zinc-600">
                                <span>{shortDay(chart[0]?.match.date)}</span>
                                <span>{shortDay(chart.at(-1)?.match.date)}</span>
                            </div>

                            <div className="mt-5 grid grid-cols-2 gap-3">
                                {[[t('Home'), sampleOf(statGames, 'all', 'home'), 'text-emerald-400'], [t('Away'), sampleOf(statGames, 'all', 'away'), 'text-blue-400']].map(([label, list, tone]) => (
                                    <div key={label} className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${tone}`}>{label} · {t('{n} games', { n: list.length })}</div>
                                        <div className="mt-1 flex items-baseline gap-4 tabular-nums">
                                            <span><span className="text-lg font-black text-white">{mean(list, g => g.for).toFixed(2)}</span> <span className="text-[10px] text-zinc-500">{t('for')}</span></span>
                                            <span><span className="text-lg font-black text-zinc-300">{mean(list, g => g.ag).toFixed(2)}</span> <span className="text-[10px] text-zinc-500">{t('against')}</span></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Panel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Latest results; each opens the full match statistics. */}
                <Panel title={t('Recent results')} icon={<History className="w-4 h-4 text-emerald-400" />} delay="240ms">
                    {results.length === 0 ? (
                        <p className="text-sm text-zinc-500 text-center py-6">{t('No results yet this season.')}</p>
                    ) : (
                        <ul className="space-y-1">
                            {results.slice(0, 8).map((g, i) => {
                                const r = outcome(g);
                                return (
                                    <li key={`${g.match.date}-${g.opponent}`} className="animate-waterfall" style={{ animationDelay: staggerDelay(i) }}>
                                        <div {...clickable(() => setOpenMatch(g.match))} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer">
                                            <span className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center text-[11px] font-black ${RESULT[r]}`}>{r}</span>
                                            <span className="w-4 text-[10px] font-bold text-zinc-500">{g.home ? t('H') : t('A')}</span>
                                            <TeamBadge team={g.opponent} logo={teamLogos[g.opponent]} onOpen={onTeamClick} className="w-5 h-5" />
                                            <span className="flex-1 truncate text-sm font-semibold text-zinc-200">{g.opponent}</span>
                                            <span className="text-sm font-black text-white tabular-nums">{g.for}-{g.ag}</span>
                                            <span className="w-12 text-right text-[10px] font-bold text-zinc-500">{shortDay(g.match.date)}</span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>

                {/* What they produce and concede, against the league's average team. */}
                <Panel title={t('Profile vs league')} icon={<Activity className="w-4 h-4 text-emerald-400" />} delay="320ms" className="lg:col-span-2">
                    {profile.length === 0 ? (
                        <p className="text-sm text-zinc-500 text-center py-6">{t('Not enough statistics recorded yet.')}</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-[minmax(0,7rem)_1fr_1fr] gap-x-4 md:gap-x-6 text-[10px] font-bold uppercase tracking-wider text-zinc-500 pb-2 border-b border-white/5">
                                <span>{t('Per match')}</span>
                                <span>{t('Produces')}</span>
                                <span>{t('Concedes')}</span>
                            </div>
                            <div className="divide-y divide-white/5">
                                {profile.map(p => (
                                    <div key={p.key} className="grid grid-cols-[minmax(0,7rem)_1fr_1fr] gap-x-4 md:gap-x-6 items-center py-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-zinc-200 truncate">{getStatLabel(p.key)}</div>
                                            <div className="text-[10px] text-zinc-500 tabular-nums">{t('league {avg}', { avg: p.leagueAvg.toFixed(p.leagueAvg < 10 ? 2 : 1) })}</div>
                                        </div>
                                        <VsLeague value={p.produces} avg={p.leagueAvg} />
                                        <VsLeague value={p.concedes} avg={p.leagueAvg} />
                                    </div>
                                ))}
                            </div>
                            <p className="mt-3 text-[10px] text-zinc-500">
                                <span className="text-amber-400 font-bold">{t('Amber')}</span> {t("is above the league's average team,")} <span className="text-sky-400 font-bold">{t('blue')}</span> {t('below.')}
                            </p>
                        </>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default TeamDetails;

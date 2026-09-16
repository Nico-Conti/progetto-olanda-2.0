import React from 'react';
import { Flame } from 'lucide-react';
import { getStatLabel } from '../../utils/statistics';
import { useCountUp } from '../../hooks/useCountUp';
import { useJersey } from '../../hooks/useJersey';
import { LeagueLogo, FlagTile } from '../LeagueTag';
import TeamBadge from '../TeamBadge';
import { flagWash } from '../../utils/leaguePickerFx';
import { t, dateLocale, countryName } from '../../i18n';

/**
 * A side of the fixture. From lg up the club's kit stands large on the outer
 * side, apart from the badge; below that there is no room, so it sits small
 * beside the badge. Straight, always. The badge opens the team's page.
 */
const Team = ({ name, logo, exp, std, side, onOpen, country }) => {
    const jersey = useJersey(name, country);
    const kit = (className) => jersey && (
        <img src={jersey} alt={t('{team} kit', { team: name })} loading="lazy" className={`jersey object-contain drop-shadow-2xl ${className}`} />
    );
    return (
        <div className={`flex items-center justify-center gap-4 xl:gap-10 min-w-0 ${side === 'home' ? 'flex-row hero-in-left' : 'flex-row-reverse hero-in-right'}`}>
            {kit('hidden lg:block w-28 h-28 xl:w-36 xl:h-36 shrink-0')}
            <div className="flex flex-col items-center text-center min-w-0">
                <div className={`relative mb-3 flex items-end gap-1.5 ${side === 'home' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className={`absolute inset-0 rounded-full blur-2xl opacity-40 ${side === 'home' ? 'bg-emerald-500' : 'bg-blue-500'}`} aria-hidden="true" />
                    {kit('lg:hidden relative w-10 h-10 md:w-14 md:h-14')}
                    <span className="relative">
                        <TeamBadge team={name} logo={logo} onOpen={onOpen} className="w-14 h-14 md:w-20 md:h-20 drop-shadow-2xl" />
                    </span>
                </div>
                <div className="w-full text-base md:text-2xl font-black text-white leading-tight line-clamp-2">{name}</div>
                <div className="mt-1.5 flex items-baseline gap-1.5 font-mono tabular-nums">
                    <span className={`text-sm md:text-lg font-bold ${side === 'home' ? 'text-emerald-400' : 'text-blue-400'}`}>{exp.toFixed(2)}</span>
                    <span className="text-[10px] md:text-xs text-zinc-500">±{std.toFixed(2)}</span>
                </div>
                <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">{side === 'home' ? t('Home exp.') : t('Away exp.')}</span>
            </div>
        </div>
    );
};

/**
 * The top of the match view, in the same shape as the fixture cards elsewhere:
 * the league over its nation's flag, then the two sides either side of the
 * predicted total. The sides slide in, the total counts up under a slow
 * spotlight, and the split of it between the teams fills from the middle.
 * `meta` (league) and `date` are optional - a custom matchup has neither.
 */
const PredictionHero = ({ prediction, home, away, teamLogos, selectedStatistic, leagueAverage, date, meta, line, onTeamClick }) => {
    const total = useCountUp(prediction?.total ?? 0);
    if (!prediction) return null;

    const isHot = leagueAverage ? prediction.total > leagueAverage * 1.15 : prediction.total > 11.5;
    const vsAverage = leagueAverage ? prediction.total / leagueAverage - 1 : null;
    const share = prediction.expHome / ((prediction.expHome + prediction.expAway) || 1);
    const pOver = prediction.probOver && line != null ? prediction.probOver(line) : null;
    const when = date && !isNaN(new Date(date)) ? new Date(date) : null;

    return (
        <div className="relative rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-md shadow-xl overflow-hidden">
            {(meta || when) && (
                <div className="relative flex items-center gap-3 px-5 py-3 border-b border-white/5">
                    {(meta?.flag || meta?.bands) && (
                        <div
                            aria-hidden="true"
                            // A card-sized strip, the same as on the fixture cards.
                            className="absolute inset-y-0 left-0 w-96 max-w-full opacity-20"
                            style={flagWash(meta, 'linear-gradient(to right, black, transparent 75%)')}
                        />
                    )}
                    {meta && (
                        <>
                            <LeagueLogo meta={meta} />
                            <div className="relative min-w-0">
                                <div className="text-sm font-black text-white truncate">{meta.name}</div>
                                {meta.country && (
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                        <FlagTile meta={meta} />
                                        {countryName(meta.country)}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {when && (
                        <div className="relative ml-auto text-right leading-tight">
                            <div className="text-xs font-bold text-zinc-200">
                                {when.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                            {String(date).includes('T') && (
                                <div className="text-[11px] font-bold text-zinc-500 tabular-nums">
                                    {when.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="relative px-4 md:px-8 pt-7 pb-6 md:pt-9">
                {/* Each side's colour washed in from its edge. */}
                <div className="absolute -left-24 top-1/4 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
                <div className="absolute -right-24 top-1/4 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" aria-hidden="true" />

                <p className="relative text-center text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500 mb-5 md:mb-7">
                    {t('Predicted total {stat}', { stat: getStatLabel(selectedStatistic) })}
                </p>

                <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
                    <Team name={home} logo={teamLogos[home]} exp={prediction.expHome} std={prediction.expHomeStd} side="home" onOpen={onTeamClick} country={meta?.country} />

                    <div className="relative flex flex-col items-center px-2">
                        <div className={`hero-spot absolute left-1/2 top-1/2 w-40 h-40 md:w-64 md:h-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl pointer-events-none ${isHot ? 'bg-orange-500/25' : 'bg-white/10'}`} aria-hidden="true" />
                        <div className={`relative text-6xl md:text-8xl font-black tracking-tighter tabular-nums leading-none ${isHot
                            ? 'text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-orange-400 to-red-500'
                            : 'text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.25)]'}`}>
                            {total.toFixed(1)}
                        </div>
                        <div className={`relative mt-2 font-mono text-sm md:text-base font-bold ${isHot ? 'text-orange-400/70' : 'text-zinc-500'}`}>
                            ±{prediction.totalStd.toFixed(2)}
                        </div>
                    </div>

                    <Team name={away} logo={teamLogos[away]} exp={prediction.expAway} std={prediction.expAwayStd} side="away" onOpen={onTeamClick} country={meta?.country} />
                </div>

                {/* How the total splits between the sides, filling out from the middle. */}
                <div className="relative mt-7 max-w-xl mx-auto">
                    <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800/80 gap-0.5">
                        <div className="h-full" style={{ width: `${100 * share}%` }}>
                            <div className="bar-grow h-full rounded-l-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ transformOrigin: 'right' }} />
                        </div>
                        <div className="h-full flex-1">
                            <div className="bar-grow h-full rounded-r-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ transformOrigin: 'left' }} />
                        </div>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 tabular-nums">
                        <span>{t('{pct}% home', { pct: (100 * share).toFixed(0) })}</span>
                        <span>{t('{pct}% away', { pct: (100 * (1 - share)).toFixed(0) })}</span>
                    </div>
                </div>

                <div className="relative mt-5 flex flex-wrap justify-center gap-2">
                    {isHot && (
                        <span className="hot-chip inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-xs font-bold text-orange-300">
                            <Flame className="w-3.5 h-3.5 fill-current" /> {t('Hot match')}
                        </span>
                    )}
                    {pOver != null && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white tabular-nums">
                            {(100 * pOver).toFixed(0)}%
                            <span className="font-medium text-zinc-400">{t('over {line}', { line })}</span>
                        </span>
                    )}
                    {vsAverage != null && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold tabular-nums">
                            <span className={vsAverage > 0.02 ? 'text-emerald-400' : vsAverage < -0.02 ? 'text-red-400' : 'text-zinc-300'}>
                                {vsAverage >= 0 ? '+' : ''}{(100 * vsAverage).toFixed(0)}%
                            </span>
                            <span className="font-medium text-zinc-400">{t('vs league avg {avg}', { avg: leagueAverage.toFixed(1) })}</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictionHero;

import React from 'react';
import { Activity } from 'lucide-react';
import { halfLifeFor, getStatLabel } from '../../utils/statistics';
import TeamBadge from '../TeamBadge';
import { t } from '../../i18n';

/**
 * One mirrored row: the home value's bar grows left from the middle, the away
 * value's right, and the larger of the two is lit in its side's colour.
 */
const TapeRow = ({ label, home, away, scale, delay }) => (
    <div>
        <div className="flex items-baseline justify-between mb-1.5 tabular-nums">
            <span className={`font-mono text-lg md:text-xl font-black ${home > away ? 'text-emerald-400' : 'text-zinc-300'}`}>{home.toFixed(2)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
            <span className={`font-mono text-lg md:text-xl font-black ${away > home ? 'text-blue-400' : 'text-zinc-300'}`}>{away.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 h-2">
            <div className="flex justify-end rounded-l-full bg-zinc-800/80 overflow-hidden">
                <div className="h-full" style={{ width: `${100 * home / scale}%` }}>
                    <div className="bar-grow h-full rounded-l-full bg-gradient-to-l from-emerald-400 to-emerald-600" style={{ transformOrigin: 'right', animationDelay: delay }} />
                </div>
            </div>
            <div className="rounded-r-full bg-zinc-800/80 overflow-hidden">
                <div className="h-full" style={{ width: `${100 * away / scale}%` }}>
                    <div className="bar-grow h-full rounded-r-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ transformOrigin: 'left', animationDelay: delay }} />
                </div>
            </div>
        </div>
    </div>
);

/**
 * The inputs behind the prediction, side by side: what each team produces and
 * concedes. Mirrored bars on one scale, so which side leads is read at a
 * glance. For and against are the model's own averages, recency-weighted for a
 * statistic with a fitted half-life - so it says that, not a window it never used.
 */
const StatsAnalysis = ({ prediction, home, away, nGames, teamLogos, selectedStatistic, general = false, onTeamClick }) => {
    if (!prediction) return null;
    const stat = getStatLabel(selectedStatistic);
    const halfLife = halfLifeFor(selectedStatistic);
    const scale = Math.max(prediction.hFor, prediction.aFor, prediction.hAg, prediction.aAg) || 1;
    const venue = (side) => (general ? t('all matches') : side === 'home' ? t('home matches') : t('away matches'));

    return (
        <div className="glass-panel p-5 rounded-xl border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                <h3 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    {t('Tale of the tape')}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {halfLife ? t('Recency-weighted · {days}-day half-life', { days: halfLife }) : nGames === 'all' ? t('Last season') : t('Last {n} games', { n: nGames })}
                </span>
            </div>

            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 min-w-0">
                    <TeamBadge team={home} logo={teamLogos[home]} onOpen={onTeamClick} className="w-7 h-7" />
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{home}</div>
                        <div className="text-[10px] text-zinc-500">{venue('home')}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 min-w-0 text-right">
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{away}</div>
                        <div className="text-[10px] text-zinc-500">{venue('away')}</div>
                    </div>
                    <TeamBadge team={away} logo={teamLogos[away]} onOpen={onTeamClick} className="w-7 h-7" />
                </div>
            </div>

            <div className="space-y-4">
                <TapeRow label={t('{stat} for', { stat })} home={prediction.hFor} away={prediction.aFor} scale={scale} delay="0ms" />
                <TapeRow label={t('{stat} against', { stat })} home={prediction.hAg} away={prediction.aAg} scale={scale} delay="120ms" />
            </div>
        </div>
    );
};

export default StatsAnalysis;

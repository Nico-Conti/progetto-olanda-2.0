import React from 'react';
import TeamBadge from '../TeamBadge';
import { clickable } from '../ui/clickable';
import { t, dateLocale } from '../../i18n';

/**
 * One past match of a team's form: opponent, the statistic for and against, and
 * the total against `line`. `processData` keeps the whole match on the row, so
 * it opens the same MatchStatsModal that Standings > Results does - a row from a
 * model whose lookup missed has no `match`, and stays inert rather than opening
 * an empty modal.
 */
const MatchRow = ({ match, teamLogos, line, onTeamClick, onMatchClick }) => {
    const over = line != null && match.total > line;
    const when = match.date ? new Date(match.date) : null;
    const open = onMatchClick && match.match ? () => onMatchClick(match.match) : null;
    return (
        <div
            {...(open ? clickable(open) : {})}
            aria-label={open ? t('Open {team} match stats', { team: match.opponent }) : undefined}
            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 transition-colors ${open ? 'cursor-pointer hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400' : ''}`}
        >
            <div className="min-w-0">
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    {t('MD {n}', { n: match.giornata })}
                    {when && !isNaN(when) && <> · {when.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}</>}
                </span>
                <div className="flex items-center gap-2">
                    <TeamBadge team={match.opponent} logo={teamLogos[match.opponent]} onOpen={onTeamClick} className="w-4 h-4" />
                    <span className="text-sm text-zinc-200 font-semibold truncate">{match.opponent}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 tabular-nums">
                <div className="flex flex-col items-center w-7">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">{t('For')}</span>
                    <span className="text-sm font-black text-emerald-400">{match.statFor}</span>
                </div>
                <div className="flex flex-col items-center w-7">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">{t('Ag')}</span>
                    <span className="text-sm font-black text-red-400">{match.statAg}</span>
                </div>
                <div
                    title={line != null ? `${over ? t('Over') : t('Under')} ${line}` : undefined}
                    className={`flex flex-col items-center w-11 py-0.5 rounded-md border ${line == null ? 'border-transparent'
                        : over ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-white/[0.03] border-white/10'}`}
                >
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">{line == null ? t('Tot') : over ? t('Over') : t('Under')}</span>
                    <span className={`text-sm font-black ${over ? 'text-emerald-300' : 'text-white'}`}>{match.total}</span>
                </div>
            </div>
        </div>
    );
};

export default MatchRow;

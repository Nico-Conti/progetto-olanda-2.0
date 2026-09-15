import React from 'react';

/** One past match of a team's form: opponent, the statistic for and against, and the total against `line`. */
const MatchRow = ({ match, teamLogos, line }) => {
    const over = line != null && match.total > line;
    const when = match.date ? new Date(match.date) : null;
    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors">
            <div className="min-w-0">
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    MD {match.giornata}
                    {when && !isNaN(when) && <> · {when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</>}
                </span>
                <div className="flex items-center gap-2">
                    <img src={teamLogos[match.opponent]} alt="" className="w-4 h-4 object-contain shrink-0" />
                    <span className="text-sm text-zinc-200 font-semibold truncate">{match.opponent}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 tabular-nums">
                <div className="flex flex-col items-center w-7">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">For</span>
                    <span className="text-sm font-black text-emerald-400">{match.statFor}</span>
                </div>
                <div className="flex flex-col items-center w-7">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">Ag</span>
                    <span className="text-sm font-black text-red-400">{match.statAg}</span>
                </div>
                <div
                    title={line != null ? `${over ? 'Over' : 'Under'} ${line}` : undefined}
                    className={`flex flex-col items-center w-11 py-0.5 rounded-md border ${line == null ? 'border-transparent'
                        : over ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-white/[0.03] border-white/10'}`}
                >
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">{line == null ? 'Tot' : over ? 'Over' : 'Under'}</span>
                    <span className={`text-sm font-black ${over ? 'text-emerald-300' : 'text-white'}`}>{match.total}</span>
                </div>
            </div>
        </div>
    );
};

export default MatchRow;

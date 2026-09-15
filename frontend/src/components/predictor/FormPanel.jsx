import React from 'react';
import MatchRow from './MatchRow';

const RECENT = 10;

/**
 * The matches the model read for a team (newest first), with how often the
 * total went over `line` - the question a bet on this fixture asks - over the
 * last ten, which is current form, and over the whole list.
 */
const FormPanel = ({ team, label, matches, line, teamLogos, accent }) => {
    const over = (list) => (line == null ? 0 : list.filter(m => m.total > line).length);
    const recent = matches.slice(0, RECENT);
    const hits = over(recent);
    const rate = recent.length ? hits / recent.length : 0;
    return (
        <div className="glass-panel rounded-xl p-5 border border-white/10 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/5">
                <h4 className="font-bold text-white flex items-center gap-3 text-lg min-w-0">
                    <img src={teamLogos[team]} alt="" className="w-7 h-7 object-contain shrink-0" />
                    <span className="truncate">{team}</span>
                </h4>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${accent}`}>{label}</span>
            </div>

            {line != null && matches.length > 0 && (
                <div className="mb-3">
                    <div className="flex items-baseline justify-between text-xs mb-1.5">
                        <span className="text-zinc-400">
                            Over <span className="font-bold text-white">{line}</span>, last {recent.length}
                        </span>
                        <span className="font-bold text-white tabular-nums">
                            {hits} of {recent.length}
                            {matches.length > recent.length && (
                                <span className="text-zinc-500 font-medium"> · {over(matches)} of {matches.length} in all</span>
                            )}
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 origin-left transition-transform duration-500" style={{ transform: `scaleX(${rate})` }} />
                    </div>
                </div>
            )}

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                {matches.length > 0
                    ? matches.map(m => <MatchRow key={`${m.season}-${m.giornata}-${m.opponent}`} match={m} teamLogos={teamLogos} line={line} />)
                    : <p className="text-sm text-zinc-500 text-center py-6">No matches at this venue yet.</p>}
            </div>
        </div>
    );
};

export default FormPanel;

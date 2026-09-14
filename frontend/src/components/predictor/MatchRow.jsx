import React from 'react';

const MatchRow = ({ match, teamLogos }) => {
    return (
        <div className="flex flex-col bg-white/5 rounded-lg border border-white/5 overflow-hidden transition">
            <div
                className="flex items-center justify-between p-3">
                <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {match.giornata}</span>
                    <div className="flex items-center gap-2">
                        <img src={teamLogos[match.opponent]} alt={match.opponent} className="w-4 h-4 object-contain" />
                        <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{match.opponent}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center min-w-[30px]">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">For</span>
                        <span className="text-base font-black text-emerald-400">{match.statFor}</span>
                    </div>
                    <div className="flex flex-col items-center min-w-[30px]">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Ag</span>
                        <span className="text-base font-black text-red-400">{match.statAg}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                    <div className="flex flex-col items-center min-w-[30px]">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                        <span className="text-base font-black text-white">{match.total}</span>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default MatchRow;

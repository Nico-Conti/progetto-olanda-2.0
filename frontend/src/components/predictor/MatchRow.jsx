import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const MatchRow = ({ match, onShowAnalysis, teamLogos }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex flex-col bg-white/5 rounded-lg border border-white/5 overflow-hidden transition-all">
            <div
                className="flex items-center justify-between p-3 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
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
                        <span className="text-base font-black text-emerald-400">{match.cornersFor}</span>
                    </div>
                    <div className="flex flex-col items-center min-w-[30px]">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Ag</span>
                        <span className="text-base font-black text-red-400">{match.cornersAg}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                    <div className="flex flex-col items-center min-w-[30px]">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                        <span className="text-base font-black text-white">{match.total}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {isOpen && (
                <div className="p-3 bg-black/20 text-xs text-zinc-400 italic border-t border-white/5 animate-in slide-in-from-top-1 flex flex-col gap-2">
                    <p>{match.tldr || "No summary available."}</p>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            console.log("View Details clicked", match);
                            onShowAnalysis(match);
                        }}
                        className="self-end text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 flex items-center gap-1 z-10 relative"
                    >
                        View Details <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default MatchRow;

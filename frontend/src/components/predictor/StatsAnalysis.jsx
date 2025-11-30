import React from 'react';
import { Activity } from 'lucide-react';

const StatsAnalysis = ({ prediction, home, away, nGames, teamLogos }) => {
    if (!prediction) return null;

    return (
        <div className="glass-panel p-5 rounded-xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Stats Analysis (Last {nGames === 'all' ? 'Season' : nGames} Games)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Home Team Stats */}
                <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                            <img src={teamLogos[home]} alt={home} className="w-6 h-6 object-contain" />
                            {home} <span className="text-zinc-500 text-xs font-normal">(Home Matches)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                                <div className="text-2xl font-mono font-bold text-white">{prediction.hFor.toFixed(2)}</div>
                            </div>
                            <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                                <div className="text-2xl font-mono font-bold text-red-400">{prediction.hAg.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Away Team Stats */}
                <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                            <img src={teamLogos[away]} alt={away} className="w-6 h-6 object-contain" />
                            {away} <span className="text-zinc-500 text-xs font-normal">(Away Matches)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                                <div className="text-2xl font-mono font-bold text-white">{prediction.aFor.toFixed(2)}</div>
                            </div>
                            <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                                <div className="text-2xl font-mono font-bold text-red-400">{prediction.aAg.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsAnalysis;

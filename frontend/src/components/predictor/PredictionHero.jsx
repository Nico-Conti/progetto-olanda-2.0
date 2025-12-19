import React from 'react';
import { Flame, Info } from 'lucide-react';

const PredictionHero = ({ prediction, home, away, teamLogos, selectedStatistic, leagueAverage }) => {
    if (!prediction) return null;

    // Use dynamic threshold if leagueAverage is provided, otherwise fallback to reasonable default or keep existing behavior
    // List view used: match.prediction.total > (leagueAverages[match.selectedStat] * 1.15)
    // If leagueAverage is undefined (e.g. initial load), we should probably not show the flame or default to old behavior.
    const isHotMatch = leagueAverage ? prediction.total > (leagueAverage * 1.15) : prediction.total > 11.5;

    return (
        <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10 bg-zinc-900/40  z-[-1]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

            <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs mb-4 md:mb-6">Predicted Total {selectedStatistic}</h2>

                <div className="flex items-center justify-center gap-2 md:gap-8 mb-6 md:mb-8 w-full">
                    <div className="text-right flex-1 flex flex-col items-end overflow-hidden">
                        <img src={teamLogos[home]} alt={home} className="w-10 h-10 md:w-16 md:h-16 object-contain mb-2" />
                        <div className="text-base md:text-2xl font-bold text-white truncate w-full">{home}</div>
                        <div className="flex flex-col md:flex-row items-end md:items-center gap-0.5 md:gap-2 mt-1">
                            <div className="text-emerald-400 font-mono text-xs md:text-base font-bold">
                                Exp: {prediction.expHome.toFixed(2)}
                            </div>
                            <div className="text-emerald-400/60 font-mono text-[10px] md:text-sm font-bold">
                                ±{prediction.expHomeStd.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center shrink-0 mx-2">
                        <div className={`text-5xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${isHotMatch ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                            {prediction.total.toFixed(1)}
                        </div>
                        <div className={`font-mono text-sm md:text-lg font-bold mt-[-5px] md:mt-[-10px] ${isHotMatch ? 'text-orange-500/60' : 'text-zinc-500'}`}>
                            ±{prediction.totalStd.toFixed(2)}
                        </div>
                    </div>

                    <div className="text-left flex-1 flex flex-col items-start overflow-hidden">
                        <img src={teamLogos[away]} alt={away} className="w-10 h-10 md:w-16 md:h-16 object-contain mb-2" />
                        <div className="text-base md:text-2xl font-bold text-white truncate w-full">{away}</div>
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-0.5 md:gap-2 mt-1">
                            <div className="text-blue-400 font-mono text-xs md:text-base font-bold">
                                Exp: {prediction.expAway.toFixed(2)}
                            </div>
                            <div className="text-blue-400/60 font-mono text-[10px] md:text-sm font-bold">
                                ±{prediction.expAwayStd.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

                {isHotMatch ? (
                    <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                        <Flame className="w-4 h-4 fill-current" />
                        <span className="font-bold text-sm uppercase tracking-wide">High Over Trend ({leagueAverage ? `>${(leagueAverage * 1.15).toFixed(1)}` : 'Hot'})</span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                        <Info className="w-4 h-4" />
                        <span className="font-medium text-sm">Standard Projection</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PredictionHero;

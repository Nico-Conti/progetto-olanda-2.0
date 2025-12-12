import React from 'react';
import { Trophy, Percent } from 'lucide-react';

const MatchWinnerCard = ({ prediction, loading, homeTeam, awayTeam }) => {
    if (loading) {
        return (
            <div className="glass-panel p-6 rounded-xl border border-white/10 animate-pulse h-full">
                <div className="h-6 bg-white/10 rounded w-1/3 mb-4"></div>
                <div className="h-12 bg-white/10 rounded w-full mb-4"></div>
                <div className="h-24 bg-white/10 rounded w-full"></div>
            </div>
        );
    }

    if (!prediction) return null;

    const { probabilities } = prediction;
    const { home_win, draw, away_win } = probabilities;

    // Determine likely winner for highlight
    let likelyOutcome = "Draw";
    let maxProb = draw;
    let colorClass = "text-zinc-400";

    if (home_win > maxProb) {
        likelyOutcome = homeTeam;
        maxProb = home_win;
        colorClass = "text-emerald-400";
    }
    if (away_win > maxProb) {
        likelyOutcome = awayTeam;
        maxProb = away_win;
        colorClass = "text-blue-400";
    }

    return (
        <div className="glass-panel p-6 rounded-xl border border-white/10 h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        Match Winner (1X2)
                    </h3>
                    <div className={`text-2xl font-black mt-2 truncate max-w-[200px] ${colorClass}`}>
                        {likelyOutcome}
                        <span className="text-sm font-bold text-zinc-500 ml-2">({maxProb}%)</span>
                    </div>
                </div>
                <div className="bg-zinc-900/50 p-2 rounded-lg border border-white/5">
                    <Percent className="w-5 h-5 text-zinc-400" />
                </div>
            </div>

            <div className="space-y-6">
                {/* Probability Bar */}
                <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden flex">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-1000"
                        style={{ width: `${home_win}%` }}
                        title={`${homeTeam}: ${home_win}%`}
                    ></div>
                    <div
                        className="h-full bg-zinc-600 transition-all duration-1000"
                        style={{ width: `${draw}%` }}
                        title={`Draw: ${draw}%`}
                    ></div>
                    <div
                        className="h-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${away_win}%` }}
                        title={`${awayTeam}: ${away_win}%`}
                    ></div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                        <div className="text-xs font-bold text-emerald-400 mb-1">HOME</div>
                        <div className="text-lg font-black text-white">{home_win}%</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-zinc-400 mb-1">DRAW</div>
                        <div className="text-lg font-black text-white">{draw}%</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-blue-400 mb-1">AWAY</div>
                        <div className="text-lg font-black text-white">{away_win}%</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MatchWinnerCard;

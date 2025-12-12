import React from 'react';
import { Target, Flame, TrendingUp } from 'lucide-react';

const GoalsCard = ({ prediction, loading }) => {
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

    const { predicted_total_goals, stats_used } = prediction;
    const isHighOctane = predicted_total_goals > 2.8;

    return (
        <div className="glass-panel p-6 rounded-xl border border-white/10 h-full flex flex-col relative overflow-hidden group">
            {/* Background Glow */}
            {isHighOctane && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            )}

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-400" />
                        Goals Prediction
                    </h3>
                    <div className="text-3xl font-black text-white mt-2 flex items-baseline gap-2">
                        {predicted_total_goals.toFixed(2)}
                        <span className="text-sm font-bold text-zinc-500">Exp. Goals</span>
                    </div>
                </div>

                {isHighOctane ? (
                    <div className="bg-orange-500/10 text-orange-400 px-3 py-1.5 rounded-lg border border-orange-500/20 flex items-center gap-2 animate-pulse">
                        <Flame className="w-4 h-4 fill-current" />
                        <span className="text-xs font-bold uppercase">High Octane</span>
                    </div>
                ) : (
                    <div className="bg-zinc-800/50 text-zinc-400 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Standard</span>
                    </div>
                )}
            </div>

            <div className="space-y-4 relative z-10">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Total xGOT</div>
                        <div className="text-lg font-bold text-white">{stats_used.total_xgot.toFixed(2)}</div>
                    </div>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Combined xG</div>
                        <div className="text-lg font-bold text-white">{(stats_used.home_xg + stats_used.away_xg).toFixed(2)}</div>
                    </div>
                </div>

                {/* Team Breakdown */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-zinc-400 font-medium">Home xG</span>
                        <span className="text-white font-bold">{stats_used.home_xg.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(stats_used.home_xg / (stats_used.home_xg + stats_used.away_xg)) * 100}%` }}
                        ></div>
                    </div>

                    <div className="flex justify-between items-center text-sm mt-1">
                        <span className="text-zinc-400 font-medium">Away xG</span>
                        <span className="text-white font-bold">{stats_used.away_xg.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(stats_used.away_xg / (stats_used.home_xg + stats_used.away_xg)) * 100}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GoalsCard;

import React, { useState } from 'react';
import { Calculator, ChevronRight, Flame, Info, Activity } from 'lucide-react';
import { getAvg } from '../../utils/stats';

const Predictor = ({ stats, teams, home, setHome, away, setAway }) => {
    const [nGames, setNGames] = useState(5);

    const getRelevantMatches = (team, locationFilter, n) => {
        if (!stats[team]) return [];
        let matches = stats[team].all_matches.filter(m => m.location === locationFilter);
        matches.sort((a, b) => b.giornata - a.giornata);
        if (n !== 'all') matches = matches.slice(0, n);
        return matches;
    };

    const homeMatches = getRelevantMatches(home, 'Home', nGames);
    const awayMatches = getRelevantMatches(away, 'Away', nGames);

    const calculatePrediction = () => {
        if (!stats[home] || !stats[away]) return null;
        const hFor = getAvg(homeMatches.map(m => m.cornersFor));
        const hAg = getAvg(homeMatches.map(m => m.cornersAg));
        const aFor = getAvg(awayMatches.map(m => m.cornersFor));
        const aAg = getAvg(awayMatches.map(m => m.cornersAg));

        const expHome = (hFor + aAg) / 2;
        const expAway = (aFor + hAg) / 2;
        const total = expHome + expAway;

        return { expHome, expAway, total, hFor, hAg, aFor, aAg };
    };

    const prediction = calculatePrediction();

    const MatchHistoryCard = ({ team, matches, type }) => (
        <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                    {type === 'Home' ? <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> : <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
                    {team}
                </h4>
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{type} Form</span>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {matches.length > 0 ? matches.map(m => (
                    <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">MD {m.giornata}</span>
                            <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">For</span>
                                <span className="text-sm font-bold text-emerald-400">{m.cornersFor}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10"></div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">Ag</span>
                                <span className="text-sm font-bold text-red-400">{m.cornersAg}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10"></div>
                            <div className="flex flex-col items-center min-w-[30px]">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                                <span className="text-base font-black text-white">{m.total}</span>
                            </div>
                        </div>
                    </div>
                )) : <p className="text-zinc-500 text-sm italic text-center py-4">No matches found.</p>}
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Controls & Prediction Hero */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Controls */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="glass-panel p-5 rounded-xl border border-white/10">
                        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-emerald-400" />
                            Configuration
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Home Team</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium"
                                            value={home}
                                            onChange={(e) => setHome(e.target.value)}
                                        >
                                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Away Team</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                            value={away}
                                            onChange={(e) => setAway(e.target.value)}
                                        >
                                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Sample Size</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[3, 5, 'all'].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setNGames(n)}
                                            className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                                                ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                }`}
                                        >
                                            {n === 'all' ? 'Season' : `Last ${n}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Prediction Result */}
                <div className="lg:col-span-8">
                    {prediction && (
                        <div className="h-full glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700"></div>

                            <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                                <div className="flex items-center justify-center gap-8 mb-8 w-full">
                                    <div className="text-right flex-1">
                                        <div className="text-2xl font-bold text-white truncate">{home}</div>
                                        <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {prediction.expHome.toFixed(2)}</div>
                                    </div>

                                    <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${prediction.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                                        {prediction.total.toFixed(1)}
                                    </div>

                                    <div className="text-left flex-1">
                                        <div className="text-2xl font-bold text-white truncate">{away}</div>
                                        <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {prediction.expAway.toFixed(2)}</div>
                                    </div>
                                </div>

                                {prediction.total > 11.5 ? (
                                    <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                        <Flame className="w-4 h-4 fill-current" />
                                        <span className="font-bold text-sm uppercase tracking-wide">High Over Trend</span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                                        <Info className="w-4 h-4" />
                                        <span className="font-medium text-sm">Standard Projection</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Analysis Breakdown */}
            {prediction && (
                <div className="glass-panel p-5 rounded-xl border border-white/10">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Stats Analysis (Last {nGames === 'all' ? 'Season' : nGames} Games)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Home Team Stats */}
                        <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div className="relative z-10">
                                <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
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
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div className="relative z-10">
                                <div className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
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
            )}

            {/* Detailed History */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <MatchHistoryCard team={home} matches={homeMatches} type="Home" />
                <MatchHistoryCard team={away} matches={awayMatches} type="Away" />
            </div>

            {/* Formula Legend */}
            <div className="glass-panel rounded-xl p-5 border border-white/10 bg-zinc-900/40">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4 text-zinc-500" />
                    Prediction Formula
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-400 font-mono">
                    <div className="bg-zinc-950/50 p-3 rounded-lg border border-white/5">
                        <div className="text-emerald-400 font-bold mb-1">Home Expected</div>
                        <div>(Home Avg For + Away Avg Against) / 2</div>
                        <div className="mt-1 text-zinc-500">
                            ({prediction?.hFor.toFixed(2)} + {prediction?.aAg.toFixed(2)}) / 2 = <span className="text-white">{prediction?.expHome.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-lg border border-white/5">
                        <div className="text-blue-400 font-bold mb-1">Away Expected</div>
                        <div>(Away Avg For + Home Avg Against) / 2</div>
                        <div className="mt-1 text-zinc-500">
                            ({prediction?.aFor.toFixed(2)} + {prediction?.hAg.toFixed(2)}) / 2 = <span className="text-white">{prediction?.expAway.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Predictor;

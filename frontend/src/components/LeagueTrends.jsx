import React, { useState } from 'react';
import { Info, TrendingUp, Flame, Snowflake } from 'lucide-react';
import TrendBadge from './TrendBadge';
import { getAvg, getTrendData } from '../utils/stats';

const LeagueTrends = ({ stats, teamLogos, selectedStatistic }) => {
    const [sliderValue, setSliderValue] = useState(0); // 0: 3, 1: 5, 2: 10, 3: All
    const options = [3, 5, 10, 'all'];
    const nGames = options[sliderValue];

    const teams = Object.keys(stats).sort();

    return (
        <div className="space-y-6">
            {/* Controls & Legend */}
            <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex flex-col gap-2 w-full md:w-1/3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-400 uppercase tracking-wide">Trend Sample</span>
                        <span className="text-emerald-400 font-bold font-mono text-lg">
                            {nGames === 'all' ? 'Season' : `Last ${nGames}`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="3"
                        step="1"
                        value={sliderValue}
                        onChange={(e) => setSliderValue(parseInt(e.target.value))}
                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase px-1">
                        <span>3</span>
                        <span>5</span>
                        <span>10</span>
                        <span>All</span>
                    </div>
                </div>

                <div className="flex flex-col gap-2 bg-zinc-900/50 p-4 rounded-xl border border-white/5 w-full md:w-auto">
                    <div className="flex items-center gap-2 mb-1">
                        <Info className="w-4 h-4 text-zinc-400" />
                        <span className="font-bold text-zinc-300 uppercase text-xs">Trend Legend</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                            <span className="font-mono bg-white/5 px-1 rounded">Diff</span>
                            <span>= Avg(L{nGames}) - Avg(Season)</span>
                        </div>
                        <div className="w-px h-4 bg-white/10 hidden md:block"></div>
                        <div className="flex items-center gap-1.5">
                            <Flame className="w-4 h-4 text-red-400" />
                            <span className="font-bold text-red-400">&gt; +1.5</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-orange-400" />
                            <span className="font-bold text-orange-400">&gt; +0.5</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Snowflake className="w-4 h-4 text-blue-400" />
                            <span className="font-bold text-blue-400">&lt; -0.5</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
                <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/40">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                            League Trends ({selectedStatistic})
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">Comparing Season Averages vs Recent Form ({nGames === 'all' ? 'Entire Season' : `Last ${nGames} Games`})</p>
                    </div>
                </div>

                {/* Mobile View (Cards) */}
                <div className="md:hidden space-y-4">
                    {teams.map((team, index) => {
                        const hTrend = getTrendData(stats[team].home_totals, nGames);
                        const aTrend = getTrendData(stats[team].away_totals, nGames);
                        const hForAvg = getAvg(stats[team].home_for);
                        const hAgAvg = getAvg(stats[team].home_ag);
                        const aForAvg = getAvg(stats[team].away_for);
                        const aAgAvg = getAvg(stats[team].away_ag);

                        return (
                            <div
                                key={team}
                                style={{ animationDelay: `${index * 50}ms` }}
                                className="glass-panel p-4 rounded-xl border border-white/10 animate-waterfall"
                            >
                                <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                                    <img src={teamLogos[team]} alt={team} className="w-8 h-8 object-contain" />
                                    <span className="font-bold text-white text-lg">{team}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Home Stats */}
                                    <div className="bg-zinc-900/40 p-3 rounded-lg border border-white/5">
                                        <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2 text-center">Home</div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-500">Avg For</span>
                                                <span className="text-white font-mono">{hForAvg.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-500">Avg Ag</span>
                                                <span className="text-white font-mono">{hAgAvg.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm bg-white/5 p-1 rounded">
                                                <span className="text-zinc-400">Recent</span>
                                                <span className="text-white font-bold font-mono">{hTrend.recent.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-center pt-1">
                                                <TrendBadge diff={hTrend.diff} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Away Stats */}
                                    <div className="bg-zinc-900/40 p-3 rounded-lg border border-white/5">
                                        <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2 text-center">Away</div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-500">Avg For</span>
                                                <span className="text-white font-mono">{aForAvg.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-500">Avg Ag</span>
                                                <span className="text-white font-mono">{aAgAvg.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm bg-white/5 p-1 rounded">
                                                <span className="text-zinc-400">Recent</span>
                                                <span className="text-white font-bold font-mono">{aTrend.recent.toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-center pt-1">
                                                <TrendBadge diff={aTrend.diff} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-zinc-300">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
                            <tr>
                                <th className="px-5 py-3 font-bold tracking-wider text-sm">Team</th>
                                <th className="px-3 py-3 text-center border-l border-white/5 bg-emerald-500/5 text-emerald-500 font-bold" colSpan={5}>Home Stats</th>
                                <th className="px-3 py-3 text-center border-l border-white/5 bg-blue-500/5 text-blue-500 font-bold" colSpan={5}>Away Stats</th>
                            </tr>
                            <tr>
                                <th className="px-5 py-3"></th>

                                <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-emerald-500/5" title="Season Average For">Avg For (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5" title="Season Average Against">Avg Ag (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-zinc-400" title="Season Average Total">Avg Tot (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-400" title={`Average Total Last ${nGames}`}>Avg Tot (L{nGames})</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5">Trend</th>

                                <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-blue-500/5" title="Season Average For">Avg For (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5" title="Season Average Against">Avg Ag (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-zinc-400" title="Season Average Total">Avg Tot (Sea)</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-400" title={`Average Total Last ${nGames}`}>Avg Tot (L{nGames})</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5">Trend</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {teams.map((team, index) => {
                                const hTrend = getTrendData(stats[team].home_totals, nGames);
                                const aTrend = getTrendData(stats[team].away_totals, nGames);

                                const hForAvg = getAvg(stats[team].home_for);
                                const hAgAvg = getAvg(stats[team].home_ag);
                                const aForAvg = getAvg(stats[team].away_for);
                                const aAgAvg = getAvg(stats[team].away_ag);

                                return (
                                    <tr
                                        key={team}
                                        style={{ animationDelay: `${index * 50}ms` }}
                                        className="hover:bg-white/[0.03] transition-colors group animate-waterfall"
                                    >
                                        <td className="px-5 py-3 font-bold text-white text-base group-hover:text-emerald-400 transition-colors border-r border-white/5 flex items-center gap-3">
                                            <img src={teamLogos[team]} alt={team} className="w-6 h-6 object-contain" />
                                            {team}
                                        </td>

                                        {/* Home Stats */}
                                        <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base">{hForAvg.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{hAgAvg.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center text-zinc-400 font-mono font-medium text-base">{hTrend.season.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center font-black text-white font-mono text-lg bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">{hTrend.recent.toFixed(1)}</td>
                                        <td className="px-3 py-3 flex justify-center items-center h-full"><TrendBadge diff={hTrend.diff} /></td>

                                        {/* Away Stats */}
                                        <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base border-l border-white/5">{aForAvg.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{aAgAvg.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center text-zinc-400 font-mono font-medium text-base">{aTrend.season.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center font-black text-white font-mono text-lg bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">{aTrend.recent.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center">
                                            <div className="flex justify-center"><TrendBadge diff={aTrend.diff} /></div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LeagueTrends;

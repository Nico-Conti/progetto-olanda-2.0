import React from 'react';
import { Trophy, Minus, Plus, X, Check } from 'lucide-react';
import GlassPanel from '../ui/GlassPanel';
import Select from '../ui/Select';

const ResultsList = ({
    rankedTeams,
    displayLimit,
    setDisplayLimit,
    nGames,
    setNGames,
    maxGames,
    teamLogos,
    bets,
    addToBet,
    removeFromBet,
    selectedStatistic,
    operator,
    threshold,
    onTeamClick
}) => {

    const displayLimitOptions = [5, 10, 15, 20].map(n => ({ value: n, label: n.toString() }));
    const nGamesOptions = [3, 5, 10, 'all'].map(n => ({ value: n, label: n === 'all' ? 'Season' : n.toString() }));

    return (
        <GlassPanel className="rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        Top
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setDisplayLimit(prev => Math.max(1, prev - 1))}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <Minus className="w-3 h-3" />
                        </button>

                        <div className="w-20">
                            <Select
                                value={displayLimit}
                                onChange={setDisplayLimit}
                                options={displayLimitOptions}
                                className="h-8 text-xs"
                            />
                        </div>

                        <button
                            onClick={() => setDisplayLimit(prev => Math.min(20, prev + 1))}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <h2 className="text-xl font-black text-white">
                        Teams
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-2">
                        Last Games:
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                setNGames(prev => {
                                    const val = prev === 'all' ? maxGames : prev;
                                    return Math.max(1, val - 1);
                                });
                            }}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <Minus className="w-3 h-3" />
                        </button>

                        <div className="w-24">
                            <Select
                                value={nGames}
                                onChange={setNGames}
                                options={nGamesOptions}
                                className="h-8 text-xs"
                            />
                        </div>

                        <button
                            onClick={() => {
                                setNGames(prev => {
                                    if (prev === 'all') return 'all';
                                    if (prev + 1 >= maxGames) return 'all';
                                    return prev + 1;
                                });
                            }}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-zinc-950/50 text-xs uppercase text-zinc-500 font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-4 text-center w-16">Rank</th>
                            <th className="px-6 py-4">Team</th>
                            <th className="px-6 py-4 text-center">Record</th>
                            <th className="px-6 py-4 text-center">Win Rate</th>
                            <th className="px-6 py-4 text-center">Add to Slip</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {rankedTeams.slice(0, displayLimit).map((team, index) => (
                            <tr key={team.team} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-4 text-center font-mono text-zinc-500 font-bold">
                                    #{index + 1}
                                </td>
                                <td className="px-6 py-4">
                                    <div
                                        className="flex items-center gap-3 cursor-pointer"
                                        onClick={() => onTeamClick && onTeamClick(team.team)}
                                    >
                                        <img
                                            src={teamLogos[team.team]}
                                            alt={team.team}
                                            className="w-8 h-8 object-contain"
                                        />
                                        <span className="font-bold text-white text-lg group-hover:text-purple-400 transition-colors">
                                            {team.team}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="font-mono font-bold text-zinc-300 bg-zinc-900 px-3 py-1 rounded-md border border-white/5">
                                        {team.winCount} / {team.totalGames}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${team.winRate >= 80 ? 'bg-emerald-500' :
                                                    team.winRate >= 60 ? 'bg-emerald-400' :
                                                        team.winRate >= 40 ? 'bg-yellow-500' :
                                                            'bg-red-500'
                                                    }`}
                                                style={{ width: `${team.winRate}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className={`font-black text-lg ${team.winRate >= 80 ? 'text-emerald-500' :
                                                team.winRate >= 60 ? 'text-emerald-400' :
                                                    team.winRate >= 40 ? 'text-yellow-500' :
                                                        'text-red-500'
                                                }`}>
                                                {team.winRate.toFixed(0)}%
                                            </span>
                                            <span className="text-xs font-mono text-zinc-500 font-bold">
                                                @{team.winRate > 0 ? (100 / team.winRate).toFixed(2) : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={() => {
                                            const opt = operator === 'over' ? 'O' : 'U';
                                            const isAdded = bets?.some(b => b.game === team.team && b.stat === selectedStatistic && b.option === opt && b.value === threshold);

                                            if (isAdded) {
                                                removeFromBet(team.team);
                                            } else {
                                                addToBet(team.team, opt, threshold, selectedStatistic);
                                            }
                                        }}
                                        className={`p-2 rounded-lg transition-all ${bets?.some(b => b.game === team.team && b.stat === selectedStatistic && b.option === (operator === 'over' ? 'O' : 'U') && b.value === threshold)
                                            ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'
                                            : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                                            }`}
                                    >
                                        {bets?.some(b => b.game === team.team && b.stat === selectedStatistic && b.option === (operator === 'over' ? 'O' : 'U') && b.value === threshold) ? (
                                            <X className="w-4 h-4" />
                                        ) : (
                                            <Plus className="w-4 h-4 transition-transform" />
                                        )}
                                    </button>
                                </td>
                            </tr>
                        ))}

                        {rankedTeams.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-zinc-500">
                                    No data available for the selected criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </GlassPanel>
    );
};

export default ResultsList;

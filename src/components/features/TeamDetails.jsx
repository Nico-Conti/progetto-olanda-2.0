import React from 'react';
import { ArrowLeft, TrendingUp, Calendar, MapPin, Globe, Info } from 'lucide-react';
import { getAvg, getTrendData } from '../../utils/stats';
import TrendBadge from '../common/TrendBadge';

const TeamDetails = ({ teamName, stats, teamInfo, onBack }) => {
    const teamStats = stats[teamName];

    if (!teamStats) return <div>Team not found</div>;

    const hTrend = getTrendData(teamStats.home_corners_total, 5);
    const aTrend = getTrendData(teamStats.away_corners_total, 5);

    // Helper for averages
    const avg = (arr) => getAvg(arr).toFixed(1);

    const StatCard = ({ title, homeVal, awayVal, icon: Icon, color = "emerald" }) => (
        <div className={`glass-panel p-4 rounded-xl border border-white/10 bg-${color}-900/5`}>
            <h3 className={`text-sm font-bold text-${color}-400 mb-3 flex items-center gap-2`}>
                <Icon className="w-4 h-4" /> {title}
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Home</div>
                    <div className="text-xl font-mono font-bold text-white">{homeVal}</div>
                </div>
                <div>
                    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Away</div>
                    <div className="text-xl font-mono font-bold text-white">{awayVal}</div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Header with Team Info */}
            <div className="glass-panel p-6 rounded-xl border border-white/10 relative overflow-hidden">
                {/* Background Stadium Image */}
                {teamInfo?.stadium_image_url && (
                    <div className="absolute inset-0 z-0">
                        <img
                            src={teamInfo.stadium_image_url}
                            alt="Stadium"
                            className="w-full h-full object-cover opacity-20"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
                    </div>
                )}

                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white absolute top-4 right-4 md:static"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>

                    {teamInfo?.logo_url && (
                        <img src={teamInfo.logo_url} alt={teamName} className="w-24 h-24 object-contain drop-shadow-2xl" />
                    )}

                    <div className="flex-1">
                        <h1 className="text-4xl font-bold text-white mb-2">{teamName}</h1>

                        <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                            {teamInfo?.formed_year && (
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>Est. {teamInfo.formed_year}</span>
                                </div>
                            )}
                            {teamInfo?.website && (
                                <a href={`https://${teamInfo.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
                                    <Globe className="w-4 h-4" />
                                    <span>{teamInfo.website}</span>
                                </a>
                            )}
                        </div>

                        {teamInfo?.description && (
                            <p className="mt-4 text-zinc-300 text-sm max-w-2xl line-clamp-3 hover:line-clamp-none transition-all cursor-pointer">
                                {teamInfo.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Corners (Main Stat) */}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 glass-panel p-6 rounded-xl border border-white/10 bg-emerald-900/10">
                    <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" /> Corner Stats
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <div className="text-zinc-400 text-sm">Home Avg For</div>
                            <div className="text-2xl font-mono font-bold text-white">{avg(teamStats.home_corners_for)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-400 text-sm">Home Avg Ag.</div>
                            <div className="text-2xl font-mono font-bold text-white">{avg(teamStats.home_corners_ag)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-400 text-sm">Away Avg For</div>
                            <div className="text-2xl font-mono font-bold text-white">{avg(teamStats.away_corners_for)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-400 text-sm">Away Avg Ag.</div>
                            <div className="text-2xl font-mono font-bold text-white">{avg(teamStats.away_corners_ag)}</div>
                        </div>
                    </div>
                </div>

                <StatCard
                    title="Goals Scored (Avg)"
                    icon={TrendingUp}
                    homeVal={avg(teamStats.home_goals_for)}
                    awayVal={avg(teamStats.away_goals_for)}
                    color="blue"
                />
                <StatCard
                    title="Goals Conceded (Avg)"
                    icon={TrendingUp}
                    homeVal={avg(teamStats.home_goals_ag)}
                    awayVal={avg(teamStats.away_goals_ag)}
                    color="red"
                />
                <StatCard
                    title="Shots on Target (Avg)"
                    icon={TrendingUp}
                    homeVal={avg(teamStats.home_shots_ot_for)}
                    awayVal={avg(teamStats.away_shots_ot_for)}
                    color="purple"
                />
                <StatCard
                    title="Possession (%)"
                    icon={TrendingUp}
                    homeVal={`${avg(teamStats.home_possession_for)}%`}
                    awayVal={`${avg(teamStats.away_possession_for)}%`}
                    color="yellow"
                />
                <StatCard
                    title="Cards (Y+R)"
                    icon={TrendingUp}
                    homeVal={avg(teamStats.home_cards_for)}
                    awayVal={avg(teamStats.away_cards_for)}
                    color="orange"
                />
            </div>

            {/* Match History */}
            <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
                <div className="px-5 py-4 border-b border-white/5 bg-zinc-900/40">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-zinc-400" />
                        Match History
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-zinc-300">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
                            <tr>
                                <th className="px-5 py-3">Round</th>
                                <th className="px-5 py-3">Loc</th>
                                <th className="px-5 py-3">Opponent</th>
                                <th className="px-5 py-3 text-center">Score</th>
                                <th className="px-5 py-3 text-center">Corners</th>
                                <th className="px-5 py-3 text-center">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {teamStats.all_matches.sort((a, b) => b.giornata - a.giornata).map((match, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                                    <td className="px-5 py-3 text-zinc-500">#{match.giornata}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${match.location === 'Home' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                            {match.location.substring(0, 1)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 font-medium text-white">{match.opponent}</td>
                                    <td className="px-5 py-3 text-center font-mono text-zinc-300">
                                        {match.goalsFor} - {match.goalsAg}
                                    </td>
                                    <td className="px-5 py-3 text-center font-mono">
                                        <span className="text-emerald-300">{match.cornersFor}</span> - <span className="text-red-300">{match.cornersAg}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center font-mono font-bold text-white">{match.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TeamDetails;

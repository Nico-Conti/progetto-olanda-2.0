import React, { useMemo, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Filter } from 'lucide-react';
import { processData } from '../utils/stats';

const LeagueTable = ({ matchData, teamLogos, onTeamClick, leagueLogo, selectedStatistic = 'goals' }) => {
    const [showFilters, setShowFilters] = useState(false);
    const [limit, setLimit] = useState('all');
    const [location, setLocation] = useState('all');

    const tableData = useMemo(() => {
        // Always calculate standings based on 'goals' for standard football table
        const stats = processData(matchData, 'goals');
        // Calculate tooltip stats based on selected statistic
        const tooltipStats = processData(matchData, selectedStatistic);
        const teams = Object.keys(stats);

        const rows = teams.map(team => {
            let matches = stats[team].all_matches;
            let tooltipMatches = tooltipStats[team]?.all_matches || [];

            // 1. Filter by Location
            if (location !== 'all') {
                const locStr = location === 'home' ? 'Home' : 'Away';
                matches = matches.filter(m => m.location === locStr);
                tooltipMatches = tooltipMatches.filter(m => m.location === locStr);
            }

            // 2. Filter by Limit (Last N Games)
            if (limit !== 'all') {
                const limitNum = Number(limit);
                matches = matches.slice(0, limitNum);
                tooltipMatches = tooltipMatches.slice(0, limitNum);
            }

            let w = 0, d = 0, l = 0, gf = 0, ga = 0;

            // Calculate Stats based on FILTERED matches
            matches.forEach(m => {
                const f = Number(m.statFor);
                const a = Number(m.statAg);
                gf += f;
                ga += a;
                if (f > a) w++;
                else if (f === a) d++;
                else l++;
            });

            // Calculate form (last 5 games of the FILTERED set)
            // matches are sorted desc by giornata, so index 0 is latest
            const form = matches.slice(0, 5).map((m, i) => {
                let result = 'L';
                if (m.statFor > m.statAg) result = 'W';
                else if (m.statFor === m.statAg) result = 'D';

                // Get corresponding match from tooltip stats (should be at same index as both are sorted by giornata)
                // We double check giornata just in case, or fallback to same index
                const tooltipMatch = tooltipMatches[i];

                return {
                    result,
                    ...m,
                    tooltipStatFor: tooltipMatch?.statFor,
                    tooltipStatAg: tooltipMatch?.statAg,
                    tooltipDate: tooltipMatch?.date
                };
            });

            return {
                team,
                mp: matches.length,
                w,
                d,
                l,
                gf,
                ga,
                gd: gf - ga,
                pts: (w * 3) + d,
                form
            };
        });

        return rows.sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.gd !== a.gd) return b.gd - a.gd;
            return b.gf - a.gf;
        });
    }, [matchData, selectedStatistic, limit, location]);

    const getFormColor = (result) => {
        switch (result) {
            case 'W': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'D': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
            case 'L': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-zinc-800 text-zinc-500';
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="glass-panel rounded-xl border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {leagueLogo ? (
                        <img src={leagueLogo} alt="League Logo" className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                    ) : (
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                            <Trophy className="w-5 h-5" />
                        </div>
                    )}
                    <div>
                        <h2 className="text-lg font-bold text-white">League Standings</h2>
                        <p className="text-zinc-400 text-xs mt-0.5">Current Season Performance ({selectedStatistic})</p>
                    </div>
                </div>

                <div className="flex items-center gap-6 animate-in fade-in slide-in-from-right-4">
                    {/* Games Filter */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sample:</span>
                        <div className="flex bg-zinc-900 rounded-lg p-1 border border-white/10">
                            {[
                                { label: 'Season', value: 'all' },
                                { label: 'Last 5', value: '5' },
                                { label: 'Last 10', value: '10' },
                                { label: 'Last 15', value: '15' }
                            ].map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setLimit(opt.value)}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${limit === opt.value
                                            ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/20'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Location Filter */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">View:</span>
                        <div className="flex bg-zinc-900 rounded-lg p-1 border border-white/10">
                            {[
                                { label: 'Total', value: 'all' },
                                { label: 'Home', value: 'home' },
                                { label: 'Away', value: 'away' }
                            ].map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setLocation(opt.value)}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${location === opt.value
                                            ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/20'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950/50 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">
                        <tr>
                            <th className="px-4 py-3 text-center w-12">Pos</th>
                            <th className="px-4 py-3">Team</th>
                            <th className="px-4 py-3 text-center">MP</th>
                            <th className="px-4 py-3 text-center">W</th>
                            <th className="px-4 py-3 text-center">D</th>
                            <th className="px-4 py-3 text-center">L</th>
                            <th className="px-4 py-3 text-center hidden md:table-cell">GF</th>
                            <th className="px-4 py-3 text-center hidden md:table-cell">GA</th>
                            <th className="px-4 py-3 text-center">GD</th>
                            <th className="px-4 py-3 text-center text-white">Pts</th>
                            <th className="px-4 py-3 text-center hidden lg:table-cell">Form</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {tableData.map((row, index) => (
                            <tr
                                key={row.team}
                                className="hover:bg-white/[0.04] transition-all cursor-pointer group animate-waterfall"
                                style={{ animationDelay: `${index * 50}ms` }}
                                onClick={() => onTeamClick && onTeamClick(row.team)}
                            >
                                <td className="px-4 py-3 text-center font-mono text-zinc-500 group-hover:text-white transition-colors">
                                    {index + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={teamLogos[row.team]}
                                            alt={row.team}
                                            className="w-8 h-8 object-contain"
                                        />
                                        <span className="font-bold text-zinc-200 group-hover:text-white transition-colors">
                                            {row.team}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center text-zinc-400">{row.mp}</td>
                                <td className="px-4 py-3 text-center text-emerald-400/80 font-medium">{row.w}</td>
                                <td className="px-4 py-3 text-center text-zinc-400 font-medium">{row.d}</td>
                                <td className="px-4 py-3 text-center text-red-400/80 font-medium">{row.l}</td>
                                <td className="px-4 py-3 text-center hidden md:table-cell text-zinc-400">{row.gf}</td>
                                <td className="px-4 py-3 text-center hidden md:table-cell text-zinc-400">{row.ga}</td>
                                <td className={`px-4 py-3 text-center font-bold ${row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                                </td>
                                <td className="px-4 py-3 text-center font-black text-white text-base">
                                    {row.pts}
                                </td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                    <div className="flex items-center justify-center gap-1">
                                        {row.form.map((match, i) => (
                                            <div key={i} className="group/tooltip relative">
                                                <div
                                                    className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border ${getFormColor(match.result)}`}
                                                >
                                                    {match.result}
                                                </div>
                                                {/* Tooltip */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max hidden group-hover/tooltip:block z-[60]">
                                                    <div className="bg-zinc-900/95 backdrop-blur-md text-white text-xs px-3 py-2 rounded-lg border border-white/10 shadow-xl flex flex-col items-center gap-1">
                                                        <span className="font-bold whitespace-nowrap">
                                                            {match.location === 'Home'
                                                                ? `${match.tooltipStatFor}:${match.tooltipStatAg}`
                                                                : `${match.tooltipStatAg}:${match.tooltipStatFor}`
                                                            }
                                                            {' '}
                                                            <span className="text-zinc-400 font-normal">
                                                                ({match.location === 'Home' ? `${match.team} - ${match.opponent}` : `${match.opponent} - ${match.team}`})
                                                            </span>
                                                        </span>
                                                        <span className="text-zinc-500 text-[10px]">
                                                            {selectedStatistic.charAt(0).toUpperCase() + selectedStatistic.slice(1)} • {formatDate(match.tooltipDate || match.date)}
                                                        </span>
                                                        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 border-r border-b border-white/10 rotate-45"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LeagueTable;

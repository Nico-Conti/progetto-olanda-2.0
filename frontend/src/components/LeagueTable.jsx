import React, { useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { processData } from '../utils/stats';

const LeagueTable = ({ matchData, teamLogos, onTeamClick, leagueLogo }) => {
    const tableData = useMemo(() => {
        const stats = processData(matchData, 'goals');
        const teams = Object.keys(stats);

        const rows = teams.map(team => {
            const matches = stats[team].all_matches;
            let w = 0, d = 0, l = 0, gf = 0, ga = 0;
            // Calculate form (last 5 games)
            // matches are sorted desc by giornata, so index 0 is latest
            const form = matches.slice(0, 5).map(m => {
                if (m.statFor > m.statAg) return 'W';
                if (m.statFor === m.statAg) return 'D';
                return 'L';
            }).reverse(); // Display left-to-right as oldest-to-newest usually, or newest-to-oldest? standard is often Left=Oldest Right=Newest. 
            // processData sorts newest first. So slice(0,5) gives [Newest, ..., 5th Newest]. 
            // We want [5th Newest, ..., Newest]. So reverse() is correct.

            matches.forEach(m => {
                const f = Number(m.statFor);
                const a = Number(m.statAg);
                gf += f;
                ga += a;
                if (f > a) w++;
                else if (f === a) d++;
                else l++;
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
    }, [matchData]);

    const getFormColor = (result) => {
        switch (result) {
            case 'W': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'D': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
            case 'L': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-zinc-800 text-zinc-500';
        }
    };

    return (
        <div className="glass-panel rounded-xl border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center gap-3">
                {leagueLogo ? (
                    <img src={leagueLogo} alt="League Logo" className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                ) : (
                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                        <Trophy className="w-5 h-5" />
                    </div>
                )}
                <div>
                    <h2 className="text-lg font-bold text-white">League Standings</h2>
                    <p className="text-zinc-400 text-xs mt-0.5">Current Season Performance</p>
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
                                        {row.form.map((res, i) => (
                                            <div
                                                key={i}
                                                className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border ${getFormColor(res)}`}
                                            >
                                                {res}
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

import React from 'react';
import { Flame, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { getAvg } from '../../utils/stats';

const LeagueStats = ({ stats, teams }) => {
    if (!stats || teams.length === 0) return null;

    // Calculate team metrics
    const teamMetrics = teams.map(team => {
        const s = stats[team];
        const avgCornersTotal = getAvg(s.all_matches.map(m => m.total));
        const avgGoalsTotal = getAvg(s.all_matches.map(m => m.goalsFor + m.goalsAg));
        const avgCornersFor = getAvg(s.all_matches.map(m => m.cornersFor));

        return {
            team,
            avgCornersTotal,
            avgGoalsTotal,
            avgCornersFor
        };
    });

    // Sort for different categories
    const topCornerTeams = [...teamMetrics].sort((a, b) => b.avgCornersTotal - a.avgCornersTotal).slice(0, 3);
    const topGoalTeams = [...teamMetrics].sort((a, b) => b.avgGoalsTotal - a.avgGoalsTotal).slice(0, 3);
    const topAttackingCornerTeams = [...teamMetrics].sort((a, b) => b.avgCornersFor - a.avgCornersFor).slice(0, 3);

    const TrendCard = ({ title, icon: Icon, data, color, valueKey, label }) => (
        <div className="glass-panel p-5 rounded-xl border border-white/10 h-full">
            <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400`}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-sm uppercase tracking-wide">{title}</h3>
            </div>
            <div className="space-y-3">
                {data.map((item, i) => (
                    <div key={item.team} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <span className="text-zinc-600 font-mono font-bold text-xs">0{i + 1}</span>
                            <span className="text-zinc-300 font-medium group-hover:text-white transition-colors">{item.team}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className={`text-${color}-400 font-bold font-mono`}>{item[valueKey].toFixed(2)}</span>
                            <span className="text-[10px] text-zinc-600 uppercase">{label}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-bold text-white">League Trends & Hot Stats</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TrendCard
                    title="Highest Corner Games"
                    icon={TrendingUp}
                    data={topCornerTeams}
                    color="emerald"
                    valueKey="avgCornersTotal"
                    label="Avg Total / Match"
                />
                <TrendCard
                    title="Goal Machines"
                    icon={Target}
                    data={topGoalTeams}
                    color="blue"
                    valueKey="avgGoalsTotal"
                    label="Avg Goals / Match"
                />
                <TrendCard
                    title="Corner Generators"
                    icon={Flame}
                    data={topAttackingCornerTeams}
                    color="orange"
                    valueKey="avgCornersFor"
                    label="Avg For / Match"
                />
            </div>
        </div>
    );
};

export default LeagueStats;

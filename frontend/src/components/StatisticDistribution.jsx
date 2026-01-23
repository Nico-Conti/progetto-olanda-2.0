import React, { useState, useMemo } from 'react';
import { ChevronDown, BarChart2, TrendingUp, X } from 'lucide-react';

const STAT_OPTIONS = [
    { value: 'goals', label: 'Goals' },
    { value: 'corners', label: 'Corners' },
    { value: 'shots', label: 'Shots' },
    { value: 'shots_on_target', label: 'Shots on Target' },
    { value: 'fouls', label: 'Fouls' },
    { value: 'yellow_cards', label: 'Yellow Cards' },
    { value: 'red_cards', label: 'Red Cards' },
];

const StatisticDistribution = ({ matches, onClose }) => {
    const [selectedStat, setSelectedStat] = useState('goals');
    const [viewMode, setViewMode] = useState('total'); // 'total', 'home', 'away'

    const distribution = useMemo(() => {
        if (!matches || matches.length === 0) return null;

        const counts = {};
        const values = [];
        let maxCount = 0;
        let totalSum = 0;
        let count = 0;

        matches.forEach(m => {
            if (!m.stats || !m.stats[selectedStat]) return;

            let val = 0;
            const homeVal = Number(m.stats[selectedStat].home);
            const awayVal = Number(m.stats[selectedStat].away);

            if (viewMode === 'total') val = homeVal + awayVal;
            else if (viewMode === 'home') val = homeVal;
            else if (viewMode === 'away') val = awayVal;

            // Round to nearest integer just in case (though these stats are usually ints)
            val = Math.round(val);

            counts[val] = (counts[val] || 0) + 1;
            maxCount = Math.max(maxCount, counts[val]);
            values.push(val);
            totalSum += val;
            count++;
        });

        // Median
        values.sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

        // Mean
        const mean = count > 0 ? totalSum / count : 0;

        // Create display array
        const labels = Object.keys(counts).map(Number).sort((a, b) => a - b);
        // Fill gaps? Maybe not necessary for integer stats unless meaningful. 
        // Let's fill gaps if the range is not too huge.
        const minVal = labels[0] || 0;
        const maxVal = labels[labels.length - 1] || 0;

        const chartData = [];
        if (count > 0) {
            for (let i = minVal; i <= maxVal; i++) {
                chartData.push({
                    value: i,
                    count: counts[i] || 0,
                    percentage: (counts[i] || 0) / count * 100
                });
            }
        }

        return {
            chartData,
            stats: { mean, median, totalSamples: count },
            maxCount
        };
    }, [matches, selectedStat, viewMode]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col rounded-xl border border-white/10 shadow-2xl bg-zinc-950">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <BarChart2 className="w-6 h-6 text-emerald-400" />
                            Statistic Distribution
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">
                            Analyze the frequency of <span className="text-emerald-400 font-bold uppercase">{selectedStat.replace('_', ' ')}</span> across the league.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-6 h-6 text-zinc-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="p-6 border-b border-white/5 bg-zinc-900/50 flex flex-col xl:flex-row gap-6 items-center justify-between shrink-0">
                    <div className="flex flex-col md:flex-row gap-6 items-center w-full xl:w-auto">
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Statistic</label>
                            <div className="relative">
                                <select
                                    value={selectedStat}
                                    onChange={(e) => setSelectedStat(e.target.value)}
                                    className="w-full md:w-48 bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-bold uppercase"
                                >
                                    {STAT_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Metric</label>
                            <div className="flex bg-zinc-900 border border-white/10 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('total')}
                                    className={`px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${viewMode === 'total' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Total
                                </button>
                                <button
                                    onClick={() => setViewMode('home')}
                                    className={`px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${viewMode === 'home' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Home
                                </button>
                                <button
                                    onClick={() => setViewMode('away')}
                                    className={`px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${viewMode === 'away' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Away
                                </button>
                            </div>
                        </div>
                    </div>

                    {distribution && (
                        <div className="flex items-center gap-3 w-full xl:w-auto justify-center xl:justify-end border-t xl:border-t-0 border-white/5 pt-4 xl:pt-0">
                            <div className="flex flex-col items-center justify-center p-2.5 bg-white/5 border border-white/10 rounded-xl min-w-[90px] shadow-lg">
                                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Mean</div>
                                <div className="text-xl font-black text-white">{distribution.stats.mean.toFixed(2)}</div>
                            </div>
                            <div className="flex flex-col items-center justify-center p-2.5 bg-white/5 border border-white/10 rounded-xl min-w-[90px] shadow-lg">
                                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Median</div>
                                <div className="text-xl font-black text-white">{distribution.stats.median}</div>
                            </div>
                            <div className="flex flex-col items-center justify-center p-2.5 bg-white/5 border border-white/10 rounded-xl min-w-[90px] shadow-lg">
                                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Samples</div>
                                <div className="text-xl font-black text-white">{distribution.stats.totalSamples}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden p-6 flex flex-col">
                    {distribution && (
                        <div className="flex flex-col h-full gap-6">
                            {/* Chart */}
                            <div className="flex-1 w-full flex items-end gap-2 pb-8 px-4 border-b border-white/5 relative min-h-[200px]">
                                {distribution.chartData.map((d) => {
                                    const heightPercent = (d.count / distribution.maxCount) * 100;
                                    return (
                                        <div key={d.value} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                            {/* Bar */}
                                            <div
                                                className="w-full bg-emerald-500 hover:bg-emerald-400 border-t border-x border-emerald-400/50 rounded-t-sm transition-all relative group-hover:shadow-[0_0_20px_rgba(16,185,129,0.6)]"
                                                style={{ height: `${heightPercent}%` }}
                                            >
                                                {/* Tooltip */}
                                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-900 border border-white/10 text-white text-xs font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                                                    {d.count} matches ({d.percentage.toFixed(1)}%)
                                                </div>
                                            </div>
                                            {/* Label */}
                                            <div className="absolute -bottom-6 text-xs font-bold text-zinc-500">{d.value}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="text-center text-xs text-zinc-500 font-mono shrink-0">
                                Distribution of {selectedStat.toUpperCase()} per match ({viewMode})
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StatisticDistribution;

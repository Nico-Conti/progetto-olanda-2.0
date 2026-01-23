import React, { useState, useMemo, useEffect } from 'react';
import { processData, calculatePrediction, VOLATILE_STATS } from '../utils/stats';
import { ChevronDown, Play, AlertCircle, CheckCircle, TrendingUp, X } from 'lucide-react';

const AccuracyReport = ({ matches, selectedStatistic, teamLogos, onClose }) => {
    const [nGames, setNGames] = useState(5);
    const [forceMean, setForceMean] = useState(false);
    const [useGeneralStats, setUseGeneralStats] = useState(false);
    const [results, setResults] = useState([]);
    const [isCalculating, setIsCalculating] = useState(false);
    const [summary, setSummary] = useState(null);
    const [maxCap, setMaxCap] = useState('');
    const [softBuffer, setSoftBuffer] = useState('');
    const [minPred, setMinPred] = useState('');

    // Sort matches by date ascending (or giornata if date missing)
    const sortedMatches = useMemo(() => {
        return [...matches].filter(m => {
            // Filter only played matches with valid stats
            return m.stats && m.stats[selectedStatistic];
        }).sort((a, b) => {
            // Try date first
            if (a.date && b.date) {
                return new Date(a.date) - new Date(b.date);
            }
            // Fallback to giornata (extract number)
            const getG = (s) => parseInt(String(s).replace(/\D/g, '')) || 0;
            return getG(a.giornata) - getG(b.giornata);
        });
    }, [matches, selectedStatistic]);

    const runBacktest = () => {
        setIsCalculating(true);

        // Use setTimeout to allow UI to update to "Calculating..." state
        setTimeout(() => {
            const tempResults = [];
            let count = 0;
            let totalDiff = 0;

            let underCount = 0; // Wins for Model
            let overCount = 0; // Losses for Model
            let noBetCount = 0;
            let underSum = 0;
            let overSum = 0;

            let benchmarkWins = 0;

            for (let i = 0; i < sortedMatches.length; i++) {
                const targetMatch = sortedMatches[i];

                // Get history strictly BEFORE this match
                const pastMatches = sortedMatches.slice(0, i);

                const stats = processData(pastMatches, selectedStatistic);

                const homeTeam = targetMatch.home || targetMatch.squadre?.home;
                const awayTeam = targetMatch.away || targetMatch.squadre?.away;

                // --- Benchmark Calculation (Rolling Mean/Median) ---
                const pastTotals = [];
                pastMatches.forEach(pm => {
                    const s = pm.stats?.[selectedStatistic];
                    if (s) pastTotals.push(Number(s.home) + Number(s.away));
                });

                let benchmarkVal = 0;
                if (pastTotals.length > 0) {
                    if (forceMean) {
                        benchmarkVal = pastTotals.reduce((a, b) => a + b, 0) / pastTotals.length;
                    } else {
                        pastTotals.sort((a, b) => a - b);
                        const mid = Math.floor(pastTotals.length / 2);
                        benchmarkVal = pastTotals.length % 2 !== 0
                            ? pastTotals[mid]
                            : (pastTotals[mid - 1] + pastTotals[mid]) / 2;
                    }
                }

                const prediction = calculatePrediction(
                    homeTeam,
                    awayTeam,
                    stats,
                    nGames,
                    false, // useAdjustedMode
                    useGeneralStats, // useGeneralStats
                    selectedStatistic,
                    forceMean ? 'mean' : null
                );

                if (prediction && prediction.total > 0) {
                    const actualHome = Number(targetMatch.stats[selectedStatistic].home);
                    const actualAway = Number(targetMatch.stats[selectedStatistic].away);
                    const actualTotal = actualHome + actualAway;

                    const diff = actualTotal - prediction.total;
                    const absDiff = Math.abs(diff);

                    // --- Model Betting Logic ---
                    let adjustedTotal = prediction.total;
                    if (softBuffer !== '' && !isNaN(parseFloat(softBuffer))) {
                        adjustedTotal -= parseFloat(softBuffer);
                    }
                    let impliedLine = Math.round(adjustedTotal) - 0.5;

                    let isCapped = false;
                    if (maxCap !== '' && !isNaN(parseFloat(maxCap))) {
                        const cap = parseFloat(maxCap);
                        if (impliedLine > cap) {
                            impliedLine = cap;
                            isCapped = true;
                        }
                    }
                    const isWin = actualTotal > impliedLine;

                    // Check Min Prediction Threshold
                    let isNoBet = false;
                    if (minPred !== '' && !isNaN(parseFloat(minPred))) {
                        if (prediction.total < parseFloat(minPred)) {
                            isNoBet = true;
                        }
                    }

                    if (!isNoBet) {
                        if (isWin) {
                            underCount++;
                            underSum += diff;
                        } else {
                            overCount++;
                            overSum += Math.abs(diff);
                        }
                    } else {
                        noBetCount++;
                    }

                    // --- Benchmark Betting Logic ---
                    let benchAdjusted = benchmarkVal;
                    if (softBuffer !== '' && !isNaN(parseFloat(softBuffer))) {
                        benchAdjusted -= parseFloat(softBuffer);
                    }
                    let benchLine = Math.round(benchAdjusted) - 0.5;
                    if (maxCap !== '' && !isNaN(parseFloat(maxCap))) {
                        const cap = parseFloat(maxCap);
                        if (benchLine > cap) {
                            benchLine = cap;
                        }
                    }

                    // Only count benchmark wins if the MODEL also bet (fair comparison)
                    if (!isNoBet) {
                        const benchWin = actualTotal > benchLine;
                        if (benchWin) benchmarkWins++;
                    }

                    tempResults.push({
                        match: targetMatch,
                        home: homeTeam,
                        away: awayTeam,
                        prediction: prediction,
                        actual: { home: actualHome, away: actualAway, total: actualTotal },
                        diff: diff,
                        absDiff: absDiff,
                        isWin: isWin,
                        isNoBet: isNoBet,
                        impliedLine: impliedLine,
                        isCapped: isCapped
                    });

                    if (!isNoBet) {
                        totalDiff += absDiff;
                        count++;
                    }
                }
            }

            // Calculate Summary
            const avgError = count > 0 ? (totalDiff / count) : 0;
            const winDiff = underCount - benchmarkWins;
            const winMargin = underCount > 0 ? (underSum / underCount) : 0;
            const lossMargin = overCount > 0 ? (overSum / overCount) : 0;

            setResults(tempResults.reverse()); // Show newest first
            setSummary({
                totalAnalyzed: count,
                avgError: avgError,
                modelWins: underCount,
                benchmarkWins: benchmarkWins,
                winDiff: winDiff,
                noBetCount: noBetCount,
                wins: { count: underCount, margin: winMargin },
                losses: { count: overCount, margin: lossMargin }
            });
            setIsCalculating(false);
        }, 100);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-white/10 shadow-2xl bg-zinc-950">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-emerald-400" />
                            Accuracy Analysis
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">
                            Backtest betting lines against past results for <span className="text-emerald-400 font-bold uppercase">{selectedStatistic}</span>.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ChevronDown className="w-6 h-6 text-zinc-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="flex flex-col border-b border-white/5 bg-zinc-900/50">
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Sample Size */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sample Size</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                {[3, 5, 10].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setNGames(n)}
                                        className={`flex-1 text-[10px] font-bold uppercase rounded transition-all ${nGames === n ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        Last {n}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Aggregator */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Aggregator</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                <button
                                    onClick={() => setForceMean(false)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition-all ${!forceMean ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Median
                                </button>
                                <button
                                    onClick={() => setForceMean(true)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition-all ${forceMean ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Mean
                                </button>
                            </div>
                        </div>

                        {/* Trend Mode */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Trend Mode</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                <button
                                    onClick={() => setUseGeneralStats(false)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition-all ${!useGeneralStats ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Specific
                                </button>
                                <button
                                    onClick={() => setUseGeneralStats(true)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition-all ${useGeneralStats ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    General
                                </button>
                            </div>
                        </div>

                        {/* Soft Buffer */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Soft Buffer (-)</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9 items-center relative">
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="0"
                                    value={softBuffer}
                                    onChange={(e) => setSoftBuffer(e.target.value)}
                                    className="w-full bg-transparent text-white text-xs font-bold px-3 py-1 focus:outline-none placeholder:text-zinc-600"
                                />
                                {softBuffer && (
                                    <button
                                        onClick={() => setSoftBuffer('')}
                                        className="absolute right-2 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Min Prediction */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Min Prediction</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9 items-center relative">
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="None"
                                    value={minPred}
                                    onChange={(e) => setMinPred(e.target.value)}
                                    className="w-full bg-transparent text-white text-xs font-bold px-3 py-1 focus:outline-none placeholder:text-zinc-600"
                                />
                                {minPred && (
                                    <button
                                        onClick={() => setMinPred('')}
                                        className="absolute right-2 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Max Line Cap */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Max Line Cap</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9 items-center relative">
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="No Cap"
                                    value={maxCap}
                                    onChange={(e) => setMaxCap(e.target.value)}
                                    className="w-full bg-transparent text-white text-xs font-bold px-3 py-1 focus:outline-none placeholder:text-zinc-600"
                                />
                                {maxCap && (
                                    <button
                                        onClick={() => setMaxCap('')}
                                        className="absolute right-2 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-6 pb-6 pt-0">
                        <button
                            onClick={runBacktest}
                            disabled={isCalculating}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase tracking-widest text-sm rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                        >
                            {isCalculating ? (
                                <span className="animate-pulse">Computing Matches...</span>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 fill-current" /> Run Backtest Analysis
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {summary && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                            <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Active Bets</div>
                                <div className="text-2xl font-black text-white">{summary.totalAnalyzed}</div>
                            </div>
                            <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Avg Abs Error</div>
                                <div className="text-2xl font-black text-white">{summary.avgError.toFixed(2)}</div>
                            </div>
                            <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50 relative overflow-hidden">
                                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Vs Benchmark</div>
                                <div className={`text-2xl font-black ${summary.winDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {summary.winDiff > 0 ? '+' : ''}{summary.winDiff} Bets
                                </div>
                                <div className="text-[9px] text-zinc-600 mt-0.5">
                                    Base Wins: {summary.benchmarkWins} ({summary.totalAnalyzed > 0 ? ((summary.benchmarkWins / summary.totalAnalyzed) * 100).toFixed(0) : 0}%)
                                </div>
                                {/* Background Chart effect */}
                                <div className={`absolute -right-2 -bottom-2 w-16 h-16 opacity-10 ${summary.winDiff >= 0 ? 'bg-emerald-500' : 'bg-red-500'} blur-xl rounded-full`} />
                            </div>
                            <div className="glass-panel p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                                <div className="text-xs font-bold text-emerald-400 uppercase mb-1">Winning Bets</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white">{summary.wins.count}</span>
                                    <span className="text-xs font-medium text-emerald-400">
                                        ({summary.totalAnalyzed > 0 ? ((summary.wins.count / summary.totalAnalyzed) * 100).toFixed(0) : 0}%)
                                    </span>
                                </div>
                            </div>
                            <div className="glass-panel p-4 rounded-lg border border-red-500/20 bg-red-500/10">
                                <div className="text-xs font-bold text-red-400 uppercase mb-1">Losing Bets</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white">{summary.losses.count}</span>
                                    <span className="text-xs font-medium text-red-400">
                                        ({summary.totalAnalyzed > 0 ? ((summary.losses.count / summary.totalAnalyzed) * 100).toFixed(0) : 0}%)
                                    </span>
                                </div>
                            </div>
                            <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Skipped</div>
                                <div className="text-2xl font-black text-zinc-400">{summary.noBetCount}</div>
                            </div>
                        </div>
                    )}

                    {results.length > 0 ? (
                        <table className="w-full text-left text-zinc-300 table-fixed">
                            <thead className="text-xs text-zinc-500 uppercase border-b border-white/5 bg-zinc-950/50">
                                <tr>
                                    <th className="py-4 pl-4 w-[40%]">Match</th>
                                    <th className="py-4 text-center w-[15%]">Date</th>
                                    <th className="py-4 text-center w-[15%]">Bet Line (Ov)</th>
                                    <th className="py-4 text-center w-[15%]">Actual</th>
                                    <th className="py-4 text-center w-[15%]">Result</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {results.map((res, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="py-3 pl-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col items-end w-24">
                                                    <span className="font-bold truncate w-full text-right">{res.home}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <img src={teamLogos[res.home]} className="w-5 h-5 object-contain" />
                                                    <span className="text-zinc-600 text-xs font-bold">vs</span>
                                                    <img src={teamLogos[res.away]} className="w-5 h-5 object-contain" />
                                                </div>
                                                <div className="flex flex-col w-24">
                                                    <span className="font-bold truncate w-full">{res.away}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 text-center text-zinc-500 text-xs">
                                            {res.match.date
                                                ? new Date(res.match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                : (res.match.giornata || '-')}
                                        </td>
                                        <td className="py-3 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-mono font-bold ${res.isCapped ? 'text-yellow-400' : 'text-blue-400'}`}>
                                                    {res.impliedLine}
                                                    {res.isCapped && <span className="text-[10px] ml-1 align-top text-yellow-500/80" title="Capped by Max Line setting">CAP</span>}
                                                </span>
                                                <span className="text-[9px] text-zinc-600">Pred: {res.prediction.total.toFixed(1)}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 text-center font-mono font-bold text-white">
                                            {res.actual.total}
                                        </td>
                                        <td className={`py-3 text-center font-bold ${res.isNoBet ? 'text-zinc-600' : (res.isWin ? 'text-emerald-500' : 'text-red-500')}`}>
                                            {res.isNoBet ? 'NO BET' : (res.isWin ? 'WIN' : 'LOSS')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center text-zinc-500 py-20 flex flex-col items-center">
                            <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
                            <p>Click "Run Backtest" to analyze historical performance.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccuracyReport;

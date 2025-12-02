import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Calculator, ChevronDown, Plus, Minus, Trophy } from 'lucide-react';
import StatisticSelector from './StatisticSelector';
import { processData } from '../utils/stats';

const STAT_CONFIG = {
    corners: {
        total: { default: 9.5, step: 1, options: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5] }
    },
    goals: {
        total: { default: 2.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    shots: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 12.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5, 14.5] }
    },
    shots_on_target: {
        total: { default: 8.5, step: 1, options: [6.5, 7.5, 8.5, 9.5, 10.5, 11.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] }
    },
    fouls: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 11.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5] }
    },
    yellow_cards: {
        total: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    red_cards: {
        total: { default: 0.5, step: 0.5, options: [0.5] },
        individual: { default: 0.5, step: 0.5, options: [0.5] }
    },
    possession: {
        total: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] },
        individual: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] }
    },
};

const HighestWinningFactor = ({ onBack, isAnimationEnabled, matchData, teamLogos }) => {
    const [selectedStatistic, setSelectedStatistic] = useState('corners');
    const [analysisMode, setAnalysisMode] = useState('total'); // 'total' or 'individual'
    const [operator, setOperator] = useState('over');
    const [threshold, setThreshold] = useState(STAT_CONFIG['corners'].total.default);
    const [nGames, setNGames] = useState(5);
    const [displayLimit, setDisplayLimit] = useState(5);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [isHistorySelectorOpen, setIsHistorySelectorOpen] = useState(false);
    const [isTeamNumberSelectorOpen, setIsTeamNumberSelectorOpen] = useState(false);
    const [selectedLeague, setSelectedLeague] = useState('All');
    const [isLeagueSelectorOpen, setIsLeagueSelectorOpen] = useState(false);
    const selectorRef = useRef(null);
    const historySelectorRef = useRef(null);
    const teamNumberSelectorRef = useRef(null);
    const leagueSelectorRef = useRef(null);

    // Update threshold when statistic or mode changes
    useEffect(() => {
        const config = STAT_CONFIG[selectedStatistic] || { total: { default: 0.5 }, individual: { default: 0.5 } };
        setThreshold(config[analysisMode].default);
    }, [selectedStatistic, analysisMode]);

    // Close selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (selectorRef.current && !selectorRef.current.contains(event.target)) {
                setIsSelectorOpen(false);
            }
            if (historySelectorRef.current && !historySelectorRef.current.contains(event.target)) {
                setIsHistorySelectorOpen(false);
            }
            if (teamNumberSelectorRef.current && !teamNumberSelectorRef.current.contains(event.target)) {
                setIsTeamNumberSelectorOpen(false);
            }
            if (leagueSelectorRef.current && !leagueSelectorRef.current.contains(event.target)) {
                setIsLeagueSelectorOpen(false);
            }
        };

        if (isSelectorOpen || isHistorySelectorOpen || isTeamNumberSelectorOpen || isLeagueSelectorOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSelectorOpen, isHistorySelectorOpen, isTeamNumberSelectorOpen, isLeagueSelectorOpen]);

    // Helper to adjust threshold
    const adjustThreshold = (delta) => {
        setThreshold(prev => {
            const newVal = prev + delta;
            return Math.max(0, Math.round(newVal * 10) / 10); // Keep 1 decimal place
        });
    };

    const currentConfig = (STAT_CONFIG[selectedStatistic] || { total: { step: 0.5, options: [] }, individual: { step: 0.5, options: [] } })[analysisMode];

    const availableLeagues = useMemo(() => {
        if (!matchData) return [];
        const leagues = new Set(matchData.map(m => m.league).filter(Boolean));
        return ['All', ...Array.from(leagues).sort()];
    }, [matchData]);

    // Calculate Winning Factors
    const rankedTeams = useMemo(() => {
        if (!matchData || matchData.length === 0) return [];

        const filteredMatchData = selectedLeague === 'All'
            ? matchData
            : matchData.filter(m => m.league === selectedLeague);

        const processedStats = processData(filteredMatchData, selectedStatistic);
        const teams = Object.keys(processedStats);
        const results = [];

        teams.forEach(team => {
            const teamData = processedStats[team];
            const allMatches = [...teamData.all_matches].sort((a, b) => b.giornata - a.giornata);
            const recentMatches = nGames === 'all' ? allMatches : allMatches.slice(0, nGames);

            if (recentMatches.length === 0) return;

            let winCount = 0;
            recentMatches.forEach(match => {
                const value = analysisMode === 'total' ? match.total : match.statFor;
                if (operator === 'over' && value > threshold) {
                    winCount++;
                } else if (operator === 'under' && value < threshold) {
                    winCount++;
                }
            });

            const winRate = (winCount / recentMatches.length) * 100;

            results.push({
                team,
                winCount,
                totalGames: recentMatches.length,
                winRate,
                matches: recentMatches
            });
        });

        // Sort by Win Rate descending, then by Win Count descending
        return results.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.winCount - a.winCount;
        });
    }, [matchData, selectedStatistic, operator, threshold, nGames, selectedLeague, analysisMode]);

    // Calculate max games played by any team to set the limit for "Season"
    const maxGames = useMemo(() => {
        if (!matchData || matchData.length === 0) return 38;
        const counts = {};
        matchData.forEach(m => {
            counts[m.home_team] = (counts[m.home_team] || 0) + 1;
            counts[m.away_team] = (counts[m.away_team] || 0) + 1;
        });
        return Math.max(0, ...Object.values(counts));
    }, [matchData]);

    return (
        <div className="min-h-screen text-zinc-200 font-sans relative pb-12">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 mb-8 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span className="font-bold text-sm uppercase tracking-wide">Back</span>
                        </button>
                        <div className="h-6 w-px bg-white/10"></div>
                        <h1 className="text-lg font-black tracking-tight text-white leading-none">
                            Highest <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Winning Factor</span>
                        </h1>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 md:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Configuration Panel */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="glass-panel p-6 rounded-2xl border border-white/10 sticky top-24">
                            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
                                <Calculator className="w-5 h-5 text-purple-400" />
                                Configuration
                            </h2>

                            <div className="space-y-6">
                                {/* Section 1: Analysis Scope */}
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Analysis Scope</h3>

                                    {/* League Selection */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">League</label>
                                        <div className="relative">
                                            <button
                                                onClick={() => setIsLeagueSelectorOpen(!isLeagueSelectorOpen)}
                                                className="w-full h-10 flex items-center justify-between px-3 bg-zinc-950 rounded-lg border border-white/10 hover:border-purple-500/50 transition-colors group"
                                            >
                                                <span className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">
                                                    {selectedLeague}
                                                </span>
                                                <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-purple-400" />
                                            </button>

                                            {isLeagueSelectorOpen && (
                                                <div
                                                    ref={leagueSelectorRef}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200 max-h-60 overflow-y-auto"
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        {availableLeagues.map((league) => (
                                                            <button
                                                                key={league}
                                                                onClick={() => {
                                                                    setSelectedLeague(league);
                                                                    setIsLeagueSelectorOpen(false);
                                                                }}
                                                                className={`p-2 rounded-md font-bold text-xs text-left transition-all ${selectedLeague === league
                                                                    ? 'bg-purple-500 text-white shadow-lg'
                                                                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                                                    }`}
                                                            >
                                                                {league}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mode Selection */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Mode</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setAnalysisMode('total')}
                                                className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${analysisMode === 'total'
                                                    ? 'bg-blue-500 text-white shadow-lg'
                                                    : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                            >
                                                Match Total
                                            </button>
                                            <button
                                                onClick={() => setAnalysisMode('individual')}
                                                className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${analysisMode === 'individual'
                                                    ? 'bg-purple-500 text-white shadow-lg'
                                                    : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                            >
                                                Team Stats
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Winning Criteria */}
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Winning Criteria</h3>

                                    {/* Statistic Selection */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Statistic</label>
                                        <StatisticSelector
                                            value={selectedStatistic}
                                            onChange={(e) => setSelectedStatistic(e.target.value)}
                                            className="w-full"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        {/* Operator Selection */}
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Operator</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => setOperator('over')}
                                                    className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${operator === 'over'
                                                        ? 'bg-emerald-500 text-white shadow-lg'
                                                        : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                >
                                                    Over
                                                </button>
                                                <button
                                                    onClick={() => setOperator('under')}
                                                    className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${operator === 'under'
                                                        ? 'bg-red-500 text-white shadow-lg'
                                                        : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                >
                                                    Under
                                                </button>
                                            </div>
                                        </div>

                                        {/* Threshold Selection */}
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Threshold</label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => adjustThreshold(-currentConfig.step)}
                                                    className="p-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>

                                                <div className="relative flex-grow">
                                                    <button
                                                        onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                                                        className="w-full h-10 flex items-center justify-center bg-zinc-950 rounded-lg border border-white/10 hover:border-purple-500/50 transition-colors group"
                                                    >
                                                        <span className="text-xl font-black text-white font-mono group-hover:text-purple-400 transition-colors">
                                                            {threshold}
                                                        </span>
                                                        <ChevronDown className="absolute right-3 w-4 h-4 text-zinc-600 group-hover:text-purple-400" />
                                                    </button>

                                                    {isSelectorOpen && (
                                                        <div
                                                            ref={selectorRef}
                                                            className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200"
                                                        >
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {currentConfig.options.map((opt) => (
                                                                    <button
                                                                        key={opt}
                                                                        onClick={() => {
                                                                            setThreshold(opt);
                                                                            setIsSelectorOpen(false);
                                                                        }}
                                                                        className={`p-2 rounded-md font-bold text-xs transition-all ${threshold === opt
                                                                            ? 'bg-purple-500 text-white shadow-lg'
                                                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                                                            }`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => adjustThreshold(currentConfig.step)}
                                                    className="p-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="lg:col-span-8">
                        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                                        <Trophy className="w-5 h-5 text-yellow-500" />
                                        Top
                                    </h2>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setDisplayLimit(prev => Math.max(1, prev - 1));
                                            }}
                                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                        >
                                            <Minus className="w-3 h-3" />
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={() => setIsTeamNumberSelectorOpen(!isTeamNumberSelectorOpen)}
                                                className="h-8 px-3 flex items-center justify-center gap-2 bg-zinc-950 rounded-md border border-white/10 hover:border-purple-500/50 transition-colors group min-w-[60px]"
                                            >
                                                <span className="text-sm font-bold text-white font-mono group-hover:text-purple-400 transition-colors">
                                                    {displayLimit}
                                                </span>
                                                <ChevronDown className="w-3 h-3 text-zinc-600 group-hover:text-purple-400" />
                                            </button>

                                            {isTeamNumberSelectorOpen && (
                                                <div
                                                    ref={teamNumberSelectorRef}
                                                    className="absolute top-full left-0 mt-2 w-40 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200"
                                                >
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[5, 10, 15, 20].map((n) => (
                                                            <button
                                                                key={n}
                                                                onClick={() => {
                                                                    setDisplayLimit(n);
                                                                    setIsTeamNumberSelectorOpen(false);
                                                                }}
                                                                className={`p-2 rounded-md font-bold text-xs transition-all ${displayLimit === n
                                                                    ? 'bg-purple-500 text-white shadow-lg'
                                                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                                                    }`}
                                                            >
                                                                {n}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => {
                                                setDisplayLimit(prev => Math.min(20, prev + 1));
                                            }}
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

                                        <div className="relative">
                                            <button
                                                onClick={() => setIsHistorySelectorOpen(!isHistorySelectorOpen)}
                                                className="h-8 px-3 flex items-center justify-center gap-2 bg-zinc-950 rounded-md border border-white/10 hover:border-purple-500/50 transition-colors group min-w-[80px]"
                                            >
                                                <span className="text-sm font-bold text-white font-mono group-hover:text-purple-400 transition-colors">
                                                    {nGames === 'all' ? 'Season' : nGames}
                                                </span>
                                                <ChevronDown className="w-3 h-3 text-zinc-600 group-hover:text-purple-400" />
                                            </button>

                                            {isHistorySelectorOpen && (
                                                <div
                                                    ref={historySelectorRef}
                                                    className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200"
                                                >
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[3, 5, 10, 'all'].map((n) => (
                                                            <button
                                                                key={n}
                                                                onClick={() => {
                                                                    setNGames(n);
                                                                    setIsHistorySelectorOpen(false);
                                                                }}
                                                                className={`p-2 rounded-md font-bold text-xs transition-all ${nGames === n
                                                                    ? 'bg-purple-500 text-white shadow-lg'
                                                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                                                    }`}
                                                            >
                                                                {n === 'all' ? 'Season' : n}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {rankedTeams.slice(0, displayLimit).map((team, index) => (
                                            <tr key={team.team} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4 text-center font-mono text-zinc-500 font-bold">
                                                    #{index + 1}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
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
                                            </tr>
                                        ))}

                                        {rankedTeams.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-12 text-center text-zinc-500">
                                                    No data available for the selected criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default HighestWinningFactor;

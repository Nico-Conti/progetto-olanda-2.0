import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Calculator, Calendar, Flame, Plus, Minus, ChevronDown } from 'lucide-react';
import { processData, calculatePrediction } from '../utils/stats';
import MatchRow from './predictor/MatchRow';
import AnalysisSection from './predictor/AnalysisSection';
import PredictionHero from './predictor/PredictionHero';
import StatsAnalysis from './predictor/StatsAnalysis';
import StatisticSelector from './StatisticSelector';
import BetBuilderCell from './BetBuilderCell';

const STAT_OPTIONS = [
    { value: 'main', label: 'Main' },
    { value: 'corners', label: 'Corners' },
    { value: 'goals', label: 'Goals' },
    { value: 'shots', label: 'Shots' },
    { value: 'shots_on_target', label: 'Shots on Target' },
    { value: 'fouls', label: 'Fouls' },
    { value: 'yellow_cards', label: 'Yellow Cards' },
    { value: 'red_cards', label: 'Red Cards' },
    { value: 'possession', label: 'Possession' },
];

const Predictor = ({ stats: globalStats, fixtures, matches, teams, teamLogos, selectedStatistic, matchData, matchStatistics, setMatchStatistics, addToBet, removeFromBet, bets, preSelectedMatch, onExitPreview, backButtonLabel }) => {
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [nGames, setNGames] = useState(5);
    const [selectedMatchday, setSelectedMatchday] = useState(null);
    const [selectedAnalysisMatch, setSelectedAnalysisMatch] = useState(null);
    const [useAdjustedMode, setUseAdjustedMode] = useState(false);
    const [useGeneralStats, setUseGeneralStats] = useState(false);

    // Sync preSelectedMatch
    useEffect(() => {
        if (preSelectedMatch) {
            setSelectedMatch(preSelectedMatch);
            // Do not auto-select analysis match. Let user click on specific matches to see details.
            setSelectedAnalysisMatch(null);
        }
    }, [preSelectedMatch]);

    // Memoize all stats
    const allProcessedStats = useMemo(() => {
        const stats = {};
        STAT_OPTIONS.forEach(opt => {
            const statKey = opt.value === 'main' ? 'goals' : opt.value;
            stats[opt.value] = processData(matchData, statKey);
        });
        return stats;
    }, [matchData]);

    // League Averages for Hot Match condition
    const leagueAverages = useMemo(() => {
        const averages = {};
        STAT_OPTIONS.forEach(opt => {
            const statistic = opt.value;
            let totalVal = 0;
            let count = 0;
            matchData.forEach(m => {
                const statObj = m.stats?.[statistic];
                if (statObj) {
                    totalVal += Number(statObj.home) + Number(statObj.away);
                    count++;
                }
            });
            averages[statistic] = count > 0 ? totalVal / count : 0;
        });
        return averages;
    }, [matchData]);

    // Independent Statistic State
    const [localStatistic, setLocalStatistic] = useState(selectedStatistic);

    // Sync local statistic with global when global changes, but only if not in a specific view that overrides it?
    // Or just set initial state. The user asked for "independently", so maybe we shouldn't auto-sync if they changed it locally.
    // But if they change the global one, they probably expect the default to update.
    // Let's sync it when selectedStatistic changes.
    useEffect(() => {
        setLocalStatistic(selectedStatistic);
    }, [selectedStatistic]);

    // Recalculate stats based on localStatistic
    const localStats = useMemo(() => {
        if (localStatistic === selectedStatistic) return globalStats;
        return processData(matchData, localStatistic);
    }, [matchData, localStatistic, selectedStatistic, globalStats]);

    // Custom Matchup State
    const [customHome, setCustomHome] = useState('');
    const [customAway, setCustomAway] = useState('');
    const [showCustomPrediction, setShowCustomPrediction] = useState(false);

    // Initialize custom teams
    useEffect(() => {
        if (teams.length > 0 && !customHome) {
            setCustomHome(teams[0]);
            setCustomAway(teams[1]);
        }
    }, [teams, customHome]);

    const customPrediction = useMemo(() => {
        if (!customHome || !customAway || !showCustomPrediction) return null;
        return calculatePrediction(customHome, customAway, localStats, nGames, useAdjustedMode, useGeneralStats);
    }, [customHome, customAway, localStats, nGames, showCustomPrediction, useAdjustedMode, useGeneralStats]);

    const upcomingMatches = useMemo(() => {
        if (!fixtures || !globalStats) return [];

        // Filter fixtures that haven't been played yet
        // A match is considered played if the home team has a recorded match against the away team at home
        const unplayed = fixtures.filter(f => {
            if (!globalStats[f.home]) return true; // If we don't have stats for home team, assume unplayed or invalid
            const played = globalStats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
            return !played;
        });

        // Calculate predictions for all unplayed matches
        const predictions = unplayed.map(match => {
            const matchId = `${match.home}-${match.away}`;
            const stat = matchStatistics[matchId] || selectedStatistic;
            const statsToUse = allProcessedStats[stat] || globalStats;

            const pred = calculatePrediction(match.home, match.away, statsToUse, nGames, useAdjustedMode, useGeneralStats);
            return { ...match, prediction: pred, selectedStat: stat };
        }).filter(m => m.prediction !== null); // Filter out matches where we couldn't calc prediction (e.g. missing team stats)

        return predictions.sort((a, b) => a.matchday - b.matchday);
    }, [fixtures, globalStats, nGames, matchStatistics, selectedStatistic, allProcessedStats, useAdjustedMode, useGeneralStats]);

    // Get available matchdays from upcoming matches
    const availableMatchdays = useMemo(() => {
        const days = [...new Set(upcomingMatches.map(m => m.matchday))];
        return days.sort((a, b) => a - b);
    }, [upcomingMatches]);

    // Set default selected matchday
    useEffect(() => {
        if (availableMatchdays.length > 0 && selectedMatchday === null) {
            setSelectedMatchday(availableMatchdays[0]);
        }
    }, [availableMatchdays, selectedMatchday]);

    // Filter matches by selected matchday
    const displayedMatches = useMemo(() => {
        if (!selectedMatchday) return [];
        return upcomingMatches.filter(m => m.matchday === selectedMatchday);
    }, [upcomingMatches, selectedMatchday]);

    if (selectedMatch) {
        const { home, away, prediction } = selectedMatch;
        // Recalculate prediction for selected match to ensure it uses the current nGames if changed in detail view
        // Use LOCAL stats here
        const detailPred = calculatePrediction(home, away, localStats, nGames, useAdjustedMode, useGeneralStats);

        if (!detailPred) return <div>Error loading match details</div>;

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => {
                        if (preSelectedMatch && onExitPreview) {
                            onExitPreview();
                        } else {
                            setSelectedMatch(null);
                        }
                        setSelectedAnalysisMatch(null);
                    }}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-2"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    <span className="font-bold text-sm uppercase tracking-wide">
                        {preSelectedMatch ? (backButtonLabel || 'Back to Previous') : 'Back to Fixtures'}
                    </span>
                </button>

                {/* Configuration (Sample Size Only) */}
                {/* Configuration (Sample Size Only) */}
                <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2 self-start md:self-auto">
                        <Calculator className="w-5 h-5 text-emerald-400" />
                        Match Analysis
                    </h3>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        {/* Local Statistic Selector */}
                        <div className="w-full sm:w-auto">
                            <StatisticSelector
                                value={localStatistic}
                                onChange={(e) => setLocalStatistic(e.target.value)}
                                className="w-full sm:w-[140px]"
                            />
                        </div>

                        <div className="hidden sm:block w-px h-4 bg-white/10"></div>

                        {/* Adjusted Mode Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-400 uppercase whitespace-nowrap">Adjusted:</span>
                            <button
                                onClick={() => setUseAdjustedMode(!useAdjustedMode)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${useAdjustedMode ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                            >
                                <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${useAdjustedMode ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div className="hidden sm:block w-px h-4 bg-white/10"></div>

                        {/* General Trend Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-400 uppercase whitespace-nowrap">Gen. Trend:</span>
                            <button
                                onClick={() => setUseGeneralStats(!useGeneralStats)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${useGeneralStats ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                            >
                                <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${useGeneralStats ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div className="hidden sm:block w-px h-4 bg-white/10"></div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                            <span className="text-xs font-bold text-zinc-400 uppercase whitespace-nowrap mb-1 sm:mb-0">Sample Size:</span>
                            <div className="flex flex-wrap bg-zinc-900/50 p-1 rounded-lg border border-white/5 items-center gap-1 w-full sm:w-auto">
                                {[3, 5, 'all'].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setNGames(n)}
                                        className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all text-center whitespace-nowrap ${nGames === n
                                            ? 'bg-zinc-700 text-white shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                            } hidden sm:block`}
                                    >
                                        {n === 'all' ? 'Season' : `Last ${n}`}
                                    </button>
                                ))}
                                <div className="hidden sm:block w-px h-4 bg-white/10 mx-1"></div>
                                <div className={`flex items-center justify-between flex-1 sm:flex-none p-0.5 rounded-lg border transition-all ${!['all', 3, 5].includes(nGames)
                                    ? 'bg-zinc-800 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                    : 'bg-zinc-900/50 border-white/5 hover:border-white/10'
                                    }`}>
                                    <button
                                        onClick={() => setNGames(prev => { const val = (prev === 'all' || !prev) ? 5 : parseInt(prev); return Math.max(1, val - 1); })}
                                        className="p-1 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <Minus className="w-3 h-3" />
                                    </button>
                                    <input
                                        type="number"
                                        min="1"
                                        max="30"
                                        value={nGames === 'all' ? '' : nGames}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setNGames('');
                                            } else {
                                                const parsed = parseInt(val);
                                                if (!isNaN(parsed) && parsed > 0) setNGames(parsed);
                                            }
                                        }}
                                        placeholder="#"
                                        className="w-8 bg-transparent border-none p-0 text-center focus:ring-0 text-white font-bold text-xs appearance-none"
                                    />
                                    <button
                                        onClick={() => setNGames(prev => { const val = (prev === 'all' || !prev) ? 5 : parseInt(prev); return Math.min(30, val + 1); })}
                                        className="p-1 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Prediction Hero */}
                <PredictionHero prediction={detailPred} home={home} away={away} teamLogos={teamLogos} selectedStatistic={localStatistic} />

                {/* Stats Analysis Breakdown */}
                <StatsAnalysis prediction={detailPred} home={home} away={away} nGames={nGames} teamLogos={teamLogos} selectedStatistic={localStatistic} />

                {/* Detailed History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                <img src={teamLogos[home]} alt={home} className="w-6 h-6 object-contain" />
                                {home}
                            </h4>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            {detailPred.homeMatches.map(m => (
                                <MatchRow key={m.giornata} match={m} onShowAnalysis={setSelectedAnalysisMatch} teamLogos={teamLogos} selectedStatistic={localStatistic} />
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                <img src={teamLogos[away]} alt={away} className="w-6 h-6 object-contain" />
                                {away}
                            </h4>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            {detailPred.awayMatches.map(m => (
                                <MatchRow key={m.giornata} match={m} onShowAnalysis={setSelectedAnalysisMatch} teamLogos={teamLogos} selectedStatistic={localStatistic} />
                            ))}
                        </div>
                    </div>
                </div>
                <AnalysisSection match={selectedAnalysisMatch} onClose={() => setSelectedAnalysisMatch(null)} teamLogos={teamLogos} />
            </div>
        );
    }

    // Master Table View
    return (
        <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-emerald-400" />
                        Upcoming Fixtures & Predictions
                    </h2>
                    <p className="text-zinc-400 text-sm mt-1">Predictions based on {nGames === 'all' ? 'Season' : `Last ${nGames || 5}`} games form</p>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-end gap-y-4 gap-x-6">
                    {/* Matchday Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Matchday:</span>
                        <div className="relative">
                            <select
                                value={selectedMatchday || ''}
                                onChange={(e) => setSelectedMatchday(parseInt(e.target.value))}
                                className="bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-1.5 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-bold"
                            >
                                {availableMatchdays.map(day => (
                                    <option key={day} value={day}>MD {day}</option>
                                ))}
                            </select>
                            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 rotate-90 pointer-events-none" />
                        </div>
                    </div>

                    <div className="w-px h-8 bg-white/10 hidden md:block"></div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-400 uppercase hidden md:inline">Adj. Mode:</span>
                        <button
                            onClick={() => setUseAdjustedMode(!useAdjustedMode)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${useAdjustedMode ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${useAdjustedMode ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    <div className="w-px h-8 bg-white/10 hidden md:block"></div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-400 uppercase hidden md:inline">Gen. Trend:</span>
                        <button
                            onClick={() => setUseGeneralStats(!useGeneralStats)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${useGeneralStats ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${useGeneralStats ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    <div className="w-px h-8 bg-white/10 hidden md:block"></div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Sample:</span>
                        <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5 items-center gap-1">
                            {[3, 5, 'all'].map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setNGames(n)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                                        ? 'bg-zinc-700 text-white shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                        } hidden sm:block`}
                                >
                                    {n === 'all' ? 'Season' : `Last ${n}`}
                                </button>
                            ))}
                            <div className="hidden sm:block w-px h-4 bg-white/10 mx-1"></div>
                            <div className={`flex items-center p-0.5 rounded-lg border transition-all ${!['all', 3, 5].includes(nGames)
                                ? 'bg-zinc-800 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                : 'bg-zinc-900/50 border-white/5 hover:border-white/10'
                                }`}>
                                <button
                                    onClick={() => setNGames(prev => { const val = (prev === 'all' || !prev) ? 5 : parseInt(prev); return Math.max(1, val - 1); })}
                                    className="p-1 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={nGames === 'all' ? '' : nGames}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            setNGames('');
                                        } else {
                                            const parsed = parseInt(val);
                                            if (!isNaN(parsed) && parsed > 0) setNGames(parsed);
                                        }
                                    }}
                                    placeholder="#"
                                    className="w-8 bg-transparent border-none p-0 text-center focus:ring-0 text-white font-bold text-xs appearance-none"
                                />
                                <button
                                    onClick={() => setNGames(prev => { const val = (prev === 'all' || !prev) ? 5 : parseInt(prev); return Math.min(30, val + 1); })}
                                    className="p-1 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
                {/* Mobile View (Cards) */}
                <div className="md:hidden space-y-4">
                    {displayedMatches.length > 0 ? displayedMatches.map((match, idx) => (
                        <div
                            key={idx}
                            style={{ animationDelay: `${idx * 50}ms` }}
                            onClick={(e) => {
                                if (e.target.closest('select') || e.target.closest('button')) return;
                                setSelectedMatch(match);
                                setSelectedAnalysisMatch(null);
                            }}
                            className="glass-panel p-4 rounded-xl border border-white/10 relative overflow-hidden animate-waterfall active:scale-95 transition-transform"
                        >
                            {/* Date Badge */}
                            <div className="absolute top-0 right-0 bg-zinc-900/80 px-2 py-1 rounded-bl-lg border-l border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                {(() => {
                                    if (!match.date) return 'TBD';
                                    const d = new Date(match.date);
                                    return !isNaN(d.getTime())
                                        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                        : match.date;
                                })()}
                            </div>

                            {/* Hot Match Indicator */}
                            {match.selectedStat !== 'possession' && match.prediction.total > (leagueAverages[match.selectedStat] * 1.15) && (
                                <div className="absolute top-0 left-0 bg-red-500/20 text-red-500 p-1.5 rounded-br-lg animate-pulse border-r border-b border-red-500/20 z-10">
                                    <Flame className="w-3.5 h-3.5 fill-current" />
                                </div>
                            )}

                            {/* Teams */}
                            <div className="flex items-center justify-between mt-2 mb-4">
                                <div className="flex flex-col items-center w-1/3 text-center">
                                    <img src={teamLogos[match.home]} alt={match.home} className="w-10 h-10 object-contain mb-1" />
                                    <span className={`text-xs font-bold leading-tight ${match.prediction.expHome > match.prediction.expAway ? 'text-white' : 'text-zinc-400'}`}>{match.home}</span>
                                </div>

                                <div className="flex flex-col items-center justify-center w-1/3">
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Total</span>
                                    <div className="text-2xl font-black text-white tracking-tighter bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                                        {match.prediction.total.toFixed(1)}
                                    </div>
                                </div>

                                <div className="flex flex-col items-center w-1/3 text-center">
                                    <img src={teamLogos[match.away]} alt={match.away} className="w-10 h-10 object-contain mb-1" />
                                    <span className={`text-xs font-bold leading-tight ${match.prediction.expAway > match.prediction.expHome ? 'text-white' : 'text-zinc-400'}`}>{match.away}</span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2 text-center">
                                    <div className="text-[10px] text-emerald-500/70 font-bold uppercase">Home Exp</div>
                                    <div className="text-lg font-mono font-bold text-emerald-400">{match.prediction.expHome.toFixed(2)}</div>
                                </div>
                                <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-2 text-center">
                                    <div className="text-[10px] text-blue-500/70 font-bold uppercase">Away Exp</div>
                                    <div className="text-lg font-mono font-bold text-blue-400">{match.prediction.expAway.toFixed(2)}</div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
                                <div className="relative flex-grow">
                                    <select
                                        value={match.selectedStat}
                                        onChange={(e) => {
                                            const matchId = `${match.home}-${match.away}`;
                                            setMatchStatistics(prev => ({ ...prev, [matchId]: e.target.value }));
                                        }}
                                        className="w-full bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded-lg pl-2 pr-8 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {STAT_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                                </div>

                                <div onClick={(e) => e.stopPropagation()}>
                                    <BetBuilderCell
                                        game={`${match.home} vs ${match.away}`}
                                        home={match.home}
                                        away={match.away}
                                        teamLogos={teamLogos}
                                        stat={match.selectedStat}
                                        prediction={match.prediction}
                                        onAdd={addToBet}
                                        onRemove={removeFromBet}
                                        bets={bets}
                                        existingBet={bets?.find(b => b.game === `${match.home} vs ${match.away}` && b.stat === match.selectedStat)}
                                    />
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="glass-panel p-8 text-center text-zinc-500 rounded-xl border border-white/10 border-dashed">
                            No upcoming fixtures found for this matchday.
                        </div>
                    )}
                </div>

                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-zinc-300">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
                            <tr>
                                <th className="pl-5 pr-2 py-3 font-bold tracking-wider text-center w-[80px]">Date</th>
                                <th className="pl-2 pr-5 py-3 font-bold tracking-wider text-center">Matchup</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-500">Home Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-500">Away Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-white/5 text-white">Total Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider">Stat</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider">Bet Builder</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {displayedMatches.length > 0 ? displayedMatches.map((match, idx) => (
                                <tr
                                    key={idx}
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                    onClick={(e) => {
                                        // Prevent navigation if clicking on the dropdown
                                        if (e.target.closest('select')) return;
                                        setSelectedMatch(match);
                                        setSelectedAnalysisMatch(null);
                                    }}
                                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group animate-waterfall"
                                >
                                    <td className="pl-5 pr-0 py-4 whitespace-nowrap font-medium text-zinc-400 text-center w-[80px]">
                                        {(() => {
                                            if (!match.date) return 'TBD';
                                            const d = new Date(match.date);
                                            return !isNaN(d.getTime())
                                                ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                : match.date;
                                        })()}
                                    </td>
                                    <td className="pl-0 pr-5 py-4 relative text-center">
                                        <div className="flex items-center gap-3 justify-center">
                                            <div className="flex items-center gap-2 w-[150px] justify-end">
                                                <span
                                                    className={`font-bold whitespace-nowrap truncate ${match.prediction.expHome > match.prediction.expAway ? 'text-white' : 'text-zinc-400'}`}
                                                    title={match.home}
                                                >
                                                    {match.home}
                                                </span>
                                                <img src={teamLogos[match.home]} alt={match.home} className="w-6 h-6 flex-shrink-0 object-contain" />
                                            </div>
                                            <div className="flex flex-col items-center flex-shrink-0">
                                                <span className="text-zinc-600 font-bold text-xs">VS</span>
                                            </div>
                                            <div className="flex items-center gap-2 w-[150px]">
                                                <img src={teamLogos[match.away]} alt={match.away} className="w-6 h-6 flex-shrink-0 object-contain" />
                                                <span
                                                    className={`font-bold whitespace-nowrap truncate ${match.prediction.expAway > match.prediction.expHome ? 'text-white' : 'text-zinc-400'}`}
                                                    title={match.away}
                                                >
                                                    {match.away}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Hot Indicator */}
                                        {match.selectedStat !== 'possession' && match.prediction.total > (leagueAverages[match.selectedStat] * 1.15) && (
                                            <div className="absolute top-1 right-2 w-6 h-6 flex items-center justify-center bg-red-500/10 text-red-500 rounded-full animate-pulse border border-red-500/20" title="Hot Match (15% Above Avg)">
                                                <Flame className="w-3.5 h-3.5 fill-current" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-4 text-center font-mono font-bold text-emerald-400 bg-emerald-500/5">{match.prediction.expHome.toFixed(2)}</td>
                                    <td className="px-3 py-4 text-center font-mono font-bold text-blue-400 bg-blue-500/5">{match.prediction.expAway.toFixed(2)}</td>
                                    <td className="px-3 py-4 text-center font-black text-white bg-white/5 text-lg">{match.prediction.total.toFixed(1)}</td>
                                    <td className="px-3 py-4 text-center">
                                        <div className="relative inline-block">
                                            <select
                                                value={match.selectedStat}
                                                onChange={(e) => {
                                                    const matchId = `${match.home}-${match.away}`;
                                                    setMatchStatistics(prev => ({ ...prev, [matchId]: e.target.value }));
                                                }}
                                                className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded-md pl-2 pr-6 py-1 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold w-[100px] cursor-pointer hover:bg-zinc-800"
                                            >
                                                {STAT_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <BetBuilderCell
                                            game={`${match.home} vs ${match.away}`}
                                            home={match.home}
                                            away={match.away}
                                            teamLogos={teamLogos}
                                            stat={match.selectedStat}
                                            prediction={match.prediction}
                                            onAdd={addToBet}
                                            onRemove={removeFromBet}
                                            bets={bets}
                                            existingBet={bets?.find(b => b.game === `${match.home} vs ${match.away}` && b.stat === match.selectedStat)}
                                        />
                                    </td>

                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" className="px-5 py-8 text-center text-zinc-500">
                                        No upcoming fixtures found for this matchday.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Custom Matchup Selector */}
            < div className="glass-panel p-6 rounded-xl border border-white/10 mt-8" >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-emerald-400" />
                        Custom Matchup Analysis
                    </h3>
                    <button
                        onClick={() => setShowCustomPrediction(!showCustomPrediction)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${showCustomPrediction ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {showCustomPrediction ? 'Hide Analysis' : 'Analyze Matchup'}
                    </button>
                </div>

                {
                    showCustomPrediction && (
                        <div className="flex justify-end mb-4">
                            <StatisticSelector
                                value={localStatistic}
                                onChange={(e) => setLocalStatistic(e.target.value)}
                                className="w-[140px]"
                            />
                        </div>
                    )
                }

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Home Team</label>
                        <div className="relative">
                            <select
                                className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium"
                                value={customHome}
                                onChange={(e) => setCustomHome(e.target.value)}
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
                                value={customAway}
                                onChange={(e) => setCustomAway(e.target.value)}
                            >
                                {teams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {
                    showCustomPrediction && customPrediction && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            {/* Prediction Hero (Reused) */}
                            <PredictionHero prediction={customPrediction} home={customHome} away={customAway} teamLogos={teamLogos} selectedStatistic={localStatistic} />

                            {/* Detailed History (Reused) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                                        <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                            <img src={teamLogos[customHome]} alt={customHome} className="w-6 h-6 object-contain" />
                                            {customHome}
                                        </h4>
                                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
                                    </div>
                                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                        {customPrediction.homeMatches.map(m => (
                                            <MatchRow key={m.giornata} match={m} onShowAnalysis={setSelectedAnalysisMatch} teamLogos={teamLogos} selectedStatistic={localStatistic} />
                                        ))}
                                    </div>
                                </div>

                                <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                                        <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                            <img src={teamLogos[customAway]} alt={customAway} className="w-6 h-6 object-contain" />
                                            {customAway}
                                        </h4>
                                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
                                    </div>
                                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                        {customPrediction.awayMatches.map(m => (
                                            <MatchRow key={m.giornata} match={m} onShowAnalysis={setSelectedAnalysisMatch} teamLogos={teamLogos} selectedStatistic={localStatistic} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <AnalysisSection match={selectedAnalysisMatch} onClose={() => setSelectedAnalysisMatch(null)} teamLogos={teamLogos} />
                        </div>
                    )
                }
            </div >


            {/* Detailed Analysis Modal/Section */}

        </div >
    );
};

export default Predictor;

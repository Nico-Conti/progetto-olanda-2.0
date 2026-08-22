import React, { useState, useMemo, useCallback } from 'react';
import { Flame, Calendar, TrendingUp, ChevronRight, Zap, ZapOff, Sparkles, BrainCircuit, X, Play } from 'lucide-react';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import EngineToggle from './EngineToggle';
import { getStatLabel, STAT_CONFIG, resolveStatKey } from '../utils/statistics';
import { findBestStrategy, defaultLineFor, MIN_CALLS } from '../utils/backtest';
import { usePersistedPrefs, toggleLeagueSelection } from '../hooks/usePersistedPrefs';
import { useUpcomingFixtures } from '../hooks/useUpcomingFixtures';
import { useClickOutside } from '../hooks/useClickOutside';
import Dropdown from './ui/Dropdown';
import StatisticSelector from './StatisticSelector';
import SignalBadge from './SignalBadge';
import DerivedBadge from './DerivedBadge';
import Header from './Header';

const OptimizationSettingsModal = ({ isOpen, onClose, onRun, selectedStatistic }) => {
    const suggested = defaultLineFor(selectedStatistic);
    const [line, setLine] = useState('');

    if (!isOpen) return null;

    const options = STAT_CONFIG[resolveStatKey(selectedStatistic)]?.total?.options ?? [];
    const chosen = line === '' ? suggested : Number(line);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-md rounded-xl border border-white/10 shadow-2xl bg-zinc-950 p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-6">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <BrainCircuit className="w-6 h-6 text-emerald-400" />
                        Optimization Settings
                    </h2>
                    <p className="text-zinc-400 text-sm mt-1">
                        Finds, per league, the settings whose over/under calls beat simply always
                        betting the same side.
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">
                            Line for {getStatLabel(selectedStatistic)}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[...new Set([suggested, ...options])].filter(v => v != null).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setLine(String(v))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${chosen === v
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : 'bg-zinc-900 text-zinc-400 border-white/10 hover:text-white'}`}
                                >
                                    {v}{v === suggested ? ' (default)' : ''}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2">
                            Each match is called over or under this line. The confidence margin -
                            how far the prediction must sit from the line before a call is made -
                            is swept automatically, along with the sample size and averaging mode.
                        </p>
                    </div>

                    <div className="rounded-lg border border-white/5 bg-zinc-900/60 p-3">
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                            Strategies are ranked by how far they beat the base rate, over at least
                            {' '}{MIN_CALLS} calls. Some statistics have no edge at all - the result
                            will say so rather than showing a flattering percentage.
                        </p>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm rounded-lg transition-colors border border-white/5"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onRun({ line: chosen })}
                        className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm rounded-lg transition-colors shadow-[0_0_20px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Run Optimization
                    </button>
                </div>
            </div>
        </div>
    );
};

const STORAGE_KEY = 'olanda_hotmatches_prefs';
const DEFAULT_PREFS = {
    nGames: 5,
    displayCount: 9,
    selectedLeagues: ['All'],
    selectedDate: null,
    forceMean: false,
    useGeneralStats: false,
    isOptimizationActive: false,
    optimizedParams: {},
    currentBettingParams: {}
};

const HotMatches = ({ engine, onEngineChange, stats, fixtures, matchData, teamLogos, isAnimationEnabled, onToggleAnimation, selectedStatistic, onStatisticChange, onBack, onMatchClick }) => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, DEFAULT_PREFS);
    const {
        nGames, displayCount, selectedLeagues, selectedDate, forceMean, useGeneralStats,
        isOptimizationActive, optimizedParams,
    } = prefs;

    const setNGames = (v) => setPrefs({ nGames: v });
    const setDisplayCount = (v) => setPrefs({ displayCount: v });
    const setSelectedDate = (v) => setPrefs({ selectedDate: v });
    const setForceMean = (v) => setPrefs({ forceMean: v });
    const setUseGeneralStats = (v) => setPrefs({ useGeneralStats: v });

    const [activeDropdown, setActiveDropdown] = useState(null);

    // Optimization State (transient - not persisted)
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const { availableLeagues, availableDates, candidates } =
        useUpcomingFixtures(fixtures, stats, { selectedLeagues, selectedDate });

    const handleLeagueToggle = (league) =>
        setPrefs(prev => ({ selectedLeagues: toggleLeagueSelection(prev.selectedLeagues, league) }));

    // Optimization Handler
    const handleOptimizationStart = (bettingParams) => {
        if (!matchData || matchData.length === 0) return;

        setIsSettingsModalOpen(false);
        setIsOptimizing(true);

        // Yield a frame so the loading state paints before the sweep runs.
        setTimeout(() => {
            const leagues = [...new Set(matchData.map(m => m.league).filter(Boolean))];
            const newOptimizedParams = {};

            leagues.forEach(league => {
                const leagueMatches = matchData.filter(m => m.league === league);
                const best = findBestStrategy(leagueMatches, selectedStatistic, bettingParams);
                if (best) newOptimizedParams[league] = best;
            });

            setPrefs({
                currentBettingParams: bettingParams,
                optimizedParams: newOptimizedParams,
                isOptimizationActive: true,
            });
            setIsOptimizing(false);
        }, 100);
    };

    const toggleOptimization = () => {
        if (isOptimizationActive) {
            setPrefs({
                isOptimizationActive: false,
                optimizedParams: {},
                currentBettingParams: {},
            });
        } else {
            setIsSettingsModalOpen(true);
        }
    };

    // Team histories for whatever statistic actually drives the selected one:
    // corners are predicted from shots, goals from box touches, everything else
    // from itself. See utils/predictTotal.js.
    const predictionModel = useMemo(
        // Residual tracking costs one extra prediction per match folded in, so
        // it is only switched on for the engine that needs it.
        () => buildPredictionModel(matchData, selectedStatistic,
            { trackResiduals: engine === ENGINES.COUNT }),
        [matchData, selectedStatistic, engine]
    );

    // Rank the shared candidate set by expected total, applying the optimized
    // per-league model params when optimization is switched on.
    const topMatches = useMemo(() => {
        return candidates
            .map(match => {
                const optimized = isOptimizationActive ? optimizedParams[match.league] : null;

                const currentNGames = optimized ? optimized.nGames : nGames;
                const currentUseGeneralStats = optimized ? optimized.useGeneralStats : useGeneralStats;
                const currentForceMean = optimized ? optimized.forceMean : forceMean;

                const pred = predictFromModel(predictionModel, match.home, match.away, {
                    nGames: currentNGames,
                    useGeneralStats: currentUseGeneralStats,
                    aggregatorOverride: currentForceMean ? 'mean' : 'median',
                    // Kickoff, so a fixture next month is not modelled as if it
                    // were today. Falls back to now for a fixture with no date.
                    asOf: match.date ?? new Date(),
                    engine,
                });

                return {
                    ...match,
                    prediction: pred,
                    isOptimized: Boolean(optimized),
                    strategy: optimized || null,
                    usedParams: { n: currentNGames, ugs: currentUseGeneralStats, fm: currentForceMean }
                };
            })
            .filter(m => m.prediction !== null)
            .sort((a, b) => b.prediction.total - a.prediction.total)
            .slice(0, displayCount);
    }, [candidates, predictionModel, nGames, displayCount, useGeneralStats, forceMean, isOptimizationActive, optimizedParams, engine]);

    // Close dropdown when clicking outside
    useClickOutside(activeDropdown, '.dropdown-container', useCallback(() => setActiveDropdown(null), []));

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>
    );

    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            Hot <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Matches</span>
        </h1>
    );

    return (
        <div className="min-h-screen text-zinc-200 font-sans relative pb-12">
            <Header
                title={appTitle}
                onLogoClick={onBack}
                showSound={true}
                showAnimationToggle={true}
                isAnimationEnabled={isAnimationEnabled}
                onToggleAnimation={onToggleAnimation}
                pageName={pageName}
            >
                <StatisticSelector
                    value={selectedStatistic}
                    onChange={onStatisticChange}
                    className="w-[180px]"
                />
            </Header>

            <OptimizationSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                onRun={handleOptimizationStart}
                selectedStatistic={selectedStatistic}
            />

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                <div className="space-y-6 relative">

                    <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col xl:flex-row justify-between items-center gap-4 relative z-50">
                        <div className="flex items-center gap-3 min-w-max w-full xl:w-auto justify-center xl:justify-start border-b xl:border-b-0 border-white/5 pb-4 xl:pb-0">
                            <div className="p-2 bg-zinc-900 rounded-lg border border-white/10">
                                <Flame className="w-5 h-5 text-orange-500" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-black text-white leading-none tracking-tight">
                                    Hot <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">Matches</span>
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide">
                                        Top {getStatLabel(selectedStatistic)} picks
                                    </p>
                                    <SignalBadge statistic={selectedStatistic} showLabel />
                                    <EngineToggle engine={engine} onChange={onEngineChange} />
                                    <DerivedBadge statistic={selectedStatistic} />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 w-full flex-1">
                            {/* League Multi-Filter */}
                            <Dropdown
                                label="Leagues"
                                active={activeDropdown === 'league'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'league' ? null : 'league')}
                                value={selectedLeagues.includes('All') ? 'All Leagues' : `${selectedLeagues.length} Selected`}
                                width="w-full"
                                className="flex-[2] min-w-[200px]"
                            >
                                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                    <button
                                        onClick={() => handleLeagueToggle('All')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors mb-1 ${selectedLeagues.includes('All')
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                            : 'text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                                    >
                                        All Leagues
                                    </button>
                                    <div className="h-px bg-white/5 my-1" />
                                    {availableLeagues.map(league => (
                                        <label
                                            key={league}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedLeagues.includes(league)
                                                ? 'bg-zinc-800 text-white'
                                                : 'text-zinc-500 hover:bg-white/5'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0"
                                                checked={selectedLeagues.includes(league)}
                                                onChange={() => handleLeagueToggle(league)}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-wide">{league}</span>
                                        </label>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Date Selector */}
                            <Dropdown
                                label="Date"
                                active={activeDropdown === 'date'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
                                value={selectedDate ? (selectedDate.toDateString() === new Date().toDateString() ? 'Today' : selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : 'Upcoming'}
                                width="w-full"
                                className="flex-[1.5] min-w-[140px]"
                            >
                                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                    <button
                                        onClick={() => { setSelectedDate(null); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors mb-1 ${selectedDate === null
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                            : 'text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                                    >
                                        Upcoming Matches
                                    </button>
                                    <div className="h-px bg-white/5 my-1" />
                                    {availableDates.map(date => {
                                        const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
                                        const isToday = date.toDateString() === new Date().toDateString();
                                        const label = isToday ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                                        return (
                                            <button
                                                key={date.toISOString()}
                                                onClick={() => { setSelectedDate(date); setActiveDropdown(null); }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${isSelected
                                                    ? 'bg-zinc-800 text-white'
                                                    : 'text-zinc-500 hover:bg-white/5'}`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Dropdown>

                            {/* View Count */}
                            <Dropdown
                                label="View"
                                active={activeDropdown === 'view'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'view' ? null : 'view')}
                                value={displayCount}
                                width="w-full"
                                className="flex-1 min-w-[80px]"
                            >
                                <div className="space-y-1">
                                    {[3, 6, 9, 12, 15].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => { setDisplayCount(n); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${displayCount === n
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {n} Matches
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Manual Overrides (Disable if optimized) */}
                            <div className={`flex gap-3 transition-opacity ${isOptimizationActive ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                {/* Sample Size */}
                                <Dropdown
                                    label="Sample"
                                    active={activeDropdown === 'sample'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'sample' ? null : 'sample')}
                                    value={nGames === 'all' ? 'Season' : `Last ${nGames}`}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        {[3, 5, 10, 'all'].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => { setNGames(n); setActiveDropdown(null); }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${nGames === n
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'text-zinc-400 hover:bg-white/5'}`}
                                            >
                                                {n === 'all' ? 'Whole Season' : `Last ${n} Games`}
                                            </button>
                                        ))}
                                    </div>
                                </Dropdown>

                                {/* Trend */}
                                <Dropdown
                                    label="Trend"
                                    active={activeDropdown === 'trend'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'trend' ? null : 'trend')}
                                    value={useGeneralStats ? 'General' : 'Specific'}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        <button
                                            onClick={() => { setUseGeneralStats(false); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${!useGeneralStats
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            Specific (Home/Away)
                                        </button>
                                        <button
                                            onClick={() => { setUseGeneralStats(true); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${useGeneralStats
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            General (All Matches)
                                        </button>
                                    </div>
                                </Dropdown>

                                {/* Calc */}
                                <Dropdown
                                    label="Calc"
                                    active={activeDropdown === 'calc'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'calc' ? null : 'calc')}
                                    value={forceMean ? 'Mean' : 'Median'}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        <button
                                            onClick={() => { setForceMean(false); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${!forceMean
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            Median (Default)
                                        </button>
                                        <button
                                            onClick={() => { setForceMean(true); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${forceMean
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            Mean (Average)
                                        </button>
                                    </div>
                                </Dropdown>
                            </div>

                            {/* Optimize Button */}
                            <div className="flex flex-col flex-1 min-w-[120px]">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-0.5 block">AI Optimize</span>
                                <button
                                    onClick={toggleOptimization}
                                    disabled={isOptimizing}
                                    className={`relative w-full text-sm font-bold uppercase tracking-wider rounded-lg border px-3 py-1.5 flex items-center justify-center gap-2 transition-all ${isOptimizationActive
                                        ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                        : 'bg-zinc-800 text-zinc-400 border-white/5 hover:bg-zinc-700 hover:text-white'
                                        }`}
                                >
                                    {isOptimizing ? (
                                        <span className="animate-pulse">Optimizing...</span>
                                    ) : (
                                        <>
                                            {isOptimizationActive ? <BrainCircuit className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                                            {isOptimizationActive ? 'Active' : 'Optimize'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {topMatches.map((match, idx) => (
                            <div
                                key={`${match.home}-${match.away}-${idx}`}
                                style={{ animationDelay: `${idx * 100}ms` }}
                                className="glass-panel rounded-xl p-5 border border-white/10 hover:border-emerald-500/30 transition-all group relative overflow-hidden animate-waterfall cursor-pointer"
                                onClick={() => onMatchClick && onMatchClick(match)}
                            >
                                {/* Rank Badge */}
                                <div className="absolute top-0 right-0 bg-zinc-900/80 px-3 py-1.5 rounded-bl-xl border-l border-b border-white/5 font-black text-2xl text-zinc-700 group-hover:text-emerald-500/50 transition-colors">
                                    #{idx + 1}
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {(() => {
                                            if (!match.date) return 'TBD';
                                            const d = new Date(match.date);
                                            return !isNaN(d.getTime())
                                                ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                : match.date;
                                        })()}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-12">
                                            {match.league || 'Unknown League'}
                                        </div>
                                        {match.isOptimized && (
                                            match.strategy?.beatsBaseRate ? (
                                                <div
                                                    title={`Calls over/under ${match.strategy.line} correctly ${(100 * match.strategy.accuracy).toFixed(1)}% of the time vs a ${(100 * match.strategy.baseRate).toFixed(1)}% base rate, over ${match.strategy.calls} calls.`}
                                                    className="text-[9px] font-bold text-emerald-500 uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 mr-12 mt-1 flex items-center gap-1"
                                                >
                                                    <BrainCircuit className="w-3 h-3" />
                                                    +{(100 * match.strategy.edge).toFixed(1)}pt edge
                                                </div>
                                            ) : (
                                                <div
                                                    title={`No setting beat simply always betting the same side at ${match.strategy?.line}. Best was ${(100 * (match.strategy?.accuracy ?? 0)).toFixed(1)}% vs a ${(100 * (match.strategy?.baseRate ?? 0)).toFixed(1)}% base rate.`}
                                                    className="text-[9px] font-bold text-zinc-500 uppercase bg-zinc-500/10 px-1.5 py-0.5 rounded border border-zinc-500/20 mr-12 mt-1 flex items-center gap-1"
                                                >
                                                    <BrainCircuit className="w-3 h-3" /> No edge found
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Teams */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex flex-col items-center gap-2 w-1/3">
                                        <img src={teamLogos[match.home]} alt={match.home} className="w-12 h-12 object-contain drop-shadow-lg" />
                                        <span className="font-bold text-sm text-center leading-tight">{match.home}</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center w-1/3">
                                        <span className="text-xs font-bold text-zinc-600 uppercase mb-1">VS</span>
                                        <div className="text-3xl font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                            {match.prediction.total.toFixed(1)}
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1 border border-emerald-500/20">
                                            Exp. {getStatLabel(selectedStatistic)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2 w-1/3">
                                        <img src={teamLogos[match.away]} alt={match.away} className="w-12 h-12 object-contain drop-shadow-lg" />
                                        <span className="font-bold text-sm text-center leading-tight">{match.away}</span>
                                    </div>
                                </div>

                                {/* Stats Breakdown */}
                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    <div className="bg-zinc-900/50 rounded-lg p-2 border border-white/5 text-center">
                                        <span className="block text-[10px] font-bold text-zinc-500 uppercase">Home Exp</span>
                                        <span className="block text-lg font-bold text-emerald-400">{match.prediction.expHome.toFixed(2)}</span>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-lg p-2 border border-white/5 text-center">
                                        <span className="block text-[10px] font-bold text-zinc-500 uppercase">Away Exp</span>
                                        <span className="block text-lg font-bold text-blue-400">{match.prediction.expAway.toFixed(2)}</span>
                                    </div>
                                </div>
                                {isOptimizationActive && match.usedParams && (
                                    <div className="mt-2 text-[9px] text-zinc-600 font-mono text-center">
                                        Using: {match.usedParams.n == 'all' ? 'Season' : `Last ${match.usedParams.n}`} • {match.usedParams.ugs ? 'Gen' : 'Spec'} • {match.usedParams.fm ? 'Mean' : 'Median'}
                                        {match.strategy && (
                                            <> • margin {match.strategy.margin} • {(100 * match.strategy.accuracy).toFixed(0)}% vs {(100 * match.strategy.baseRate).toFixed(0)}% base ({match.strategy.calls})</>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {topMatches.length === 0 && (
                        <div className="text-center py-12 text-zinc-500">
                            No upcoming matches found to analyze.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default HotMatches;

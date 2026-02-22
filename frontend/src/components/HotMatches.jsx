import React, { useState, useMemo, useEffect } from 'react';
import { Flame, Calendar, TrendingUp, ChevronRight, Zap, ZapOff, Sparkles, BrainCircuit, X, Play } from 'lucide-react';
import { calculatePrediction } from '../utils/stats';
import { findBestStrategy } from '../utils/backtest';
import StatisticSelector from './StatisticSelector';
import Header from './Header';

const Dropdown = ({ label, active, onToggle, value, children, width = 'min-w-[140px]', className = '' }) => (
    <div className={`dropdown-container relative ${className}`}>
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-0.5 block">{label}</span>
        <div className="relative">
            <button
                onClick={onToggle}
                className={`bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold text-left flex items-center justify-between ${width}`}
            >
                <span className="truncate">{value}</span>
                <ChevronRight className={`absolute right-2 w-3 h-3 text-zinc-500 transition-transform ${active ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            {active && (
                <div className="absolute top-full mt-2 left-0 bg-zinc-950 border border-white/10 p-2 rounded-xl shadow-2xl min-w-[200px] animate-in fade-in zoom-in-95 duration-200 z-50">
                    {children}
                </div>
            )}
        </div>
    </div>
);

const OptimizationSettingsModal = ({ isOpen, onClose, onRun, selectedStatistic }) => {
    const [softBuffer, setSoftBuffer] = useState('');
    const [minPrediction, setMinPrediction] = useState('');
    const [maxLineCap, setMaxLineCap] = useState('');

    if (!isOpen) return null;

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
                        Configure the betting parameters to maximize.
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Soft Buffer */}
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Soft Buffer (-)</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.5"
                                value={softBuffer}
                                placeholder="0"
                                onChange={(e) => setSoftBuffer(e.target.value)}
                                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-bold">POINTS</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                            Subtracts this amount from the prediction to create a safer line.
                        </p>
                    </div>

                    {/* Min Prediction */}
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Min Prediction</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.5"
                                value={minPrediction}
                                placeholder="0"
                                onChange={(e) => setMinPrediction(e.target.value)}
                                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-bold">TOTAL</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                            Only bet if the prediction is at least this value.
                        </p>
                    </div>

                    {/* Max Line Cap */}
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Max Line Cap (Optional)</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.5"
                                value={maxLineCap}
                                placeholder="None"
                                onChange={(e) => setMaxLineCap(e.target.value)}
                                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold placeholder:text-zinc-600"
                            />
                            {maxLineCap !== '' && (
                                <button
                                    onClick={() => setMaxLineCap('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                            Caps the betting line at this value.
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
                        onClick={() => onRun({
                            softBuffer: softBuffer === '' ? 0 : Number(softBuffer),
                            minPrediction: minPrediction === '' ? 0 : Number(minPrediction),
                            maxLineCap: maxLineCap === '' ? null : Number(maxLineCap)
                        })}
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
    useGeneralStats: false
};

const getStoredPrefs = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.selectedDate) {
                parsed.selectedDate = new Date(parsed.selectedDate);
            }
            return { ...DEFAULT_PREFS, ...parsed };
        }
    } catch (e) {
        console.error("Failed to load prefs", e);
    }
    return DEFAULT_PREFS;
};

const HotMatches = ({ stats, fixtures, matchData, teamLogos, isAnimationEnabled, onToggleAnimation, selectedStatistic, onStatisticChange, onBack, onMatchClick }) => {
    const [initialPrefs] = useState(() => getStoredPrefs());

    const [nGames, setNGames] = useState(initialPrefs.nGames);
    const [displayCount, setDisplayCount] = useState(initialPrefs.displayCount);
    const [selectedLeagues, setSelectedLeagues] = useState(initialPrefs.selectedLeagues);

    const [activeDropdown, setActiveDropdown] = useState(null);

    const [selectedDate, setSelectedDate] = useState(initialPrefs.selectedDate);
    const [forceMean, setForceMean] = useState(initialPrefs.forceMean);
    const [useGeneralStats, setUseGeneralStats] = useState(initialPrefs.useGeneralStats);

    // Optimization State
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedParams, setOptimizedParams] = useState({}); // { 'Serie A': { nGames: ..., ... } }
    const [isOptimizationActive, setIsOptimizationActive] = useState(false);

    // Values used for current active optimization for display/logic
    const [currentBettingParams, setCurrentBettingParams] = useState({});

    // Modal State
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // Persist changes
    useEffect(() => {
        const prefsToSave = {
            nGames,
            displayCount,
            selectedLeagues,
            selectedDate,
            forceMean,
            useGeneralStats
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefsToSave));
    }, [nGames, displayCount, selectedLeagues, selectedDate, forceMean, useGeneralStats]);

    // 0. Get available leagues for filter
    const availableLeagues = useMemo(() => {
        if (!fixtures) return [];
        const leagues = [...new Set(fixtures.map(f => f.league).filter(Boolean))];
        return leagues.sort();
    }, [fixtures]);

    // 0.5 Get available dates from fixtures (e.g. from today onwards)
    const availableDates = useMemo(() => {
        if (!fixtures) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dates = new Set();
        fixtures.forEach(f => {
            if (!f.date) return;
            const d = new Date(f.date);
            d.setHours(0, 0, 0, 0);
            if (d >= today) {
                dates.add(d.toISOString());
            }
        });

        // Convert to array, sort, and take next 14 days
        return Array.from(dates)
            .map(d => new Date(d))
            .sort((a, b) => a - b)
            .slice(0, 14);
    }, [fixtures]);

    const handleLeagueToggle = (league) => {
        if (league === 'All') {
            setSelectedLeagues(['All']);
        } else {
            setSelectedLeagues(prev => {
                const filtered = prev.filter(l => l !== 'All');
                if (filtered.includes(league)) {
                    const result = filtered.filter(l => l !== league);
                    return result.length === 0 ? ['All'] : result;
                } else {
                    return [...filtered, league];
                }
            });
        }
    };

    // Optimization Handler
    const handleOptimizationStart = (bettingParams) => {
        if (!matchData || matchData.length === 0) return;

        setIsSettingsModalOpen(false);
        setIsOptimizing(true);
        setCurrentBettingParams(bettingParams);

        // Use setTimeout to allow UI to render the loading state
        setTimeout(() => {
            const leagues = [...new Set(matchData.map(m => m.league).filter(Boolean))];
            const newOptimizedParams = {};

            leagues.forEach(league => {
                // Filter matches for this league
                const leagueMatches = matchData.filter(m => m.league === league);
                // Find best strategy using user-defined betting params
                const best = findBestStrategy(leagueMatches, selectedStatistic, bettingParams);
                if (best) {
                    newOptimizedParams[league] = best;
                }
            });

            console.log("Optimization Complete:", newOptimizedParams);
            setOptimizedParams(newOptimizedParams);
            setIsOptimizationActive(true);
            setIsOptimizing(false);
        }, 100);
    };

    const toggleOptimization = () => {
        if (isOptimizationActive) {
            setIsOptimizationActive(false);
            setOptimizedParams({});
            setCurrentBettingParams({});
        } else {
            setIsSettingsModalOpen(true);
        }
    };

    // 1. Identify upcoming matchday for each league
    const upcomingMatchdays = useMemo(() => {
        if (!fixtures) return {};
        const leagues = [...new Set(fixtures.map(f => f.league).filter(Boolean))];
        const map = {};
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        leagues.forEach(league => {
            const leagueFixtures = fixtures.filter(f => f.league === league);

            // Find unplayed matches for this league that are NOT in the past
            const candidates = leagueFixtures.filter(f => {
                // 1. Basic unplayed check (not in scraped stats)
                if (stats && stats[f.home]) {
                    const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
                    if (played) return false;
                }

                // 2. Date check: must be today or future (allow 24h grace)
                if (f.date) {
                    const matchDate = new Date(f.date);
                    if (matchDate < oneDayAgo) return false;
                }

                return true;
            });

            if (candidates.length > 0) {
                // Sort by DATE (closest in time) to find the upcoming matchday
                // Use Infinity for TBD to push them to the end
                const sortedByTime = candidates.sort((a, b) => {
                    const dateA = a.date ? new Date(a.date).getTime() : Infinity;
                    const dateB = b.date ? new Date(b.date).getTime() : Infinity;
                    return dateA - dateB;
                });
                map[league] = sortedByTime[0].matchday;
            }
        });
        return map;
    }, [fixtures, stats]);

    const topMatches = useMemo(() => {
        if (!fixtures || !stats) return [];

        // Filter for unplayed matches that are in the upcoming matchday for their league
        const candidates = fixtures.filter(f => {
            if (!f.league) return false;

            // Apply Multi-League Filter
            const isAllSelected = selectedLeagues.includes('All');
            if (!isAllSelected && !selectedLeagues.includes(f.league)) return false;

            // Unplayed Check
            if (stats && stats[f.home]) {
                const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
                if (played) return false;
            }

            // Today Only Logic
            // Date Filter Logic
            if (selectedDate) {
                if (!f.date) return false;
                const d = new Date(f.date);
                return d.toDateString() === selectedDate.toDateString();
            }

            // Default: Upcoming Matchday Logic
            const targetMatchday = upcomingMatchdays[f.league];
            if (f.matchday !== targetMatchday) return false;

            return true;
        });

        // Calculate predictions
        const predictions = candidates.map(match => {
            // Determine params to use
            let currentNGames = nGames;
            let currentUseGeneralStats = useGeneralStats;
            let currentForceMean = forceMean;
            let isOptimized = false;

            if (isOptimizationActive && optimizedParams[match.league]) {
                const p = optimizedParams[match.league];
                currentNGames = p.nGames;
                currentUseGeneralStats = p.useGeneralStats;
                currentForceMean = p.forceMean;
                isOptimized = true;
            }

            const pred = calculatePrediction(
                match.home,
                match.away,
                stats,
                currentNGames,
                false,
                currentUseGeneralStats,
                selectedStatistic,
                currentForceMean ? 'mean' : 'median'
            );
            return {
                ...match,
                prediction: pred,
                isOptimized,
                usedParams: { n: currentNGames, ugs: currentUseGeneralStats, fm: currentForceMean }
            };
        }).filter(m => m.prediction !== null);

        // Apply Min Prediction Filter based on current betting params if valid
        // Only if filtering is desirable here? 
        // The user might want to see all matches but sorted. 
        // However, if optimized for "Min Pred 10", matches with 9 should ideally be ranked lower or filtered.
        // Let's keep them all but sort by value.

        // Sort by Total Expected corners/goals/etc (Descending)
        const sorted = predictions.sort((a, b) => b.prediction.total - a.prediction.total);

        return sorted.slice(0, displayCount);
    }, [fixtures, stats, nGames, upcomingMatchdays, displayCount, selectedLeagues, selectedDate, useGeneralStats, forceMean, isOptimizationActive, optimizedParams, selectedStatistic]);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!activeDropdown) return;
        const handleClickOutside = (e) => {
            if (!e.target.closest('.dropdown-container')) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeDropdown]);

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
                                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                                    Top {selectedStatistic.replace('_', ' ')} picks
                                </p>
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
                                            <div className="text-[9px] font-bold text-emerald-500 uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 mr-12 mt-1 flex items-center gap-1">
                                                <BrainCircuit className="w-3 h-3" /> AI Optimized
                                            </div>
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
                                            Exp. {selectedStatistic === 'corners' ? 'Corners' : selectedStatistic === 'goals' ? 'Goals' : selectedStatistic.replace('_', ' ')}
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

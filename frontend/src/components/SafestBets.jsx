import React, { useState, useMemo, useCallback } from 'react';
import { Shield, Calendar, TrendingUp, ChevronRight, CheckCircle2 } from 'lucide-react';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { getStatLabel } from '../utils/statistics';
import { usePersistedPrefs, toggleLeagueSelection } from '../hooks/usePersistedPrefs';
import { useUpcomingFixtures } from '../hooks/useUpcomingFixtures';
import { useClickOutside } from '../hooks/useClickOutside';
import Dropdown from './ui/Dropdown';
import StatisticSelector from './StatisticSelector';
import EngineToggle from './EngineToggle';
import Header from './Header';

const STORAGE_KEY = 'olanda_safestbets_prefs';
// The model knobs live in useModelSettings, shared with Hot Matches and the
// Predictor - see that hook for why they are not per screen.
const DEFAULT_PREFS = {
    displayCount: 9,
    selectedLeagues: ['All'],
    selectedDate: null,
};

const CONFIDENCE_THRESHOLDS = {
    corners: { high: 2.0, med: 3.0 },
    goals: { high: 0.85, med: 1.35 },
    shots: { high: 3.5, med: 5.5 },
    shots_on_target: { high: 1.8, med: 2.8 },
    fouls: { high: 3.2, med: 5.2 },
    yellow_cards: { high: 1.0, med: 1.6 },
    red_cards: { high: 0.2, med: 0.4 },
    possession: { high: 4.5, med: 7.5 },
    offsides: { high: 0.8, med: 1.5 },
    default: { high: 1.0, med: 2.0 }
};

const getConfidenceLabel = (stdDev, statType) => {
    const thresholds = CONFIDENCE_THRESHOLDS[statType] || CONFIDENCE_THRESHOLDS.default;
    if (stdDev <= thresholds.high) return { label: 'High', color: 'text-emerald-400' };
    if (stdDev <= thresholds.med) return { label: 'Med', color: 'text-yellow-400' };
    return { label: 'Low', color: 'text-red-400' };
};

const SafestBets = ({ engine, onEngineChange, stats, fixtures, teamLogos, isAnimationEnabled, onToggleAnimation, selectedStatistic, matchData, onStatisticChange, onBack, onMatchClick, modelSettings, setNGames, setUseGeneralStats, setForceMean }) => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, DEFAULT_PREFS);
    const { displayCount, selectedLeagues, selectedDate } = prefs;
    const { nGames, useGeneralStats, forceMean } = modelSettings;

    const setDisplayCount = (v) => setPrefs({ displayCount: v });
    const setSelectedDate = (v) => setPrefs({ selectedDate: v });

    const [activeDropdown, setActiveDropdown] = useState(null);

    const { availableLeagues, availableDates, candidates } =
        useUpcomingFixtures(fixtures, stats, { selectedLeagues, selectedDate });

    const handleLeagueToggle = (league) =>
        setPrefs(prev => ({ selectedLeagues: toggleLeagueSelection(prev.selectedLeagues, league) }));

    // Team histories for whatever statistic actually drives the selected one:
    // corners are predicted from shots, goals from box touches, everything else
    // from itself. See utils/predictTotal.js.
    const predictionModel = useMemo(
        () => buildPredictionModel(matchData, selectedStatistic,
            { trackResiduals: engine === ENGINES.COUNT }),
        [matchData, selectedStatistic, engine]
    );

    // Rank the shared candidate set by prediction variance: the lower the
    // spread, the "safer" the bet.
    const safestMatches = useMemo(() => {
        return candidates
            .map(match => ({
                ...match,
                prediction: predictFromModel(predictionModel, match.home, match.away, {
                    nGames,
                    useGeneralStats,
                    aggregatorOverride: forceMean ? 'mean' : null,
                    asOf: match.date ?? new Date(),
                    engine,
                })
            }))
            .filter(m => m.prediction !== null)
            .sort((a, b) => a.prediction.totalStd - b.prediction.totalStd)
            .slice(0, displayCount);
    }, [candidates, predictionModel, nGames, displayCount, useGeneralStats, forceMean, engine]);

    // Close dropdown when clicking outside
    useClickOutside(activeDropdown, '.dropdown-container', useCallback(() => setActiveDropdown(null), []));

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>
    );

    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            Safest <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Bets</span>
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
                <EngineToggle engine={engine} onChange={onEngineChange} />
                <StatisticSelector
                    value={selectedStatistic}
                    onChange={onStatisticChange}
                    className="w-[180px]"
                />
            </Header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                <div className="space-y-6 relative">

                    <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col xl:flex-row justify-between items-center gap-4 relative z-50">
                        <div className="flex items-center gap-3 xl:min-w-max w-full xl:w-auto justify-center xl:justify-start border-b xl:border-b-0 border-white/5 pb-4 xl:pb-0">
                            <div className="p-2 bg-zinc-900 rounded-lg border border-white/10">
                                <Shield className="w-5 h-5 text-cyan-500" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-black text-white leading-none tracking-tight">
                                    Safest <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Bets</span>
                                </h2>
                                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                                    Low Variance {getStatLabel(selectedStatistic)} Picks
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 w-full flex-1">
                            {/* League Multi-Filter */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
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
                                                className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/20 focus:ring-offset-0"
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
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
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
                                accent="cyan"
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
                                                ? 'bg-cyan-500/20 text-cyan-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {n} Matches
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Sample Size */}
                            <Dropdown
                                accent="cyan"
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
                                                ? 'bg-cyan-500/20 text-cyan-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {n === 'all' ? 'Whole Season' : `Last ${n} Games`}
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Trend */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        Specific (Home/Away)
                                    </button>
                                    <button
                                        onClick={() => { setUseGeneralStats(true); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${useGeneralStats
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        General (All Matches)
                                    </button>
                                </div>
                            </Dropdown>

                            {/* Calc */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        Auto (per statistic)
                                    </button>
                                    <button
                                        onClick={() => { setForceMean(true); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${forceMean
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        Mean (Average)
                                    </button>
                                </div>
                            </Dropdown>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {safestMatches.map((match, idx) => (
                            <div
                                key={`${match.home}-${match.away}-${idx}`}
                                style={{ animationDelay: `${idx * 100}ms` }}
                                className="glass-panel rounded-xl p-5 border border-white/10 hover:border-cyan-500/30 transition-all group relative overflow-hidden animate-waterfall cursor-pointer"
                                onClick={() => onMatchClick && onMatchClick(match)}
                            >
                                {/* Rank Badge */}
                                <div className="absolute top-0 right-0 bg-zinc-900/80 px-3 py-1.5 rounded-bl-xl border-l border-b border-white/5 font-black text-2xl text-zinc-700 group-hover:text-cyan-500/50 transition-colors">
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
                                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-12">
                                        {match.league || 'Unknown League'}
                                    </div>
                                </div>

                                {/* Teams */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex flex-col items-center gap-2 w-1/3">
                                        <img src={teamLogos[match.home]} alt={match.home} className="w-12 h-12 object-contain drop-shadow-lg" />
                                        <span className="font-bold text-sm text-center leading-tight">{match.home}</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center w-1/3">
                                        <span className="text-xs font-bold text-zinc-600 uppercase mb-1">VAR</span>
                                        <div className="text-3xl font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                            {match.prediction.totalStd.toFixed(2)}
                                        </div>
                                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider bg-cyan-500/10 px-2 py-0.5 rounded-full mt-1 border border-cyan-500/20">
                                            {getStatLabel(selectedStatistic)} spread
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
                                        <span className="block text-[10px] font-bold text-zinc-500 uppercase">Exp Total</span>
                                        <span className="block text-lg font-bold text-cyan-400">{match.prediction.total.toFixed(2)}</span>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-lg p-2 border border-white/5 text-center">
                                        <span className="block text-[10px] font-bold text-zinc-500 uppercase">Confidence</span>
                                        {(() => {
                                            const { label, color } = getConfidenceLabel(match.prediction.totalStd, selectedStatistic);
                                            return (
                                                <span className={`block text-lg font-bold ${color}`}>
                                                    {label}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {safestMatches.length === 0 && (
                        <div className="text-center py-12 text-zinc-500">
                            No upcoming matches found to analyze.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SafestBets;

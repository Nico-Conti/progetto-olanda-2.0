import React, { useState, useMemo, useEffect } from 'react';
import { Flame, Calendar, TrendingUp, ChevronRight, Zap, ZapOff } from 'lucide-react';
import { calculatePrediction } from '../utils/stats';
import StatisticSelector from './StatisticSelector';
import Header from './Header';

const HotMatches = ({ stats, fixtures, teamLogos, isAnimationEnabled, onToggleAnimation, selectedStatistic, onStatisticChange, onBack, onMatchClick }) => {
    const [nGames, setNGames] = useState(5);
    const [displayCount, setDisplayCount] = useState(9);
    const [selectedLeagues, setSelectedLeagues] = useState(['All']);
    const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);

    // 0. Get available leagues for filter
    const availableLeagues = useMemo(() => {
        if (!fixtures) return [];
        const leagues = [...new Set(fixtures.map(f => f.league).filter(Boolean))];
        return leagues.sort();
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

            const targetMatchday = upcomingMatchdays[f.league];
            if (f.matchday !== targetMatchday) return false;

            if (!stats[f.home]) return true;
            const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
            return !played;
        });

        // Calculate predictions
        const predictions = candidates.map(match => {
            const pred = calculatePrediction(match.home, match.away, stats, nGames);
            return { ...match, prediction: pred };
        }).filter(m => m.prediction !== null);

        // Sort by Total Expected corners/goals/etc (Descending)
        const sorted = predictions.sort((a, b) => b.prediction.total - a.prediction.total);

        return sorted.slice(0, displayCount);
    }, [fixtures, stats, nGames, upcomingMatchdays, displayCount, selectedLeagues]);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isLeagueDropdownOpen) return;
        const handleClickOutside = (e) => {
            if (!e.target.closest('.league-filter-container')) {
                setIsLeagueDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isLeagueDropdownOpen]);

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

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                <div className="space-y-6 relative">

                    <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 relative z-20">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Flame className="w-5 h-5 text-orange-500" />
                                Hot Matches
                            </h2>
                            <p className="text-zinc-400 text-sm mt-1">Highest predicted total {selectedStatistic.replace('_', ' ')} for the upcoming matchday across all leagues</p>
                        </div>

                        <div className="flex flex-wrap md:flex-nowrap items-center justify-center md:justify-end gap-y-4 gap-x-6 md:mr-12">
                            {/* League Multi-Filter */}
                            <div className="flex items-center gap-3 league-filter-container relative">
                                <span className="text-xs font-bold text-zinc-400 uppercase">Leagues:</span>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                                        className="bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-10 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-bold min-w-[140px] text-left flex items-center justify-between"
                                    >
                                        <span className="truncate">
                                            {selectedLeagues.includes('All')
                                                ? 'All Leagues'
                                                : `${selectedLeagues.length} Selected`}
                                        </span>
                                        <ChevronRight className={`absolute right-2 w-3 h-3 text-zinc-500 transition-transform ${isLeagueDropdownOpen ? '-rotate-90' : 'rotate-90'}`} />
                                    </button>

                                    {isLeagueDropdownOpen && (
                                        <div className="absolute top-full mt-2 right-0 bg-zinc-950 border border-white/10 p-2 rounded-xl shadow-2xl z-50 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                                            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                <button
                                                    onClick={() => handleLeagueToggle('All')}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors mb-1 ${selectedLeagues.includes('All')
                                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20'
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
                                                            className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500/20 focus:ring-offset-0"
                                                            checked={selectedLeagues.includes(league)}
                                                            onChange={() => handleLeagueToggle(league)}
                                                        />
                                                        <span className="text-xs font-bold uppercase tracking-wide">{league}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Display Count Selector */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-zinc-400 uppercase">View:</span>
                                <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5 items-center gap-1">
                                    {[3, 6, 9, 12, 15].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setDisplayCount(n)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${displayCount === n
                                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-sm'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                                }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sample Size Selector */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-zinc-400 uppercase">Sample:</span>
                                <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5 items-center gap-1">
                                    {[3, 5, 10, 'all'].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setNGames(n)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                                                ? 'bg-zinc-700 text-white shadow-sm'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                                }`}
                                        >
                                            {n === 'all' ? 'Season' : `Last ${n}`}
                                        </button>
                                    ))}
                                </div>
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

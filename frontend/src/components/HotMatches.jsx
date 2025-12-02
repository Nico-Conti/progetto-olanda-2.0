import React, { useState, useMemo, useEffect } from 'react';
import { Flame, Calendar, TrendingUp, ChevronRight, Zap, ZapOff } from 'lucide-react';
import { calculatePrediction } from '../utils/stats';
import StatisticSelector from './StatisticSelector';

const HotMatches = ({ stats, fixtures, teamLogos, isAnimationEnabled, onToggleAnimation, selectedStatistic, onStatisticChange }) => {
    const [nGames, setNGames] = useState(5);
    const [displayCount, setDisplayCount] = useState(9);
    // 1. Identify upcoming matchday for each league
    const upcomingMatchdays = useMemo(() => {
        if (!fixtures) return {};
        const leagues = [...new Set(fixtures.map(f => f.league).filter(Boolean))];
        const map = {};

        leagues.forEach(league => {
            const leagueFixtures = fixtures.filter(f => f.league === league);
            // Find unplayed matches for this league
            // We need to check against stats to see if played, but for "upcoming matchday" 
            // we can often just look at dates or assume the scraper sets matchday correctly.
            // Let's use the same "unplayed" logic as before to be safe.

            const unplayedInLeague = leagueFixtures.filter(f => {
                if (!stats || !stats[f.home]) return true;
                const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
                return !played;
            });

            if (unplayedInLeague.length > 0) {
                // Sort by matchday and take the first one
                const sorted = unplayedInLeague.sort((a, b) => a.matchday - b.matchday);
                map[league] = sorted[0].matchday;
            }
        });
        return map;
    }, [fixtures, stats]);

    const topMatches = useMemo(() => {
        if (!fixtures || !stats) return [];

        // Filter for unplayed matches that are in the upcoming matchday for their league
        const candidates = fixtures.filter(f => {
            if (!f.league) return false;
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

        // Sort by Total Expected Corners (Descending)
        const sorted = predictions.sort((a, b) => b.prediction.total - a.prediction.total);

        return sorted.slice(0, displayCount);
    }, [fixtures, stats, nGames, upcomingMatchdays, displayCount]);

    return (
        <div className="space-y-6 relative">

            <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 relative z-20">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Flame className="w-5 h-5 text-orange-500" />
                        Hot Matches
                    </h2>
                    <p className="text-zinc-400 text-sm mt-1">Highest predicted total {selectedStatistic.replace('_', ' ')} for the upcoming matchday across all leagues</p>
                </div>

                <div className="flex items-center gap-6 mr-12">
                    {/* Statistic Selector */}
                    <StatisticSelector
                        value={selectedStatistic}
                        onChange={onStatisticChange}
                        className="w-[180px]"
                    />

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
                        className="glass-panel rounded-xl p-5 border border-white/10 hover:border-emerald-500/30 transition-all group relative overflow-hidden animate-waterfall"
                    >
                        {/* Rank Badge */}
                        <div className="absolute top-0 right-0 bg-zinc-900/80 px-3 py-1.5 rounded-bl-xl border-l border-b border-white/5 font-black text-2xl text-zinc-700 group-hover:text-emerald-500/50 transition-colors">
                            #{idx + 1}
                        </div>

                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {match.date ? new Date(match.date).toLocaleDateString() : 'TBD'}
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
    );
};

export default HotMatches;

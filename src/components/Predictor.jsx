import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Calculator, Flame, Info, Calendar, Activity } from 'lucide-react';
import { TEAM_LOGOS } from '../data/teamLogos';
import { calculatePrediction } from '../utils/stats';

const Predictor = ({ stats, fixtures, teams }) => {
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [nGames, setNGames] = useState(5);
    const [selectedMatchday, setSelectedMatchday] = useState(null);

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
        return calculatePrediction(customHome, customAway, stats, nGames);
    }, [customHome, customAway, stats, nGames, showCustomPrediction]);

    const upcomingMatches = useMemo(() => {
        if (!fixtures || !stats) return [];

        // Filter fixtures that haven't been played yet
        // A match is considered played if the home team has a recorded match against the away team at home
        const unplayed = fixtures.filter(f => {
            if (!stats[f.home]) return true; // If we don't have stats for home team, assume unplayed or invalid
            const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
            return !played;
        });

        // Calculate predictions for all unplayed matches
        const predictions = unplayed.map(match => {
            const pred = calculatePrediction(match.home, match.away, stats, nGames);
            return { ...match, prediction: pred };
        }).filter(m => m.prediction !== null); // Filter out matches where we couldn't calc prediction (e.g. missing team stats)

        return predictions.sort((a, b) => a.matchday - b.matchday);
    }, [fixtures, stats, nGames]);

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
        // Actually, we can just use the one from the list or recalculate.
        // Let's recalculate to be safe and simple with the existing UI components that might need specific props.
        const detailPred = calculatePrediction(home, away, stats, nGames);

        if (!detailPred) return <div>Error loading match details</div>;

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => setSelectedMatch(null)}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-2"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    <span className="font-bold text-sm uppercase tracking-wide">Back to Fixtures</span>
                </button>

                {/* Configuration (Sample Size Only) */}
                <div className="glass-panel p-4 rounded-xl border border-white/10 flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-emerald-400" />
                        Match Analysis
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Sample Size:</span>
                        <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                            {[3, 5, 'all'].map((n) => (
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

                {/* Prediction Hero */}
                <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

                    <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                        <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                        <div className="flex items-center justify-center gap-8 mb-8 w-full">
                            <div className="text-right flex-1 flex flex-col items-end">
                                <img src={TEAM_LOGOS[home]} alt={home} className="w-16 h-16 object-contain mb-2" />
                                <div className="text-2xl font-bold text-white truncate">{home}</div>
                                <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {detailPred.expHome.toFixed(2)}</div>
                            </div>

                            <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${detailPred.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                                {detailPred.total.toFixed(1)}
                            </div>

                            <div className="text-left flex-1 flex flex-col items-start">
                                <img src={TEAM_LOGOS[away]} alt={away} className="w-16 h-16 object-contain mb-2" />
                                <div className="text-2xl font-bold text-white truncate">{away}</div>
                                <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {detailPred.expAway.toFixed(2)}</div>
                            </div>
                        </div>

                        {detailPred.total > 11.5 ? (
                            <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                <Flame className="w-4 h-4 fill-current" />
                                <span className="font-bold text-sm uppercase tracking-wide">High Over Trend</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                                <Info className="w-4 h-4" />
                                <span className="font-medium text-sm">Standard Projection</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats Analysis Breakdown */}
                <div className="glass-panel p-5 rounded-xl border border-white/10">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Stats Analysis (Last {nGames === 'all' ? 'Season' : nGames} Games)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Home Team Stats */}
                        <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                                    <img src={TEAM_LOGOS[home]} alt={home} className="w-6 h-6 object-contain" />
                                    {home} <span className="text-zinc-500 text-xs font-normal">(Home Matches)</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                                        <div className="text-2xl font-mono font-bold text-white">{detailPred.hFor.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                                        <div className="text-2xl font-mono font-bold text-red-400">{detailPred.hAg.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Away Team Stats */}
                        <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                                    <img src={TEAM_LOGOS[away]} alt={away} className="w-6 h-6 object-contain" />
                                    {away} <span className="text-zinc-500 text-xs font-normal">(Away Matches)</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                                        <div className="text-2xl font-mono font-bold text-white">{detailPred.aFor.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                                        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                                        <div className="text-2xl font-mono font-bold text-red-400">{detailPred.aAg.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Detailed History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                <img src={TEAM_LOGOS[home]} alt={home} className="w-6 h-6 object-contain" />
                                {home}
                            </h4>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            {detailPred.homeMatches.map(m => (
                                <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                                        <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center min-w-[30px]">
                                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                                            <span className="text-base font-black text-white">{m.total}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                <img src={TEAM_LOGOS[away]} alt={away} className="w-6 h-6 object-contain" />
                                {away}
                            </h4>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            {detailPred.awayMatches.map(m => (
                                <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                                        <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center min-w-[30px]">
                                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                                            <span className="text-base font-black text-white">{m.total}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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

                <div className="flex items-center gap-6">
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
                                        }`}
                                >
                                    {n === 'all' ? 'Season' : `Last ${n}`}
                                </button>
                            ))}
                            <div className="w-px h-4 bg-white/10 mx-1"></div>
                            <div className="flex items-center gap-1 px-2">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase">Custom:</span>
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
                                    className="w-10 bg-zinc-950 border border-zinc-800 rounded text-center text-xs text-white py-1 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-zinc-300">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
                            <tr>
                                <th className="px-5 py-3 font-bold tracking-wider">Date</th>
                                <th className="px-5 py-3 font-bold tracking-wider">Matchup</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-500">Home Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-500">Away Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider bg-white/5 text-white">Total Exp</th>
                                <th className="px-3 py-3 text-center font-bold tracking-wider">Trend</th>
                                <th className="px-3 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {displayedMatches.length > 0 ? displayedMatches.map((match, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedMatch(match)}
                                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                                >
                                    <td className="px-5 py-4 whitespace-nowrap font-medium text-zinc-400">{match.date}</td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 w-[120px] justify-end">
                                                <span className={`font-bold ${match.prediction.expHome > match.prediction.expAway ? 'text-white' : 'text-zinc-400'}`}>{match.home}</span>
                                                <img src={TEAM_LOGOS[match.home]} alt={match.home} className="w-6 h-6 object-contain" />
                                            </div>
                                            <span className="text-zinc-600 font-bold text-xs">VS</span>
                                            <div className="flex items-center gap-2 w-[120px]">
                                                <img src={TEAM_LOGOS[match.away]} alt={match.away} className="w-6 h-6 object-contain" />
                                                <span className={`font-bold ${match.prediction.expAway > match.prediction.expHome ? 'text-white' : 'text-zinc-400'}`}>{match.away}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 text-center font-mono font-bold text-emerald-400 bg-emerald-500/5">{match.prediction.expHome.toFixed(2)}</td>
                                    <td className="px-3 py-4 text-center font-mono font-bold text-blue-400 bg-blue-500/5">{match.prediction.expAway.toFixed(2)}</td>
                                    <td className="px-3 py-4 text-center font-black text-white bg-white/5 text-lg">{match.prediction.total.toFixed(1)}</td>
                                    <td className="px-3 py-4 text-center">
                                        {match.prediction.total > 11.5 && (
                                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 animate-pulse">
                                                <Flame className="w-4 h-4 fill-current" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-4 text-right">
                                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors inline-block" />
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
            </div>

            {/* Custom Matchup Selector */}
            <div className="glass-panel p-6 rounded-xl border border-white/10 mt-8">
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

                {showCustomPrediction && customPrediction && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                        {/* Prediction Hero (Reused) */}
                        <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10 bg-zinc-900/40">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

                            <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                                <div className="flex items-center justify-center gap-8 mb-8 w-full">
                                    <div className="text-right flex-1 flex flex-col items-end">
                                        <img src={TEAM_LOGOS[customHome]} alt={customHome} className="w-16 h-16 object-contain mb-2" />
                                        <div className="text-2xl font-bold text-white truncate">{customHome}</div>
                                        <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {customPrediction.expHome.toFixed(2)}</div>
                                    </div>

                                    <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${customPrediction.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                                        {customPrediction.total.toFixed(1)}
                                    </div>

                                    <div className="text-left flex-1 flex flex-col items-start">
                                        <img src={TEAM_LOGOS[customAway]} alt={customAway} className="w-16 h-16 object-contain mb-2" />
                                        <div className="text-2xl font-bold text-white truncate">{customAway}</div>
                                        <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {customPrediction.expAway.toFixed(2)}</div>
                                    </div>
                                </div>

                                {customPrediction.total > 11.5 ? (
                                    <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                        <Flame className="w-4 h-4 fill-current" />
                                        <span className="font-bold text-sm uppercase tracking-wide">High Over Trend</span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                                        <Info className="w-4 h-4" />
                                        <span className="font-medium text-sm">Standard Projection</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Detailed History (Reused) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                                    <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                        <img src={TEAM_LOGOS[customHome]} alt={customHome} className="w-6 h-6 object-contain" />
                                        {customHome}
                                    </h4>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
                                </div>
                                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                    {customPrediction.homeMatches.map(m => (
                                        <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                                                <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center min-w-[30px]">
                                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                                                    <span className="text-base font-black text-white">{m.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                                    <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                                        <img src={TEAM_LOGOS[customAway]} alt={customAway} className="w-6 h-6 object-contain" />
                                        {customAway}
                                    </h4>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
                                </div>
                                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                    {customPrediction.awayMatches.map(m => (
                                        <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                                                <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center min-w-[30px]">
                                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                                                    <span className="text-base font-black text-white">{m.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Predictor;

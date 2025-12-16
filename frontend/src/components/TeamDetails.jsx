import React, { useState, useMemo } from 'react'; // ADDED useMemo here
import { ArrowLeft, Calendar, Trophy, History, ChevronDown, ChevronUp, MapPin, Target } from 'lucide-react';

// --- HistoryItem Component (Moved before TeamDetails for clarity, but works either way) ---

const HistoryItem = ({ match, teamLogos }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Helper to determine color based on match result (Win, Draw, Loss - assuming statFor > statAg is a Win for the current team)
    const getResultIndicator = (forVal, agVal) => {
        if (forVal > agVal) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'; // Win
        if (forVal < agVal) return 'text-red-400 bg-red-500/20 border-red-500/30'; // Loss
        return 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30'; // Draw
    };

    return (
        <div className={`border rounded-lg overflow-hidden transition-all duration-300 ${getResultIndicator(match.statFor, match.statAg)}`}>
            <div
                className="p-4 flex items-center justify-between cursor-pointer bg-zinc-900/40 hover:bg-zinc-800/60 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-4 w-1/3">
                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase w-12 text-center ${match.location === 'Home' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-orange-500/10 text-orange-400'}`}>
                        {match.location}
                    </div>
                    <div className="text-zinc-500 text-xs font-mono">MD {match.giornata}</div>
                </div>

                <div className="flex items-center gap-3 w-1/3 justify-center">
                    {teamLogos && teamLogos[match.opponent] && (
                        <img src={teamLogos[match.opponent]} alt={match.opponent} className="w-6 h-6 object-contain opacity-80" />
                    )}
                    <span className="font-bold text-zinc-300 text-sm truncate">{match.opponent}</span>
                </div>

                <div className="flex items-center gap-4 w-1/3 justify-end">
                    <div className="text-right">
                        <div className="text-lg font-black font-mono leading-none">
                            <span className="text-white">{match.statFor}</span>
                            <span className="text-zinc-600 mx-1">-</span>
                            <span className="text-zinc-400">{match.statAg}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-tighter">Total: {match.total}</div>
                    </div>
                    <div className={`text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Expandable Content */}
            {isOpen && (
                <div className="bg-black/20 border-t border-white/10 p-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Details</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between border-b border-white/5 pb-1">
                                    <span className="text-zinc-400">Total {match.location === 'Home' ? 'For (Home)' : 'For (Away)'}</span>
                                    <span className="text-white font-mono">{match.total}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-1">
                                    <span className="text-zinc-400">For</span>
                                    <span className="text-emerald-400 font-mono">{match.statFor}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-1">
                                    <span className="text-zinc-400">Against</span>
                                    <span className="text-red-400 font-mono">{match.statAg}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Summary</h4>
                            <p className="text-xs text-zinc-400 leading-relaxed italic">
                                {match.tldr || match.detailed_summary || "No detailed summary available for this match."}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- TeamDetails Component ---

const TeamDetails = ({ team, teamLogo, stats, fixtures, onBack, teamLogos, selectedStatistic, onMatchClick }) => {

    // Find next fixture for the specific team
    const nextFixture = useMemo(() => {
        if (!fixtures) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return fixtures
            .filter(f => (f.home === team || f.away === team))
            .filter(f => {
                const d = new Date(f.date);
                return !isNaN(d.getTime()) && d >= today;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    }, [fixtures, team]);


    // History is already sorted by giornata desc in processData (as per comment)
    const history = stats?.all_matches || [];

    // The original formatStatName was unused, so it's removed to clean up.
    // The getResultColor was also unused in the final JSX, so it's removed to clean up.


    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4">
                    {teamLogo && <img src={teamLogo} alt={team} className="w-12 h-12 object-contain" />}
                    <div>
                        <h1 className="text-2xl font-black text-white">{team}</h1>
                        <div className="text-sm text-zinc-400 font-medium capitalize">{selectedStatistic} Analysis</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Next Match & Stats Summary */}
                <div className="space-y-6">
                    {/* Next Match Card */}
                    <div
                        // Changed click handler to use the full nextFixture object
                        onClick={() => nextFixture && onMatchClick && onMatchClick(nextFixture)}
                        className={`glass-panel p-5 rounded-xl border border-white/10 relative overflow-hidden group transition-all ${nextFixture ? 'cursor-pointer hover:border-emerald-500/30 hover:bg-white/5' : ''}`}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Calendar className="w-24 h-24 text-emerald-500" />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Next Match
                        </h3>

                        {nextFixture ? (
                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                                    <div className="flex flex-col items-center w-5/12 text-center gap-2">
                                        <img src={teamLogos[nextFixture.home]} alt={nextFixture.home} className="w-10 h-10 object-contain" />
                                        <div className="font-bold text-white text-sm leading-tight">{nextFixture.home}</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">Home</div>
                                    </div>

                                    <div className="flex flex-col items-center justify-center w-2/12">
                                        <div className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 py-1 px-2 rounded mb-1">VS</div>
                                    </div>

                                    <div className="flex flex-col items-center w-5/12 text-center gap-2">
                                        <img src={teamLogos[nextFixture.away]} alt={nextFixture.away} className="w-10 h-10 object-contain" />
                                        <div className="font-bold text-white text-sm leading-tight">{nextFixture.away}</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">Away</div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-xs font-medium text-zinc-400 px-1">
                                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {nextFixture.league}</span>
                                    <span>{new Date(nextFixture.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-900/50 p-6 rounded-lg border border-white/5 text-center text-zinc-500 text-sm">
                                No upcoming fixtures found.
                            </div>
                        )}
                    </div>

                    {/* Quick Stats */}
                    {stats && (
                        <div className="glass-panel p-5 rounded-xl border border-white/10">
                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Target className="w-4 h-4" /> Season Averages
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                {/* HOME FOR */}
                                <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-xs text-zinc-500 uppercase">Home For</div>
                                    <div className="text-xl font-bold text-emerald-400 font-mono">
                                        {/* Added null-check for the array length to prevent division by zero or errors */}
                                        {(stats.home_for && stats.home_for.length > 0 ? stats.home_for.reduce((a, b) => a + b, 0) / stats.home_for.length : 0).toFixed(1)}
                                    </div>
                                </div>
                                {/* AWAY FOR */}
                                <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-xs text-zinc-500 uppercase">Away For</div>
                                    <div className="text-xl font-bold text-blue-400 font-mono">
                                        {(stats.away_for && stats.away_for.length > 0 ? stats.away_for.reduce((a, b) => a + b, 0) / stats.away_for.length : 0).toFixed(1)}
                                    </div>
                                </div>
                                {/* HOME AGAINST */}
                                <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-xs text-zinc-500 uppercase">Home Ag</div>
                                    <div className="text-xl font-bold text-red-400 font-mono">
                                        {(stats.home_ag && stats.home_ag.length > 0 ? stats.home_ag.reduce((a, b) => a + b, 0) / stats.home_ag.length : 0).toFixed(1)}
                                    </div>
                                </div>
                                {/* AWAY AGAINST */}
                                <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 text-center">
                                    <div className="text-xs text-zinc-500 uppercase">Away Ag</div>
                                    <div className="text-xl font-bold text-red-400 font-mono">
                                        {(stats.away_ag && stats.away_ag.length > 0 ? stats.away_ag.reduce((a, b) => a + b, 0) / stats.away_ag.length : 0).toFixed(1)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Match History */}
                <div className="md:col-span-2">
                    <div className="glass-panel p-5 rounded-xl border border-white/10 h-full">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <History className="w-4 h-4" /> Match History
                        </h3>

                        <div className="space-y-3 h-[410px] overflow-y-auto pr-2 custom-scrollbar">
                            {history.length > 0 ? (
                                history.map((match, idx) => (
                                    <HistoryItem
                                        key={`${match.giornata}-${idx}`}
                                        match={match}
                                        teamLogos={teamLogos}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-10 text-zinc-500">No match history available.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TeamDetails;
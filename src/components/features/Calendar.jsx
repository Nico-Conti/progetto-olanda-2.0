import React from 'react';
import { Calendar as CalendarIcon, Clock, TrendingUp, AlertCircle } from 'lucide-react';

const Calendar = ({ fixtures }) => {
    if (!fixtures || fixtures.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                <CalendarIcon className="w-12 h-12 mb-4 opacity-20" />
                <p>No upcoming matches scheduled.</p>
            </div>
        );
    }

    // Group by Date
    const groupedFixtures = fixtures.reduce((acc, fixture) => {
        const date = new Date(fixture.match_date).toLocaleDateString('en-GB', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        if (!acc[date]) acc[date] = [];
        acc[date].push(fixture);
        return acc;
    }, {});

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3 mb-6">
                <CalendarIcon className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-bold text-white">Upcoming Fixtures & Predictions</h2>
            </div>

            {Object.entries(groupedFixtures).map(([date, matches]) => (
                <div key={date} className="space-y-4">
                    <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm sticky top-20 bg-zinc-950/80 backdrop-blur-md py-2 z-10">
                        {date}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {matches.map(match => (
                            <div key={match.id} className="glass-panel p-4 rounded-xl border border-white/10 hover:border-white/20 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase">
                                        <Clock className="w-3 h-3" />
                                        {new Date(match.match_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="px-2 py-1 rounded bg-zinc-800/50 text-[10px] font-bold text-zinc-400 border border-white/5">
                                        MD {match.giornata}
                                    </div>
                                </div>

                                <div className="space-y-3 mb-4">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-white text-lg">{match.home_team}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-white text-lg">{match.away_team}</span>
                                    </div>
                                </div>

                                {match.prediction_total_corners ? (
                                    <div className="pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1">
                                                <TrendingUp className="w-3 h-3" />
                                                Exp. Corners
                                            </span>
                                            <span className={`text-lg font-black ${match.prediction_total_corners > 10.5 ? 'text-emerald-400' : 'text-white'}`}>
                                                {match.prediction_total_corners.toFixed(2)}
                                            </span>
                                        </div>

                                        {match.prediction_prob_over_9_5 > 0.6 && (
                                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1.5 rounded border border-emerald-500/20">
                                                <AlertCircle className="w-3 h-3" />
                                                {Math.round(match.prediction_prob_over_9_5 * 100)}% Chance Over 9.5
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="pt-4 border-t border-white/5 text-center">
                                        <span className="text-xs text-zinc-600 italic">Prediction pending...</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Calendar;

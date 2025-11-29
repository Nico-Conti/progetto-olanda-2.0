import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Flame, ArrowRight, Activity, Calendar } from 'lucide-react';

const HotMatches = () => {
    const [hotMatches, setHotMatches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHotMatches = async () => {
            try {
                const { data, error } = await supabase
                    .from('fixtures')
                    .select('*')
                    .eq('is_hot_match', true)
                    .eq('status', 'SCHEDULED')
                    .order('match_date', { ascending: true });

                if (error) throw error;
                setHotMatches(data || []);
            } catch (error) {
                console.error('Error fetching hot matches:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchHotMatches();
    }, []);

    if (loading) {
        return <div className="text-white text-center py-10">Loading hot matches...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="glass-panel p-6 rounded-xl border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="relative z-10 flex items-center gap-4 mb-6">
                    <div className="bg-red-500/20 p-3 rounded-lg border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                        <Flame className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Hot Matches</h2>
                        <p className="text-zinc-400 text-sm">High probability opportunities identified by the AI model</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {hotMatches.length > 0 ? (
                        hotMatches.map((match) => (
                            <div key={match.id} className="bg-zinc-900/50 border border-white/5 rounded-xl p-5 hover:bg-zinc-900/80 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(match.match_date).toLocaleDateString()}
                                    </div>
                                    <div className="bg-red-500/10 text-red-400 text-xs font-bold px-2 py-1 rounded border border-red-500/20">
                                        {match.prediction_prob_over_9_5 ? `${Math.round(match.prediction_prob_over_9_5 * 100)}% Prob.` : 'Hot Pick'}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-center flex-1">
                                        <div className="text-white font-bold text-lg truncate">{match.home_team}</div>
                                    </div>
                                    <div className="text-zinc-600 font-black px-3">VS</div>
                                    <div className="text-center flex-1">
                                        <div className="text-white font-bold text-lg truncate">{match.away_team}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-400">Exp. Total Corners</span>
                                        <span className="text-white font-mono font-bold">{match.prediction_total_corners}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-400">Reason</span>
                                        <span className="text-emerald-400 font-medium text-xs">{match.hot_match_reason}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-10 text-zinc-500 italic">
                            No hot matches found at the moment. Check back later!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HotMatches;

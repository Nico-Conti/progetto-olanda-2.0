import React from 'react';
import { Activity, ChevronDown, Info } from 'lucide-react';
import { TEAM_LOGOS } from '../../data/teamLogos';

const AnalysisSection = ({ match, onClose }) => {
    if (!match) return null;

    const homeTeam = match.location === 'Home' ? match.team : match.opponent;
    const awayTeam = match.location === 'Home' ? match.opponent : match.team;

    return (
        <div className="glass-panel rounded-xl border border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <div>
                        <h3 className="font-bold text-white text-lg">Match Analysis Detail</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-zinc-400 uppercase font-bold">MD {match.giornata} •</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold ${homeTeam === match.team ? 'text-white' : 'text-zinc-400'}`}>{homeTeam}</span>
                                <img src={TEAM_LOGOS[homeTeam]} alt={homeTeam} className="w-4 h-4 object-contain" />
                                <span className="text-xs text-zinc-500 font-bold">vs</span>
                                <img src={TEAM_LOGOS[awayTeam]} alt={awayTeam} className="w-4 h-4 object-contain" />
                                <span className={`text-xs font-bold ${awayTeam === match.team ? 'text-white' : 'text-zinc-400'}`}>{awayTeam}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                >
                    <ChevronDown className="w-5 h-5" />
                </button>
            </div>

            <div className="p-6">
                <div className="prose prose-invert prose-sm max-w-none">
                    <h4 className="text-white font-bold uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-400" />
                        Detailed Report
                    </h4>
                    <div className="text-zinc-300 space-y-4 leading-relaxed whitespace-pre-line">
                        {match.detailed_summary || "No detailed analysis available."}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalysisSection;

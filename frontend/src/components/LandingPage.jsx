import React from 'react';
import { Trophy, ArrowRight } from 'lucide-react';

const LandingPage = ({ availableLeagues, leaguesData, onSelectLeague }) => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 z-0"></div>
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none"></div>

            <div className="relative z-10 max-w-2xl w-full text-center space-y-12 animate-in fade-in zoom-in duration-700">

                {/* Header */}
                <div className="space-y-4">
                    <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-sm mb-4">
                        <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white">
                        Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                    </h1>
                    <p className="text-zinc-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                        Advanced football analytics. <br />
                        <span className="text-zinc-500">Select a league to begin male pisello...</span>
                    </p>
                </div>

                {/* League Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg mx-auto">
                    {availableLeagues.map((leagueName) => {
                        const leagueObj = leaguesData?.find(l => l.name === leagueName);
                        const logoUrl = leagueObj?.logo_url;

                        return (
                            <button
                                key={leagueName}
                                onClick={() => onSelectLeague(leagueName)}
                                className="group relative flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:-translate-y-1"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center border border-zinc-200 group-hover:border-emerald-500/30 transition-colors overflow-hidden">
                                        {logoUrl ? (
                                            <img src={logoUrl} alt={leagueName} className="w-8 h-8 object-contain" />
                                        ) : (
                                            <Trophy className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors capitalize">
                                            {leagueName}
                                        </h3>
                                        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">View Stats</span>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transform group-hover:translate-x-1 transition-all" />
                            </button>
                        );
                    })}

                    {availableLeagues.length === 0 && (
                        <div className="col-span-full p-8 text-zinc-500 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                            No leagues found. Please run the scraper.
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-8 text-zinc-600 text-xs font-mono uppercase tracking-widest opacity-50">
                Powered by Gemini AI & Supabase
            </div>
        </div>
    );
};

export default LandingPage;

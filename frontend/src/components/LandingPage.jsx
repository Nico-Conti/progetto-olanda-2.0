import React from 'react';
import { Flame, Trophy, ArrowRight, Zap } from 'lucide-react';
import ToggleSwitch from './ui/ToggleSwitch';

const LandingPage = ({ availableLeagues, leaguesData, onSelectLeague, isAnimationEnabled, onToggleAnimation, onOpenTopCorners, onOpenHighestWinningFactor }) => {
    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden">
            {/* Animation Toggle */}
            <div className="absolute top-6 right-6 z-50">
                <ToggleSwitch
                    isOn={isAnimationEnabled}
                    onToggle={onToggleAnimation}
                    label="Animations"
                />
            </div>
            {/* Background Effects */}

            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none"></div>

            <div className="flex-grow flex flex-col items-center justify-center p-4 w-full relative z-10">
                <div className="max-w-4xl w-full text-center space-y-12">

                    {/* Header */}
                    <div className="space-y-4 animate-waterfall">
                        <div className="inline-flex items-center justify-center ">
                            <img src="/logo.png" alt="Logo" className="w-32 h-32 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white">
                            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                        </h1>
                        <p className="text-zinc-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                            Advanced football analytics. <br />
                            <span className="text-zinc-500">Select a league to begin male pisello...</span>
                        </p>
                    </div>

                    {/* League Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mx-auto">
                        {availableLeagues.map((leagueName, index) => {
                            const leagueObj = leaguesData?.find(l => l.name === leagueName);
                            const logoUrl = leagueObj?.logo_url;

                            return (
                                <button
                                    key={leagueName}
                                    onClick={() => onSelectLeague(leagueName)}
                                    style={{ animationDelay: `${(index + 1) * 100}ms` }}
                                    className="group relative flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:-translate-y-1 animate-waterfall"
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
                            <div className="col-span-full p-8 text-zinc-500 bg-white/5 rounded-2xl border border-white/5 border-dashed animate-waterfall">
                                No leagues found. Activate Backend server.
                            </div>
                        )}
                    </div>

                    {/* Feature Buttons */}
                    <div
                        className="w-full max-w-4xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-waterfall"
                        style={{ animationDelay: `${(availableLeagues.length + 1) * 100}ms` }}
                    >
                        <button
                            onClick={onOpenTopCorners}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:border-orange-500/50 transition-colors">
                                    <Flame className="w-6 h-6 text-orange-500 group-hover:text-orange-400 transition-colors" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-orange-300 transition-colors">
                                        Hot Matches
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">Best Matchups</span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-orange-400 transform group-hover:translate-x-1 transition-all" />
                        </button>

                        <button
                            onClick={onOpenHighestWinningFactor}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-purple-500/50 rounded-2xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:border-purple-500/50 transition-colors">
                                    <Zap className="w-6 h-6 text-purple-500 group-hover:text-purple-400 transition-colors" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                                        Winning Factor
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">Bet Analysis</span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-purple-400 transform group-hover:translate-x-1 transition-all" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div
                className="py-8 text-center text-zinc-600 text-xs font-mono uppercase tracking-widest opacity-100 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ animationDelay: `${(availableLeagues.length + 2) * 100}ms`, animationFillMode: 'backwards' }}
            >
                Powered by NickyBoy, Ciusbe, MatteBucco, Baggianis, Giagulosky, Gabri Robot drago del k-means
            </div>
        </div>
    );
};

export default LandingPage;

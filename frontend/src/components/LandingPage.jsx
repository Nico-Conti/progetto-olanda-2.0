import React from 'react';
import { Flame, Trophy, ArrowRight, Zap, X, List, ChevronLeft, ChevronRight } from 'lucide-react';
import ToggleSwitch from './ui/ToggleSwitch';

const LandingPage = ({ availableLeagues, leaguesData, onSelectLeague, isAnimationEnabled, onToggleAnimation, onOpenTopCorners, onOpenHighestWinningFactor }) => {
    const [isLeagueModalOpen, setIsLeagueModalOpen] = React.useState(false);

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

                    {/* League Selection - Horizontal Scroll with Controls */}
                    <div className="w-full max-w-5xl mx-auto relative group/scroll px-4 md:px-0">
                        <div className="flex items-center gap-4">

                            {/* Left Scroll Button */}
                            <button
                                onClick={() => {
                                    const container = document.getElementById('league-scroll-container');
                                    if (container) container.scrollBy({ left: -300, behavior: 'smooth' });
                                }}
                                className="hidden md:flex p-3 rounded-full bg-zinc-900/80 border border-white/10 hover:bg-zinc-800 hover:border-emerald-500/50 text-zinc-400 hover:text-emerald-400 transition-all hover:scale-110 z-20"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>

                            {/* Scrollable Container */}
                            <div
                                id="league-scroll-container"
                                className="flex-grow overflow-x-auto flex gap-3 pb-4 pt-2 px-1 snap-x scrollbar-hide mask-linear-fade"
                            >
                                {availableLeagues.map((leagueName, index) => {
                                    const leagueObj = leaguesData?.find(l => l.name === leagueName);
                                    const logoUrl = leagueObj?.logo_url;
                                    const countryFlag = leagueObj?.country_flag;

                                    return (
                                        <button
                                            key={leagueName}
                                            onClick={() => onSelectLeague(leagueName)}
                                            style={{ animationDelay: `${(index + 1) * 100}ms` }}
                                            className="flex-shrink-0 w-48 snap-center group relative flex flex-col items-center justify-center p-4 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-emerald-500/50 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:-translate-y-1 animate-waterfall"
                                        >
                                            <div className="relative">
                                                <div className="w-12 h-12 mb-3 rounded-lg bg-white flex items-center justify-center border border-zinc-200 group-hover:border-emerald-500/30 transition-colors overflow-hidden">
                                                    {logoUrl ? (
                                                        <img src={logoUrl} alt={leagueName} className="w-8 h-8 object-contain" />
                                                    ) : (
                                                        <Trophy className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                                                    )}
                                                </div>
                                                {countryFlag && (
                                                    <img
                                                        src={countryFlag}
                                                        alt="Flag"
                                                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-zinc-900 object-cover shadow-sm"
                                                    />
                                                )}
                                            </div>
                                            <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors capitalize">
                                                {leagueName}
                                            </h3>
                                            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400 mt-1">View Stats</span>
                                        </button>
                                    );
                                })}

                                {availableLeagues.length === 0 && (
                                    <div className="w-full p-8 text-zinc-500 bg-white/5 rounded-2xl border border-white/5 border-dashed animate-waterfall">
                                        No leagues found. Activate Backend server.
                                    </div>
                                )}
                            </div>

                            {/* Right Scroll Button */}
                            <button
                                onClick={() => {
                                    const container = document.getElementById('league-scroll-container');
                                    if (container) container.scrollBy({ left: 300, behavior: 'smooth' });
                                }}
                                className="hidden md:flex p-3 rounded-full bg-zinc-900/80 border border-white/10 hover:bg-zinc-800 hover:border-emerald-500/50 text-zinc-400 hover:text-emerald-400 transition-all hover:scale-110 z-20"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>

                            {/* All Button - Fixed Outside */}
                            <div className="h-full flex items-center pl-2 border-l border-white/10">
                                <button
                                    onClick={() => setIsLeagueModalOpen(true)}
                                    className="flex flex-col items-center justify-center p-4 w-20 h-full bg-zinc-900/30 hover:bg-zinc-800/50 border border-white/5 hover:border-white/20 rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 animate-waterfall"
                                    style={{ animationDelay: `${(availableLeagues.length + 1) * 100}ms` }}
                                >
                                    <div className="w-10 h-10 mb-2 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
                                        <List className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                                    </div>
                                    <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-300">All</span>
                                </button>
                            </div>
                        </div>
                    </div>


                    {/* Feature Buttons */}
                    <div
                        className="w-full max-w-xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-2 gap-10 animate-waterfall"
                        style={{ animationDelay: `${(availableLeagues.length + 2) * 100}ms` }}
                    >
                        <button
                            onClick={onOpenTopCorners}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-white/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover-fire overflow-visible"
                        >
                            {/* Fire Effect */}
                            <div className="absolute inset-x-0 -top-10 bottom-0 pointer-events-none overflow-visible">
                                {[...Array(12)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="fire-particle w-8 h-8"
                                        style={{
                                            '--tx': `${(Math.random() - 0.5) * 100}px`,
                                            animationDelay: `${Math.random() * 0.5}s`,
                                            animationDuration: `${0.8 + Math.random() * 0.5}s`,
                                            left: `${30 + Math.random() * 40}%`
                                        }}
                                    />
                                ))}
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-orange-500/20 blur-[40px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
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
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-orange-400 transform group-hover:translate-x-1 transition-all relative z-10" />
                        </button>

                        <button
                            onClick={onOpenHighestWinningFactor}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-white/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover-lightning overflow-visible"
                        >
                            {/* Lightning Effect */}
                            <div className="absolute inset-x-0 -top-10 bottom-0 pointer-events-none overflow-visible">
                                {[...Array(12)].map((_, i) => (
                                    <svg
                                        key={i}
                                        className="lightning-bolt w-8 h-8 text-purple-400"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        style={{
                                            '--tx': `${(Math.random() - 0.5) * 150}px`,
                                            '--rot': `${(Math.random() - 0.5) * 60}deg`,
                                            animationDelay: `${Math.random() * 0.5}s`,
                                            animationDuration: `${0.8 + Math.random() * 0.5}s`,
                                            left: `${30 + Math.random() * 40}%`
                                        }}
                                    >
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                    </svg>
                                ))}
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-purple-500/20 blur-[40px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
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
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-purple-400 transform group-hover:translate-x-1 transition-all relative z-10" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div
                className="py-8 text-center text-zinc-600 text-xs font-mono uppercase tracking-widest opacity-100 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ animationDelay: `${(availableLeagues.length + 3) * 100}ms`, animationFillMode: 'backwards' }}
            >
                Powered by NickyBoy, Ciusbe, MatteBucco, Baggianis, Giagulosky, Gabri Robot drago del k-means
            </div>

            {/* League Selection Modal */}
            {isLeagueModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-white">Select League</h2>
                            <button
                                onClick={() => setIsLeagueModalOpen(false)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6 text-zinc-400 hover:text-white" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {availableLeagues.map((leagueName) => {
                                const leagueObj = leaguesData?.find(l => l.name === leagueName);
                                const logoUrl = leagueObj?.logo_url;
                                const countryFlag = leagueObj?.country_flag;
                                return (
                                    <button
                                        key={leagueName}
                                        onClick={() => {
                                            onSelectLeague(leagueName);
                                            setIsLeagueModalOpen(false);
                                        }}
                                        className="group relative flex flex-col items-center justify-center p-4 bg-zinc-800/50 hover:bg-zinc-700/80 border border-white/5 hover:border-emerald-500/50 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                                    >
                                        <div className="relative">
                                            <div className="w-12 h-12 mb-3 rounded-lg bg-white flex items-center justify-center border border-zinc-200 group-hover:border-emerald-500/30 transition-colors overflow-hidden">
                                                {logoUrl ? (
                                                    <img src={logoUrl} alt={leagueName} className="w-8 h-8 object-contain" />
                                                ) : (
                                                    <Trophy className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                                                )}
                                            </div>
                                            {countryFlag && (
                                                <img
                                                    src={countryFlag}
                                                    alt="Flag"
                                                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-zinc-800 object-cover shadow-sm"
                                                />
                                            )}
                                        </div>
                                        <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors capitalize text-center">
                                            {leagueName}
                                        </h3>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LandingPage;

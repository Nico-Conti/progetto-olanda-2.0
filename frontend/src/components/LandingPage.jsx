import React from 'react';
import { Flame, Trophy, ArrowRight, ArrowLeft, Zap, X, Globe, Shield } from 'lucide-react';
import ToggleSwitch from './ui/ToggleSwitch';

const PARTICLE_COUNT = 12;

/**
 * Randomised offsets/timings for the hover particle effects.
 *
 * Generated once per mount rather than inline in the JSX: calling Math.random()
 * during render reshuffles every particle on each re-render, which restarts the
 * CSS animations mid-flight.
 */
const makeParticles = (spread, withRotation) =>
    Array.from({ length: PARTICLE_COUNT }, () => ({
        tx: `${(Math.random() - 0.5) * spread}px`,
        rot: withRotation ? `${(Math.random() - 0.5) * 60}deg` : undefined,
        delay: `${Math.random() * 0.5}s`,
        duration: `${0.8 + Math.random() * 0.5}s`,
        left: `${30 + Math.random() * 40}%`,
    }));

const LandingPage = ({ availableLeagues, leaguesData, onSelectLeague, isAnimationEnabled, onToggleAnimation, onOpenTopCorners, onOpenHighestWinningFactor, onOpenSafestBets }) => {
    const [isLeagueModalOpen, setIsLeagueModalOpen] = React.useState(false);
    const [modalCountry, setModalCountry] = React.useState(null);
    const [fireParticles] = React.useState(() => makeParticles(100, false));
    const [lightningParticles] = React.useState(() => makeParticles(150, true));

    // Nations, each with the leagues we actually have data for. `League` rows
    // carry `country` and `tier`, so the drill-down needs no extra request.
    const nations = React.useMemo(() => {
        const groups = new Map();
        availableLeagues.forEach((leagueName) => {
            const league = leaguesData?.find(l => l.name === leagueName);
            const country = league?.country || 'Other';
            if (!groups.has(country)) groups.set(country, { flag: league?.country_flag, leagues: [] });
            groups.get(country).leagues.push({ name: leagueName, logoUrl: league?.logo_url, tier: league?.tier ?? 99 });
        });
        groups.forEach(g => g.leagues.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)));
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [availableLeagues, leaguesData]);

    const openNation = nations.find(([country]) => country === modalCountry);

    const closeModal = () => {
        setIsLeagueModalOpen(false);
        setModalCountry(null);
    };

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden pointer-events-none">
            {/* Animation Toggle */}
            <div className="absolute top-6 right-6 z-50 pointer-events-auto">
                <ToggleSwitch
                    isOn={isAnimationEnabled}
                    onToggle={onToggleAnimation}
                    label="Animations"
                />
            </div>
            {/* Background Effects */}

            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none"></div>

            <div className="flex-grow flex flex-col items-center justify-center p-4 w-full relative z-10 pointer-events-none">
                <div className="max-w-4xl w-full text-center space-y-12 pointer-events-none">

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
                    <div
                        className="w-full max-w-md mx-auto pointer-events-auto animate-waterfall"
                        style={{ animationDelay: '100ms' }}
                    >
                        <button
                            onClick={() => setIsLeagueModalOpen(true)}
                            disabled={availableLeagues.length === 0}
                            className="group w-full flex items-center justify-between gap-4 p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:border-emerald-500/50 transition-colors">
                                    <Globe className="w-6 h-6 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                                        Select Your League
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">
                                        {availableLeagues.length > 0
                                            ? `${availableLeagues.length} leagues \u00b7 ${nations.length} nations`
                                            : 'No leagues found - activate backend'}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transform group-hover:translate-x-1 transition-all" />
                        </button>
                    </div>


                    {/* Feature Buttons */}
                    <div
                        className="w-full max-w-5xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 animate-waterfall pointer-events-auto"
                        style={{ animationDelay: `${(availableLeagues.length + 2) * 100}ms` }}
                    >
                        <button
                            onClick={onOpenTopCorners}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-white/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover-fire overflow-visible"
                        >
                            {/* Fire Effect */}
                            <div className="absolute inset-x-0 -top-10 bottom-0 pointer-events-none overflow-visible">
                                {fireParticles.map((p, i) => (
                                    <div
                                        key={i}
                                        className="fire-particle w-8 h-8"
                                        style={{
                                            '--tx': p.tx,
                                            animationDelay: p.delay,
                                            animationDuration: p.duration,
                                            left: p.left
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
                                {lightningParticles.map((p, i) => (
                                    <svg
                                        key={i}
                                        className="lightning-bolt w-8 h-8 text-purple-400"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        style={{
                                            '--tx': p.tx,
                                            '--rot': p.rot,
                                            animationDelay: p.delay,
                                            animationDuration: p.duration,
                                            left: p.left
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

                        <button
                            onClick={onOpenSafestBets}
                            className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-white/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover-ice overflow-visible"
                        >
                            {/* Ice Effect */}
                            <div className="absolute inset-x-0 -top-10 bottom-0 pointer-events-none overflow-visible">
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-cyan-500/20 blur-[40px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 group-hover:border-cyan-500/50 transition-colors">
                                    <Shield className="w-6 h-6 text-cyan-500 group-hover:text-cyan-400 transition-colors" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                                        Safest Bets
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">Low Variance</span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-cyan-400 transform group-hover:translate-x-1 transition-all relative z-10" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div
                className="py-8 text-center text-zinc-600 text-base uppercase tracking-widest opacity-100 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ fontFamily: "'Silkscreen', monospace", animationDelay: `${(availableLeagues.length + 3) * 100}ms`, animationFillMode: 'backwards' }}
            >
                Powered by NickyBoy, Ciusbe, MatteBucco, Baggianis, Giagulosky, La BuccoStrega.
            </div>

            {/* League Selection Modal - nation first, then its leagues */}
            {isLeagueModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                    <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {openNation && (
                                    <button
                                        onClick={() => setModalCountry(null)}
                                        className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
                                        aria-label="Back to nations"
                                    >
                                        <ArrowLeft className="w-5 h-5 text-zinc-400 hover:text-white" />
                                    </button>
                                )}
                                <h2 className="text-2xl font-bold text-white capitalize">
                                    {openNation ? openNation[0] : 'Select Nation'}
                                </h2>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-6 h-6 text-zinc-400 hover:text-white" />
                            </button>
                        </div>
                        <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {openNation
                                ? openNation[1].leagues.map(({ name, logoUrl }) => (
                                    <button
                                        key={name}
                                        onClick={() => {
                                            onSelectLeague(name);
                                            closeModal();
                                        }}
                                        className="group relative flex flex-col items-center justify-center p-4 bg-zinc-800/50 hover:bg-zinc-700/80 border border-white/5 hover:border-emerald-500/50 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                                    >
                                        <div className="w-12 h-12 mb-3 rounded-lg bg-white flex items-center justify-center border border-zinc-200 group-hover:border-emerald-500/30 transition-colors overflow-hidden">
                                            {logoUrl ? (
                                                <img src={logoUrl} alt={name} className="w-8 h-8 object-contain" />
                                            ) : (
                                                <Trophy className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                                            )}
                                        </div>
                                        <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors capitalize text-center">
                                            {name}
                                        </h3>
                                    </button>
                                ))
                                : nations.map(([country, { flag, leagues }]) => (
                                    <button
                                        key={country}
                                        onClick={() => setModalCountry(country)}
                                        className="group relative flex flex-col items-center justify-center p-4 bg-zinc-800/50 hover:bg-zinc-700/80 border border-white/5 hover:border-emerald-500/50 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                                    >
                                        <div className="w-12 h-12 mb-3 rounded-full bg-white flex items-center justify-center border border-zinc-200 group-hover:border-emerald-500/30 transition-colors overflow-hidden">
                                            {flag ? (
                                                <img src={flag} alt={country} className="w-full h-full object-cover" />
                                            ) : (
                                                <Globe className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                                            )}
                                        </div>
                                        <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors capitalize text-center">
                                            {country}
                                        </h3>
                                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-1">
                                            {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
                                        </span>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default LandingPage;

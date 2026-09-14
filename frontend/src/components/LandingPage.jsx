import React from 'react';
import { Flame, ArrowRight, ArrowLeft, Zap, X, Globe, Shield } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import ElectricBorder from './originkit/ElectricBorder';
import TrophyIntro, { TrophyIcon } from './TrophyIntro';
import { confettiBurst, flagWipe, flagColors, flagStripes, flagRing, motionAllowed } from '../utils/leaguePickerFx';

const SUBTITLE = 'Advanced football analytics.';
const CREDITS = 'Powered by NickyBoy, Ciusbe, MatteBucco, Baggianis, Giagulosky, La BuccoStrega, Claude.';

/**
 * Randomised placement and timing for the hover particles, drawn once at load
 * rather than during render: re-randomising on every render would restart the
 * CSS animations mid-flight. Delays are negative so a stream is already running
 * when the hover starts.
 */
const particles = (count, { left, dur, sway }) => Array.from({ length: count }, () => {
    const d = dur[0] + Math.random() * (dur[1] - dur[0]);
    return {
        left: `${left[0] + Math.random() * (left[1] - left[0])}%`,
        '--dur': `${d}s`,
        '--delay': `${-Math.random() * d}s`,
        '--sway': `${(Math.random() - 0.5) * 2 * sway}px`,
    };
});
const EMBERS = particles(16, { left: [12, 88], dur: [1.1, 1.9], sway: 14 })
    .map(style => ({ ...style, width: 3 + Math.random() * 3, height: 3 + Math.random() * 3 }));
const SPARKLES = particles(10, { left: [4, 94], dur: [2.6, 4.2], sway: 12 })
    .map(style => ({ ...style, top: `${-10 + Math.random() * 40}%` }));

/** The effect layer behind a feature card's content; see "Landing feature-card hover effects" in index.css. */
const HoverFx = ({ kind }) => {
    if (kind === 'fire') return (
        <div className="fx absolute inset-x-0 -top-16 bottom-0 pointer-events-none" aria-hidden="true">
            <div className="fx-heat" />
            {EMBERS.map((style, i) => <span key={i} className="fx-ember" style={style} />)}
        </div>
    );
    if (kind === 'frost') return (
        <div className="fx absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute inset-0 overflow-hidden rounded-2xl"><div className="fx-glint" /></div>
            {SPARKLES.map((style, i) => <span key={i} className="sparkle fx-sparkle" style={style} />)}
        </div>
    );
    return null;
};

// Class strings written out in full per card: Tailwind only generates classes
// it can read literally in the source.
const FEATURES = [
    {
        id: 'hot', label: 'Hot Matches', caption: 'Best Matchups', Icon: Flame, fx: 'fire',
        card: 'hover-fire', glow: 'bg-orange-500/20',
        iconBox: 'bg-orange-500/10 border-orange-500/20 group-hover:border-orange-500/50',
        icon: 'text-orange-500 group-hover:text-orange-400', iconFx: 'fx-flame',
        title: 'group-hover:text-orange-300', arrow: 'group-hover:text-orange-400',
    },
    {
        id: 'factor', label: 'Winning Factor', caption: 'Bet Analysis', Icon: Zap, fx: 'lightning',
        card: 'hover-lightning', glow: 'bg-purple-500/20',
        iconBox: 'bg-purple-500/10 border-purple-500/20 group-hover:border-purple-500/50',
        icon: 'text-purple-500 group-hover:text-purple-400', iconFx: 'fx-zap',
        title: 'group-hover:text-purple-300', arrow: 'group-hover:text-purple-400',
    },
    {
        id: 'safe', label: 'Safest Bets', caption: 'Low Variance', Icon: Shield, fx: 'frost',
        card: 'hover-ice', glow: 'bg-cyan-500/20',
        iconBox: 'bg-cyan-500/10 border-cyan-500/20 group-hover:border-cyan-500/50',
        icon: 'text-cyan-500 group-hover:text-cyan-400',
        title: 'group-hover:text-cyan-300', arrow: 'group-hover:text-cyan-400',
    },
];

const FeatureCard = ({ feature, onClick }) => {
    const { Icon } = feature;
    // The electric border redraws a canvas every frame, so it only exists while
    // hovered (plus its fade-out); the CSS effects just pause instead.
    const [hovered, setHovered] = React.useState(false);
    const [reducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const electric = usePresence(!reducedMotion && feature.fx === 'lightning' && hovered, '--fx-fade-out');

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-white/10 rounded-2xl transition duration-300 hover:-translate-y-1 overflow-visible ${feature.card}`}
        >
            <HoverFx kind={feature.fx} />
            {electric && (
                <div className="fx absolute inset-0 pointer-events-none" aria-hidden="true">
                    <ElectricBorder
                        color="#e9d5ff"
                        bgColor="transparent"
                        glowColor="#a855f7"
                        glowIntensity={4}
                        chaos={1.6}
                        thickness={1.5}
                        speed={1.2}
                        borderRadius={16}
                    />
                </div>
            )}
            <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-32 blur-[40px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${feature.glow}`} />

            <div className="flex items-center gap-4 relative z-10">
                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center border transition-colors ${feature.iconBox}`}>
                    {feature.fx === 'frost' && (
                        <>
                            <span className="fx-shield-ring" />
                            <span className="fx-shield-ring" />
                        </>
                    )}
                    <Icon className={`w-6 h-6 transition-colors ${feature.icon} ${feature.iconFx ?? ''}`} />
                </div>
                <div className="text-left">
                    <h3 className={`text-lg font-bold text-white transition-colors ${feature.title}`}>
                        {feature.label}
                    </h3>
                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">{feature.caption}</span>
                </div>
            </div>
            <ArrowRight className={`w-5 h-5 text-zinc-600 transform group-hover:translate-x-1 transition relative z-10 ${feature.arrow}`} />
        </button>
    );
};

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** `text` with everything from `revealed` on swapped for random glyphs (spaces and punctuation kept). */
const scramble = (text, revealed) => [...text]
    .map((ch, i) => (i < revealed || !/[a-z0-9]/i.test(ch) ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
    .join('');

/**
 * Text that decodes from random glyphs, left to right. A small stand-in for
 * Originkit's pixel-led-display (paid) and scrambletext (53KB of source).
 */
const ScrambleText = ({ text, delay = 300, duration = 1500 }) => {
    const [reducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const animate = !reducedMotion;
    const [display, setDisplay] = React.useState(() => scramble(text, 0));

    React.useEffect(() => {
        if (!animate) return;
        const start = performance.now() + delay;
        const timer = setInterval(() => {
            const progress = (performance.now() - start) / duration;
            setDisplay(scramble(text, Math.floor(Math.max(0, progress) * text.length)));
            if (progress >= 1) clearInterval(timer);
        }, 50);
        return () => clearInterval(timer);
    }, [animate, text, delay, duration]);

    if (!animate) return text;
    return (
        <>
            <span aria-hidden="true">{display}</span>
            <span className="sr-only">{text}</span>
        </>
    );
};

const LandingPage = ({ availableLeagues, leaguesData, onSelectLeague, onOpenTopCorners, onOpenHighestWinningFactor, onOpenSafestBets }) => {
    const [isLeagueModalOpen, setIsLeagueModalOpen] = React.useState(false);
    const [modalCountry, setModalCountry] = React.useState(null);
    const [isTrophyShowing, setIsTrophyShowing] = React.useState(false);
    const panelRef = React.useRef(null);
    const featureClicks = { hot: onOpenTopCorners, factor: onOpenHighestWinningFactor, safe: onOpenSafestBets };

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

    const isModalMounted = usePresence(isLeagueModalOpen, '--modal-close-dur');


    // The nation is reset on open, not on close, so the list does not jump
    // back to nations while the closing modal is still fading out. Unless the
    // viewer prefers reduced motion, the trophy opens the picker (TrophyIntro's onReveal).
    const openModal = () => {
        setModalCountry(null);
        if (motionAllowed()) setIsTrophyShowing(true);
        else setIsLeagueModalOpen(true);
    };
    const closeModal = () => setIsLeagueModalOpen(false);

    // Confetti in the flag's colours out of the clicked flag, and the colours
    // sweeping across the picker while it switches to that nation's leagues.
    const pickNation = (country, event) => {
        if (!motionAllowed()) {
            setModalCountry(country);
            return;
        }
        const stripes = flagColors(country);
        confettiBurst(event.currentTarget.firstElementChild.getBoundingClientRect(), stripes);
        flagWipe(panelRef.current, stripes, () => setModalCountry(country));
    };

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden pointer-events-none">
            {/* Background Effects */}

            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none"></div>

            <div className="flex-grow flex flex-col items-center justify-center p-4 w-full relative z-10 pointer-events-none">
                <div className="max-w-4xl w-full text-center space-y-12 pointer-events-none">

                    {/* Header */}
                    <div className="space-y-4 animate-waterfall">
                        <div className="inline-flex items-center justify-center">
                            <img src="/logo.png" alt="Logo" className="w-32 h-32 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white">
                            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                        </h1>
                        <p className="text-zinc-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                            <span className="sr-only">{SUBTITLE}</span>
                            <span className="colour-sweep" aria-hidden="true">
                                {SUBTITLE.split('').map((char, i) => (
                                    <span key={i} style={{ '--i': i }}>{char}</span>
                                ))}
                            </span>
                            <br />
                            <span className="text-zinc-500">Select a league to begin male pisello...</span>
                        </p>
                    </div>

                    {/* League Selection */}
                    <div
                        className="w-full max-w-md mx-auto pointer-events-auto animate-waterfall"
                        style={{ animationDelay: '100ms' }}
                    >
                        <button
                            onClick={openModal}
                            disabled={availableLeagues.length === 0}
                            className="group w-full flex items-center justify-between gap-4 p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-amber-500/50 rounded-2xl transition duration-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/50 transition-colors">
                                    {/* The trophy the picker opens with; it redraws itself on hover. */}
                                    <TrophyIcon
                                        className="w-6 h-6 trophy-redraw"
                                        pathProps={{ pathLength: 1 }}
                                    />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors">
                                        Select Your League
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">
                                        {availableLeagues.length > 0
                                            ? `${availableLeagues.length} leagues \u00b7 ${nations.length} nations`
                                            : 'No leagues found - activate backend'}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-amber-400 transform group-hover:translate-x-1 transition" />
                        </button>
                    </div>


                    {/* Feature Buttons */}
                    <div
                        className="w-full max-w-5xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 animate-waterfall pointer-events-auto"
                        style={{ animationDelay: '200ms' }}
                    >
                        {FEATURES.map(feature => (
                            <FeatureCard
                                key={feature.id}
                                feature={feature}
                                onClick={featureClicks[feature.id]}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div
                className="py-8 text-center text-zinc-600 text-base uppercase tracking-widest opacity-100 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ fontFamily: "'Silkscreen', monospace", animationDelay: '300ms', animationFillMode: 'backwards' }}
            >
                <ScrambleText text={CREDITS} />
            </div>

            <TrophyIntro
                active={isTrophyShowing}
                onReveal={() => setIsLeagueModalOpen(true)}
                onDone={() => setIsTrophyShowing(false)}
            />

            {/* League Selection Modal - nation first, then its leagues */}
            {isModalMounted && (
                <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto transition-opacity starting:opacity-0 ${isLeagueModalOpen ? 'duration-250' : 'duration-150 opacity-0'}`}>
                    <div ref={panelRef} className={`t-modal ${isLeagueModalOpen ? 'is-open' : 'is-closing'} relative bg-zinc-900 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.1),transparent_60%)] border border-amber-500/25 rounded-3xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col shadow-[0_0_60px_rgba(245,158,11,0.12)]`}>
                        {/* The chosen nation's colours, drawn in along the top edge. */}
                        {openNation && (
                            <div
                                key={openNation[0]}
                                className="h-1 shrink-0 origin-left animate-[flag-bar_600ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
                                style={{ background: flagStripes(flagColors(openNation[0])) }}
                            />
                        )}
                        <div className="p-4 sm:p-6 border-b border-amber-500/15 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {openNation ? (
                                    <button
                                        onClick={() => setModalCountry(null)}
                                        className="p-2 -ml-2 hover:bg-amber-500/10 rounded-full transition-colors"
                                        aria-label="Back to nations"
                                    >
                                        <ArrowLeft className="w-5 h-5 text-zinc-400 hover:text-amber-300" />
                                    </button>
                                ) : (
                                    <TrophyIcon className="w-6 h-6 mr-1" aria-hidden="true" />
                                )}
                                <h2 className="text-2xl font-bold capitalize text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-400">
                                    {openNation ? openNation[0] : 'Select Nation'}
                                </h2>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-amber-500/10 rounded-full transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-6 h-6 text-zinc-400 hover:text-amber-300" />
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
                                        className="group relative flex flex-col items-center justify-center p-4 bg-amber-500/[0.04] hover:bg-amber-500/10 border border-amber-500/10 hover:border-amber-500/40 rounded-xl transition duration-200 hover:shadow-[0_8px_24px_rgba(245,158,11,0.12)] hover:-translate-y-1"
                                    >
                                        <div className="w-12 h-12 mb-3 rounded-lg bg-white flex items-center justify-center border border-amber-200/60 group-hover:border-amber-400 transition-colors overflow-hidden">
                                            {logoUrl ? (
                                                <img src={logoUrl} alt={name} className="w-8 h-8 object-contain" />
                                            ) : (
                                                <TrophyIcon className="w-6 h-6" aria-hidden="true" />
                                            )}
                                        </div>
                                        <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors capitalize text-center">
                                            {name}
                                        </h3>
                                    </button>
                                ))
                                : nations.map(([country, { flag, leagues }]) => (
                                    <button
                                        key={country}
                                        onClick={(event) => pickNation(country, event)}
                                        // The flag's colours, for the hover ring and bar (.flag-hover in index.css).
                                        style={{ '--flag-ring': flagRing(flagColors(country)), '--flag-stripes': flagStripes(flagColors(country)) }}
                                        className="group relative flex flex-col items-center justify-center p-4 bg-amber-500/[0.04] hover:bg-amber-500/10 border border-amber-500/10 hover:border-amber-500/40 rounded-xl transition duration-200 hover:shadow-[0_8px_24px_rgba(245,158,11,0.12)] hover:-translate-y-1 flag-hover"
                                    >
                                        <div className="relative mb-3">
                                            <span className="flag-ring" aria-hidden="true" />
                                            <div className="relative w-12 h-12 rounded-full bg-white flex items-center justify-center border border-amber-200/60 overflow-hidden">
                                                {flag ? (
                                                    <img src={flag} alt={country} className="w-full h-full object-cover" />
                                                ) : (
                                                    <Globe className="w-6 h-6 text-amber-500" />
                                                )}
                                            </div>
                                        </div>
                                        <span className="flag-bar" aria-hidden="true" />
                                        <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors capitalize text-center">
                                            {country}
                                        </h3>
                                        <span className="text-[10px] text-amber-200/45 font-medium uppercase tracking-wider mt-1">
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

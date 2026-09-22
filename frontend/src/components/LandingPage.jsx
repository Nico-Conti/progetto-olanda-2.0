import React from 'react';
import { Flame, ArrowRight, ArrowLeft, Zap, X, Globe, Activity, Star, Play, Ticket } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import { useAccount } from '../hooks/useAuth';
import { AccountButton } from './AccountModal';
import ElectricBorder from './originkit/ElectricBorder';
import GlowBorder from './originkit/GlowBorder';
import TrophyIntro, { TrophyIcon } from './TrophyIntro';
import Trailer from './Trailer';
import { confettiBurst, flagWipe, flagColors, flagStripes, motionAllowed } from '../utils/leaguePickerFx';
import { t, tk, countryName, getLanguage } from '../i18n';

const SUBTITLE = tk('Advanced football analytics.');
const CREDIT_NAMES = 'NickyBoy, Ciusbe, MatteBucco, Baggianis, Giagulosky, La BuccoStrega, Claude';

// What the site is, in prose. Deliberately independent of the API: the league
// picker and the feature cards say nothing at all until /leagues answers, and a
// cold Render instance answers nothing for ~42s - so a first visitor, and every
// crawler, met a page with no readable content on it. This is the part that is
// always here. Keep it free of counts that live in config.py; the picker already
// shows the league total from live data, and a second hardcoded one would drift.
const ABOUT_LEAD = tk('Expected corners, goals, cards and fouls for every upcoming fixture, built from years of results and set against the line the bookmaker is offering - then scored against what actually happened.');
const ABOUT_FACTS = [tk('Match data since 2014'), tk('Corners, goals, cards, fouls'), tk('Published backtest')];

// Who runs this and how to reach them. A site that asks for a password while
// saying nothing about who operates it is the shape of a phishing page, which
// is what a Safe Browsing reviewer is looking for; the second line also puts on
// the record that this is editorial, not a book taking money.
const CONTACT_EMAIL = 'info@progettoolanda.it';
const FOOTER_DISCLAIMER = tk('Statistics and models, published for information. No bets are taken or handled on this site.');
const FOOTER_PRIVACY = tk('An account stores your email, username, favourite leagues and saved slips. Never sold, never shared for advertising.');

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
// Odds deltas floating off the ticker card, rising and falling in equal measure.
const TICKS = particles(8, { left: [6, 90], dur: [1.8, 2.8], sway: 10 })
    .map((style, i) => {
        const up = i % 2 === 0;
        return {
            style: { ...style, bottom: `${10 + Math.random() * 50}%`, color: up ? '#34d399' : '#f87171' },
            text: `${up ? '+' : '−'}${(0.5 + Math.random() * 4).toFixed(1)}%`,
        };
    });
// A jagged price path across the card, in a 100x40 box.
const CHART_POINTS = '0,30 8,27 16,31 24,22 32,25 40,17 48,20 56,12 64,16 72,9 80,13 88,6 100,8';
// Gold dust rising off the league picker's trophy card.
const GOLD_DUST = particles(14, { left: [3, 97], dur: [2.2, 3.6], sway: 16 })
    .map(style => ({ ...style, bottom: `${6 + Math.random() * 40}%` }));
// Coins raining down behind the bonus card and the Bonus Planner header. Small,
// faint and slow at the back; larger, brighter and quicker at the front, for depth.
const COINS = particles(16, { left: [2, 98], dur: [2.4, 4.2], sway: 0 })
    .map(style => {
        const depth = Math.random();
        return {
            ...style,
            '--dur': `${4.4 - depth * 2}s`,
            '--s': (0.55 + depth * 0.55).toFixed(2),
            '--o': (0.18 + depth * 0.32).toFixed(2),
            '--dx': `${(Math.random() - 0.5) * 24}px`,
            '--spin': `${(Math.random() < 0.5 ? -1 : 1) * 720}deg`,
        };
    });

/** Gold coins falling through a card from a glowing slot on its top edge, over a fuchsia haze. Also the Bonus Planner header. */
export const CoinCascade = ({ className = '' }) => (
    <div className={`absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none ${className}`} aria-hidden="true">
        <div className="fx-coin-haze" />
        <div className="fx-coin-slot" />
        {COINS.map((style, i) => <span key={i} className="fx-coin" style={style}><i /></span>)}
    </div>
);

/** Embers rising off the bottom edge, over a heat glow. Also the Hot Matches header. */
export const EmberLayer = ({ className = '' }) => (
    <div className={`absolute inset-x-0 -top-16 bottom-0 pointer-events-none ${className}`} aria-hidden="true">
        <div className="fx-heat" />
        {EMBERS.map((style, i) => <span key={i} className="fx-ember" style={style} />)}
    </div>
);

/** The effect layer behind a feature card's content; see "Landing feature-card hover effects" in index.css. */
const HoverFx = ({ kind }) => {
    if (kind === 'fire') return <EmberLayer className="fx" />;
    if (kind === 'ticker') return (
        <div className="fx absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <svg className="fx-chart absolute inset-0 w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="fx-chart-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="rgb(52 211 153 / 0.22)" />
                            <stop offset="1" stopColor="rgb(52 211 153 / 0)" />
                        </linearGradient>
                    </defs>
                    <polygon points={`${CHART_POINTS} 100,40 0,40`} fill="url(#fx-chart-fill)" />
                    <polyline points={CHART_POINTS} fill="none" stroke="rgb(52 211 153 / 0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="fx-cursor" />
            </div>
            {TICKS.map(({ style, text }, i) => <span key={i} className="fx-tick" style={style}>{text}</span>)}
        </div>
    );
    if (kind === 'gold') return (
        <div className="fx absolute inset-0 rounded-[inherit] pointer-events-none" aria-hidden="true">
            <CoinCascade />
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <div className="fx-glint" style={{ '--glint': 'rgb(252 211 77 / 0.2)' }} />
            </div>
        </div>
    );
    return null;
};

// Class strings written out in full per card: Tailwind only generates classes
// it can read literally in the source.
const FEATURES = [
    {
        id: 'hot', label: tk('Hot Matches'), caption: tk('Best Matchups'), Icon: Flame, fx: 'fire',
        card: 'hover-fire', glow: 'bg-orange-500/20',
        iconBox: 'bg-orange-500/10 border-orange-500/20 group-hover:border-orange-500/50',
        icon: 'text-orange-500 group-hover:text-orange-400', iconFx: 'fx-flame',
        title: 'group-hover:text-orange-300', arrow: 'group-hover:text-orange-400',
    },
    {
        id: 'factor', label: tk('Winning Factor'), caption: tk('Bet Analysis'), Icon: Zap, fx: 'lightning',
        card: 'hover-lightning', glow: 'bg-purple-500/20',
        iconBox: 'bg-purple-500/10 border-purple-500/20 group-hover:border-purple-500/50',
        icon: 'text-purple-500 group-hover:text-purple-400', iconFx: 'fx-zap',
        title: 'group-hover:text-purple-300', arrow: 'group-hover:text-purple-400',
    },
    {
        id: 'moves', label: tk('Market Moves'), caption: tk('Closing Line Value'), Icon: Activity, fx: 'ticker',
        card: 'hover-ticker', glow: 'bg-emerald-500/20',
        iconBox: 'bg-emerald-500/10 border-emerald-500/20 group-hover:border-emerald-500/50',
        icon: 'text-emerald-500 group-hover:text-emerald-400', iconFx: 'fx-beat',
        title: 'group-hover:text-emerald-300', arrow: 'group-hover:text-emerald-400',
    },
    {
        id: 'bonus', label: tk('Bonus Planner'), caption: tk('Best Bonus Slips'), Icon: Ticket, fx: 'gold',
        card: 'hover-gold', glow: 'bg-amber-500/20',
        iconBox: 'bg-amber-500/10 border-amber-500/20 group-hover:border-amber-500/50',
        icon: 'text-amber-400 group-hover:text-amber-300', iconFx: 'fx-ticket',
        title: 'fx-title-flow', arrow: 'group-hover:text-amber-400',
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
                    <Icon className={`w-6 h-6 transition-colors ${feature.icon} ${feature.iconFx ?? ''}`} />
                </div>
                <div className="text-left">
                    <h3 className={`text-lg font-bold text-white transition-colors ${feature.title}`}>
                        {t(feature.label)}
                    </h3>
                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">{t(feature.caption)}</span>
                </div>
            </div>
            <ArrowRight className={`w-5 h-5 text-zinc-600 transform group-hover:translate-x-1 transition relative z-10 ${feature.arrow}`} />
        </button>
    );
};

const POSTER = '/trailer/poster.jpg';

/**
 * The trailer, as a thumbnail in the landing page's top-left corner: the
 * video's own cover at 16:9, a frosted play button, its length, and a label.
 * On hover it lifts, the cover eases in, a glint crosses it and the play button
 * lights up. On a phone it shrinks and drops the label, clear of the hero logo.
 */
const TrailerCard = ({ onClick }) => (
    <button
        onClick={onClick}
        aria-label={t('Watch the presentation')}
        className="group flex flex-col items-start gap-1.5 rounded-xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
    >
        <span className="relative block w-20 sm:w-32 md:w-40 aspect-video rounded-xl overflow-hidden border border-white/15 bg-zinc-900 shadow-lg shadow-black/40 transition duration-300 group-hover:border-cyan-400/60 group-hover:shadow-cyan-500/20 group-focus-visible:ring-2 group-focus-visible:ring-cyan-400">
            <img src={POSTER} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 transition duration-500 group-hover:opacity-100 group-hover:scale-105" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <span className="trailer-glint absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent" aria-hidden="true" />
            <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/30 transition duration-300 group-hover:bg-cyan-400/90 group-hover:border-cyan-200 group-hover:scale-110">
                    <Play className="w-4 h-4 ml-0.5 fill-white text-white group-hover:fill-zinc-950 group-hover:text-zinc-950 transition-colors" />
                </span>
            </span>
            <span className="hidden sm:block absolute bottom-1 right-1 px-1.5 py-px rounded bg-black/70 text-[10px] font-bold tabular-nums text-white">0:24</span>
        </span>
        <span className="hidden sm:block pl-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors group-hover:text-cyan-300">
            {t('Watch the presentation')}
        </span>
    </button>
);

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

const LandingPage = ({ availableLeagues, leaguesData, loadError, onRetry, onSelectLeague, onOpenTopCorners, onOpenHighestWinningFactor, onOpenMarketMoves, onOpenBonusPlanner }) => {
    // `loadError` is the MATCH fetch failing, and this page no longer needs it -
    // the picker fills from the League table. Offering a retry while holding a
    // perfectly good list of leagues is what Google's renderer screenshotted on
    // 2026-09-18: it got the shell, did not finish the 5.5MB request, and the
    // page reported failure over a picker it could have used. The error belongs
    // here only when there is nothing to offer.
    const stuck = loadError && availableLeagues.length === 0;
    const [isLeagueModalOpen, setIsLeagueModalOpen] = React.useState(false);
    const [modalCountry, setModalCountry] = React.useState(null);
    const [isTrophyShowing, setIsTrophyShowing] = React.useState(false);
    const panelRef = React.useRef(null);
    const featureClicks = { hot: onOpenTopCorners, factor: onOpenHighestWinningFactor, moves: onOpenMarketMoves, bonus: onOpenBonusPlanner };
    const [trailerOpen, setTrailerOpen] = React.useState(false);
    // The signed-in user's favourite leagues, as one-click shortcuts under the picker.
    const { user } = useAccount();
    const favourites = (user?.user_metadata?.favourite_leagues ?? []).filter(l => availableLeagues.includes(l));

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

    // Like the electric border on Winning Factor, the league button's golden
    // edge redraws every frame, so it only exists while hovered.
    const [leagueHover, setLeagueHover] = React.useState(false);
    const leagueGlow = usePresence(motionAllowed() && leagueHover, '--fx-fade-out');


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

            <div className="absolute top-6 left-6 z-20 pointer-events-auto">
                <TrailerCard onClick={() => setTrailerOpen(true)} />
            </div>
            <Trailer open={trailerOpen} onClose={() => setTrailerOpen(false)} />
            <div className="absolute top-4 right-4 z-20 pointer-events-auto">
                <AccountButton />
            </div>

            <div className="flex-grow flex flex-col items-center justify-center p-4 w-full relative z-10 pointer-events-none">
                <div className="max-w-4xl w-full text-center space-y-6 pointer-events-none">

                    {/* Header */}
                    <div className="space-y-3 animate-waterfall">
                        {/* The crest is sized by VIEWPORT HEIGHT, not width. The page
                            is meant to fit one screen, and the content floor is 779px;
                            a fixed w-32 costs 32px more than that and puts a 1440x780
                            laptop back into scrolling. Above 820px there is slack for
                            it - which is the gap that otherwise opens between the
                            description and the footer. */}
                        <div className="inline-flex items-center justify-center">
                            <img
                                src="/logo.png"
                                alt="Logo"
                                className="w-24 h-24 [@media(min-height:820px)]:w-32 [@media(min-height:820px)]:h-32 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                            />
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white">
                            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                        </h1>
                        <p className="text-zinc-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                            <span className="sr-only">{t(SUBTITLE)}</span>
                            <span className="colour-sweep" aria-hidden="true">
                                {t(SUBTITLE).split('').map((char, i) => (
                                    <span key={i} style={{ '--i': i }}>{char}</span>
                                ))}
                            </span>
                        </p>
                    </div>

                    {/* See ABOUT_LEAD. Typographic rather than boxed - a hairline,
                        two paragraphs falling away in contrast, then the facts in
                        small caps - so it reads as a standfirst introducing the
                        cards and not as another panel competing with them. */}
                    <div className="max-w-2xl mx-auto animate-waterfall" style={{ animationDelay: '100ms' }}>
                        <div className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" aria-hidden="true" />
                        <p className="mt-3 text-zinc-400 text-sm md:text-base leading-relaxed">
                            {t(ABOUT_LEAD)}
                        </p>
                        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                            {/* The separator TRAILS its item rather than leading the
                                next one: the row wraps to three lines at 390px, and a
                                leading slash would start each of them. */}
                            {ABOUT_FACTS.map((fact, i) => (
                                <li key={fact} className="flex items-center gap-3">
                                    {t(fact)}
                                    {i < ABOUT_FACTS.length - 1 && <span aria-hidden="true" className="text-zinc-700">/</span>}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* League Selection */}
                    <div
                        className="w-full max-w-md mx-auto pointer-events-auto animate-waterfall"
                        style={{ animationDelay: '200ms' }}
                    >
                        <button
                            // `loading` is handled upstream (App renders its own
                            // loader), so reaching here with nothing means the fetch
                            // FAILED - which is what a cold Render instance does to a
                            // visitor, and to a crawler that will not wait out a 42s
                            // start. The button becomes the retry rather than sitting
                            // disabled beside an error nobody can act on.
                            onClick={stuck ? onRetry : openModal}
                            onMouseEnter={() => setLeagueHover(true)}
                            onMouseLeave={() => setLeagueHover(false)}
                            disabled={availableLeagues.length === 0 && !stuck}
                            className="group relative w-full flex items-center justify-between gap-4 p-6 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 hover:border-amber-500/50 rounded-2xl transition duration-300 hover:shadow-[0_0_28px_rgba(245,158,11,0.2)] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                            {/* A champion's glory, the gold counterpart of the fire,
                                lightning and ticker cards below: rays turn behind the
                                trophy, gold dust rises, a light sweeps the card and a
                                golden edge runs round it. See "League picker hover"
                                in index.css. */}
                            {availableLeagues.length > 0 && (
                                <>
                                    <div className="fx absolute inset-x-0 -top-16 bottom-0 pointer-events-none" aria-hidden="true">
                                        {GOLD_DUST.map((style, i) => <span key={i} className="sparkle fx-dust" style={style} />)}
                                    </div>
                                    {/* Clipped to the card: light glowing from within it. */}
                                    <div className="fx absolute inset-0 overflow-hidden rounded-2xl pointer-events-none" aria-hidden="true">
                                        <div className="fx-rays absolute left-12 top-1/2 w-72 h-72 -translate-x-1/2 -translate-y-1/2" />
                                        <div className="fx-glint" style={{ '--glint': 'rgb(253 230 138 / 0.2)' }} />
                                    </div>
                                    {leagueGlow && (
                                        <div className="fx absolute inset-0 pointer-events-none" aria-hidden="true">
                                            <GlowBorder
                                                glowColor="#fcd34d"
                                                tailColor="rgba(251, 191, 36, 0.45)"
                                                baseColor="rgba(255, 255, 255, 0)"
                                                borderWidth={1.5}
                                                speed={5}
                                                style={{ borderRadius: 16 }}
                                            />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 blur-[40px] rounded-full bg-amber-500/25 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" aria-hidden="true" />
                                </>
                            )}

                            <div className="relative z-10 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/60 group-hover:bg-amber-500/15 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.35)] transition duration-300">
                                    {/* The trophy the picker opens with; it redraws itself
                                        on hover and is lifted like a cup. */}
                                    <TrophyIcon
                                        className="w-6 h-6 trophy-redraw fx-cup"
                                        pathProps={{ pathLength: 1 }}
                                    />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white fx-gold-text">
                                        {stuck ? t('Try again') : t('Select Your League')}
                                    </h3>
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider group-hover:text-zinc-400">
                                        {stuck
                                            ? t('Could not load the data')
                                            : availableLeagues.length > 0
                                                ? t('{leagues} leagues · {nations} nations', { leagues: availableLeagues.length, nations: nations.length })
                                                : t('No leagues available')}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight className="relative z-10 w-5 h-5 text-zinc-600 group-hover:text-amber-400 transform group-hover:translate-x-1 transition" />
                        </button>

                        {favourites.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2 mt-3">
                                {favourites.map(name => {
                                    const logo = leaguesData?.find(l => l.name === name)?.logo_url;
                                    return (
                                        <button
                                            key={name}
                                            onClick={() => onSelectLeague(name)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/60 border border-amber-500/20 hover:border-amber-500/50 text-xs font-semibold text-zinc-300 hover:text-amber-300 transition"
                                        >
                                            {logo
                                                ? <img src={logo} alt="" className="w-4 h-4 object-contain bg-white rounded-sm" />
                                                : <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                                            {name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Feature Buttons */}
                    <div
                        className="w-full max-w-5xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 animate-waterfall pointer-events-auto"
                        style={{ animationDelay: '300ms' }}
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
                className="py-4 px-4 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
                style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}
            >
                <div
                    className="text-center text-zinc-600 text-base uppercase tracking-widest"
                    style={{ fontFamily: "'Silkscreen', monospace" }}
                >
                    <ScrambleText text={t('Powered by {names}.', { names: CREDIT_NAMES })} />
                </div>

                {/* See FOOTER_DISCLAIMER. Deliberately NOT in Silkscreen: the credits
                    are decoration and this is meant to be read. pointer-events-auto is
                    required - the page root turns them off and the mailto would
                    inherit that, leaving a link nothing can click. */}
                <div className="pointer-events-auto mx-auto mt-3 max-w-2xl space-y-1.5 text-center text-xs leading-relaxed text-zinc-600">
                    <p>
                        <span className="text-zinc-500">Progetto Olanda 2.0</span>
                        <span aria-hidden="true" className="mx-2 text-zinc-700">/</span>
                        <a
                            href={`mailto:${CONTACT_EMAIL}`}
                            className="text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-400 hover:decoration-emerald-400/60"
                        >
                            {CONTACT_EMAIL}
                        </a>
                        <span aria-hidden="true" className="mx-2 text-zinc-700">/</span>
                        {/* A real page, not a modal or a view: it has to be linkable,
                            crawlable, and readable with the API asleep. Same line as
                            the address, so it costs no height against the 779px.

                            `.html` on purpose. A static file is served ahead of any
                            rewrite everywhere - Netlify, vite preview AND vite dev -
                            whereas bare /privacy needs the netlify.toml rule, which
                            dev does not read: there it hits Vite's SPA fallback,
                            boots the app and bounces you to the landing page. The
                            rule stays, so /privacy also resolves in production.

                            The policy is two files rather than one page with a
                            toggle, so it needs no script and a shared link keeps
                            its language; the app sends you to the one it is
                            currently showing. */}
                        <a
                            href={getLanguage() === 'it' ? '/privacy.html' : '/privacy.en.html'}
                            className="text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-400 hover:decoration-emerald-400/60"
                        >
                            Privacy
                        </a>
                    </p>
                    <p>{t(FOOTER_DISCLAIMER)}</p>
                    <p>{t(FOOTER_PRIVACY)}</p>
                </div>
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
                                        aria-label={t('Back to nations')}
                                    >
                                        <ArrowLeft className="w-5 h-5 text-zinc-400 hover:text-amber-300" />
                                    </button>
                                ) : (
                                    <TrophyIcon className="w-6 h-6 mr-1" aria-hidden="true" />
                                )}
                                <h2 className="text-2xl font-bold capitalize text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-400">
                                    {openNation ? countryName(openNation[0]) : t('Select Nation')}
                                </h2>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-amber-500/10 rounded-full transition-colors"
                                aria-label={t('Close')}
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
                                        // The flag's colours, for the hover bar (.flag-hover in index.css).
                                        style={{ '--flag-stripes': flagStripes(flagColors(country)) }}
                                        className="group relative flex flex-col items-center justify-center p-4 bg-amber-500/[0.04] hover:bg-amber-500/10 border border-amber-500/10 hover:border-amber-500/40 rounded-xl transition duration-200 hover:shadow-[0_8px_24px_rgba(245,158,11,0.12)] hover:-translate-y-1 flag-hover"
                                    >
                                        <div className="relative mb-3">
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
                                            {countryName(country)}
                                        </h3>
                                        <span className="text-[10px] text-amber-200/45 font-medium uppercase tracking-wider mt-1">
                                            {leagues.length === 1 ? t('1 league') : t('{n} leagues', { n: leagues.length })}
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

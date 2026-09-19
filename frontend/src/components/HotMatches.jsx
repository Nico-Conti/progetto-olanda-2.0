import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Flame, TrendingUp, BrainCircuit, SearchX } from 'lucide-react';
import { buildPredictionModel, predictFromModel, ENGINES, MIN_EFFECTIVE_FOR_EV } from '../utils/predictTotal';
import { expectedValue, devig } from '../utils/countModel';
import { getStatLabel, STAT_CONFIG, resolveStatKey, UNJOINED_STATS } from '../utils/statistics';
import { halfLifeFor } from '../utils/statistics';
import { usePersistedPrefs, toggleLeagueSelection } from '../hooks/usePersistedPrefs';
import { useUpcomingFixtures } from '../hooks/useUpcomingFixtures';
import { useClickOutside } from '../hooks/useClickOutside';
import Dropdown from './ui/Dropdown';
import StatisticSelector from './StatisticSelector';
import SignalBadge from './SignalBadge';
import DerivedBadge from './DerivedBadge';
import Header from './Header';
import SlidingTabs from './ui/SlidingTabs';
import FireBorder from './FireBorder';
import { motionAllowed } from '../utils/leaguePickerFx';
import { useCountUp } from '../hooks/useCountUp';
import { staggerDelay } from '../utils/stagger';
import MatchCard from './MatchCard';
import { hasBet } from '../utils/bets';
import { leagueMeta } from '../utils/leaguePickerFx';
import { t, tk, tx, dateLocale } from '../i18n';

/**
 * What "hot" means, which is not one question.
 *
 * `total` is the original ranking: the biggest expected number. It answers
 * "where will the most happen", and needs no prices.
 *
 * `ev` is the honest betting ranking and the narrowest: it needs a captured
 * price, and on 2026-08-24 only 31 of 1,014 upcoming fixtures had one for
 * corners. It is additionally gated on `prediction.confident`, because EV ranks
 * by how far the model disagrees with the market and the largest disagreements
 * come from the least history - see the odds section of CLAUDE.md. The UI states
 * how many fixtures survived both filters rather than quietly showing a short list.
 *
 * There is deliberately no "rank by P(over line)" mode, though it looks like the
 * obvious third one. `withDistribution` fits ONE dispersion per model
 * (`dispersionFor(model)`), shared by every match, so probOver(total, line, r) is
 * strictly monotone in `total` - ranking on it returns the identical order, always.
 * Verified on 180 fixtures: same five matches, same sequence, for corners and
 * goals. It is shown on each card, where a calibrated probability beats a raw
 * magnitude, but it is not offered as a sort. If dispersion ever becomes
 * per-match, this stops being true and the mode becomes worth adding.
 */
const RANK_MODES = {
    total: { value: 'total', label: tk('Expected total'), needsCount: false, needsPrice: false },
    ev: { value: 'ev', label: tk('Expected value'), needsCount: true, needsPrice: true },
};

/**
 * A price the cap allows us to back, or null.
 *
 * The cap filters LEGS, not fixtures. A fixture whose best expected value sits
 * on a 5.00 outsider still surfaces with its best leg UNDER the cap, rather
 * than disappearing from a list it belongs in - filtering `bestEv` after the
 * scan would have hidden it. Devigging deliberately still reads both raw
 * prices: the cap is about what we will back, not about what the market thinks.
 */
const bettable = (price, maxPrice) =>
    (price && (maxPrice == null || price <= maxPrice)) ? price : null;

/** The line a statistic is judged at - the same one the backtests use. */
const lineFor = (stat) => STAT_CONFIG[resolveStatKey(stat)]?.total?.default ?? null;

/**
 * Every line the market realistically offers for a statistic, ascending.
 *
 * `extra` carries the lines this fixture is actually priced at, which the
 * configured ladder does not always contain - total fouls are listed in steps of
 * two while the book posted 25.5, so scanning the config alone found no foul
 * market on a day both Serie A fixtures had one.
 */
const linesFor = (stat, extra = []) => {
    const cfg = STAT_CONFIG[resolveStatKey(stat)]?.total;
    if (!cfg) return [];
    return [...new Set([cfg.default, ...(cfg.options ?? []), ...extra])]
        .filter(v => v != null)
        .sort((a, b) => a - b);
};

/**
 * The expected total, counted up inside a ring that fills to P(over line).
 * Stops read the page's --fx colours, so the ring follows its theme.
 */
const HeatRing = ({ total, prob }) => {
    const shownTotal = useCountUp(total, 1100);
    const shownProb = useCountUp(prob ?? 0, 1100);
    const r = 42;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                <defs>
                    <linearGradient id="hm-heat" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" style={{ stopColor: 'var(--fx-light)' }} />
                        <stop offset="0.5" style={{ stopColor: 'var(--fx-a)' }} />
                        <stop offset="1" style={{ stopColor: 'var(--fx-b)' }} />
                    </linearGradient>
                </defs>
                <circle cx="48" cy="48" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="6" />
                {prob != null && (
                    <circle cx="48" cy="48" r={r} fill="none" stroke="url(#hm-heat)" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={c} strokeDashoffset={c * (1 - shownProb)} className="bp-ring-glow" />
                )}
            </svg>
            <div className="absolute inset-0 grid place-items-center">
                <span className="text-3xl font-black tracking-tighter tabular-nums bp-gold-text leading-none">{shownTotal.toFixed(1)}</span>
            </div>
        </div>
    );
};

const STORAGE_KEY = 'olanda_hotmatches_prefs';
// nGames / useGeneralStats / forceMean deliberately do NOT live here: they are
// shared with Market Moves and the Predictor through useModelSettings, so the
// same fixture cannot carry a different expected value on two screens.
const DEFAULT_PREFS = {
    displayCount: 9,
    selectedLeagues: ['All'],
    selectedDate: null,
    rankBy: 'total',
    maxPrice: null,
};

const HotMatches = ({ priceFor, pricedLines, stats, fixtures, matchData, teamLogos, leagues, selectedStatistic, onStatisticChange, onBack, onMatchClick, modelSettings, setNGames, setUseGeneralStats, setForceMean, bets, onOpenBetSlip }) => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, DEFAULT_PREFS);
    const {
        displayCount, selectedLeagues, selectedDate, rankBy, maxPrice,
    } = prefs;
    const { nGames, useGeneralStats, forceMean } = modelSettings;

    // A stale stored mode falls back rather than ranking on undefined.
    const effectiveRankBy = RANK_MODES[rankBy] ? rankBy : 'total';

    // Sample size and mean/median belong to the WINDOW estimator, which lost to
    // recency decay (docs section 10). Anything with a fitted half-life takes the
    // decay path, which is handed neither - so these controls would sit here
    // doing nothing. Trend (useGeneralStats) is NOT dead and stays.
    const decayed = halfLifeFor(selectedStatistic) != null;

    const setDisplayCount = (v) => setPrefs({ displayCount: v });
    const setSelectedDate = (v) => setPrefs({ selectedDate: v });
    const setRankBy = (v) => setPrefs({ rankBy: v });
    const setMaxPrice = (v) => setPrefs({ maxPrice: v });

    const [activeDropdown, setActiveDropdown] = useState(null);

    // Flames round the header, as on the homepage card. A canvas redrawn every
    // frame, so it only burns while the header is on screen.
    const heroRef = useRef(null);
    const [heroVisible, setHeroVisible] = useState(false);
    const [fire] = useState(motionAllowed);
    useEffect(() => {
        if (!fire) return;
        const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting));
        io.observe(heroRef.current);
        return () => io.disconnect();
    }, [fire]);

    const { availableLeagues, availableDates, candidates } =
        useUpcomingFixtures(fixtures, stats, { selectedLeagues, selectedDate });

    const handleLeagueToggle = (league) =>
        setPrefs(prev => ({ selectedLeagues: toggleLeagueSelection(prev.selectedLeagues, league) }));

    const predictionModel = useMemo(
        // The residuals are what the distribution's spread is fitted from.
        () => buildPredictionModel(matchData, selectedStatistic, { trackResiduals: true }),
        [matchData, selectedStatistic]
    );

    // Rank the shared candidate set by expected total, applying the optimized
    // per-league model params when optimization is switched on.
    const topMatches = useMemo(() => {
        const scored = candidates
            .map(match => {
                const pred = predictFromModel(predictionModel, match.home, match.away, {
                    nGames,
                    useGeneralStats,
                    aggregatorOverride: forceMean ? 'mean' : null,
                    // Kickoff, so a fixture next month is not modelled as if it
                    // were today. Falls back to now for a fixture with no date.
                    asOf: match.date ?? new Date(),
                    engine: ENGINES.COUNT,
                });

                // P(over) at the judged line, and the best expected value across
                // every line the market offers, both sides.
                const line = lineFor(selectedStatistic);
                const probability = (pred?.probOver && line != null) ? pred.probOver(line) : null;

                let bestEv = null;
                if (pred?.probOver && priceFor) {
                    const scan = linesFor(selectedStatistic,
                        pricedLines?.(match.home, match.away, selectedStatistic) ?? []);
                    for (const l of scan) {
                        const p = pred.probOver(l);
                        if (p == null) continue;
                        const overPrice = priceFor(match.home, match.away, selectedStatistic, l, true);
                        const underPrice = priceFor(match.home, match.away, selectedStatistic, l, false);
                        // What the market itself thinks, for the card to show beside
                        // our number. Devigged when both sides are priced, because a
                        // raw 1/price still carries the book's margin and would
                        // overstate how far apart we are. Falls back to the raw
                        // implied probability when only one side was captured.
                        const dv = (overPrice > 1 && underPrice > 1) ? devig(overPrice, underPrice) : null;
                        const candidatesEv = [
                            { ev: bettable(overPrice, maxPrice) ? expectedValue(p, overPrice) : null, side: 'Over', line: l, price: overPrice,
                              prob: p, market: dv ? dv.over : (overPrice > 1 ? 1 / overPrice : null) },
                            { ev: bettable(underPrice, maxPrice) ? expectedValue(1 - p, underPrice) : null, side: 'Under', line: l, price: underPrice,
                              prob: 1 - p, market: dv ? dv.under : (underPrice > 1 ? 1 / underPrice : null) },
                        ];
                        for (const c of candidatesEv) {
                            if (c.ev != null && (bestEv == null || c.ev > bestEv.ev)) bestEv = c;
                        }
                    }
                }

                return {
                    ...match,
                    prediction: pred,
                    probability,
                    bestEv,
                };
            })
            .filter(m => m.prediction !== null);

        if (effectiveRankBy === 'ev') {
            // Confidence floor as well as a price: without it the top of this
            // table is whichever fixture has the least history, every time.
            return scored
                .filter(m => m.bestEv && m.prediction.confident)
                .sort((a, b) => b.bestEv.ev - a.bestEv.ev)
                .slice(0, displayCount);
        }

        return scored
            .sort((a, b) => b.prediction.total - a.prediction.total)
            .slice(0, displayCount);
    }, [candidates, predictionModel, nGames, displayCount, useGeneralStats, forceMean, effectiveRankBy, selectedStatistic, priceFor, pricedLines, maxPrice]);

    // How much of the candidate set each narrowing mode actually keeps, so the
    // UI can say so instead of just showing a short list.
    const coverage = useMemo(() => {
        if (effectiveRankBy !== 'ev') return null;
        let priced = 0, confident = 0;
        for (const match of candidates) {
            const pred = predictFromModel(predictionModel, match.home, match.away, {
                nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
                asOf: match.date ?? new Date(), engine: ENGINES.COUNT,
            });
            if (!pred?.probOver || !priceFor) continue;
            const hasPrice = linesFor(selectedStatistic,
                pricedLines?.(match.home, match.away, selectedStatistic) ?? []).some(l =>
                bettable(priceFor(match.home, match.away, selectedStatistic, l, true), maxPrice) ||
                bettable(priceFor(match.home, match.away, selectedStatistic, l, false), maxPrice));
            if (!hasPrice) continue;
            priced++;
            if (pred.confident) confident++;
        }
        return { total: candidates.length, priced, confident };
    }, [candidates, predictionModel, nGames, useGeneralStats, forceMean, effectiveRankBy, selectedStatistic, priceFor, pricedLines, maxPrice]);

    // Close dropdown when clicking outside
    useClickOutside(activeDropdown, '.dropdown-container', useCallback(() => setActiveDropdown(null), []));

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>
    );

    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            {t('Hot Matches').split(' ')[0]} <span className="bp-gold-text">{t('Hot Matches').split(' ').slice(1).join(' ')}</span>
        </h1>
    );

    return (
        <div className="fx-fire min-h-screen text-zinc-200 font-sans relative pb-12">
            <Header
                title={appTitle}
                onLogoClick={onBack}
                pageName={pageName}
                showBetSlip={true}
                betsCount={bets?.length ?? 0}
                onOpenBetSlip={onOpenBetSlip}
            >
                <StatisticSelector
                    value={selectedStatistic}
                    onChange={onStatisticChange}
                    className="w-[180px]"
                />
            </Header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-4">
                <div className="space-y-8 relative">
                    {/* One panel: title, ranking and filters. z-50: the dropdowns open over the cards below. */}
                    <section ref={heroRef} className={`bp-hero bp-hero-open animate-waterfall relative z-50 ${fire ? 'bp-live-edge fire-edge' : ''}`}>
                        {fire && heroVisible && <FireBorder borderRadius={24} density={0.8} />}
                        <div className="bp-orbs" aria-hidden="true">
                            <div className="bp-orb bp-orb-a" />
                            <div className="bp-orb bp-orb-b" />
                            <div className="bp-orb bp-orb-c" />
                        </div>
                        <div className="relative flex flex-col lg:flex-row lg:items-center gap-4">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="bp-icon"><Flame className="w-7 h-7 text-orange-300" /></div>
                                <div className="min-w-0">
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                                        {t('Hot Matches').split(' ')[0]} <span className="bp-gold-text">{t('Hot Matches').split(' ').slice(1).join(' ')}</span>
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <p className="text-sm text-zinc-400">
                                            {t('Top {stat} picks', { stat: getStatLabel(selectedStatistic) })}
                                        </p>
                                        <SignalBadge statistic={selectedStatistic} showLabel />
                                        <DerivedBadge statistic={selectedStatistic} />
                                    </div>
                                </div>
                            </div>
                            <SlidingTabs
                                items={[
                                    { id: 'total', label: t(RANK_MODES.total.label), Icon: Flame },
                                    { id: 'ev', label: t(RANK_MODES.ev.label), Icon: TrendingUp },
                                ]}
                                value={effectiveRankBy}
                                onChange={setRankBy}
                                className="border border-white/10 self-start lg:self-center bg-zinc-950/40"
                                tabClassName="font-semibold"
                            />
                        </div>
                        <div className="relative mt-5 pt-5 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 w-full">
                            {/* League Multi-Filter */}
                            <Dropdown
                                label={t('Leagues')}
                                active={activeDropdown === 'league'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'league' ? null : 'league')}
                                value={selectedLeagues.includes('All') ? t('All Leagues') : t('{n} selected', { n: selectedLeagues.length })}
                                width="w-full"
                                className="flex-[2] min-w-[200px]"
                            >
                                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                    <button
                                        onClick={() => handleLeagueToggle('All')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors mb-1 ${selectedLeagues.includes('All')
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                            : 'text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                                    >
                                        {t('All Leagues')}
                                    </button>
                                    <div className="h-px bg-white/5 my-1" />
                                    {availableLeagues.map(league => (
                                        <label
                                            key={league}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedLeagues.includes(league)
                                                ? 'bg-zinc-800 text-white'
                                                : 'text-zinc-500 hover:bg-white/5'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0"
                                                checked={selectedLeagues.includes(league)}
                                                onChange={() => handleLeagueToggle(league)}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-wide">{league}</span>
                                        </label>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Date Selector */}
                            <Dropdown
                                label={t('Date')}
                                active={activeDropdown === 'date'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
                                value={selectedDate ? (selectedDate.toDateString() === new Date().toDateString() ? t('Today') : selectedDate.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })) : t('Upcoming')}
                                width="w-full"
                                className="flex-[1.5] min-w-[140px]"
                            >
                                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                    <button
                                        onClick={() => { setSelectedDate(null); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors mb-1 ${selectedDate === null
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                            : 'text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                                    >
                                        {t('Upcoming Matches')}
                                    </button>
                                    <div className="h-px bg-white/5 my-1" />
                                    {availableDates.map(date => {
                                        const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
                                        const isToday = date.toDateString() === new Date().toDateString();
                                        const label = isToday ? t('Today') : date.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });

                                        return (
                                            <button
                                                key={date.toISOString()}
                                                onClick={() => { setSelectedDate(date); setActiveDropdown(null); }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${isSelected
                                                    ? 'bg-zinc-800 text-white'
                                                    : 'text-zinc-500 hover:bg-white/5'}`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Dropdown>

                            {/* View Count */}
                            <Dropdown
                                label={t('View')}
                                active={activeDropdown === 'view'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'view' ? null : 'view')}
                                value={displayCount}
                                width="w-full"
                                className="flex-1 min-w-[80px]"
                            >
                                <div className="space-y-1">
                                    {[3, 6, 9, 12, 15].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => { setDisplayCount(n); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${displayCount === n
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('{n} matches', { n })}
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Max price - only under an EV ranking, which is the
                                only thing a price cap can narrow. A long price
                                multiplies the model's disagreement with the book,
                                so the top of an EV list is mostly outsiders. */}
                            {effectiveRankBy === 'ev' && (
                                <Dropdown
                                    label={t('Max price')}
                                    active={activeDropdown === 'maxPrice'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'maxPrice' ? null : 'maxPrice')}
                                    value={maxPrice == null ? t('Any') : maxPrice.toFixed(2)}
                                    width="w-full"
                                    className="flex-1 min-w-[110px]"
                                >
                                    <div className="space-y-1">
                                        {[null, 1.5, 1.75, 2, 2.5, 3, 5].map(v => (
                                            <button
                                                key={v ?? 'any'}
                                                onClick={() => { setMaxPrice(v); setActiveDropdown(null); }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${maxPrice === v
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'text-zinc-400 hover:bg-white/5'}`}
                                            >
                                                {v == null ? t('Any price') : t('Under {price}', { price: v.toFixed(2) })}
                                            </button>
                                        ))}
                                    </div>
                                </Dropdown>
                            )}

                            <div className="flex gap-3">
                                {!decayed && (<>
                                {/* Sample Size */}
                                <Dropdown
                                    label={t('Sample')}
                                    active={activeDropdown === 'sample'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'sample' ? null : 'sample')}
                                    value={nGames === 'all' ? t('Season') : t('Last {n}', { n: nGames })}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        {[3, 5, 10, 'all'].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => { setNGames(n); setActiveDropdown(null); }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${nGames === n
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'text-zinc-400 hover:bg-white/5'}`}
                                            >
                                                {n === 'all' ? t('Whole Season') : t('Last {n} Games', { n })}
                                            </button>
                                        ))}
                                    </div>
                                </Dropdown>
                                </>)}

                                {/* Trend */}
                                <Dropdown
                                    label={t('Trend')}
                                    active={activeDropdown === 'trend'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'trend' ? null : 'trend')}
                                    value={useGeneralStats ? t('General') : t('Specific')}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        <button
                                            onClick={() => { setUseGeneralStats(false); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${!useGeneralStats
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('Specific (Home/Away)')}
                                        </button>
                                        <button
                                            onClick={() => { setUseGeneralStats(true); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${useGeneralStats
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('General (All Matches)')}
                                        </button>
                                    </div>
                                </Dropdown>

                                {!decayed && (<>
                                {/* Calc */}
                                <Dropdown
                                    label={t('Calc')}
                                    active={activeDropdown === 'calc'}
                                    onToggle={() => setActiveDropdown(activeDropdown === 'calc' ? null : 'calc')}
                                    value={forceMean ? t('Mean') : t('Median')}
                                    width="w-full"
                                    className="flex-1 min-w-[100px]"
                                >
                                    <div className="space-y-1">
                                        <button
                                            onClick={() => { setForceMean(false); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${!forceMean
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('Auto (per statistic)')}
                                        </button>
                                        <button
                                            onClick={() => { setForceMean(true); setActiveDropdown(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${forceMean
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('Mean (Average)')}
                                        </button>
                                    </div>
                                </Dropdown>
                                </>)}
                            </div>

                        </div>
                    </section>

                    {coverage && (
                        <div className="glass-panel rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                            <BrainCircuit className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-zinc-300 leading-relaxed">
                                {tx(maxPrice != null
                                    ? tk('Ranking by expected value, so this is not the whole fixture list. Of {total} upcoming matches, {priced} have a captured {stat} price under {cap} and {confident} of those also clear the confidence floor ({floor} effective matches, a fitted spread, and a statistic that has actually been measured). Prices cannot be backfilled, so a fixture with none is simply absent rather than ranked last.')
                                    : tk('Ranking by expected value, so this is not the whole fixture list. Of {total} upcoming matches, {priced} have a captured {stat} price and {confident} of those also clear the confidence floor ({floor} effective matches, a fitted spread, and a statistic that has actually been measured). Prices cannot be backfilled, so a fixture with none is simply absent rather than ranked last.'), {
                                    total: <span className="font-bold text-amber-300">{coverage.total}</span>,
                                    priced: <span className="font-bold text-amber-300">{coverage.priced}</span>,
                                    confident: <span className="font-bold text-amber-300">{coverage.confident}</span>,
                                    cap: <span className="font-bold text-amber-300">{maxPrice?.toFixed(2)}</span>,
                                    stat: getStatLabel(selectedStatistic).toLowerCase(),
                                    floor: MIN_EFFECTIVE_FOR_EV,
                                })}
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {topMatches.map((match, idx) => {
                            const share = match.prediction.expHome / ((match.prediction.expHome + match.prediction.expAway) || 1);
                            const inSlip = hasBet(bets, match.home, match.away);
                            return (
                            <MatchCard
                                key={`${effectiveRankBy}-${selectedStatistic}-${match.home}-${match.away}`}
                                match={match}
                                rank={idx + 1}
                                meta={leagueMeta(leagues, match.league)}
                                teamLogos={teamLogos}
                                inSlip={inSlip}
                                className={`hm-card ${inSlip ? '' : 'hm-glow'} ${idx === 0 && !inSlip ? 'hm-card-top' : ''}`}
                                overlay={<div className="bp-holo" aria-hidden="true" />}
                                style={{ animationDelay: `calc(160ms + ${staggerDelay(idx)})` }}
                                onClick={() => onMatchClick && onMatchClick(match)}
                                center={(
                                    <>
                                        <HeatRing total={match.prediction.total} prob={match.probability} />
                                        <span className="mt-2 text-[10px] font-bold text-orange-300 uppercase tracking-wider">
                                            {t('Exp. {stat}', { stat: getStatLabel(selectedStatistic) })}
                                        </span>
                                        {match.probability != null && (
                                            <span className="mt-1 text-[11px] font-bold text-zinc-200 tabular-nums whitespace-nowrap">
                                                {(100 * match.probability).toFixed(0)}%
                                                <span className="text-zinc-500 font-medium"> {t('over {line}', { line: lineFor(selectedStatistic) })}</span>
                                            </span>
                                        )}
                                    </>
                                )}
                            >
                                {/* Home vs away expectation, as numbers and as one split bar. */}
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                                        <span>{t('Home exp.')}</span>
                                        <span>{t('Away exp.')}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-black text-emerald-400 tabular-nums">{match.prediction.expHome.toFixed(2)}</span>
                                        <div className="hm-bar flex-1 flex h-1.5 rounded-full overflow-hidden bg-zinc-800 gap-0.5">
                                            <div className="bg-emerald-400 rounded-l-full" style={{ width: `${100 * share}%` }} />
                                            <div className="flex-1 bg-blue-400 rounded-r-full" />
                                        </div>
                                        <span className="text-lg font-black text-blue-400 tabular-nums">{match.prediction.expAway.toFixed(2)}</span>
                                    </div>
                                </div>

                                {match.bestEv && (
                                    <div
                                        title={`${t('Best expected value across every {stat} line with a captured price.', { stat: getStatLabel(selectedStatistic).toLowerCase() })}${match.prediction.confident ? '' : ` ${t('Below the confidence floor - arithmetic on an estimate we do not yet trust.')}`}`}
                                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold ${match.prediction.confident
                                            ? 'bg-emerald-500/5 border-emerald-500/20'
                                            : 'bg-white/5 border-white/10'}`}
                                    >
                                        <span className="uppercase tracking-wider text-zinc-300">
                                            {t(match.bestEv.side)} {match.bestEv.line}
                                            <span className="text-zinc-500 normal-case font-mono"> @ {match.bestEv.price.toFixed(2)}</span>
                                        </span>
                                        {/* The claim behind the EV, in probability units.
                                            EV = price x (our p - the price's implied p), so a
                                            long price multiplies the disagreement: the same 8pp
                                            gap reads as +12% EV at 1.50 and +30% at 3.82. Showing
                                            both makes the size of the actual disagreement legible
                                            instead of hiding it behind the multiplier. */}
                                        {match.bestEv.market != null && (
                                            <span
                                                title={t('We make it {ours}%, the market {market}% (margin removed). EV is that gap multiplied by the price, so long prices inflate it.', { ours: (100 * match.bestEv.prob).toFixed(0), market: (100 * match.bestEv.market).toFixed(0) })}
                                                className="font-mono tabular-nums text-zinc-400 normal-case"
                                            >
                                                {(100 * match.bestEv.prob).toFixed(0)}%
                                                <span className="text-zinc-600"> {t('vs')} </span>
                                                {(100 * match.bestEv.market).toFixed(0)}%
                                            </span>
                                        )}
                                        <span className={`font-mono font-black tabular-nums ${!match.prediction.confident ? 'text-zinc-600'
                                            : match.bestEv.ev > 0.02 ? 'text-emerald-400'
                                                : match.bestEv.ev < -0.02 ? 'text-red-400/70' : 'text-zinc-400'}`}>
                                            {(match.bestEv.ev >= 0 ? '+' : '') + (100 * match.bestEv.ev).toFixed(0)}% {t('EV')}
                                        </span>
                                    </div>
                                )}

                            </MatchCard>
                            );
                        })}
                    </div>

                    {topMatches.length === 0 && (
                        <div className="bp-empty animate-waterfall">
                            <SearchX className="w-10 h-10 text-zinc-600" />
                            <p className="text-sm text-zinc-400 max-w-xl">
                            {effectiveRankBy === 'ev'
                                // The book posts these and we capture them; we
                                // decline to join them, so "no captured price"
                                // would read as an outage rather than a choice.
                                ? (UNJOINED_STATS.has(selectedStatistic)
                                    ? t('{stat} is deliberately not priced: the bookmaker settles it on a narrower count than we measure, so an expected value here would be arithmetic on two different quantities. Rank by expected total, or pick another statistic.', { stat: getStatLabel(selectedStatistic) })
                                    : maxPrice != null
                                        ? t('No upcoming {stat} market has both a captured price under {cap} and enough history to trust. Try a higher max price, another statistic, or rank by expected total.', { stat: getStatLabel(selectedStatistic).toLowerCase(), cap: maxPrice.toFixed(2) })
                                        : t('No upcoming {stat} market has both a captured price and enough history to trust. Try another statistic, or rank by expected total.', { stat: getStatLabel(selectedStatistic).toLowerCase() }))
                                : t('No upcoming matches found to analyze.')}
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default HotMatches;

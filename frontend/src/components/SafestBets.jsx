import React, { useState, useMemo, useCallback } from 'react';
import { Shield, Calendar, TrendingUp, ChevronRight, CheckCircle2 } from 'lucide-react';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { getStatLabel } from '../utils/statistics';
import { usePersistedPrefs, toggleLeagueSelection } from '../hooks/usePersistedPrefs';
import { useUpcomingFixtures } from '../hooks/useUpcomingFixtures';
import { useClickOutside } from '../hooks/useClickOutside';
import Dropdown from './ui/Dropdown';
import StatisticSelector from './StatisticSelector';
import Header from './Header';
import MatchCard from './MatchCard';
import { leagueMeta } from '../utils/leaguePickerFx';
import { staggerDelay } from '../utils/stagger';
import { t, dateLocale } from '../i18n';

const STORAGE_KEY = 'olanda_safestbets_prefs';
// The model knobs live in useModelSettings, shared with Hot Matches and the
// Predictor - see that hook for why they are not per screen.
const DEFAULT_PREFS = {
    displayCount: 9,
    selectedLeagues: ['All'],
    selectedDate: null,
};

const CONFIDENCE_THRESHOLDS = {
    corners: { high: 2.0, med: 3.0 },
    goals: { high: 0.85, med: 1.35 },
    shots: { high: 3.5, med: 5.5 },
    shots_on_target: { high: 1.8, med: 2.8 },
    fouls: { high: 3.2, med: 5.2 },
    yellow_cards: { high: 1.0, med: 1.6 },
    red_cards: { high: 0.2, med: 0.4 },
    possession: { high: 4.5, med: 7.5 },
    offsides: { high: 0.8, med: 1.5 },
    default: { high: 1.0, med: 2.0 }
};

const getConfidenceLabel = (stdDev, statType) => {
    const thresholds = CONFIDENCE_THRESHOLDS[statType] || CONFIDENCE_THRESHOLDS.default;
    if (stdDev <= thresholds.high) return { label: t('High'), color: 'text-emerald-400' };
    if (stdDev <= thresholds.med) return { label: t('Med'), color: 'text-yellow-400' };
    return { label: t('Low'), color: 'text-red-400' };
};

const SafestBets = ({ stats, fixtures, teamLogos, leagues, selectedStatistic, matchData, onStatisticChange, onBack, onMatchClick, modelSettings, setNGames, setUseGeneralStats, setForceMean }) => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, DEFAULT_PREFS);
    const { displayCount, selectedLeagues, selectedDate } = prefs;
    const { nGames, useGeneralStats, forceMean } = modelSettings;

    const setDisplayCount = (v) => setPrefs({ displayCount: v });
    const setSelectedDate = (v) => setPrefs({ selectedDate: v });

    const [activeDropdown, setActiveDropdown] = useState(null);

    const { availableLeagues, availableDates, candidates } =
        useUpcomingFixtures(fixtures, stats, { selectedLeagues, selectedDate });

    const handleLeagueToggle = (league) =>
        setPrefs(prev => ({ selectedLeagues: toggleLeagueSelection(prev.selectedLeagues, league) }));

    // Team histories for whatever statistic actually drives the selected one:
    // corners are predicted from shots, goals from box touches, everything else
    // from itself. See utils/predictTotal.js.
    const predictionModel = useMemo(
        () => buildPredictionModel(matchData, selectedStatistic, { trackResiduals: true }),
        [matchData, selectedStatistic]
    );

    // Rank the shared candidate set by prediction variance: the lower the
    // spread, the "safer" the bet.
    const safestMatches = useMemo(() => {
        return candidates
            .map(match => ({
                ...match,
                prediction: predictFromModel(predictionModel, match.home, match.away, {
                    nGames,
                    useGeneralStats,
                    aggregatorOverride: forceMean ? 'mean' : null,
                    asOf: match.date ?? new Date(),
                    engine: ENGINES.COUNT,
                })
            }))
            .filter(m => m.prediction !== null)
            .sort((a, b) => a.prediction.totalStd - b.prediction.totalStd)
            .slice(0, displayCount);
    }, [candidates, predictionModel, nGames, displayCount, useGeneralStats, forceMean]);

    // Close dropdown when clicking outside
    useClickOutside(activeDropdown, '.dropdown-container', useCallback(() => setActiveDropdown(null), []));

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>
    );

    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            {t('Safest Bets').split(' ')[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">{t('Safest Bets').split(' ').slice(1).join(' ')}</span>
        </h1>
    );

    return (
        <div className="min-h-screen text-zinc-200 font-sans relative pb-12">
            <Header
                title={appTitle}
                onLogoClick={onBack}
                showSound={true}
                pageName={pageName}
            >
                <StatisticSelector
                    value={selectedStatistic}
                    onChange={onStatisticChange}
                    className="w-[180px]"
                />
            </Header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                <div className="space-y-6 relative">

                    <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col xl:flex-row justify-between items-center gap-4 relative z-50">
                        <div className="flex items-center gap-3 xl:min-w-max w-full xl:w-auto justify-center xl:justify-start border-b xl:border-b-0 border-white/5 pb-4 xl:pb-0">
                            <div className="p-2 bg-zinc-900 rounded-lg border border-white/10">
                                <Shield className="w-5 h-5 text-cyan-500" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-black text-white leading-none tracking-tight">
                                    {t('Safest Bets').split(' ')[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{t('Safest Bets').split(' ').slice(1).join(' ')}</span>
                                </h2>
                                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                                    {t('Low Variance {stat} Picks', { stat: getStatLabel(selectedStatistic) })}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 w-full flex-1">
                            {/* League Multi-Filter */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
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
                                                className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/20 focus:ring-offset-0"
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
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
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
                                accent="cyan"
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
                                                ? 'bg-cyan-500/20 text-cyan-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {t('{n} matches', { n })}
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Sample Size */}
                            <Dropdown
                                accent="cyan"
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
                                                ? 'bg-cyan-500/20 text-cyan-400'
                                                : 'text-zinc-400 hover:bg-white/5'}`}
                                        >
                                            {n === 'all' ? t('Whole Season') : t('Last {n} Games', { n })}
                                        </button>
                                    ))}
                                </div>
                            </Dropdown>

                            {/* Trend */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        {t('Specific (Home/Away)')}
                                    </button>
                                    <button
                                        onClick={() => { setUseGeneralStats(true); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${useGeneralStats
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        {t('General (All Matches)')}
                                    </button>
                                </div>
                            </Dropdown>

                            {/* Calc */}
                            <Dropdown
                                accent="cyan"
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
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        {t('Auto (per statistic)')}
                                    </button>
                                    <button
                                        onClick={() => { setForceMean(true); setActiveDropdown(null); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${forceMean
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'text-zinc-400 hover:bg-white/5'}`}
                                    >
                                        {t('Mean (Average)')}
                                    </button>
                                </div>
                            </Dropdown>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {safestMatches.map((match, idx) => {
                            const { label, color } = getConfidenceLabel(match.prediction.totalStd, selectedStatistic);
                            return (
                                <MatchCard
                                    key={`${match.home}-${match.away}-${idx}`}
                                    match={match}
                                    rank={idx + 1}
                                    meta={leagueMeta(leagues, match.league)}
                                    teamLogos={teamLogos}
                                    style={{ animationDelay: staggerDelay(idx) }}
                                    onClick={() => onMatchClick && onMatchClick(match)}
                                    center={(
                                        <>
                                            <div className="text-4xl font-black text-white tracking-tighter tabular-nums leading-none drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]">
                                                <span className="text-2xl text-zinc-500 align-top">±</span>{match.prediction.totalStd.toFixed(2)}
                                            </div>
                                            <span className="mt-2 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                                                {t('{stat} spread', { stat: getStatLabel(selectedStatistic) })}
                                            </span>
                                        </>
                                    )}
                                >
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-zinc-950/40 rounded-lg px-3 py-2 border border-white/5 text-center">
                                            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Exp. total')}</span>
                                            <span className="block text-lg font-black text-cyan-400 tabular-nums">{match.prediction.total.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-zinc-950/40 rounded-lg px-3 py-2 border border-white/5 text-center">
                                            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Confidence')}</span>
                                            <span className={`block text-lg font-black ${color}`}>{label}</span>
                                        </div>
                                    </div>
                                </MatchCard>
                            );
                        })}
                    </div>

                    {safestMatches.length === 0 && (
                        <div className="text-center py-12 text-zinc-500">
                            {t('No upcoming matches found to analyze.')}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SafestBets;

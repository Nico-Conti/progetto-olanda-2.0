import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calculator, Calendar, Flame, ChevronDown, TrendingUp, BarChart2, ArrowLeftRight } from 'lucide-react';
import { processData } from '../utils/stats';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { STAT_OPTIONS, PRICED_STAT_OPTIONS, SLIP_ONLY_OPTIONS, isSlipOnly, resolveStatKey, STAT_CONFIG, halfLifeFor } from '../utils/statistics';
import { API_BASE_URL } from '../config';
import FormPanel from './predictor/FormPanel';
import ModelControls, { Group } from './predictor/ModelControls';
import Select from './ui/Select';
import TeamBadge from './TeamBadge';
import PredictionHero from './predictor/PredictionHero';
import ProbabilityLadder from './predictor/ProbabilityLadder';
import StatsAnalysis from './predictor/StatsAnalysis';
import StatisticSelector from './StatisticSelector';
import BetBuilderCell from './BetBuilderCell';
import AccuracyReport from './AccuracyReport';
import StatisticDistribution from './StatisticDistribution';
import { staggerDelay } from '../utils/stagger';
import { leagueMeta } from '../utils/leaguePickerFx';
import { t, tk, dateLocale } from '../i18n';


const Predictor = ({ priceFor, pricedLines, outcomesFor, loadMarket, modelSettings, setNGames, setUseGeneralStats, setForceMean, stats: globalStats, fixtures, teams, teamLogos, leagues, selectedStatistic, matchData, modelMatchData, matchStatistics, setMatchStatistics, addToBet, removeFromBet, bets, preSelectedMatch, onExitPreview, backButtonLabel, onTeamClick }) => {
    // Model history is pooled across leagues (see App.jsx); `matchData` stays the
    // league's own and still drives the league averages, the backtest and the
    // distribution, all of which are claims about THIS league.
    const modelData = modelMatchData ?? matchData;
    const [selectedMatch, setSelectedMatch] = useState(null);
    // Shared with Hot Matches and Safest Bets. These were local useState, which
    // meant they reset to the defaults on every mount while the other two
    // screens remembered theirs - so the same fixture could show two different
    // expected values. See hooks/useModelSettings.js.
    const { nGames, useGeneralStats, forceMean } = modelSettings;
    const [selectedMatchday, setSelectedMatchday] = useState(null);
    const [showAccuracy, setShowAccuracy] = useState(false);
    const [showDistribution, setShowDistribution] = useState(false);

    // Sync preSelectedMatch
    useEffect(() => {
        if (preSelectedMatch) {
            setSelectedMatch(preSelectedMatch);
        }
    }, [preSelectedMatch]);

    // One prediction model per statistic. 'main' and 'goals' both read the goals
    // column, so the underlying keys are built once and shared.
    //
    // This replaced a parallel processData cache: the model already holds the
    // team histories, and which statistic they are built on is now the model's
    // decision, not the caller's - corners are predicted from shots, goals from
    // box touches. See utils/predictTotal.js.
    // Built ON DEMAND, one statistic at a time.
    //
    // This used to build a model for all fifteen distinct stat keys up front.
    // That was tolerable over one league's ~400 matches, but the model history is
    // now pooled across every league (~3,150), and eager building cost 6.1s of
    // blocking work on opening the Predictor with the count engine - measured,
    // against 560ms before. Hot Matches was always fast because it builds exactly
    // one. In practice the Predictor needs one or two: the selected statistic, and
    // whatever a row's own dropdown overrides it with.
    //
    // The Map is memoised on modelData, so it is a fresh cache whenever the
    // history changes and can never serve a model built from stale history.
    // The inputs travel WITH the cache rather than beside it, so a stale Map can
    // never be paired with fresh history - and the deps are genuinely used, which
    // an empty-factory useMemo would only fake.
    const modelCache = useMemo(
        () => ({ data: modelData, byKey: new Map() }),
        [modelData]
    );
    const getModel = useCallback((statistic) => {
        // 'main' and 'goals' both read the goals column, so they share one model.
        const statKey = resolveStatKey(statistic);
        if (!modelCache.byKey.has(statKey)) {
            modelCache.byKey.set(statKey, buildPredictionModel(modelCache.data, statKey,
                // The residuals the distribution's spread is fitted from; they
                // cost an extra prediction per match per statistic.
                { trackResiduals: true }));
        }
        return modelCache.byKey.get(statKey);
    }, [modelCache]);

    // League Averages for Hot Match condition
    const leagueAverages = useMemo(() => {
        const byKey = {};
        const averages = {};
        STAT_OPTIONS.forEach(opt => {
            const statKey = resolveStatKey(opt.value);
            if (byKey[statKey] === undefined) {
                let totalVal = 0;
                let count = 0;
                matchData.forEach(m => {
                    const statObj = m.stats?.[statKey];
                    if (statObj) {
                        totalVal += Number(statObj.home) + Number(statObj.away);
                        count++;
                    }
                });
                byKey[statKey] = count > 0 ? totalVal / count : 0;
            }
            averages[opt.value] = byKey[statKey];
        });
        return averages;
    }, [matchData]);

    // Independent Statistic State
    const [localStatistic, setLocalStatistic] = useState(selectedStatistic);

    // Sample size and the mean/median toggle belong to the WINDOW estimator,
    // which lost to recency decay (docs/prediction-model.md section 10). A
    // statistic with a fitted half-life goes down the decay path, which takes
    // neither - so the controls would sit there doing nothing, which reads as a
    // broken model rather than a superseded setting. Every priced market has a
    // half-life; the exploratory statistics (xG, box touches, crosses...) do not
    // and still use them.
    const decayedSelected = halfLifeFor(selectedStatistic) != null;

    // The model's homeMatches/awayMatches are in PREDICTOR units: goals are
    // forecast from box touches, so those rows read "42 - 18, total 60" under a
    // heading that says goals. The prediction is right; the history was showing
    // its input rather than the statistic asked for. This maps each row back to
    // the same fixture measured in the target statistic, for display only - the
    // model is untouched.
    // Built on modelData, not matchData: the model is pooled across leagues, so a
    // promoted or relegated side's older rows live in a different league and a
    // league-scoped lookup would silently fall back to predictor units for them.
    const targetHistory = useMemo(
        () => processData(modelData, resolveStatKey(localStatistic)),
        [modelData, localStatistic]
    );
    const inTargetUnits = (m) => {
        if (!m) return m;
        const rows = targetHistory[m.team]?.all_matches;
        const hit = rows?.find(r =>
            r.giornata === m.giornata && r.opponent === m.opponent
            && r.location === m.location && r.season === m.season);
        return hit ?? m;
    };

    // Sync local statistic with global when global changes, but only if not in a specific view that overrides it?
    // Or just set initial state. The user asked for "independently", so maybe we shouldn't auto-sync if they changed it locally.
    // But if they change the global one, they probably expect the default to update.
    // Let's sync it when selectedStatistic changes.
    useEffect(() => {
        setLocalStatistic(selectedStatistic);
    }, [selectedStatistic]);

    // Recalculate stats based on localStatistic
    const localModel = useMemo(
        () => getModel(localStatistic),
        [getModel, localStatistic]
    );

    // Custom Matchup State
    const [customHome, setCustomHome] = useState('');
    const [customAway, setCustomAway] = useState('');
    const [showCustomPrediction, setShowCustomPrediction] = useState(false);

    // Initialize custom teams
    useEffect(() => {
        if (teams.length > 0 && !customHome) {
            setCustomHome(teams[0]);
            setCustomAway(teams[1]);
        }
    }, [teams, customHome]);

    const customPrediction = useMemo(() => {
        if (!customHome || !customAway || customHome === customAway || !showCustomPrediction) return null;
        return predictFromModel(localModel, customHome, customAway, {
            nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
            // A hypothetical matchup has no kickoff; model it as of now.
            asOf: new Date(), engine: ENGINES.COUNT,
        });
    }, [customHome, customAway, localModel, nGames, showCustomPrediction, useGeneralStats, forceMean]);

    // The line a statistic is judged at, so a probability has something to be a
    // probability OF. Same source the backtests and Hot Matches use.
    const lineFor = (stat) => STAT_CONFIG[resolveStatKey(stat)]?.total?.default ?? null;

    const upcomingMatches = useMemo(() => {
        if (!fixtures || !globalStats) return [];

        // Filter fixtures that haven't been played yet and are not in the past
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const unplayed = fixtures.filter(f => {
            // 1. Date check (ignore matches more than 24h old)
            if (f.date) {
                const matchDate = new Date(f.date);
                if (matchDate < oneDayAgo) return false;
            }

            // 2. Priority Check: Use explicit status from DB if available
            if (f.status === 'PLAYED') return false;

            // 3. Fallback: no status from the DB, so infer from results.
            //
            // Season matters here. History now spans the current season AND the
            // previous one, so that recency decay has something to carry across
            // the summer. Without the season check this finds LAST season's
            // home fixture between the same two teams and hides this season's -
            // which silently removed almost every fixture except those involving
            // promoted sides.
            if (!globalStats[f.home]) return true;
            const played = globalStats[f.home].all_matches.some(m =>
                m.opponent === f.away
                && m.location === 'Home'
                && (!f.season || !m.season || m.season === f.season)
            );
            return !played;
        });

        // Calculate predictions for all unplayed matches
        const predictions = unplayed.map(match => {
            const matchId = `${match.home}-${match.away}`;
            const stat = matchStatistics[matchId] || selectedStatistic;
            // A market we only price has nothing to build a model from, and
            // asking for one would fold an empty history into a prediction. The
            // row renders a dash where the expected values go, exactly as a
            // fixture with too little history already does.
            const modelToUse = isSlipOnly(stat)
                ? null
                : (getModel(stat) ?? getModel(selectedStatistic));

            const pred = modelToUse && predictFromModel(modelToUse, match.home, match.away, {
                nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
                asOf: match.date ?? new Date(), engine: ENGINES.COUNT,
            });
            return { ...match, prediction: pred, selectedStat: stat };
        });
        // Fixtures with no prediction are kept deliberately: early in a season
        // there is no form to model yet, but the schedule should still be
        // visible. The rendering shows a dash wherever a number would go.

        return predictions.sort((a, b) => a.matchday - b.matchday);
    }, [fixtures, globalStats, nGames, matchStatistics, selectedStatistic, getModel, useGeneralStats, forceMean]);

    // Get available matchdays from upcoming matches
    const availableMatchdays = useMemo(() => {
        // Group matches by matchday
        const matchdayGroups = {};
        upcomingMatches.forEach(m => {
            if (!matchdayGroups[m.matchday]) {
                matchdayGroups[m.matchday] = [];
            }
            matchdayGroups[m.matchday].push(m);
        });

        const days = Object.keys(matchdayGroups).map(Number);

        // Sort by the earliest match date in each matchday
        return days.sort((a, b) => {
            const matchesA = matchdayGroups[a];
            const matchesB = matchdayGroups[b];

            // Find earliest date for A
            // Use timestamps for robust comparison (handle TBD or invalid dates carefully)
            const getMinDate = (matches) => {
                const dates = matches
                    .map(m => m.date ? new Date(m.date).getTime() : Infinity) // Treat TBD (null date) as far future
                    .filter(t => !isNaN(t));
                return dates.length > 0 ? Math.min(...dates) : Infinity;
            };

            const minDateA = getMinDate(matchesA);
            const minDateB = getMinDate(matchesB);

            // If dates are different, sort by date
            if (minDateA !== minDateB) {
                return minDateA - minDateB;
            }

            // Fallback to ID if dates are same (or both TBD)
            return a - b;
        });
    }, [upcomingMatches]);

    // Set default selected matchday
    useEffect(() => {
        if (availableMatchdays.length > 0 && selectedMatchday === null) {
            setSelectedMatchday(availableMatchdays[0]);
        }
    }, [availableMatchdays, selectedMatchday]);

    // Filter matches by selected matchday
    // Slip-only prices are not on the first paint - ask for each market the
    // moment a row selects it. loadMarket is a no-op after the first call.
    useEffect(() => {
        if (!loadMarket) return;
        for (const stat of new Set(Object.values(matchStatistics ?? {}))) {
            if (isSlipOnly(stat)) loadMarket(stat);
        }
    }, [matchStatistics, loadMarket]);

    const displayedMatches = useMemo(() => {
        if (!selectedMatchday) return [];
        return upcomingMatches.filter(m => m.matchday === selectedMatchday);
    }, [upcomingMatches, selectedMatchday]);

    // The matchday's fixtures by kickoff day, earliest first; undated ones last.
    const byDay = useMemo(() => {
        const at = (m) => (m.date && !isNaN(new Date(m.date)) ? new Date(m.date).getTime() : Infinity);
        const groups = [];
        [...displayedMatches].sort((a, b) => (at(a) - at(b)) || 0).forEach(m => {
            const key = at(m) === Infinity ? 'TBD' : new Date(m.date).toDateString();
            if (groups.at(-1)?.key !== key) groups.push({ key, date: key === 'TBD' ? null : new Date(m.date), matches: [] });
            groups.at(-1).matches.push(m);
        });
        return groups;
    }, [displayedMatches]);

    const controls = { useGeneralStats, setUseGeneralStats, forceMean, setForceMean, nGames, setNGames };

    // Explain an empty or number-less table: either no fixtures are loaded at
    // all, or fixtures are listed but there is not enough played history yet to
    // model them, so every expected value renders as a dash.
    const emptyReason = useMemo(() => {
        const played = matchData?.length || 0;
        const withPrediction = upcomingMatches.filter(m => m.prediction).length;

        if (upcomingMatches.length === 0) return { kind: 'no-fixtures' };
        if (withPrediction > 0) return null;

        return {
            kind: played === 0 ? 'season-not-started' : 'not-enough-history',
            count: upcomingMatches.length,
            first: [...upcomingMatches].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[0],
            played,
        };
    }, [upcomingMatches, matchData]);

    if (selectedMatch) {
        const { home, away } = selectedMatch;
        // Recalculate prediction for selected match to ensure it uses the current nGames if changed in detail view
        // Use LOCAL stats here
        const detailPred = predictFromModel(localModel, home, away, {
            nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
            asOf: selectedMatch.date ?? new Date(), engine: ENGINES.COUNT,
        });

        // A badge here opens the team page, and that page's Back returns to this match.
        const openFromMatch = onTeamClick && ((team) => onTeamClick(team, selectedMatch));

        if (!detailPred) {
            return (
                <div className="glass-panel rounded-xl border border-white/10 p-10 text-center animate-in fade-in">
                    <h3 className="text-base font-black text-white">{home} vs {away}</h3>
                    <p className="text-zinc-400 text-sm mt-2 max-w-md mx-auto">
                        {t('No prediction yet - neither side has played enough matches this season to model from. Come back once the first results are in.')}
                    </p>
                    <button
                        onClick={() => { setSelectedMatch(null); if (onExitPreview) onExitPreview(); }}
                        className="mt-5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold rounded-lg border border-white/10 transition-colors"
                    >
                        {t('Back')}
                    </button>
                </div>
            );
        }

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => {
                        if (preSelectedMatch && onExitPreview) {
                            onExitPreview();
                        } else {
                            setSelectedMatch(null);
                        }
                    }}
                    className="group inline-flex items-center gap-2 pl-2.5 pr-4 py-1.5 rounded-full border border-white/10 bg-zinc-900/60 text-zinc-300 hover:text-white hover:border-white/20 hover:bg-zinc-800/80 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                    <span className="font-bold text-xs uppercase tracking-wider">
                        {preSelectedMatch ? t(backButtonLabel || tk('Back to Previous')) : t('Back to Fixtures')}
                    </span>
                </button>

                {/* relative z-50: glass-panel applies backdrop-blur, which creates a
                    stacking context, so the statistic dropdown inside would open
                    behind the prediction hero below without this. */}
                <div className="glass-panel px-5 py-4 rounded-xl border border-white/10 relative z-50">
                    <ModelControls statistic={localStatistic} {...controls}>
                        <Group label={t('Statistic')}>
                            <StatisticSelector
                                value={localStatistic}
                                onChange={(e) => setLocalStatistic(e.target.value)}
                                className="w-[160px]"
                            />
                        </Group>
                    </ModelControls>
                </div>

                {/* The sections below cascade in after the hero. */}
                <PredictionHero
                    prediction={detailPred} home={home} away={away} teamLogos={teamLogos}
                    selectedStatistic={localStatistic} leagueAverage={leagueAverages[localStatistic]}
                    date={selectedMatch.date} line={lineFor(localStatistic)}
                    meta={selectedMatch.league ? leagueMeta(leagues, selectedMatch.league) : null}
                    onTeamClick={openFromMatch}
                />

                {/* A slip-only market has no model, so no ladder. */}
                {detailPred?.probOver && (
                    <div className="animate-waterfall" style={{ animationDelay: '120ms' }}>
                        <ProbabilityLadder prediction={detailPred} statistic={localStatistic}
                            home={home} away={away} priceFor={priceFor} pricedLines={pricedLines}
                            bets={bets} addToBet={addToBet} removeFromBet={removeFromBet} />
                    </div>
                )}

                <div className="animate-waterfall" style={{ animationDelay: '200ms' }}>
                    <StatsAnalysis prediction={detailPred} home={home} away={away} nGames={nGames} teamLogos={teamLogos} selectedStatistic={localStatistic} general={useGeneralStats} onTeamClick={openFromMatch} />
                </div>

                {/* Each side's form at this fixture's venue, against the line. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-waterfall" style={{ animationDelay: '280ms' }}>
                    <FormPanel team={home} label={useGeneralStats ? t('All games') : t('Home games')} accent="text-emerald-400" matches={detailPred.homeMatches.map(inTargetUnits)} line={lineFor(localStatistic)} teamLogos={teamLogos} onTeamClick={openFromMatch} />
                    <FormPanel team={away} label={useGeneralStats ? t('All games') : t('Away games')} accent="text-blue-400" matches={detailPred.awayMatches.map(inTargetUnits)} line={lineFor(localStatistic)} teamLogos={teamLogos} onTeamClick={openFromMatch} />
                </div>
            </div>
        );
    }

    // Master Table View
    const mdIndex = availableMatchdays.indexOf(selectedMatchday);
    const dated = byDay.filter(g => g.date);
    const dayLabel = (d) => d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
    const dayRange = dated.length === 0 ? null
        : dated.length === 1 ? dayLabel(dated[0].date)
            : `${dayLabel(dated[0].date)} – ${dayLabel(dated.at(-1).date)}`;
    const kickoff = (m) => (m.date && String(m.date).includes('T') && !isNaN(new Date(m.date))
        ? new Date(m.date).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
        : 'TBD');
    const isHot = (m) => m.selectedStat !== 'possession' && m.prediction && m.prediction.total > (leagueAverages[m.selectedStat] * 1.15);
    const statSelect = (match, className) => (
        <>
            <select
                value={match.selectedStat}
                onChange={(e) => {
                    const matchId = `${match.home}-${match.away}`;
                    setMatchStatistics(prev => ({ ...prev, [matchId]: e.target.value }));
                }}
                onClick={(e) => e.stopPropagation()}
                className={`bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded-lg pl-2 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold cursor-pointer hover:bg-zinc-800 ${className}`}
            >
                {[...PRICED_STAT_OPTIONS, ...SLIP_ONLY_OPTIONS].map(opt => (
                    <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
        </>
    );
    const betBuilder = (match) => (
        <BetBuilderCell
            game={`${match.home} vs ${match.away}`}
            priceFor={priceFor}
            outcomesFor={outcomesFor}
            home={match.home}
            away={match.away}
            teamLogos={teamLogos}
            stat={match.selectedStat}
            prediction={match.prediction}
            onAdd={addToBet}
            onRemove={removeFromBet}
            bets={bets}
            existingBet={bets?.find(b => b.game === `${match.home} vs ${match.away}` && b.stat === match.selectedStat)}
        />
    );
    const teamOptions = teams.map(team => ({
        value: team,
        label: (
            <span className="flex items-center gap-2 min-w-0">
                <img src={teamLogos[team]} alt="" className="w-4 h-4 object-contain shrink-0" />
                <span className="truncate">{team}</span>
            </span>
        ),
    }));

    return (
        <div className="space-y-6">
            {/* relative z-40: the matchday Select opens over the table below. */}
            <div className="glass-panel rounded-xl border border-white/10 relative z-40">
                <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <Calendar className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white leading-tight">{t('Upcoming fixtures')}</h2>
                            {/* Same point as StatsAnalysis: do not advertise a window
                                the decayed statistics never used. */}
                            <p className="text-zinc-400 text-sm">
                                {[
                                    selectedMatchday != null && t('Matchday {n}', { n: selectedMatchday }),
                                    dayRange,
                                    decayedSelected ? t('weighted by recency') : (nGames === 'all' ? t('last season form') : t('last {n} games form', { n: nGames || 5 })),
                                ].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowAccuracy(true)}
                            className="px-3 py-2 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/10 transition-colors flex items-center gap-2"
                        >
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> {t('Backtest')}
                        </button>
                        <button
                            onClick={() => setShowDistribution(true)}
                            className="px-3 py-2 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/10 transition-colors flex items-center gap-2"
                        >
                            <BarChart2 className="w-3.5 h-3.5 text-cyan-400" /> {t('Distribution')}
                        </button>
                    </div>
                </div>
                <div className="px-5 py-4">
                    <ModelControls statistic={selectedStatistic} {...controls}>
                        {availableMatchdays.length > 0 && (
                            <Group label={t('Matchday')}>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMatchday(availableMatchdays[mdIndex - 1])}
                                        disabled={mdIndex <= 0}
                                        aria-label={t('Previous matchday')}
                                        className="p-2 rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <Select
                                        accent="emerald"
                                        value={selectedMatchday}
                                        onChange={setSelectedMatchday}
                                        options={availableMatchdays.map(d => ({ value: d, label: t('Matchday {n}', { n: d }) }))}
                                        className="w-[150px]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMatchday(availableMatchdays[mdIndex + 1])}
                                        disabled={mdIndex < 0 || mdIndex >= availableMatchdays.length - 1}
                                        aria-label={t('Next matchday')}
                                        className="p-2 rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </Group>
                        )}
                    </ModelControls>
                </div>
            </div>

            {emptyReason && (
                <div className="glass-panel rounded-xl border border-white/10 p-8 text-center mb-4">
                    {emptyReason.kind === 'no-fixtures' ? (
                        <>
                            <h3 className="text-base font-black text-white">{t('No upcoming fixtures')}</h3>
                            <p className="text-zinc-400 text-sm mt-2">
                                {t('Nothing scheduled for this league and season. Run the fixtures scraper to load them.')}
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-base font-black text-white">
                                {emptyReason.kind === 'season-not-started'
                                    ? t("This season hasn't kicked off yet")
                                    : t('Not enough history to predict yet')}
                            </h3>
                            <p className="text-zinc-400 text-sm mt-2 max-w-xl mx-auto">
                                {t('The {n} fixtures below are scheduled', { n: emptyReason.count })}
                                {emptyReason.first?.date && (
                                    <>, {t('starting')}{' '}
                                        <span className="text-zinc-200 font-bold">
                                            {new Date(emptyReason.first.date).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' })}
                                        </span></>
                                )}
                                , {emptyReason.played === 0
                                    ? t('but no matches have been played in this season yet')
                                    : t('but only {n} matches have been played so far', { n: emptyReason.played })}
                                , {t('so there is no form to model from. Expected values show as')}
                                {' '}<span className="text-zinc-300 font-bold">-</span>{' '}
                                {t('until the first results are in.')}
                            </p>
                        </>
                    )}
                </div>
            )}

            <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
                {/* Mobile View (Cards), by kickoff day */}
                <div className="md:hidden p-4 space-y-5">
                    {byDay.length > 0 ? byDay.map(group => (
                        <div key={group.key} className="space-y-3">
                            <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                                {group.date ? group.date.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) : t('Date to be confirmed')}
                            </h3>
                            {group.matches.map((match, idx) => (
                                <div
                                    key={`${match.home}-${match.away}`}
                                    style={{ animationDelay: staggerDelay(idx) }}
                                    onClick={(e) => {
                                        if (e.target.closest('select') || e.target.closest('button')) return;
                                        setSelectedMatch(match);
                                    }}
                                    className="glass-panel p-4 rounded-xl border border-white/10 relative overflow-hidden animate-waterfall active:scale-[0.98] transition-transform"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300 tabular-nums">{kickoff(match)}</span>
                                        {isHot(match) && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold uppercase tracking-wider text-orange-400">
                                                <Flame className="w-3 h-3 fill-current" /> {t('Hot')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-4">
                                        <div className="flex flex-col items-center text-center min-w-0">
                                            <span className="mb-1"><TeamBadge team={match.home} logo={teamLogos[match.home]} onOpen={onTeamClick} className="w-10 h-10" /></span>
                                            <span className="w-full text-xs font-bold leading-tight text-white line-clamp-2">{match.home}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <div className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                                {match.prediction ? match.prediction.total.toFixed(1) : '-'}
                                            </div>
                                            {match.prediction?.probOver && lineFor(match.selectedStat) != null && (
                                                <span className="text-[10px] font-bold text-zinc-400 tabular-nums">
                                                    {(100 * match.prediction.probOver(lineFor(match.selectedStat))).toFixed(0)}%
                                                    <span className="text-zinc-600"> over {lineFor(match.selectedStat)}</span>
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-center text-center min-w-0">
                                            <span className="mb-1"><TeamBadge team={match.away} logo={teamLogos[match.away]} onOpen={onTeamClick} className="w-10 h-10" /></span>
                                            <span className="w-full text-xs font-bold leading-tight text-white line-clamp-2">{match.away}</span>
                                        </div>
                                    </div>

                                    {match.prediction && (
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="text-sm font-black text-emerald-400 tabular-nums">{match.prediction.expHome.toFixed(2)}</span>
                                            <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-zinc-800 gap-0.5">
                                                <div className="bg-emerald-400" style={{ width: `${100 * match.prediction.expHome / ((match.prediction.expHome + match.prediction.expAway) || 1)}%` }} />
                                                <div className="flex-1 bg-blue-400" />
                                            </div>
                                            <span className="text-sm font-black text-blue-400 tabular-nums">{match.prediction.expAway.toFixed(2)}</span>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
                                        <div className="relative flex-grow">{statSelect(match, 'w-full py-2')}</div>
                                        <div onClick={(e) => e.stopPropagation()}>{betBuilder(match)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )) : (
                        <div className="p-8 text-center text-zinc-500 rounded-xl border border-white/10 border-dashed">
                            {t('No upcoming fixtures found for this matchday.')}
                        </div>
                    )}
                </div>

                {/* Desktop View (Table), by kickoff day */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-zinc-300">
                        <thead className="text-[11px] text-zinc-500 uppercase bg-zinc-950/80 border-b border-white/5">
                            <tr>
                                <th className="pl-5 lg:pl-4 pr-2 py-3 font-bold tracking-wider text-center w-[80px] whitespace-nowrap">{t('Kickoff')}</th>
                                <th className="px-3 py-3 font-bold tracking-wider text-center whitespace-nowrap">{t('Matchup')}</th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider text-emerald-500 whitespace-nowrap">{t('Home exp')}</th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider text-blue-500 whitespace-nowrap">{t('Away exp')}</th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider text-white whitespace-nowrap">{t('Total')}</th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider text-emerald-500 whitespace-nowrap"
                                    title={t('Probability the total goes over the configured line, from the fitted distribution.')}>
                                    P(Over)
                                </th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider whitespace-nowrap">{t('Stat')}</th>
                                <th className="px-3 lg:px-2 py-3 text-center font-bold tracking-wider whitespace-nowrap">{t('Bet builder')}</th>
                            </tr>
                        </thead>
                        {byDay.length > 0 ? byDay.map(group => (
                            <tbody key={group.key} className="divide-y divide-white/5 text-sm">
                                <tr className="bg-white/[0.02]">
                                    <td colSpan={8} className="px-5 lg:px-4 py-2 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                                        {group.date ? group.date.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) : t('Date to be confirmed')}
                                        <span className="ml-2 font-bold normal-case tracking-normal text-zinc-600">
                                            {group.matches.length === 1 ? t('1 match') : t('{n} matches', { n: group.matches.length })}
                                        </span>
                                    </td>
                                </tr>
                                {group.matches.map((match, idx) => (
                                    <tr
                                        key={`${match.home}-${match.away}`}
                                        style={{ animationDelay: staggerDelay(idx) }}
                                        onClick={(e) => {
                                            // Prevent navigation if clicking on the dropdown
                                            if (e.target.closest('select')) return;
                                            setSelectedMatch(match);
                                        }}
                                        className="hover:bg-white/[0.04] transition-colors cursor-pointer group animate-waterfall"
                                    >
                                        <td className="pl-5 lg:pl-4 pr-2 py-4 whitespace-nowrap font-bold text-zinc-400 text-center tabular-nums w-[80px]">
                                            {kickoff(match)}
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="flex items-center gap-3 justify-center">
                                                <div className="flex items-center gap-2 w-[150px] justify-end">
                                                    <span
                                                        className={`font-bold whitespace-nowrap truncate transition-colors group-hover:text-white ${match.prediction && match.prediction.expHome > match.prediction.expAway ? 'text-white' : 'text-zinc-400'}`}
                                                        title={match.home}
                                                    >
                                                        {match.home}
                                                    </span>
                                                    <TeamBadge team={match.home} logo={teamLogos[match.home]} onOpen={onTeamClick} className="w-7 h-7" />
                                                </div>
                                                <span className="text-zinc-600 font-bold text-[10px]">VS</span>
                                                <div className="flex items-center gap-2 w-[150px]">
                                                    <TeamBadge team={match.away} logo={teamLogos[match.away]} onOpen={onTeamClick} className="w-7 h-7" />
                                                    <span
                                                        className={`font-bold whitespace-nowrap truncate transition-colors group-hover:text-white ${match.prediction && match.prediction.expAway > match.prediction.expHome ? 'text-white' : 'text-zinc-400'}`}
                                                        title={match.away}
                                                    >
                                                        {match.away}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 lg:px-2 py-4 text-center font-mono font-bold text-emerald-400">{match.prediction ? match.prediction.expHome.toFixed(2) : <span className="text-zinc-600">-</span>}</td>
                                        <td className="px-3 lg:px-2 py-4 text-center font-mono font-bold text-blue-400">{match.prediction ? match.prediction.expAway.toFixed(2) : <span className="text-zinc-600">-</span>}</td>
                                        <td className="px-3 lg:px-2 py-4 text-center">
                                            <span className="inline-flex items-center gap-1.5 font-black text-white text-lg tabular-nums">
                                                {match.prediction ? match.prediction.total.toFixed(1) : '-'}
                                                {isHot(match) && (
                                                    <span title={t('Hot match: 15% above the league average')} className="text-orange-400">
                                                        <Flame className="w-3.5 h-3.5 fill-current" />
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-3 lg:px-2 py-4 text-center font-black tabular-nums">
                                            {match.prediction?.probOver && lineFor(match.selectedStat) != null ? (
                                                <>
                                                    <span className="text-emerald-400">
                                                        {(100 * match.prediction.probOver(lineFor(match.selectedStat))).toFixed(0)}%
                                                    </span>
                                                    <span className="block text-[10px] font-bold text-zinc-600">
                                                        over {lineFor(match.selectedStat)}
                                                    </span>
                                                </>
                                            ) : <span className="text-zinc-600">-</span>}
                                        </td>
                                        <td className="px-3 lg:px-2 py-4 text-center">
                                            <div className="relative inline-block">{statSelect(match, 'w-[110px] py-1.5')}</div>
                                        </td>
                                        <td className="px-3 lg:px-2 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {betBuilder(match)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        )) : (
                            <tbody>
                                <tr>
                                    <td colSpan={8} className="px-5 py-8 text-center text-zinc-500">
                                        {t('No upcoming fixtures found for this matchday.')}
                                    </td>
                                </tr>
                            </tbody>
                        )}
                    </table>
                </div>
            </div>

            {/* Custom matchup: any two teams of the league, as if they met today.
                relative z-30 so the team pickers open over what follows. */}
            <div className="glass-panel p-5 md:p-6 rounded-xl border border-white/10 mt-8 relative z-30">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div>
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-emerald-400" />
                            {t('Custom matchup')}
                        </h3>
                        <p className="text-zinc-500 text-sm mt-0.5">{t('Any two teams from this league, modelled as if they met today.')}</p>
                    </div>
                    {showCustomPrediction && (
                        <Group label={t('Statistic')}>
                            <StatisticSelector
                                value={localStatistic}
                                onChange={(e) => setLocalStatistic(e.target.value)}
                                className="w-[160px]"
                            />
                        </Group>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] items-end gap-3">
                    <div>
                        <span className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">{t('Home team')}</span>
                        <Select accent="emerald" value={customHome} onChange={setCustomHome} options={teamOptions} />
                    </div>
                    <button
                        type="button"
                        onClick={() => { setCustomHome(customAway); setCustomAway(customHome); }}
                        aria-label={t('Swap home and away')}
                        title={t('Swap home and away')}
                        className="h-10 w-10 mx-auto rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-colors"
                    >
                        <ArrowLeftRight className="w-4 h-4" />
                    </button>
                    <div>
                        <span className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">{t('Away team')}</span>
                        <Select accent="emerald" value={customAway} onChange={setCustomAway} options={teamOptions} />
                    </div>
                    <button
                        onClick={() => setShowCustomPrediction(!showCustomPrediction)}
                        disabled={customHome === customAway}
                        className={`h-10 px-5 rounded-lg text-sm font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed ${showCustomPrediction
                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}
                    >
                        {showCustomPrediction ? t('Hide') : t('Analyze')}
                    </button>
                </div>
                {customHome === customAway && (
                    <p className="text-xs text-amber-400 mt-2">{t('Pick two different teams.')}</p>
                )}

                {showCustomPrediction && customHome !== customAway && !customPrediction && (
                    <p className="text-sm text-zinc-500 text-center mt-6">{t('Not enough history for these two teams to model yet.')}</p>
                )}

                {showCustomPrediction && customPrediction && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
                        <PredictionHero prediction={customPrediction} home={customHome} away={customAway} teamLogos={teamLogos} selectedStatistic={localStatistic} leagueAverage={leagueAverages[localStatistic]} line={lineFor(localStatistic)} onTeamClick={onTeamClick} />

                        {customPrediction?.probOver && (
                            <ProbabilityLadder prediction={customPrediction} statistic={localStatistic}
                                home={customHome} away={customAway} priceFor={priceFor} pricedLines={pricedLines}
                                bets={bets} addToBet={addToBet} removeFromBet={removeFromBet} />
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormPanel team={customHome} label={useGeneralStats ? t('All games') : t('Home games')} accent="text-emerald-400" matches={customPrediction.homeMatches.map(inTargetUnits)} line={lineFor(localStatistic)} teamLogos={teamLogos} onTeamClick={onTeamClick} />
                            <FormPanel team={customAway} label={useGeneralStats ? t('All games') : t('Away games')} accent="text-blue-400" matches={customPrediction.awayMatches.map(inTargetUnits)} line={lineFor(localStatistic)} teamLogos={teamLogos} onTeamClick={onTeamClick} />
                        </div>
                    </div>
                )}
            </div>


            {/* Detailed Analysis Modal/Section */}

            {showAccuracy && (
                <AccuracyReport
                    matches={matchData}
                    selectedStatistic={localStatistic}
                    teamLogos={teamLogos}
                    onClose={() => setShowAccuracy(false)}
                />
            )}

            {showDistribution && (
                <StatisticDistribution
                    matches={matchData}
                    onClose={() => setShowDistribution(false)}
                />
            )}
        </div >
    );
};

export default Predictor;

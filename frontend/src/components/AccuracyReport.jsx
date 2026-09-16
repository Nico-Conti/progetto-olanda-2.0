import React, { useState, useMemo } from 'react';
import {
    createPredictionModel,
    addMatchToPredictionModel,
    predictFromModel,
} from '../utils/predictTotal';
import { defaultLineFor, MARGIN_OPTIONS, MIN_CALLS } from '../utils/backtest';
import { resolveStatKey, statPair, STAT_CONFIG } from '../utils/statistics';
import { sortMatchesChronologically } from '../utils/backtestEngine';
import { ChevronDown, Play, AlertCircle, CheckCircle, TrendingUp, X, Sparkles } from 'lucide-react';
import { t, tx, dateLocale } from '../i18n';
import { getStatLabel } from '../utils/statistics';

const AccuracyReport = ({ matches, selectedStatistic, teamLogos, onClose }) => {
    const [nGames, setNGames] = useState(5);
    const [forceMean, setForceMean] = useState(false);
    const [useGeneralStats, setUseGeneralStats] = useState(false);
    const [results, setResults] = useState([]);
    const [isCalculating, setIsCalculating] = useState(false);
    const [summary, setSummary] = useState(null);
    // A fixed line plus a confidence margin. This replaced softBuffer/minPred/maxCap,
    // which existed only to shape the old `round(prediction) - 0.5` line - a line that
    // always sat below the prediction and so flattered every model.
    const [line, setLine] = useState(defaultLineFor(selectedStatistic) ?? 0);
    const [margin, setMargin] = useState(0);

    // Sort played matches by date ascending (or giornata if date missing)
    const sortedMatches = useMemo(
        () => sortMatchesChronologically(matches, selectedStatistic),
        [matches, selectedStatistic]
    );

    // Walk the season forward, calling over/under at `line` and comparing against the
    // base rate of always picking whichever side came up more often.
    const calculateBacktestLogic = (nGamesOpt, forceMeanOpt, useGeneralStatsOpt, marginOpt = margin) => {
        const tempResults = [];
        let correct = 0, calls = 0, overs = 0, seen = 0;
        let totalDiff = 0, errorCount = 0;

        // Running history, built up one match at a time instead of being
        // rebuilt from scratch on every iteration (that was O(n^2)). The model
        // also resolves which statistic actually drives this one - corners are
        // predicted from shots, goals from box touches.
        const model = createPredictionModel(selectedStatistic);
        const statKey = resolveStatKey(selectedStatistic);

        for (let i = 0; i < sortedMatches.length; i++) {
            const targetMatch = sortedMatches[i];
            const homeTeam = targetMatch.home || targetMatch.squadre?.home;
            const awayTeam = targetMatch.away || targetMatch.squadre?.away;

            const prediction = predictFromModel(model, homeTeam, awayTeam, {
                nGames: nGamesOpt,
                useGeneralStats: useGeneralStatsOpt,
                aggregatorOverride: forceMeanOpt ? 'mean' : null,
                asOf: targetMatch.date,
            });

            // statPair, not a raw read: a statistic the match does not have comes
            // back as {home: null, away: null}, and `Number(null)` is 0 - which
            // would score a backfilled fixture as a real 0-0 and count it as a
            // hit or miss it never was.
            const actual = statPair(targetMatch, statKey);
            if (prediction && prediction.total > 0 && actual) {
                const actualHome = Number(actual.home);
                const actualAway = Number(actual.away);
                const actualTotal = actualHome + actualAway;
                const diff = actualTotal - prediction.total;

                const isOver = actualTotal > line;
                seen++;
                if (isOver) overs++;

                const calledOver = prediction.total > line;
                const confident = Math.abs(prediction.total - line) >= marginOpt;
                const isCorrect = calledOver === isOver;

                if (confident) {
                    calls++;
                    if (isCorrect) correct++;
                    totalDiff += Math.abs(diff);
                    errorCount++;
                }

                tempResults.push({
                    match: targetMatch,
                    home: homeTeam,
                    away: awayTeam,
                    prediction,
                    actual: { home: actualHome, away: actualAway, total: actualTotal },
                    diff,
                    absDiff: Math.abs(diff),
                    line,
                    calledOver,
                    wasOver: isOver,
                    isCorrect,
                    isNoBet: !confident,
                });
            }

            // Advance the running history: from here on, this match is past.
            addMatchToPredictionModel(model, targetMatch);
        }

        const overRate = seen > 0 ? overs / seen : 0;
        const baseRate = Math.max(overRate, 1 - overRate);
        const accuracy = calls > 0 ? correct / calls : 0;

        return {
            results: tempResults,
            summary: {
                accuracy,
                baseRate,
                edge: accuracy - baseRate,
                calls,
                seen,
                correct,
                beatsBaseRate: calls >= MIN_CALLS && accuracy > baseRate,
                avgError: errorCount > 0 ? totalDiff / errorCount : 0,
                line,
                margin: marginOpt,
            }
        };
    };

    const runBacktest = () => {
        setIsCalculating(true);

        // Use setTimeout to allow UI to update to "Calculating..." state
        setTimeout(() => {
            const { results: res, summary: sum } = calculateBacktestLogic(nGames, forceMean, useGeneralStats);
            setResults(res.reverse()); // Show newest first
            setSummary(sum);
            setIsCalculating(false);
        }, 100);
    };

    // Sweep the model knobs *and* the confidence margin, ranking by how far each beats
    // the base rate rather than by raw win rate. A combination that calls too few
    // matches is ignored however good it looks - see MIN_CALLS.
    const optimizeSettings = () => {
        setIsCalculating(true);
        setTimeout(() => {
            const nGamesOptions = [3, 5, 10, 'all'];
            const forceMeanOptions = [false, true];
            const generalStatsOptions = [false, true];

            let best = null;
            let widest = null;

            for (const n of nGamesOptions) {
                for (const fm of forceMeanOptions) {
                    for (const ugs of generalStatsOptions) {
                        for (const mg of MARGIN_OPTIONS) {
                            const run = calculateBacktestLogic(n, fm, ugs, mg);
                            const params = { n, fm, ugs, mg };

                            if (!widest || run.summary.calls > widest.run.summary.calls) {
                                widest = { params, run };
                            }
                            if (run.summary.calls < MIN_CALLS) continue;
                            if (!best || run.summary.edge > best.run.summary.edge) {
                                best = { params, run };
                            }
                        }
                    }
                }
            }

            // Nothing cleared the sample floor: show the widest-sampled run, which will
            // report beatsBaseRate: false rather than a flattering percentage.
            const chosen = best || widest;
            if (chosen) {
                setNGames(chosen.params.n);
                setForceMean(chosen.params.fm);
                setUseGeneralStats(chosen.params.ugs);
                setMargin(chosen.params.mg);
                setResults([...chosen.run.results].reverse());
                setSummary(chosen.run.summary);
            }
            setIsCalculating(false);
        }, 100);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-white/10 shadow-2xl bg-zinc-950">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-emerald-400" />
                            {t('Accuracy Analysis')}
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">
                            {tx('Backtest betting lines against past results for {stat}.', { stat: <span className="text-emerald-400 font-bold uppercase">{getStatLabel(selectedStatistic)}</span> })}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ChevronDown className="w-6 h-6 text-zinc-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="flex flex-col border-b border-white/5 bg-zinc-900/50">
                    <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Sample Size */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Sample Size')}</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                {[3, 5, 'all'].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setNGames(n)}
                                        className={`flex-1 text-[10px] font-bold uppercase rounded transition ${nGames === n ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        {n === 'all' ? t('Season') : t('Last {n}', { n })}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Aggregator */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Aggregator')}</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                <button
                                    onClick={() => setForceMean(false)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition ${!forceMean ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t('Median')}
                                </button>
                                <button
                                    onClick={() => setForceMean(true)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition ${forceMean ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t('Mean')}
                                </button>
                            </div>
                        </div>

                        {/* Trend Mode */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Trend Mode')}</label>
                            <div className="flex bg-zinc-950 border border-white/10 rounded-lg p-1 h-9">
                                <button
                                    onClick={() => setUseGeneralStats(false)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition ${!useGeneralStats ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t('Specific')}
                                </button>
                                <button
                                    onClick={() => setUseGeneralStats(true)}
                                    className={`flex-1 text-[10px] font-bold uppercase rounded transition ${useGeneralStats ? 'bg-zinc-800 text-white shadow-sm border border-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t('General')}
                                </button>
                            </div>
                        </div>

                        {/* Line */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Line')}</label>
                            <select
                                value={line}
                                onChange={(e) => setLine(Number(e.target.value))}
                                className="bg-zinc-950 border border-white/10 rounded-lg h-9 px-3 text-white text-xs font-bold focus:outline-none"
                            >
                                {[...new Set([
                                    defaultLineFor(selectedStatistic),
                                    ...(STAT_CONFIG[resolveStatKey(selectedStatistic)]?.total?.options ?? []),
                                ])].filter(v => v != null).sort((a, b) => a - b).map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>

                        {/* Confidence margin */}
                        <div className="flex flex-col gap-2">
                            <label
                                className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider"
                                title={t('Only call a match when the prediction is at least this far from the line.')}
                            >
                                {t('Margin')}
                            </label>
                            <select
                                value={margin}
                                onChange={(e) => setMargin(Number(e.target.value))}
                                className="bg-zinc-950 border border-white/10 rounded-lg h-9 px-3 text-white text-xs font-bold focus:outline-none"
                            >
                                {MARGIN_OPTIONS.map(v => (
                                    <option key={v} value={v}>{v === 0 ? t('Call every match') : `>= ${v}`}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-6 pb-6 pt-0 flex gap-4">
                        <button
                            onClick={optimizeSettings}
                            disabled={isCalculating}
                            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase tracking-widest text-sm rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-white/5 hover:border-emerald-500/50"
                            title={t('Automatically find the best combination of settings')}
                        >
                            {isCalculating ? (
                                <span className="t-shimmer" data-text={t('Optimizing...')}>{t('Optimizing...')}</span>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 text-emerald-400 fill-emerald-400/20" /> {t('Auto-Optimize')}
                                </>
                            )}
                        </button>

                        <button
                            onClick={runBacktest}
                            disabled={isCalculating}
                            className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase tracking-widest text-sm rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                        >
                            {isCalculating ? (
                                <span
                                    // Dark text on the emerald button, so the shimmer is retuned to match.
                                    className="t-shimmer [--shimmer-base:rgb(9_9_11/0.55)] [--shimmer-highlight:#09090b]"
                                    data-text={t('Computing Matches...')}
                                >
                                    {t('Computing Matches...')}
                                </span>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 fill-current" /> {t('Run Backtest Analysis')}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                    {summary && (
                        <div className="mb-6 space-y-4">
                            <div className={`glass-panel p-4 rounded-lg border ${summary.beatsBaseRate
                                ? 'border-emerald-500/25 bg-emerald-500/10'
                                : 'border-amber-500/25 bg-amber-500/5'}`}>
                                <div className="text-xs font-bold uppercase mb-1 tracking-wide text-zinc-400">
                                    {summary.beatsBaseRate ? t('Beats the base rate') : t('No edge over the base rate')}
                                </div>
                                <div className="flex items-baseline gap-3 flex-wrap">
                                    <span className={`text-3xl font-black ${summary.beatsBaseRate ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {(100 * summary.accuracy).toFixed(1)}%
                                    </span>
                                    <span className="text-sm text-zinc-400">
                                        {tx('vs {rate} from always betting the same side', { rate: <span className="font-bold text-zinc-300">{(100 * summary.baseRate).toFixed(1)}%</span> })}
                                    </span>
                                    <span className={`text-sm font-black ${summary.edge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {summary.edge >= 0 ? '+' : ''}{(100 * summary.edge).toFixed(1)}pt
                                    </span>
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                                    {tx('Called over/under {line} on {calls} of {seen} matches', { line: <span className="font-bold text-zinc-400">{summary.line}</span>, calls: <span className="font-bold text-zinc-400">{summary.calls}</span>, seen: summary.seen })}
                                    {summary.margin > 0 && <> {t('(only when the prediction sat {margin}+ away from the line)', { margin: summary.margin })}</>}.
                                    {summary.calls < MIN_CALLS && <> {t('Fewer than {n} calls, so treat this as noise.', { n: MIN_CALLS })}</>}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                    <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{t('Calls Made')}</div>
                                    <div className="text-2xl font-black text-white">{summary.calls}</div>
                                    <div className="text-[9px] text-zinc-600 mt-0.5">of {summary.seen} predictable</div>
                                </div>
                                <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                    <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{t('Correct')}</div>
                                    <div className="text-2xl font-black text-emerald-400">{summary.correct}</div>
                                </div>
                                <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                    <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{t('Wrong')}</div>
                                    <div className="text-2xl font-black text-red-400">{summary.calls - summary.correct}</div>
                                </div>
                                <div className="glass-panel p-4 rounded-lg border border-white/10 bg-zinc-900/50">
                                    <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{t('Avg Abs Error')}</div>
                                    <div className="text-2xl font-black text-white">{summary.avgError.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {results.length > 0 ? (
                        <div className="overflow-x-auto -mx-6 px-6">
                        <table className="w-full min-w-[520px] text-left text-zinc-300">
                            <thead className="text-xs text-zinc-500 uppercase border-b border-white/5 bg-zinc-950/50">
                                <tr>
                                    <th className="py-4 pl-4 w-[40%] whitespace-nowrap">{t('Match')}</th>
                                    <th className="py-4 text-center w-[15%] whitespace-nowrap">{t('Date')}</th>
                                    <th className="py-4 text-center w-[15%] whitespace-nowrap">{t('Call')}</th>
                                    <th className="py-4 text-center w-[15%] whitespace-nowrap">{t('Actual')}</th>
                                    <th className="py-4 text-center w-[15%] whitespace-nowrap">{t('Result')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {results.map((res, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="py-3 pl-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col items-end w-24">
                                                    <span className="font-bold truncate w-full text-right">{res.home}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <img src={teamLogos[res.home]} alt={res.home} className="w-5 h-5 object-contain" />
                                                    <span className="text-zinc-600 text-xs font-bold">{t('vs')}</span>
                                                    <img src={teamLogos[res.away]} alt={res.away} className="w-5 h-5 object-contain" />
                                                </div>
                                                <div className="flex flex-col w-24">
                                                    <span className="font-bold truncate w-full">{res.away}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 text-center text-zinc-500 text-xs">
                                            {res.match.date
                                                ? new Date(res.match.date).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })
                                                : (res.match.giornata || '-')}
                                        </td>
                                        <td className="py-3 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-mono font-bold ${res.calledOver ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                    {res.calledOver ? t('Over') : t('Under')} {res.line}
                                                </span>
                                                <span className="text-[9px] text-zinc-600">{t('Pred: {n}', { n: res.prediction.total.toFixed(1) })}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 text-center font-mono font-bold text-white">
                                            {res.actual.total}
                                        </td>
                                        <td className={`py-3 text-center font-bold ${res.isNoBet ? 'text-zinc-600' : (res.isCorrect ? 'text-emerald-500' : 'text-red-500')}`}>
                                            {res.isNoBet ? t('No call') : (res.isCorrect ? t('Correct') : t('Wrong'))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    ) : (
                        <div className="text-center text-zinc-500 py-20 flex flex-col items-center">
                            <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
                            <p>{t('Click "Run Backtest Analysis" to analyze historical performance.')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccuracyReport;

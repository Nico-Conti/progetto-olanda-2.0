import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { expectedValue, devig } from '../utils/countModel';
import { getStatLabel, resolveStatKey, MARKET_FOR_STAT } from '../utils/statistics';
import { API_BASE_URL } from '../config';
import Header from './Header';
import StatisticSelector from './StatisticSelector';
import MatchCard from './MatchCard';
import MarketMovesGuide from './MarketMovesGuide';
import { hasBet } from '../utils/bets';
import { leagueMeta } from '../utils/leaguePickerFx';
import { staggerDelay } from '../utils/stagger';
import { t, dateLocale } from '../i18n';

const MOVERS_SHOWN = 12;
const PICKS_SHOWN = 30;

/**
 * Closing-line value: did the price we could have taken beat the close?
 *
 * The close is the market's best estimate, so beating it consistently is the
 * earliest honest sign of an edge - it converges in dozens of bets where ROI
 * needs thousands. `/odds/moves` hands back the first and closing price of every
 * line (backend/main.py); everything else is computed here, from the same model
 * and the same EV rule Hot Matches ranks by, so a "pick" means the same thing on
 * both screens.
 *
 * A pick is the fixture's best positive-EV side at the OPENING price, gated on
 * `prediction.confident` exactly as Hot Matches is. Its CLV is measured against
 * the devigged close, because a raw closing price still carries the margin and
 * would make every bet look like it lost a few percent.
 *
 * ponytail: statistics still on the window estimator (no fitted half-life) are
 * predicted with the whole season, including matches after kickoff, so their
 * past picks peek a little. The decayed ones honour `asOf` and do not.
 */

/** Group /odds/moves rows into one entry per fixture, lines keyed by value. */
const byFixture = (rows) => {
    const out = new Map();
    for (const r of rows) {
        const key = `${r.league}|${r.home_team}|${r.away_team}|${r.match_date}`;
        if (!out.has(key)) {
            out.set(key, {
                key, league: r.league, home: r.home_team, away: r.away_team,
                date: r.match_date, final: r.final, lines: new Map(),
            });
        }
        const lines = out.get(key).lines;
        const line = Number(r.line);
        if (!lines.has(line)) lines.set(line, {});
        lines.get(line)[r.selection] = { open: Number(r.open), close: Number(r.close) };
    }
    return [...out.values()];
};

/** The market's own probability for a side at `when` ('open' | 'close'), devigged when it can be. */
const marketProb = (quotes, side, when) => {
    const over = quotes.over?.[when];
    const under = quotes.under?.[when];
    const dv = devig(over, under);
    if (dv) return dv[side];
    const price = quotes[side]?.[when];
    return price > 1 ? 1 / price : null;
};

const pct = (x, digits = 1) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;

const useMoves = (market) => {
    // Tagged with the market it answers, so a switch reads as loading until its own result lands.
    const [state, setState] = useState({ market: null, rows: [], error: null });
    useEffect(() => {
        if (!market) return undefined;
        let cancelled = false;
        fetch(`${API_BASE_URL}/odds/moves?market=${encodeURIComponent(market)}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
            .then(rows => !cancelled && setState({ market, rows, error: null }))
            .catch(err => !cancelled && setState({ market, rows: [], error: err.message }));
        return () => { cancelled = true; };
    }, [market]);
    const current = state.market === market;
    return { rows: current ? state.rows : [], loading: !current, error: current ? state.error : null };
};

const Tile = ({ label, value, tone = 'text-white' }) => (
    <div className="glass-panel rounded-xl border border-white/10 px-4 py-3 text-center">
        <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className={`block text-2xl font-black tabular-nums ${tone}`}>{value}</span>
    </div>
);

const MarketMoves = ({ matchData, teamLogos, leagues, selectedStatistic, onStatisticChange, onBack, onMatchClick, modelSettings, bets, onOpenBetSlip }) => {
    const [tab, setTab] = useState('movers');
    const { nGames, useGeneralStats, forceMean } = modelSettings;
    const market = MARKET_FOR_STAT[resolveStatKey(selectedStatistic)];
    const { rows, loading, error } = useMoves(market);

    const predictionModel = useMemo(
        () => buildPredictionModel(matchData, selectedStatistic, { trackResiduals: true }),
        [matchData, selectedStatistic]
    );

    const fixtures = useMemo(() => byFixture(rows).map(f => {
        const pred = predictFromModel(predictionModel, f.home, f.away, {
            nGames, useGeneralStats,
            aggregatorOverride: forceMean ? 'mean' : null,
            asOf: new Date(f.date),
            engine: ENGINES.COUNT,
        });
        const modelProb = (line, side) => {
            const p = pred?.probOver?.(line);
            return p == null ? null : (side === 'over' ? p : 1 - p);
        };

        // Best positive-EV side at the opening price - the bet we would have made.
        let pick = null;
        if (pred?.confident) {
            for (const [line, q] of f.lines) {
                for (const side of ['over', 'under']) {
                    const ev = expectedValue(modelProb(line, side), q[side]?.open);
                    if (ev > 0 && (!pick || ev > pick.ev)) pick = { line, side, ev, ...q[side] };
                }
            }
        }
        if (pick) {
            const fair = marketProb(f.lines.get(pick.line), pick.side, 'close');
            pick.clv = fair ? pick.open * fair - 1 : null;
        }

        // The biggest shift in the market's opinion, on any line and side.
        let move = null;
        for (const [line, q] of f.lines) {
            for (const side of ['over', 'under']) {
                const from = marketProb(q, side, 'open');
                const to = marketProb(q, side, 'close');
                if (from == null || to == null) continue;
                // Only the side that shortened: its twin carries the same move mirrored.
                if (to - from > (move?.shift ?? 0)) {
                    const mp = modelProb(line, side);
                    move = {
                        line, side, shift: to - from, ...q[side],
                        // The model sided with this move if it already rated the side above the opening market.
                        withModel: mp == null ? null : mp > from,
                    };
                }
            }
        }
        return { ...f, pick, move };
    }), [rows, predictionModel, nGames, useGeneralStats, forceMean]);

    const movers = useMemo(() => fixtures
        .filter(f => !f.final && f.move)
        .sort((a, b) => b.move.shift - a.move.shift)
        .slice(0, MOVERS_SHOWN), [fixtures]);

    const picks = useMemo(() => fixtures
        .filter(f => f.final && f.pick?.clv != null)
        .sort((a, b) => new Date(b.date) - new Date(a.date)), [fixtures]);

    const report = useMemo(() => {
        if (!picks.length) return null;
        const share = (test) => picks.filter(test).length / picks.length;
        return {
            n: picks.length,
            // Raw: did the line move our way at all. Devigged: did it move past the margin.
            shortened: share(p => p.pick.close < p.pick.open),
            beat: share(p => p.pick.clv > 0),
            mean: picks.reduce((s, p) => s + p.pick.clv, 0) / picks.length,
        };
    }, [picks]);

    const statLabel = getStatLabel(selectedStatistic);
    const sideLabel = (m) => `${m.side === 'over' ? t('Over') : t('Under')} ${m.line}`;
    const title = t('Market Moves').split(' ');

    return (
        <div className="min-h-screen text-zinc-200 font-sans relative pb-12">
            <Header
                title={(
                    <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
                        Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                    </h1>
                )}
                onLogoClick={onBack}
                showBetSlip={true}
                betsCount={bets?.length ?? 0}
                onOpenBetSlip={onOpenBetSlip}
                pageName={(
                    <h1 className="text-lg font-black tracking-tight text-white leading-none">
                        {title[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">{title.slice(1).join(' ')}</span>
                    </h1>
                )}
            >
                <StatisticSelector value={selectedStatistic} onChange={onStatisticChange} className="w-[180px]" />
            </Header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
                <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-900 rounded-lg border border-white/10">
                            <Activity className="w-5 h-5 text-cyan-500" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black text-white leading-none tracking-tight">
                                {title[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-500">{title.slice(1).join(' ')}</span>
                            </h2>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                                {t('{stat} closing line value', { stat: statLabel })}
                            </p>
                        </div>
                    </div>
                    <div className="flex p-1 rounded-xl bg-zinc-950/60 border border-white/10" role="tablist">
                        {[['movers', t('Movers')], ['report', t('Report card')]].map(([id, label]) => (
                            <button
                                key={id}
                                role="tab"
                                aria-selected={tab === id}
                                onClick={() => setTab(id)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${tab === id
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <MarketMovesGuide />

                {!market && (
                    <p className="text-center py-12 text-zinc-500">{t('The bookmaker does not price {stat}. Pick another statistic.', { stat: statLabel })}</p>
                )}
                {market && loading && (
                    <p className="text-center py-12 text-zinc-500">{t('Loading price history...')}</p>
                )}
                {market && error && (
                    <p className="text-center py-12 text-zinc-500">{t('Price history unavailable.')}</p>
                )}

                {market && !loading && !error && tab === 'movers' && (
                    <>
                        <p className="text-xs text-zinc-500">
                            {t('Upcoming fixtures whose price moved most since we first saw it. "With model" means our model already rated that side above the opening market.')}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {movers.map((f, idx) => (
                                <MatchCard
                                    key={f.key}
                                    match={f}
                                    rank={idx + 1}
                                    meta={leagueMeta(leagues, f.league)}
                                    teamLogos={teamLogos}
                                    inSlip={hasBet(bets, f.home, f.away)}
                                    style={{ animationDelay: staggerDelay(idx) }}
                                    onClick={() => onMatchClick?.(f)}
                                    center={(
                                        <>
                                            <div className="text-4xl font-black text-white tracking-tighter tabular-nums leading-none">
                                                {pct(f.move.shift)}
                                            </div>
                                            <span className="mt-2 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                                                {sideLabel(f.move)}
                                            </span>
                                        </>
                                    )}
                                >
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-zinc-950/40 rounded-lg px-3 py-2 border border-white/5 text-center">
                                            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Price')}</span>
                                            <span className="flex items-center justify-center gap-1 text-lg font-black text-white tabular-nums">
                                                <span className="text-zinc-500">{f.move.open.toFixed(2)}</span>
                                                <ArrowDownRight className="w-4 h-4 shrink-0 text-emerald-400" />
                                                {f.move.close.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="bg-zinc-950/40 rounded-lg px-3 py-2 border border-white/5 text-center">
                                            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Model')}</span>
                                            <span className={`block text-lg font-black ${f.move.withModel == null ? 'text-zinc-500'
                                                : f.move.withModel ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {f.move.withModel == null ? '—' : f.move.withModel ? t('With model') : t('Against')}
                                            </span>
                                        </div>
                                    </div>
                                </MatchCard>
                            ))}
                        </div>
                        {!movers.length && (
                            <p className="text-center py-12 text-zinc-500">{t('No upcoming price has moved yet.')}</p>
                        )}
                    </>
                )}

                {market && !loading && !error && tab === 'report' && (
                    <>
                        <p className="text-xs text-zinc-500">
                            {t('Every confident positive-EV pick of the last two weeks, taken at the opening price and measured against the devigged close.')}
                        </p>
                        {report ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <Tile label={t('Picks')} value={report.n} />
                                    <Tile label={t('Price shortened')} value={`${(report.shortened * 100).toFixed(0)}%`}
                                        tone={report.shortened > 0.5 ? 'text-emerald-400' : 'text-red-400'} />
                                    <Tile label={t('Beat the fair close')} value={`${(report.beat * 100).toFixed(0)}%`}
                                        tone={report.beat > 0.5 ? 'text-emerald-400' : 'text-red-400'} />
                                    <Tile label={t('Average CLV')} value={pct(report.mean)}
                                        tone={report.mean > 0 ? 'text-emerald-400' : 'text-red-400'} />
                                </div>
                                <div className="glass-panel rounded-xl border border-white/10 divide-y divide-white/5">
                                    {picks.slice(0, PICKS_SHOWN).map((f, idx) => (
                                        <div key={f.key} className="flex items-center gap-3 px-4 py-2.5 text-sm animate-waterfall" style={{ animationDelay: staggerDelay(idx) }}>
                                            <span className="w-16 shrink-0 text-[11px] font-bold text-zinc-500 tabular-nums">
                                                {new Date(f.date).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                                            </span>
                                            <span className="flex-1 min-w-0 truncate font-bold text-white">{f.home} – {f.away}</span>
                                            <span className="hidden sm:block w-24 text-xs font-bold text-cyan-400">{sideLabel(f.pick)}</span>
                                            <span className="w-24 shrink-0 text-right text-xs text-zinc-400 tabular-nums">
                                                {f.pick.open.toFixed(2)} → {f.pick.close.toFixed(2)}
                                            </span>
                                            <span className={`w-20 shrink-0 flex items-center justify-end gap-0.5 font-black tabular-nums ${f.pick.clv > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {f.pick.clv > 0 ? <ArrowUpRight className="w-3.5 h-3.5 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />}
                                                {pct(f.pick.clv)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-center py-12 text-zinc-500">{t('No settled picks with a closing price yet.')}</p>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default MarketMoves;

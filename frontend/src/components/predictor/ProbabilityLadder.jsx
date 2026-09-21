import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SlipIcon } from '../BetBuilderCell';
import { STAT_CONFIG, resolveStatKey, getStatLabel } from '../../utils/statistics';
import { POISSON_LIMIT, expectedValue, devig } from '../../utils/countModel';
import { MIN_EFFECTIVE_FOR_EV } from '../../utils/predictTotal';
import { t } from '../../i18n';

/**
 * What the distribution can say that a single number cannot.
 *
 * A predicted total on its own can only be called over/under at one hardcoded
 * line. Real bookmakers post whichever line suits the match - captured foul
 * prices sit at 20.5, 21.5, 22.5 and 25.5, and only 46% of matches would be
 * priced at the 9.5 corner line the app assumes. This prices every line the
 * market realistically offers, from a single fit, and where a captured price
 * exists it shows the expected value of taking it.
 *
 * Probabilities are monotone by construction - they come from one distribution,
 * so P(over 10.5) can never exceed P(over 9.5), which separately fitted per-line
 * models can and do.
 *
 * EV is deliberately withheld when the prediction is thin. EV ranks by how far
 * the model disagrees with the market, and the largest disagreements come from
 * the least history rather than the most insight.
 *
 * Once the fixture has prices, only the priced lines are shown - the rest were
 * dead "— / —" columns - and hovering (or tapping) a price opens a card that
 * adds its Over or Under to the slip.
 */
const ProbabilityLadder = ({ prediction, statistic, home, away, date, priceFor, pricedLines, bets, addToBet, removeFromBet }) => {
    // The side just added, e.g. '7.5O', for the check that draws itself in.
    const [justAdded, setJustAdded] = useState(null);
    if (!prediction?.probOver) return null;

    const key = resolveStatKey(statistic);
    const config = STAT_CONFIG[key]?.total;
    if (!config) return null;

    // The configured ladder, plus any line this fixture is actually priced at.
    // The book posts lines we do not list - both Serie A fixtures on 2026-08-24
    // had total fouls at 25.5 only, and the foul ladder steps 20.5, 22.5, 24.5,
    // so the day's one priced foul market showed nowhere.
    const lines = [...new Set([
        config.default,
        ...(config.options ?? []),
        ...(pricedLines?.(home, away, statistic) ?? []),
    ])].sort((a, b) => a - b);
    const ladder = lines
        .map(line => {
            const over = prediction.probOver(line);
            if (over == null) return null;
            const overPrice = priceFor?.(home, away, statistic, line, true) ?? null;
            const underPrice = priceFor?.(home, away, statistic, line, false) ?? null;
            const market = (overPrice && underPrice) ? devig(overPrice, underPrice) : null;
            return {
                line, over, overPrice, underPrice, market,
                evOver: overPrice ? expectedValue(over, overPrice) : null,
                evUnder: underPrice ? expectedValue(1 - over, underPrice) : null,
            };
        })
        .filter(Boolean);
    const hasPrices = ladder.some(r => r.overPrice || r.underPrice);
    const rows = hasPrices ? ladder.filter(r => r.overPrice || r.underPrice) : ladder;
    if (!rows.length) return null;

    const confident = prediction.confident;
    const statLabel = getStatLabel(statistic);

    // The slip holds one total bet per game and statistic; adding another line
    // or side replaces it (App.jsx addToBet).
    const game = `${home} vs ${away}`;
    const slipBet = bets?.find(b => b.game === game && b.stat === statistic && b.team === 'total');
    const inSlip = (line, option) => Number(slipBet?.value) === line && slipBet?.option === option;
    const toggle = (line, option) => {
        if (inSlip(line, option)) {
            removeFromBet?.(game, statistic, 'total');
            return;
        }
        // `team` and `date` explicitly: omitting them left the slip's history
        // with no kickoff to show, since addToBet defaults date to null and a
        // saved leg carries whatever it was given at the time.
        addToBet?.(game, option, line, statistic, 'total', date ?? null);
        setJustAdded(`${line}${option}`);
        setTimeout(() => setJustAdded(null), 1500);
    };

    const shade = (p) => (p >= 0.65 ? 'text-emerald-400'
        : p <= 0.35 ? 'text-red-400' : 'text-zinc-400');

    const evCell = (ev) => {
        if (ev == null) return <span className="text-zinc-700">—</span>;
        // Below the confidence floor the number is still shown, but greyed: it is
        // arithmetic on an estimate we do not trust, not a recommendation.
        const tone = !confident ? 'text-zinc-600'
            : ev > 0.02 ? 'text-emerald-400'
                : ev < -0.02 ? 'text-red-400/70' : 'text-zinc-400';
        return <span className={tone}>{(ev >= 0 ? '+' : '') + (100 * ev).toFixed(0)}%</span>;
    };

    return (
        <div className="glass-panel rounded-xl border border-white/10 p-4 relative z-10">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-sm font-black text-white uppercase tracking-wide">
                    {t('{stat} — probability by line', { stat: statLabel })}
                </h4>
                <span className="text-[10px] text-zinc-500 uppercase font-bold">
                    {t('mean {n}', { n: prediction.total.toFixed(2) })}
                    {' · '}
                    {prediction.dispersion >= POISSON_LIMIT ? 'Poisson' : t('dispersion {n}', { n: prediction.dispersion })}
                </span>
            </div>

            {hasPrices && !confident && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        {prediction.measured === false
                            ? t('{stat} has no measured half-life or signal, so this model has never been validated for it — and we could not confirm the bookmaker prices the same quantity.', { stat: getStatLabel(statistic) })
                            : prediction.effectiveMatches != null
                                ? t('Thin history for this fixture ({n} effective matches, want {want}).', { n: prediction.effectiveMatches.toFixed(1), want: MIN_EFFECTIVE_FOR_EV })
                                : t('Thin history for this fixture.')}
                        {' '}{t('Expected value is shown but greyed out: it is arithmetic on an estimate we do not yet trust.')}
                    </p>
                </div>
            )}

            {/* Fixed layout: however many lines are priced, they share the full
                width. No scroll container with prices, or it would clip the
                add-to-slip cards. */}
            <div className={hasPrices ? '' : 'overflow-x-auto'}>
                <table className="w-full table-fixed text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase text-zinc-500 font-bold">
                            <th className="w-[5.25rem] sm:w-24 text-left py-1 pr-2 whitespace-nowrap">{t('Line')}</th>
                            {rows.map(r => (
                                <th key={r.line}
                                    className={`px-1 sm:px-2 py-1 text-center whitespace-nowrap ${(r.overPrice || r.underPrice) ? 'text-emerald-400' : ''}`}>
                                    {r.line}
                                    {Number(slipBet?.value) === r.line && (
                                        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" title={t('In the slip')} />
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        <tr className="border-t border-white/5">
                            <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-400 whitespace-nowrap">{t('Over')}</td>
                            {rows.map(r => (
                                <td key={r.line} className={`px-1 sm:px-2 py-1.5 text-center font-black ${shade(r.over)}`}>
                                    {(100 * r.over).toFixed(0)}%
                                </td>
                            ))}
                        </tr>
                        <tr className="border-t border-white/5">
                            <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-400 whitespace-nowrap">{t('Under')}</td>
                            {rows.map(r => (
                                <td key={r.line} className={`px-1 sm:px-2 py-1.5 text-center font-black ${shade(1 - r.over)}`}>
                                    {(100 * (1 - r.over)).toFixed(0)}%
                                </td>
                            ))}
                        </tr>

                        {hasPrices ? (
                            <>
                                <tr className="border-t border-white/10">
                                    <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-500 whitespace-nowrap">{t('Book O / U')}</td>
                                    {rows.map((r, i) => {
                                        const picked = Number(slipBet?.value) === r.line;
                                        // The card hangs inward at the ends so it never leaves the panel.
                                        const align = i === 0 ? 'left-0 origin-top-left'
                                            : i === rows.length - 1 ? 'right-0 origin-top-right'
                                                : 'left-1/2 -translate-x-1/2 origin-top';
                                        return (
                                            <td key={r.line} className="px-0.5 sm:px-1 py-1 text-center">
                                                <div
                                                    tabIndex={0}
                                                    aria-label={t('{stat} {line}: add Over or Under to the slip', { stat: statLabel, line: r.line })}
                                                    className={`quota relative mx-auto w-fit rounded-md px-1.5 sm:px-2 py-1 text-[11px] text-zinc-300 cursor-pointer outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-emerald-400 ${picked ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : ''}`}
                                                >
                                                    <span className="flex flex-col sm:flex-row items-center sm:gap-1">
                                                        <span className={inSlip(r.line, 'O') ? 'text-emerald-400 font-bold' : ''}>{r.overPrice ? r.overPrice.toFixed(2) : '—'}</span>
                                                        <span className="hidden sm:inline text-zinc-700">/</span>
                                                        <span className={inSlip(r.line, 'U') ? 'text-emerald-400 font-bold' : ''}>{r.underPrice ? r.underPrice.toFixed(2) : '—'}</span>
                                                    </span>

                                                    <div className={`quota-pop absolute top-full z-30 pt-1.5 w-56 ${align}`}>
                                                        <div className="rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-1.5 space-y-1 text-left">
                                                            <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                                                {statLabel} {r.line} · {t('add to slip')}
                                                            </div>
                                                            {[['O', t('Over'), r.overPrice, r.evOver], ['U', t('Under'), r.underPrice, r.evUnder]].map(([opt, label, price, ev]) => {
                                                                const on = inSlip(r.line, opt);
                                                                return (
                                                                    <button
                                                                        key={opt}
                                                                        type="button"
                                                                        disabled={!price}
                                                                        onClick={() => toggle(r.line, opt)}
                                                                        aria-pressed={on}
                                                                        className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-emerald-500/15' : 'hover:bg-white/5'}`}
                                                                    >
                                                                        <span className={`w-11 font-bold ${on ? 'text-emerald-300' : 'text-zinc-300'}`}>{label}</span>
                                                                        <span className="font-black text-white tabular-nums">{price ? price.toFixed(2) : '—'}</span>
                                                                        {price && <span className="ml-auto text-[10px] font-bold text-zinc-500">EV {evCell(ev)}</span>}
                                                                        <span className={`${price ? '' : 'ml-auto'} w-6 h-6 shrink-0 flex items-center justify-center rounded-md transition-colors ${on ? 'bg-emerald-500 text-zinc-950' : 'bg-white/5 text-zinc-400'}`}>
                                                                            <SlipIcon isInSlip={on} justAdded={justAdded === `${r.line}${opt}`} />
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                            {slipBet && !picked && (
                                                                <div className="px-2 pb-1 text-[10px] text-zinc-500">
                                                                    {t('Replaces {pick} in the slip', { pick: `${slipBet.option === 'O' ? t('Over') : t('Under')} ${slipBet.value}` })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="border-t border-white/5">
                                    <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-500 whitespace-nowrap">{t('EV Over')}</td>
                                    {rows.map(r => (
                                        <td key={r.line} className="px-1 sm:px-2 py-1.5 text-center font-black text-[12px]">{evCell(r.evOver)}</td>
                                    ))}
                                </tr>
                                <tr className="border-t border-white/5">
                                    <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-500 whitespace-nowrap">{t('EV Under')}</td>
                                    {rows.map(r => (
                                        <td key={r.line} className="px-1 sm:px-2 py-1.5 text-center font-black text-[12px]">{evCell(r.evUnder)}</td>
                                    ))}
                                </tr>
                            </>
                        ) : (
                            <tr className="border-t border-white/10">
                                <td className="text-left py-1.5 pr-2 text-[11px] uppercase font-bold text-zinc-500 whitespace-nowrap">
                                    {t('Break-even odds')}
                                </td>
                                {rows.map(r => (
                                    <td key={r.line} className="px-2 py-1.5 text-center text-[11px] text-zinc-500">
                                        {(1 / r.over).toFixed(2)}
                                    </td>
                                ))}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
                {prediction.dispersionFitted
                    ? t('Spread fitted on {n} past predictions.', { n: prediction.residualCount })
                    : t('Not enough history to fit the spread yet, so a Poisson is assumed.')}
                {' '}
                {hasPrices
                    ? t('Only the lines the bookmaker prices are shown. EV is the expected profit per unit staked at the price shown; positive means the price is longer than our probability justifies. Hover or tap a price to add it to the slip.')
                    : t('No captured prices for this fixture, so break-even odds are shown instead: the price at which a bet on Over is a coin flip.')}
            </p>
        </div>
    );
};

export default ProbabilityLadder;

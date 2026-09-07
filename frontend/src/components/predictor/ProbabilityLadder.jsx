import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { STAT_CONFIG, resolveStatKey, getStatLabel } from '../../utils/statistics';
import { POISSON_LIMIT, expectedValue, devig } from '../../utils/countModel';
import { MIN_EFFECTIVE_FOR_EV } from '../../utils/predictTotal';

/**
 * What the distribution engine can say that a single number cannot.
 *
 * The classic engine predicts one total and calls over/under at one hardcoded
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
 */
const ProbabilityLadder = ({ prediction, statistic, home, away, priceFor, pricedLines }) => {
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
    const rows = lines
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
    if (!rows.length) return null;

    const hasPrices = rows.some(r => r.overPrice || r.underPrice);
    const confident = prediction.confident;

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
                    {getStatLabel(statistic)} — probability by line
                </h4>
                <span className="text-[10px] text-zinc-500 uppercase font-bold">
                    mean {prediction.total.toFixed(2)}
                    {' · '}
                    {prediction.dispersion >= POISSON_LIMIT ? 'Poisson' : `dispersion ${prediction.dispersion}`}
                </span>
            </div>

            {hasPrices && !confident && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        {prediction.measured === false
                            ? `${getStatLabel(statistic)} has no measured half-life or signal, so this `
                              + 'model has never been validated for it — and we could not confirm the '
                              + 'bookmaker prices the same quantity. '
                            : `Thin history for this fixture`
                              + (prediction.effectiveMatches != null
                                  ? ` (${prediction.effectiveMatches.toFixed(1)} effective matches, want ${MIN_EFFECTIVE_FOR_EV}). `
                                  : '. ')}
                        Expected value is shown but greyed out: it is arithmetic on an estimate
                        we do not yet trust.
                    </p>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase text-zinc-500 font-bold">
                            <th className="text-left py-1 pr-3 whitespace-nowrap">Line</th>
                            {rows.map(r => (
                                <th key={r.line}
                                    className={`px-2 py-1 text-center whitespace-nowrap ${(r.overPrice || r.underPrice) ? 'text-emerald-400' : ''}`}>
                                    {r.line}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        <tr className="border-t border-white/5">
                            <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-400">Over</td>
                            {rows.map(r => (
                                <td key={r.line} className={`px-2 py-1.5 text-center font-black ${shade(r.over)}`}>
                                    {(100 * r.over).toFixed(0)}%
                                </td>
                            ))}
                        </tr>
                        <tr className="border-t border-white/5">
                            <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-400">Under</td>
                            {rows.map(r => (
                                <td key={r.line} className={`px-2 py-1.5 text-center font-black ${shade(1 - r.over)}`}>
                                    {(100 * (1 - r.over)).toFixed(0)}%
                                </td>
                            ))}
                        </tr>

                        {hasPrices ? (
                            <>
                                <tr className="border-t border-white/10">
                                    <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-500">Book O / U</td>
                                    {rows.map(r => (
                                        <td key={r.line} className="px-2 py-1.5 text-center text-[11px] text-zinc-400">
                                            {r.overPrice ? r.overPrice.toFixed(2) : '—'}
                                            <span className="text-zinc-700"> / </span>
                                            {r.underPrice ? r.underPrice.toFixed(2) : '—'}
                                        </td>
                                    ))}
                                </tr>
                                <tr className="border-t border-white/5">
                                    <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-500">EV Over</td>
                                    {rows.map(r => (
                                        <td key={r.line} className="px-2 py-1.5 text-center font-black text-[12px]">{evCell(r.evOver)}</td>
                                    ))}
                                </tr>
                                <tr className="border-t border-white/5">
                                    <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-500">EV Under</td>
                                    {rows.map(r => (
                                        <td key={r.line} className="px-2 py-1.5 text-center font-black text-[12px]">{evCell(r.evUnder)}</td>
                                    ))}
                                </tr>
                            </>
                        ) : (
                            <tr className="border-t border-white/10">
                                <td className="text-left py-1.5 pr-3 text-[11px] uppercase font-bold text-zinc-500">
                                    Break-even odds
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
                    ? `Spread fitted on ${prediction.residualCount} past predictions. `
                    : 'Not enough history to fit the spread yet, so a Poisson is assumed. '}
                {hasPrices
                    ? 'EV is the expected profit per unit staked at the bookmaker price shown. '
                      + 'Positive means the price is longer than our probability justifies.'
                    : 'No captured prices for this fixture, so break-even odds are shown instead: '
                      + 'the price at which a bet on Over is a coin flip.'}
            </p>
        </div>
    );
};

export default ProbabilityLadder;

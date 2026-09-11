import React from 'react';
import { Info } from 'lucide-react';
import { SELECTION_LABELS } from '../utils/statistics';

/**
 * Fixtures and prices for a market we do NOT predict.
 *
 * A separate table rather than the Predictor's, because the Predictor's is
 * prediction-shaped: Home Exp, Away Exp, Total Exp, P(Over). Selecting multigol
 * there would leave four columns blank on every row and lean on a notice to
 * explain the emptiness. Showing the prices we actually hold, and nothing where
 * a prediction would be, says the same thing without asking the reader to
 * discount what they can see.
 *
 * Outcomes come from `outcomesFor`, i.e. from what was captured, not from a
 * configured ladder - these markets have no ladder. A multigol "line" is a band
 * like "1-2" and its selection is yes/no, so there is nothing to step through.
 */
const label = (o) => {
    const sel = SELECTION_LABELS[o.selection] ?? o.selection;
    return o.line == null ? sel : `${o.line} ${sel}`;
};

const SlipMarketTable = ({ matches, market, marketLabel, outcomesFor, addToBet, bets }) => {
    const isOn = (game, line, selection) => (bets ?? []).some(
        (b) => b.game === game && b.stat === market
            && String(b.value ?? '') === String(line ?? '') && b.option === selection,
    );

    return (
        <div className="glass-panel rounded-2xl overflow-hidden relative z-10">
            {/* The whole point of the screen is that this market has no model
                behind it. Said once, plainly, at the top - not repeated per row. */}
            <div className="flex items-start gap-3 px-5 py-3 border-b border-white/5 bg-amber-500/5">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90">
                    <span className="font-bold">{marketLabel} is not predicted.</span>{' '}
                    These are the bookmaker&apos;s prices, shown so the bet can be added to a slip
                    and opened on domusbet. There is no model, no expected value and no accuracy
                    claim behind them — unlike the statistics above, nothing here has been measured.
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-zinc-300">
                    <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
                        <tr>
                            <th className="pl-5 pr-2 py-3 font-bold tracking-wider text-center w-[80px] whitespace-nowrap">Date</th>
                            <th className="pl-2 pr-4 py-3 font-bold tracking-wider text-center whitespace-nowrap">Matchup</th>
                            <th className="px-3 py-3 font-bold tracking-wider whitespace-nowrap">Prices</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                        {matches.map((match, idx) => {
                            const game = `${match.home} vs ${match.away}`;
                            const outcomes = outcomesFor(match.home, match.away, market);
                            return (
                                <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                                    <td className="pl-5 pr-2 py-4 text-center whitespace-nowrap font-medium text-zinc-400 w-[80px]">
                                        {(() => {
                                            const d = new Date(match.date);
                                            return match.date && !isNaN(d.getTime())
                                                ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                : 'TBD';
                                        })()}
                                    </td>
                                    <td className="pl-2 pr-4 py-4 text-center font-bold whitespace-nowrap">
                                        <span className="text-white">{match.home}</span>
                                        <span className="text-zinc-600 mx-2">v</span>
                                        <span className="text-white">{match.away}</span>
                                    </td>
                                    <td className="px-3 py-3">
                                        {outcomes.length === 0 ? (
                                            // Never captured rather than "no price exists": these
                                            // markets are only collected by an occasional
                                            // --slip-markets run, so absence is about us.
                                            <span className="text-zinc-600 text-xs">no prices captured for this fixture</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {outcomes.map((o, i) => {
                                                    const on = isOn(game, o.line, o.selection);
                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => addToBet(game, o.selection, o.line, market)}
                                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                                                on
                                                                    ? 'bg-emerald-500 border-emerald-400 text-white'
                                                                    : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                                                            }`}
                                                            title={on ? 'In your slip' : 'Add to slip'}
                                                        >
                                                            {label(o)}
                                                            <span className={`ml-2 font-mono ${on ? 'text-white' : 'text-emerald-400'}`}>
                                                                {o.price.toFixed(2)}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SlipMarketTable;

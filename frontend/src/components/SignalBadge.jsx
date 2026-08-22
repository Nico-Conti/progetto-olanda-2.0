import React from 'react';
import { getStatSignal, SIGNAL_LABELS } from '../utils/statistics';

/**
 * How much predictive signal a statistic actually carries, measured on a full season.
 *
 * Shown next to the statistic picker and on Hot Matches so a corners ranking is visibly
 * marked as weak rather than presented with the same confidence as fouls.
 * Renders nothing for statistics that have not been measured.
 */

const STYLES = {
    strong: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    moderate: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    weak: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    none: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
};

const DOTS = { strong: 3, moderate: 2, weak: 1, none: 0 };

const SignalBadge = ({ statistic, showLabel = false, className = '' }) => {
    const signal = getStatSignal(statistic);
    if (!signal) return null;

    const { strength, lift, edge } = signal;
    const title =
        `${SIGNAL_LABELS[strength]}. Ranking lift ${lift >= 0 ? '+' : ''}${lift.toFixed(2)} ` +
        `vs the round average; over/under edge ${edge >= 0 ? '+' : ''}${edge.toFixed(1)} points ` +
        `vs always betting the majority side. Averaged across 12 league-seasons - an ` +
        `individual league can differ, which is what the optimizer measures.`;

    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STYLES[strength]} ${className}`}
        >
            <span className="flex items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2].map(i => (
                    <span
                        key={i}
                        className={`w-1 h-1 rounded-full ${i < DOTS[strength] ? 'bg-current' : 'bg-current opacity-25'}`}
                    />
                ))}
            </span>
            {showLabel && <span>{SIGNAL_LABELS[strength]}</span>}
        </span>
    );
};

export default SignalBadge;

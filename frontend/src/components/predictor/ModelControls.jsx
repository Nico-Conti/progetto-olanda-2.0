import React from 'react';
import { Minus, Plus } from 'lucide-react';
import SlidingTabs from '../ui/SlidingTabs';
import { VOLATILE_STATS } from '../../utils/stats';
import { halfLifeFor } from '../../utils/statistics';
import { t, tk } from '../../i18n';

/**
 * A small uppercase label beside its control.
 *
 * `flex-wrap` so the label drops ABOVE the control rather than pushing it off
 * the edge. Everything inside is `whitespace-nowrap`, so without it a Group
 * cannot shrink at all: measured at 390px, Trend came to 385px against 316px
 * available in Italian ("ANDAMENTO" is 72px to "TREND"'s 38px). It wraps only
 * when a line is genuinely short of room, so desktop is untouched.
 */
export const Group = ({ label, children }) => (
    <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{label}</span>
        {children}
    </div>
);

const translated = (items) => items.map(item => ({ ...item, label: t(item.label) }));

// Short labels on purpose: two pills plus their group label have to fit 316px
// on a phone, and the Italian of the long forms did not - "Tutte le partite"
// alone is ~95px. `All` rather than `All games` because the latter is also a
// FormPanel heading, where "Tutte" would read wrong.
const TREND = [
    { id: 'venue', label: tk('Home/Away') },
    { id: 'all', label: tk('All') },
];
const CALC = [
    { id: 'auto', label: tk('Auto') },
    { id: 'mean', label: tk('Mean') },
];
const SAMPLES = [
    { id: 3, label: tk('Last 3') },
    { id: 5, label: tk('Last 5') },
    { id: 'all', label: tk('Season') },
];

/**
 * The model settings, shared by the fixture list and the match view (they
 * were two hand-copied blocks). Trend always applies. Sample size and
 * mean/median belong to the WINDOW estimator, which lost to recency decay
 * (docs/prediction-model.md section 10): a statistic with a fitted half-life
 * never reaches them, so they only show for the statistics that still do.
 * `children` go first, for the view's own controls.
 */
const ModelControls = ({ statistic, useGeneralStats, setUseGeneralStats, forceMean, setForceMean, nGames, setNGames, children }) => {
    const windowed = halfLifeFor(statistic) == null;
    const step = (delta) => setNGames(prev => {
        const n = (prev === 'all' || !prev) ? 5 : parseInt(prev, 10);
        return Math.min(30, Math.max(1, n + delta));
    });

    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {children}
            <Group label={t('Trend')}>
                <SlidingTabs
                    items={translated(TREND)}
                    value={useGeneralStats ? 'all' : 'venue'}
                    onChange={(id) => setUseGeneralStats(id === 'all')}
                    className="border border-white/5"
                    tabClassName="font-bold whitespace-nowrap"
                />
            </Group>
            {windowed && VOLATILE_STATS.includes(statistic) && (
                <Group label={t('Calc')}>
                    <SlidingTabs
                        items={translated(CALC)}
                        value={forceMean ? 'mean' : 'auto'}
                        onChange={(id) => setForceMean(id === 'mean')}
                        className="border border-white/5"
                        tabClassName="font-bold whitespace-nowrap"
                    />
                </Group>
            )}
            {windowed && (
                <Group label={t('Sample')}>
                    <SlidingTabs
                        items={translated(SAMPLES)}
                        value={nGames}
                        onChange={setNGames}
                        className="border border-white/5"
                        tabClassName="font-bold whitespace-nowrap"
                    />
                    {/* Any other window, one game at a time. */}
                    <div className={`flex items-center rounded-full border px-0.5 ${SAMPLES.some(s => s.id === nGames)
                        ? 'border-white/10 bg-zinc-900/60'
                        : 'border-emerald-500/50 bg-emerald-500/10'}`}>
                        <button type="button" onClick={() => step(-1)} aria-label={t('One game fewer')} className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-white tabular-nums">{nGames === 'all' ? '–' : nGames}</span>
                        <button type="button" onClick={() => step(1)} aria-label={t('One game more')} className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </Group>
            )}
        </div>
    );
};

export default ModelControls;

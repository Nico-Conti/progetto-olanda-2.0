import React from 'react';
import { Minus, Plus } from 'lucide-react';
import EngineToggle from '../EngineToggle';
import SlidingTabs from '../ui/SlidingTabs';
import { VOLATILE_STATS } from '../../utils/stats';
import { halfLifeFor } from '../../utils/statistics';

/** A small uppercase label beside its control. */
export const Group = ({ label, children }) => (
    <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{label}</span>
        {children}
    </div>
);

const TREND = [
    { id: 'venue', label: 'Home/Away' },
    { id: 'all', label: 'All games' },
];
const CALC = [
    { id: 'auto', label: 'Auto' },
    { id: 'mean', label: 'Mean' },
];
const SAMPLES = [
    { id: 3, label: 'Last 3' },
    { id: 5, label: 'Last 5' },
    { id: 'all', label: 'Season' },
];

/**
 * The model settings, shared by the fixture list and the match view (they
 * were two hand-copied blocks). Engine and trend always apply. Sample size and
 * mean/median belong to the WINDOW estimator, which lost to recency decay
 * (docs/prediction-model.md section 10): a statistic with a fitted half-life
 * never reaches them, so they only show for the statistics that still do.
 * `children` go first, for the view's own controls.
 */
const ModelControls = ({ statistic, engine, onEngineChange, useGeneralStats, setUseGeneralStats, forceMean, setForceMean, nGames, setNGames, children }) => {
    const windowed = halfLifeFor(statistic) == null;
    const step = (delta) => setNGames(prev => {
        const n = (prev === 'all' || !prev) ? 5 : parseInt(prev, 10);
        return Math.min(30, Math.max(1, n + delta));
    });

    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {children}
            <Group label="Engine">
                <EngineToggle engine={engine} onChange={onEngineChange} />
            </Group>
            <Group label="Trend">
                <SlidingTabs
                    items={TREND}
                    value={useGeneralStats ? 'all' : 'venue'}
                    onChange={(id) => setUseGeneralStats(id === 'all')}
                    className="border border-white/5"
                    tabClassName="font-bold whitespace-nowrap"
                />
            </Group>
            {windowed && VOLATILE_STATS.includes(statistic) && (
                <Group label="Calc">
                    <SlidingTabs
                        items={CALC}
                        value={forceMean ? 'mean' : 'auto'}
                        onChange={(id) => setForceMean(id === 'mean')}
                        className="border border-white/5"
                        tabClassName="font-bold whitespace-nowrap"
                    />
                </Group>
            )}
            {windowed && (
                <Group label="Sample">
                    <SlidingTabs
                        items={SAMPLES}
                        value={nGames}
                        onChange={setNGames}
                        className="border border-white/5"
                        tabClassName="font-bold whitespace-nowrap"
                    />
                    {/* Any other window, one game at a time. */}
                    <div className={`flex items-center rounded-full border px-0.5 ${SAMPLES.some(s => s.id === nGames)
                        ? 'border-white/10 bg-zinc-900/60'
                        : 'border-emerald-500/50 bg-emerald-500/10'}`}>
                        <button type="button" onClick={() => step(-1)} aria-label="One game fewer" className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-white tabular-nums">{nGames === 'all' ? '–' : nGames}</span>
                        <button type="button" onClick={() => step(1)} aria-label="One game more" className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </Group>
            )}
        </div>
    );
};

export default ModelControls;

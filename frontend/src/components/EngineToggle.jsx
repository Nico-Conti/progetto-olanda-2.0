import React from 'react';
import { Calculator, BarChart3 } from 'lucide-react';
import { ENGINES } from '../utils/predictTotal';

/**
 * Switches between the two prediction engines.
 *
 * Both ship. `classic` is the model every measured number in
 * docs/prediction-model.md refers to, and is the default. `count` wraps the same
 * prediction in a distribution, so a bookmaker's actual line - 20.5, 22.5, 24.5,
 * whatever it posts - can be priced from one fit instead of only the single line
 * the app has hardcoded.
 *
 * Switching does not change the predicted total, only what can be asked of it.
 */
const EngineToggle = ({ engine, onChange, className = '' }) => {
    const options = [
        {
            value: ENGINES.CLASSIC,
            label: 'Classic',
            icon: <Calculator className="w-3.5 h-3.5" />,
            title: 'The measured model: one predicted total per match, called against a fixed line.',
        },
        {
            value: ENGINES.COUNT,
            label: 'Distribution',
            icon: <BarChart3 className="w-3.5 h-3.5" />,
            title: 'Same prediction, wrapped in a negative binomial. Prices any line coherently, '
                 + 'so a bookmaker offering 20.5 and one offering 24.5 can both be answered.',
        },
    ];

    return (
        <div className={`inline-flex items-center gap-1 p-1 rounded-lg bg-zinc-900/70 border border-white/10 ${className}`}>
            {options.map(({ value, label, icon, title }) => {
                const active = engine === value;
                return (
                    <button
                        key={value}
                        onClick={() => onChange(value)}
                        title={title}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
                            active
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                        }`}
                    >
                        {icon}
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

export default EngineToggle;

import React, { useState, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { PREDICTED_STAT_OPTIONS } from '../utils/statistics';
import SignalBadge from './SignalBadge';
import DerivedBadge from './DerivedBadge';
import { useClickOutside } from '../hooks/useClickOutside';
import { t } from '../i18n';

const StatisticSelector = ({ value, onChange, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Only statistics that can be checked against a captured price. A
    // prediction for xG or possession is real but unbettable, and offering it
    // here invites a number nobody can act on.
    // Predicted statistics only. The markets we merely price are chosen per
    // fixture, in the row's own Stat dropdown, so the table keeps its
    // predictions for every other row instead of emptying out.
    const options = PREDICTED_STAT_OPTIONS;
    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useClickOutside(isOpen, dropdownRef, useCallback(() => setIsOpen(false), []));

    const handleSelect = (optionValue) => {
        onChange({ target: { value: optionValue } }); // Mimic event object for compatibility
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                data-open={isOpen}
                className="bp-control flex items-center justify-between gap-2 w-full text-zinc-300 hover:text-white text-sm font-semibold uppercase tracking-wide rounded-full px-4 py-2"
            >
                <span className="truncate">{t(selectedOption.label)}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <div
                className={`
                    absolute z-50 mt-2 w-full min-w-[180px] right-0
                    bp-pop rounded-lg shadow-xl
                    transform transition duration-200 origin-top
                    ${isOpen
                        ? 'opacity-100 translate-y-0 scale-100 visible'
                        : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}
                `}
            >
                <div className="p-1 space-y-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => handleSelect(option.value)}
                            className={`bp-opt w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide ${value === option.value ? 'bp-opt-on' : ''}`}
                        >
                            <span className="flex items-center gap-2">
                                {t(option.label)}
                                <SignalBadge statistic={option.value} />
                                <DerivedBadge statistic={option.value} />
                            </span>
                            {value === option.value && (
                                <Check className="w-3.5 h-3.5" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StatisticSelector;

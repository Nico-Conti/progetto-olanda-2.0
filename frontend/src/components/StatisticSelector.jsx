import React, { useState, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { STAT_OPTIONS } from '../utils/statistics';
import SignalBadge from './SignalBadge';
import DerivedBadge from './DerivedBadge';
import { useClickOutside } from '../hooks/useClickOutside';

const StatisticSelector = ({ value, onChange, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = STAT_OPTIONS;
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
                className={`
                    flex items-center justify-between gap-2 w-full
                    bg-zinc-900/80 border border-white/5 
                    text-zinc-300 text-sm font-semi-bold uppercase tracking-wide
                    rounded-full px-4 py-2 
                    focus:outline-none focus:ring-2 focus:ring-emerald-500/50
                    transition-all duration-200
                    hover:bg-white/5 hover:text-white hover:border-white/10
                    ${isOpen ? 'ring-2 ring-emerald-500/50 bg-zinc-900 border-emerald-500/50' : ''}
                `}
            >
                <span className="truncate">{selectedOption.label}</span>
                <ChevronDown
                    className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`}
                />
            </button>

            {/* Dropdown Menu */}
            <div
                className={`
                    absolute z-50 mt-2 w-full min-w-[180px] right-0
                    bg-zinc-900 border border-white/10 rounded-lg shadow-xl backdrop-blur-xl
                    transform transition-all duration-200 origin-top
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
                            className={`
                                w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semi-bold uppercase tracking-wide
                                transition-all duration-150
                                ${value === option.value
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'}
                            `}
                        >
                            <span className="flex items-center gap-2">
                                {option.label}
                                <SignalBadge statistic={option.value} />
                                <DerivedBadge statistic={option.value} />
                            </span>
                            {value === option.value && (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StatisticSelector;

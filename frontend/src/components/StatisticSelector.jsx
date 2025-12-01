import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const StatisticSelector = ({ value, onChange, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'corners', label: 'Corners' },
        { value: 'goals', label: 'Goals' },
        { value: 'shots', label: 'Shots' },
        { value: 'shots_on_target', label: 'Shots on Target' },
        { value: 'fouls', label: 'Fouls' },
        { value: 'yellow_cards', label: 'Yellow Cards' },
        { value: 'red_cards', label: 'Red Cards' },
        { value: 'possession', label: 'Possession' },
    ];

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

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
                    text-zinc-300 text-sm font-bold uppercase tracking-wide
                    rounded-md px-3 py-2 
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
                                w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide
                                transition-all duration-150
                                ${value === option.value
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'}
                            `}
                        >
                            {option.label}
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

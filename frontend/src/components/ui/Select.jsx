import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { t } from '../../i18n';

const Select = ({ value, onChange, options, placeholder, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isMenuMounted = usePresence(isOpen, '--dropdown-close-dur');
    const dropdownRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);

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
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                data-open={isOpen}
                className="bp-control group flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 h-10 text-sm font-bold text-white"
            >
                <span className={`truncate ${!selectedOption ? 'text-zinc-500' : ''}`}>
                    {selectedOption ? selectedOption.label : (placeholder ?? t('Select...'))}
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isMenuMounted && (
                <div
                    data-origin="top-center"
                    className={`t-dropdown ${isOpen ? 'is-open' : 'is-closing'} bp-pop absolute top-full left-0 right-0 mt-2 rounded-xl shadow-2xl p-2 z-50 max-h-60 overflow-y-auto custom-scrollbar`}
                >
                    <div className="flex flex-col gap-1">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                className={`bp-opt w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-bold text-left ${value === option.value ? 'bp-opt-on' : ''}`}
                            >
                                {option.label}
                                {value === option.value && (
                                    <Check className="w-3.5 h-3.5" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Select;

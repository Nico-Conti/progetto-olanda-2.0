import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const Select = ({ value, onChange, options, placeholder = "Select...", className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
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
                className={`
                    flex items-center justify-between gap-2 w-full
                    bg-zinc-950 rounded-lg border border-white/10 
                    px-3 py-2 h-10
                    text-sm font-bold text-white
                    hover:border-purple-500/50 transition-colors group
                    ${isOpen ? 'border-purple-500/50' : ''}
                `}
            >
                <span className={`truncate ${!selectedOption ? 'text-zinc-500' : 'group-hover:text-purple-400 transition-colors'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown
                    className={`w-4 h-4 text-zinc-600 group-hover:text-purple-400 transition-colors ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200 max-h-60 overflow-y-auto custom-scrollbar"
                >
                    <div className="flex flex-col gap-1">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                className={`
                                    w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-bold text-left transition-all
                                    ${value === option.value
                                        ? 'bg-purple-500 text-white shadow-lg'
                                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}
                                `}
                            >
                                {option.label}
                                {value === option.value && (
                                    <Check className="w-3.5 h-3.5 text-white" />
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

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';

/**
 * Labelled dropdown trigger with a popover panel.
 *
 * Relies on the `.dropdown-container` class for the click-outside dismissal in
 * `useClickOutside`, so keep that class on the wrapper.
 */
const Dropdown = ({
    label,
    active,
    onToggle,
    value,
    children,
    width = 'min-w-[140px]',
    className = '',
}) => {
    const isPanelMounted = usePresence(active, '--dropdown-close-dur');

    return (
        <div className={`dropdown-container relative ${className}`}>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-0.5 block">{label}</span>
            <div className="relative">
                <button
                    onClick={onToggle}
                    data-open={active}
                    className={`bp-control text-white text-sm rounded-lg pl-3 pr-8 py-1.5 font-bold text-left flex items-center justify-between ${width}`}
                >
                    <span className="truncate">{value}</span>
                    <ChevronRight className={`absolute right-2 w-3 h-3 text-zinc-500 transition-transform ${active ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {isPanelMounted && (
                    <div
                        data-origin="top-left"
                        className={`t-dropdown ${active ? 'is-open' : 'is-closing'} bp-pop absolute top-full mt-2 left-0 p-2 rounded-xl shadow-2xl min-w-[200px] z-50`}
                    >
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dropdown;

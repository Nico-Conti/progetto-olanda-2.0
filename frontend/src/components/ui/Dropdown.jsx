import React from 'react';
import { ChevronRight } from 'lucide-react';

// Written out in full: Tailwind scans for literal class strings, so a
// template-interpolated `ring-${accent}-500/50` would never be generated.
const ACCENT_RING = {
    emerald: 'focus:ring-emerald-500/50',
    cyan: 'focus:ring-cyan-500/50',
};

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
    accent = 'emerald',
}) => (
    <div className={`dropdown-container relative ${className}`}>
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-0.5 block">{label}</span>
        <div className="relative">
            <button
                onClick={onToggle}
                className={`bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 ${ACCENT_RING[accent] ?? ACCENT_RING.emerald} font-bold text-left flex items-center justify-between ${width}`}
            >
                <span className="truncate">{value}</span>
                <ChevronRight className={`absolute right-2 w-3 h-3 text-zinc-500 transition-transform ${active ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            {active && (
                <div className="absolute top-full mt-2 left-0 bg-zinc-950 border border-white/10 p-2 rounded-xl shadow-2xl min-w-[200px] animate-in fade-in zoom-in-95 duration-200 z-50">
                    {children}
                </div>
            )}
        </div>
    </div>
);

export default Dropdown;

import React, { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Writes the active tab's box onto the pill. Without `animate` the pill snaps
 * there, so first paint and resizes never slide in from x = 0.
 */
const placePill = (bar, pill, animate) => {
    if (!bar || !pill) return;
    const tab = bar.querySelector('[aria-selected="true"]');
    const prev = pill.style.transition;
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = `translateX(${tab ? tab.offsetLeft : 0}px)`;
    pill.style.width = `${tab ? tab.offsetWidth : 0}px`;
    if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = prev;
    }
};

/**
 * Segmented control whose active pill slides between options - the
 * transitions.dev "tabs sliding" snippet (`.t-tabs` in transitions.css).
 * `items` are `{ id, label, Icon? }`; a `value` matching none hides the pill.
 */
const SlidingTabs = ({ items, value, onChange, className = '', tabClassName = '' }) => {
    const barRef = useRef(null);
    const pillRef = useRef(null);
    const hasPlaced = useRef(false);

    useLayoutEffect(() => {
        placePill(barRef.current, pillRef.current, hasPlaced.current);
        hasPlaced.current = true;
    }, [value]);

    // Also catches the bar going from display:none to visible at a breakpoint.
    useEffect(() => {
        const observer = new ResizeObserver(() => placePill(barRef.current, pillRef.current, false));
        observer.observe(barRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={barRef} role="tablist" className={`t-tabs ${className}`}>
            <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
            {items.map(item => (
                <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={value === item.id}
                    onClick={() => onChange(item.id)}
                    className={`t-tab flex items-center gap-2 px-4 text-xs uppercase tracking-wide ${tabClassName}`}
                >
                    {item.Icon && <item.Icon className="w-3.5 h-3.5" />}
                    {item.label}
                </button>
            ))}
        </div>
    );
};

export default SlidingTabs;

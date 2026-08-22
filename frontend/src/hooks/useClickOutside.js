import { useEffect } from 'react';

/**
 * Calls `onOutside` when a mousedown lands outside the tracked element(s).
 *
 * `target` is either a CSS selector (dismiss when the click is outside every
 * element matching it) or a ref (dismiss when outside that node). Inert while
 * `enabled` is falsy, so callers can pass "is anything open?" and pay nothing
 * when nothing is.
 */
export const useClickOutside = (enabled, target, onOutside) => {
    useEffect(() => {
        if (!enabled) return;

        const handleClickOutside = (e) => {
            const isInside = typeof target === 'string'
                ? Boolean(e.target.closest(target))
                : Boolean(target?.current?.contains(e.target));
            if (!isInside) onOutside();
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [enabled, target, onOutside]);
};

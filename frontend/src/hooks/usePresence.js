import { useEffect, useState } from 'react';

/**
 * A CSS duration variable on :root, in milliseconds.
 *
 * Unit-aware on purpose: the production CSS minifier rewrites `150ms` as
 * `.15s`, so the bare parseFloat the transitions.dev snippets use reads 0.15.
 */
export function cssMs(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(value);
    if (Number.isNaN(n)) return fallback;
    return value.endsWith('ms') ? n : n * 1000;
}

/**
 * Keeps a surface mounted after `open` turns false, for as long as the CSS
 * variable `closeVar` (e.g. '--modal-close-dur') says its close transition
 * runs. Render it with `.is-open` while `open` and `.is-closing` otherwise.
 */
export function usePresence(open, closeVar) {
    const [mounted, setMounted] = useState(open);
    if (open && !mounted) setMounted(true);

    useEffect(() => {
        if (open) return;
        const timer = setTimeout(() => setMounted(false), cssMs(closeVar, 150));
        return () => clearTimeout(timer);
    }, [open, closeVar]);

    return mounted;
}

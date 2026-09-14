import { useLayoutEffect, useRef } from 'react';

/**
 * Runs a one-shot overlay animation each time `active` turns true.
 *
 * `play(root)` starts the Web Animations and returns them; each cue
 * `[ms, name]` calls `handlers[name]` at that time. Under reduced motion
 * nothing plays and every cue fires at once, in order.
 *
 * Handlers are read through a ref, refreshed in a layout effect declared
 * before the one that runs the cues: parents pass fresh inline callbacks on
 * every render, and a re-render mid-animation must not restart the timers,
 * while the reduced-motion path needs this render's handlers, not the last.
 *
 * `play` and `cues` must be module-level constants; they are not dependencies.
 */
export function useCuedAnimation(active, rootRef, play, cues, handlers) {
    const handlersRef = useRef(handlers);
    useLayoutEffect(() => {
        handlersRef.current = handlers;
    });

    useLayoutEffect(() => {
        if (!active) return;
        const fire = (name) => handlersRef.current[name]?.();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            cues.forEach(([, name]) => fire(name));
            return;
        }
        const runs = play(rootRef.current);
        const timers = cues.map(([ms, name]) => setTimeout(() => fire(name), ms));
        return () => {
            timers.forEach(clearTimeout);
            runs.forEach(run => run.cancel());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- see "module-level constants" above
    }, [active]);
}

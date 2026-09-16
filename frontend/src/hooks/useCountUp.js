import { useEffect, useRef, useState } from 'react';
import { motionAllowed } from '../utils/leaguePickerFx';

/**
 * `value`, counted up to: from 0 on mount, then from wherever it stands to the
 * new value when it changes (a different statistic, say). Ease-out cubic, one
 * frame loop. Under reduced motion it is just `value`.
 */
export function useCountUp(value, duration = 900) {
    const [reduce] = useState(() => !motionAllowed());
    const [shown, setShown] = useState(0);
    const from = useRef(0);

    useEffect(() => {
        if (reduce) return;
        const start = performance.now();
        const a = from.current;
        let frame;
        const tick = (now) => {
            const k = Math.min(1, (now - start) / duration);
            const v = a + (value - a) * (1 - (1 - k) ** 3);
            from.current = v;
            setShown(v);
            if (k < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [value, duration, reduce]);

    return reduce ? value : shown;
}

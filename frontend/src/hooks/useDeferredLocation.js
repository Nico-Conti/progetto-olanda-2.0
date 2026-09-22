import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { transitionFor } from '../utils/routes';

/**
 * The URL leads; what is painted follows one animation behind.
 *
 * `navigate()` fires on the click, so the address bar, Back, Forward, a
 * refresh and a pasted link are all correct immediately. Only the RENDER is
 * deferred, for as long as an entry animation is covering the screen - which
 * is what the old `pendingView` / `pendingLeague` / `pendingTab` trio plus
 * `isAnimating` were doing, less directly and without a working Back button.
 *
 *   shown      the location currently on screen
 *   cue        which overlay to play, or null for an instant navigation
 *   animating  the two disagree
 *   commit()   swap - called from the overlay's midpoint
 *
 * **Back-button cancellation is free, and that is the point.** Mid-animation
 * `shown` is still the page we left, so Back returns `location` to that same
 * entry, the keys match, `animating` goes false, the overlay unmounts and its
 * cleanup cancels the pending cues - `commit` never runs. No guard is needed,
 * and none would have been possible: a popstate cannot be vetoed, which is
 * why keeping the old machine and letting the router follow it could not work.
 *
 * The swap for an instant navigation happens DURING RENDER rather than in an
 * effect: an effect would paint the old page first, and it trips
 * react-hooks/set-state-in-effect. It is React's documented
 * adjust-state-when-props-change pattern, the same one `usePresence` and
 * AccountModal's `wasOpen` already use. It lives in this hook rather than in
 * App so that App stays free of render-phase setState, which would otherwise
 * stop React Compiler preserving App's own useMemo/useCallback.
 */
export function useDeferredLocation() {
    const location = useLocation();
    const [shown, setShown] = useState(location);
    const cue = transitionFor(shown, location);
    const animating = shown.key !== location.key;

    if (animating && !cue) setShown(location);

    return {
        location,
        shown: animating ? shown : location,
        cue: animating ? cue : null,
        animating,
        commit: () => setShown(location),
    };
}

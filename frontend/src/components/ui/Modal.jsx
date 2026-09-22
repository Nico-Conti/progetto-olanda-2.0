import React, { useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/usePresence';

/**
 * A modal dialog, as a native `<dialog>` opened with `showModal()`.
 *
 * The point of the native element is what it brings for free and what we
 * otherwise have to write by hand and get wrong: **Escape closes it, focus is
 * trapped inside it, the rest of the page is inert, and focus returns to
 * whatever opened it.** Measured 2026-09-21, the hand-rolled `.t-modal`
 * version of the account modal had none of that - 14 of 14 tab presses landed
 * on the page behind it, and Escape did nothing.
 *
 * `Trailer.jsx` reached the same conclusion first; this is that pattern made
 * reusable. `BetSlipModal` and the league picker in `LandingPage` still use the
 * old `.t-modal` div and still have both defects.
 *
 * `onClose` fires for Escape and the backdrop as well as a close button,
 * because the element closes itself on those and the caller's state has to
 * follow - otherwise `open` stays true and it can never be reopened.
 *
 * Children are mounted only while it is open, plus the close transition
 * (`usePresence`). The dialog element itself always renders, since `showModal`
 * needs something to call; without the inner gate, every modal's contents
 * would mount on page load - and `HistoryTab` fetches slips on mount.
 */
const Modal = ({ open, onClose, label, className = '', children }) => {
    const ref = useRef(null);
    const mounted = usePresence(open, '--modal-close-dur');

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Guarded both ways: showModal() on an open dialog throws, and close()
        // on a closed one fires a spurious `close` event.
        if (open && !el.open) el.showModal();
        if (!open && el.open) el.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-label={label}
            onClose={onClose}
            // A click on the dialog itself, rather than on its contents, is a
            // click on the backdrop: the element's box covers the whole screen.
            onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
            className={`t-dialog m-auto max-w-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm ${className}`}
        >
            {mounted && children}
        </dialog>
    );
};

export default Modal;

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import PitchMatch from './PitchMatch';

/**
 * The little match, in a dialog until you close it; opened from the landing
 * page's "Watch a match" card. Built like Trailer - a native <dialog> for
 * Escape and focus - and the match only exists while it is open.
 */
const MatchViewer = ({ open, onClose }) => {
    const dialogRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    const close = () => dialogRef.current.close();

    return (
        <dialog
            ref={dialogRef}
            aria-label={t('Watch a match')}
            onClose={onClose}
            // A click on the dialog itself, not its contents, is a click on the backdrop.
            onClick={(e) => { if (e.target === dialogRef.current) close(); }}
            className="trailer pointer-events-auto m-auto w-[min(92vw,900px)] max-w-none p-0 bg-transparent overflow-visible backdrop:bg-black/85 backdrop:backdrop-blur-sm"
        >
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 md:p-8 shadow-[0_0_80px_rgba(34,211,238,0.15)]">
                {open && <PitchMatch />}
            </div>
            <button
                onClick={close}
                aria-label={t('Close')}
                className="absolute -top-12 right-0 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
        </dialog>
    );
};

export default MatchViewer;

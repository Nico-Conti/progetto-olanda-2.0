import React from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';

// Unlisted upload on the Ciusbe channel. youtube-nocookie keeps YouTube from
// setting cookies until someone actually presses play.
const YOUTUBE_ID = 'a_QgKWbR_Ew';
const EMBED = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

/**
 * The trailer player. Its trigger is a feature card on the landing page, so this
 * is the dialog alone, opened by `open` - it owns no button of its own.
 *
 * A native <dialog> rather than the usePresence modal the league picker uses:
 * showModal() brings Escape, focus trapping and an inert page for free, and the
 * open/close fade is plain CSS (".trailer" in index.css). The YouTube iframe
 * only exists while the dialog is open: nothing from YouTube loads with the
 * page, and unmounting it is what stops playback on close.
 *
 * `onClose` fires for Escape and the backdrop too, not just the close button,
 * because <dialog> closes itself on those and the caller's state has to follow.
 */
const Trailer = ({ open, onClose }) => {
    const dialogRef = React.useRef(null);
    const [playing, setPlaying] = React.useState(false);

    React.useEffect(() => {
        const el = dialogRef.current;
        if (open && !el.open) { setPlaying(true); el.showModal(); }
        if (!open && el.open) el.close();
    }, [open]);

    const close = () => dialogRef.current.close();

    return (
        <>
            <dialog
                ref={dialogRef}
                aria-label={t('Progetto Olanda 2.0 presentation')}
                onClose={() => { setPlaying(false); onClose(); }}
                // A click on the dialog itself, not its contents, is a click on the backdrop.
                // pointer-events-auto: the landing page's wrappers switch them off, and
                // the dialog would inherit that - backdrop, controls and close button alike.
                onClick={(e) => { if (e.target === dialogRef.current) close(); }}
                className="trailer pointer-events-auto m-auto w-[min(92vw,1100px)] max-w-none p-0 bg-transparent overflow-visible backdrop:bg-black/85 backdrop:backdrop-blur-sm"
            >
                <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black shadow-[0_0_80px_rgba(16,185,129,0.15)]">
                    {playing && (
                        <iframe
                            src={EMBED}
                            title={t('Progetto Olanda 2.0 presentation')}
                            // Autoplay with sound is allowed: the dialog was opened by a click.
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="absolute inset-0 w-full h-full"
                        />
                    )}
                </div>
                <button
                    onClick={close}
                    aria-label={t('Close')}
                    className="absolute -top-12 right-0 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </dialog>
        </>
    );
};

export default Trailer;

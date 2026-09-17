import React from 'react';
import { Play, X } from 'lucide-react';
import { t } from '../i18n';

// Unlisted upload on the Ciusbe channel. youtube-nocookie keeps YouTube from
// setting cookies until someone actually presses play.
const YOUTUBE_ID = 'a_QgKWbR_Ew';
const EMBED = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
const POSTER = '/trailer/poster.jpg';

/**
 * The trailer: a bubble in the landing page's top-left corner that opens a player.
 *
 * A native <dialog> rather than the usePresence modal the league picker uses:
 * showModal() brings Escape, focus trapping and an inert page for free, and the
 * open/close fade is plain CSS (".trailer" in index.css). The YouTube iframe
 * only exists while the dialog is open: nothing from YouTube loads with the
 * page, and unmounting it is what stops playback on close.
 */
const Trailer = () => {
    const dialogRef = React.useRef(null);
    const [playing, setPlaying] = React.useState(false);

    const open = () => {
        setPlaying(true);
        dialogRef.current.showModal();
    };
    const close = () => dialogRef.current.close();

    return (
        <>
            {/* A bubble in the corner; its label slides out on hover or keyboard focus. */}
            <button
                onClick={open}
                aria-label={t('Watch the presentation')}
                className="group pointer-events-auto relative flex items-center rounded-full outline-none"
            >
                <span className="trailer-ping absolute left-0 w-10 h-10 rounded-full border border-emerald-300/60" aria-hidden="true" />
                <span className="relative w-10 h-10 rounded-full overflow-hidden border border-white/15 group-hover:border-emerald-400/60 group-focus-visible:ring-2 group-focus-visible:ring-emerald-400 shadow-lg transition">
                    <img src={POSTER} alt="" className="w-full h-full object-cover scale-150 opacity-60 transition duration-500 group-hover:opacity-90 group-hover:scale-[1.7]" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-4 h-4 ml-0.5 fill-white text-white drop-shadow" />
                    </span>
                </span>
                <span aria-hidden="true" className="ml-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-white/10 whitespace-nowrap text-xs font-semibold text-zinc-200 opacity-0 -translate-x-2 pointer-events-none transition duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
                    {t('Watch the presentation')} <span className="ml-1 font-mono text-zinc-500">0:24</span>
                </span>
            </button>

            <dialog
                ref={dialogRef}
                aria-label={t('Progetto Olanda 2.0 presentation')}
                onClose={() => setPlaying(false)}
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

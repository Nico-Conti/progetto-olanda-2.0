import React, { useLayoutEffect, useRef } from 'react';

import { FileText } from 'lucide-react';
import GlassPanel from './ui/GlassPanel';
import { AccountButton } from './AccountModal';
import { t } from '../i18n';

const Header = ({
    logoSrc = "/logo.png",
    onLogoClick,
    title,
    children,
    showBetSlip = false,
    betsCount = 0,
    onOpenBetSlip,
    pageName = '',
}) => {
    // Publishes the header's height as --app-header-h, so bars that stick
    // below it (the Standings toolbar) line up however tall it wraps.
    const ref = useRef(null);
    useLayoutEffect(() => {
        const el = ref.current;
        const observer = new ResizeObserver(() =>
            document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <GlassPanel ref={ref} className="sticky top-0 z-[100] border-b border-white/5 mb-8 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between relative">
                {/* Left Section: Logo & Title */}
                <div
                    className={`flex flex-col items-center gap-0.5 ${onLogoClick ? 'cursor-pointer group' : ''}`}
                    onClick={onLogoClick}
                >
                    {logoSrc && (
                        <img
                            src={logoSrc}
                            alt="Logo"
                            className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-transform group-hover:scale-105"
                        />
                    )}

                    {title}
                </div>

                {pageName && (
                    <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        {pageName}
                    </div>
                )}
                {/* Right Section: Controls */}
                <div className="flex items-center gap-2 md:gap-4">
                    {children}

                    {showBetSlip && (
                        <button
                            onClick={onOpenBetSlip}
                            aria-label={t('Open bet slip')}
                            className="bp-control relative p-2 rounded-lg text-zinc-400 hover:text-white group"
                        >
                            {/* Always mounted so it can pop in and out (transitions.dev
                                badge); the count re-keys so each change replays the
                                number pop-in. */}
                            <span className="t-badge -top-1 -right-1" data-open={betsCount > 0}>
                                <span className="t-badge-dot min-w-4 h-4 px-1 bg-emerald-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                                    <span key={betsCount} className="t-digit-group is-animating">
                                        {String(betsCount).split('').map((digit, i, all) => (
                                            <span
                                                key={i}
                                                className="t-digit"
                                                data-stagger={i === all.length - 1 ? 2 : i === all.length - 2 ? 1 : undefined}
                                            >
                                                {digit}
                                            </span>
                                        ))}
                                    </span>
                                </span>
                            </span>
                            {/* The slip icon, and the ONE the whole feature
                                uses - the slip window, the history cards and a
                                recap all open with it. It was a hand-copied
                                lucide path here and a Trophy in the slip
                                itself, so the button and what it opened did
                                not look related. */}
                            <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                    )}

                    <AccountButton />
                </div>
            </div>
        </GlassPanel>
    );
};

export default Header;

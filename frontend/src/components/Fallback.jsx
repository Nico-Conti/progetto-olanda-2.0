import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Home } from 'lucide-react';
import LegalFooter from './ui/LegalFooter';
import { ABOUT_LEAD, ABOUT_FACTS } from '../content/about';
import { t, tk } from '../i18n';

/**
 * What a route renders when it cannot render itself: the data failed to load,
 * or the thing in the URL does not exist.
 *
 * **It carries the landing page's real prose, and that is the point.** Routing
 * gave leagues their own URLs, so a crawler can now reach a page that is not
 * the landing page. The Safe Browsing flag this site carried until 2026-09-21
 * came from exactly this shape - a sleeping backend leaving a page with no
 * description, no operator and no contact - so a route that fails must still
 * say what the site is, who runs it and how to reach them. A spinner or a bare
 * "not found" would recreate the thing that got the site flagged.
 *
 * It is also the only place an inner route can report a failed load at all:
 * before routing, a dead /matches simply left you on the landing page, because
 * nothing but the landing page ever rendered without data.
 */

const SHELL = 'min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center relative z-10';

const Fallback = ({ heading, message, children }) => (
    <div className={SHELL}>
        <img src="/logo.png" alt="" className="w-20 h-20 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
        <h1 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>

        <h2 className="mt-6 text-lg font-bold text-white">{heading}</h2>
        {message && <p className="mt-2 max-w-md text-sm text-zinc-400">{message}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>

        {/* The prose a crawler needs, identical to the landing page's. */}
        <div className="mt-12 max-w-2xl">
            <div className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" aria-hidden="true" />
            <p className="mt-3 text-sm md:text-base leading-relaxed text-zinc-400">{t(ABOUT_LEAD)}</p>
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                {ABOUT_FACTS.map((fact, i) => (
                    <li key={fact} className="flex items-center gap-3">
                        {t(fact)}
                        {i < ABOUT_FACTS.length - 1 && <span aria-hidden="true" className="text-zinc-700">/</span>}
                    </li>
                ))}
            </ul>
        </div>

        <div className="w-full mt-8"><LegalFooter /></div>
    </div>
);

const BUTTON = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors';
const PRIMARY = `${BUTTON} bg-emerald-500 hover:bg-emerald-400 border-transparent text-white`;
const QUIET = `${BUTTON} border-white/10 text-zinc-300 hover:text-white hover:bg-white/5`;

/** A load that failed rather than one that is slow. Retry, never a spinner
 *  that spins for ever - `useMatchData` already exposes `refetch`. */
export const LoadFailed = ({ onRetry }) => (
    <Fallback
        heading={t(tk('Could not load the data'))}
        message={t(tk('The data service did not answer. It sleeps when unused and can take a moment to wake.'))}
    >
        <button onClick={onRetry} className={PRIMARY}>
            <RefreshCw className="w-4 h-4" /> {t(tk('Try again'))}
        </button>
        <Link to="/" className={QUIET}><Home className="w-4 h-4" /> {t(tk('Home'))}</Link>
    </Fallback>
);

/** Identity in the URL that does not resolve. A panel rather than a redirect:
 *  a redirect hides a broken link from whoever has to debug it, and leaves a
 *  crawler with nothing. `links` are offered as real <a> elements. */
export const NotFound = ({ heading, message, links = [] }) => (
    <Fallback heading={heading ?? t(tk('Page not found'))} message={message}>
        {links.map(({ to, label }) => (
            <Link key={to} to={to} className={QUIET}>{label}</Link>
        ))}
        <Link to="/" className={PRIMARY}><Home className="w-4 h-4" /> {t(tk('Home'))}</Link>
    </Fallback>
);

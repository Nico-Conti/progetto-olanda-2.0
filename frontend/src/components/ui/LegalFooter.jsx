import React from 'react';
import { t, tk } from '../../i18n';
import { privacyHref, termsHref } from '../../utils/legal';

/**
 * The legal line for the app itself.
 *
 * The landing page carries its own footer, laid out against a fixed height and
 * styled to match it; this is the same information for everything behind it,
 * where previously the privacy policy was reachable only by going back out to
 * the landing page.
 *
 * Deliberately plain markup and no data of its own: it renders identically with
 * the backend asleep, which is the whole point of the static pages it links to.
 */

const DISCLAIMER = tk('Statistics and models, published for information. No bets are taken or handled on this site. Over 18s only.');

const LINK = 'underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-400 hover:decoration-emerald-400/60';

const LegalFooter = () => (
    // pb-28 on mobile is the clearance for the fixed LiquidNav, moved here from
    // <main> because this is now the last thing in the scroll flow.
    <footer className="max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-28 lg:pb-10 text-center text-xs leading-relaxed text-zinc-400">
        <p>{t(DISCLAIMER)}</p>
        <p className="mt-1.5 text-zinc-400">
            <a href={privacyHref()} className={LINK}>Privacy</a>
            <span aria-hidden="true" className="mx-2 text-zinc-700">/</span>
            <a href={termsHref()} className={LINK}>{t('Terms')}</a>
            <span aria-hidden="true" className="mx-2 text-zinc-700">/</span>
            <a href="mailto:info@progettoolanda.it" className={LINK}>info@progettoolanda.it</a>
        </p>
    </footer>
);

export default LegalFooter;

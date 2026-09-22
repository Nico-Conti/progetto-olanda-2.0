import { tk } from '../i18n/index.js';

/**
 * What the site is, in prose. The ONE copy.
 *
 * This lived in LandingPage until routing gave leagues their own URLs, which
 * gave Googlebot a crawl path into pages that are not the landing page for the
 * first time. That matters more here than it looks: the site was flagged by
 * Safe Browsing in September 2026 because a sleeping backend left the landing
 * page with no description, no operator and no contact - a sign-in box on an
 * anonymous page, which is the shape of a phishing site. The flag cleared on
 * 2026-09-21.
 *
 * So every route a crawler can reach has to say what this is even when the API
 * is dead, which means the error and not-found pages need this text too, not
 * thirty words of UI labels. Import it; do not re-write it in a second place.
 */
export const ABOUT_LEAD = tk('Expected corners, goals, cards and fouls for every upcoming fixture, built from years of results and set against the line the bookmaker is offering - then scored against what actually happened.');

export const ABOUT_FACTS = [
    tk('Match data since 2014'),
    tk('Corners, goals, cards, fouls'),
    tk('Published backtest'),
];

export const FOOTER_DISCLAIMER = tk('Statistics and models, published for information. No bets are taken or handled on this site. Over 18s only.');

export const FOOTER_PRIVACY = tk('An account stores your email, username, favourite leagues and saved slips. Never sold, never shared for advertising.');

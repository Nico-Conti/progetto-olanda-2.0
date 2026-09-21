import { getLanguage } from '../i18n';

/**
 * Hrefs for the two static legal pages.
 *
 * `.html` on purpose, and the reasoning is the same one spelled out at the
 * landing page's privacy link: a static file is served ahead of any rewrite
 * everywhere - Netlify, `vite preview` AND `vite dev` - whereas bare `/privacy`
 * relies on the netlify.toml rule, which dev does not read. There it would hit
 * Vite's SPA fallback, boot the app and bounce you to the landing page.
 *
 * Each policy is two files rather than one page with a toggle, so it needs no
 * script and a shared link keeps its language; we send you to the one matching
 * the language the app is currently showing.
 */
export const privacyHref = () => (getLanguage() === 'it' ? '/privacy.html' : '/privacy.en.html');
export const termsHref = () => (getLanguage() === 'it' ? '/terms.html' : '/terms.en.html');

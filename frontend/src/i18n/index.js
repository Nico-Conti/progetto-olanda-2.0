import { cloneElement, isValidElement, useEffect, useState } from 'react';
import it from './it.js';

/*
   English and Italian. The English text IS the key: `t('Upcoming fixtures')`
   returns it as written in English, and its Italian from ./it.js in Italian -
   so English needs no dictionary, and anything not yet translated shows in
   English rather than as a key. `{name}` placeholders are filled from `vars`.

   `t` reads a module-level language rather than a context. App subscribes with
   useLanguage() and re-renders on a change, which re-renders every component
   under it, so labels built outside components (tab lists, option lists) are
   translated too, as long as they go through `t` at render time.
*/

const STORAGE_KEY = 'olanda_language';
export const LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'it', label: 'Italiano' },
];

let language = (() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'it' ? 'it' : 'en'; } catch { return 'en'; }
})();
const listeners = new Set();

export const getLanguage = () => language;

export const setLanguage = (next) => {
    const lang = next === 'it' ? 'it' : 'en';
    if (lang === language) return;
    language = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    document.documentElement.lang = lang;
    listeners.forEach(fn => fn(lang));
};

/** The current language, re-rendering the caller when it changes. */
export const useLanguage = () => {
    const [lang, setLang] = useState(language);
    useEffect(() => {
        listeners.add(setLang);
        document.documentElement.lang = language;
        return () => listeners.delete(setLang);
    }, []);
    return lang;
};

export const t = (text, vars) => {
    let out = (language === 'it' && it[text]) || text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
    return out;
};

/**
 * `t` for a sentence with styled parts: `vars` may be React elements (a bold
 * number, say), placed wherever the translation puts their {name}. Returns an
 * array React renders as is.
 */
export const tx = (text, vars) => ((language === 'it' && it[text]) || text)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, i) => {
        const name = part.match(/^\{(\w+)\}$/)?.[1];
        const value = name && vars && name in vars ? vars[name] : part;
        return isValidElement(value) ? cloneElement(value, { key: i }) : value;
    });

/**
 * Marks text that is translated later, where it is displayed through `t` - a
 * label in a constant, say. Returns it unchanged; it exists so the coverage
 * check (check.mjs) sees the text.
 */
export const tk = (text) => text;

/** For toLocaleDateString / toLocaleTimeString: day and month names in the page's language. */
export const dateLocale = () => (language === 'it' ? 'it-IT' : 'en-GB');

// The leagues table names nations in Italian; English shows them in English.
const COUNTRY_EN = {
    Belgio: 'Belgium', Brasile: 'Brazil', Francia: 'France', Germania: 'Germany',
    Inghilterra: 'England', Italia: 'Italy', Norvegia: 'Norway', Olanda: 'Netherlands',
    Portogallo: 'Portugal', Scozia: 'Scotland', Spagna: 'Spain', Turchia: 'Turkey',
};
export const countryName = (country) => (language === 'it' ? country : COUNTRY_EN[country] ?? country);

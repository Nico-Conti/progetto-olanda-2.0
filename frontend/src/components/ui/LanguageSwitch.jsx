import React from 'react';
import { t, useLanguage, setLanguage, LANGUAGES } from '../../i18n';

// Inline SVG, not emoji: Windows renders 🇬🇧 and 🇮🇹 as the letters "GB" and "IT".
const FLAGS = {
    en: (
        <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
            <clipPath id="lang-uk"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z" /></clipPath>
            <path d="M0,0v30h60v-30z" fill="#012169" />
            <path d="M0,0L60,30M60,0L0,30" stroke="#fff" strokeWidth="6" />
            <path d="M0,0L60,30M60,0L0,30" clipPath="url(#lang-uk)" stroke="#C8102E" strokeWidth="4" />
            <path d="M30,0v30M0,15h60" stroke="#fff" strokeWidth="10" />
            <path d="M30,0v30M0,15h60" stroke="#C8102E" strokeWidth="6" />
        </svg>
    ),
    it: (
        <svg viewBox="0 0 3 2" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0,0h1v2h-1z" fill="#009246" />
            <path d="M1,0h1v2h-1z" fill="#fff" />
            <path d="M2,0h1v2h-1z" fill="#CE2B37" />
        </svg>
    ),
};

/** English / Italian as two flags. `onChange` runs after the switch (the profile saves it). */
const LanguageSwitch = ({ onChange, className = '' }) => {
    const lang = useLanguage();
    return (
        <div role="radiogroup" aria-label={t('Language')} className={`flex items-center gap-1 p-1 rounded-full bg-zinc-900/60 border border-white/10 ${className}`}>
            {LANGUAGES.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={lang === id}
                    aria-label={label}
                    title={label}
                    onClick={() => { setLanguage(id); onChange?.(id); }}
                    className={`rounded-full p-1 transition ${lang === id
                        ? 'bg-white/10 ring-1 ring-white/25'
                        : 'opacity-40 grayscale hover:opacity-90 hover:grayscale-0'}`}
                >
                    <span className="block w-6 h-4 rounded-[3px] overflow-hidden">{FLAGS[id]}</span>
                </button>
            ))}
        </div>
    );
};

export default LanguageSwitch;

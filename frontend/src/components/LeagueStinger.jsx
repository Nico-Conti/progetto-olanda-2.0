import React, { useRef } from 'react';
import { useCuedAnimation } from '../hooks/useCuedAnimation';
import { flagColors } from '../utils/leaguePickerFx';

/*
   Entering a league: a TV-style replay stinger. Skewed bands in the nation's
   colours sweep across, a dark panel follows and covers the screen, the
   league's logo spins through on it, then everything carries on off the right
   edge in reverse order - colours last - revealing the league.

   Like TransitionAnimation, only transform and opacity through the Web
   Animations API, so it keeps running while the Predictor renders underneath.
*/
const TOTAL = 1350;     // the first band is off the right edge
const SWAP = 470;       // the dark panel covers the screen: swap the view
const IN = 420;         // a band's sweep in (the last band arrives at ~SWAP)
const OUT_AT = 760;     // the first band starts to leave
const OUT = 420;
const STAGGER = 55;
const EASE_IN = 'cubic-bezier(0.65, 0, 0.35, 1)';
const EASE_OUT = 'cubic-bezier(0.55, 0, 0.75, 0.2)';

/** Up to three distinct colours from the nation's flag, lifted pure white a touch. */
const bandColors = (country) => [...new Set(flagColors(country).map(s => s.color))]
    .slice(0, 3)
    .map(c => (c.toLowerCase() === '#ffffff' ? '#e4e4e7' : c));

const play = (root) => {
    const part = (name) => [...root.querySelectorAll(`[data-part="${name}"]`)];
    const bands = part('band');
    const n = bands.length;
    const runs = [];
    const off = TOTAL;

    bands.forEach((band, i) => {
        // In: first band first. Out: last (the dark panel, on top) first.
        const inStart = i * STAGGER;
        const outStart = OUT_AT + (n - 1 - i) * STAGGER;
        runs.push(band.animate([
            { offset: 0, transform: 'translateX(-100%) skewX(-18deg)' },
            { offset: inStart / off, transform: 'translateX(-100%) skewX(-18deg)', easing: EASE_IN },
            { offset: (inStart + IN) / off, transform: 'translateX(0) skewX(-18deg)' },
            { offset: outStart / off, transform: 'translateX(0) skewX(-18deg)', easing: EASE_OUT },
            { offset: (outStart + OUT) / off, transform: 'translateX(100%) skewX(-18deg)' },
            { offset: 1, transform: 'translateX(100%) skewX(-18deg)' },
        ], { duration: TOTAL, fill: 'both' }));
    });

    // The logo rides in with the dark panel, spinning, lands a touch large,
    // settles, and leaves with it, spinning on.
    const [logo] = part('logo');
    const panelIn = (n - 1) * STAGGER;
    const panelOut = OUT_AT;
    runs.push(logo.animate([
        { offset: 0, opacity: 0, transform: 'translateX(-70vw) perspective(600px) rotateY(-540deg) scale(0.5)' },
        { offset: panelIn / off, opacity: 0, transform: 'translateX(-70vw) perspective(600px) rotateY(-540deg) scale(0.5)', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { offset: (panelIn + IN + 60) / off, opacity: 1, transform: 'translateX(0) perspective(600px) rotateY(0deg) scale(1.12)', easing: 'ease-out' },
        { offset: (panelIn + IN + 140) / off, opacity: 1, transform: 'translateX(0) perspective(600px) rotateY(0deg) scale(1)' },
        { offset: panelOut / off, opacity: 1, transform: 'translateX(0) perspective(600px) rotateY(0deg) scale(1)', easing: EASE_OUT },
        { offset: (panelOut + OUT) / off, opacity: 1, transform: 'translateX(75vw) perspective(600px) rotateY(360deg) scale(0.7)' },
        { offset: 1, opacity: 0, transform: 'translateX(75vw) perspective(600px) rotateY(360deg) scale(0.7)' },
    ], { duration: TOTAL, fill: 'both' }));

    // A glint across the disc while it holds.
    const [glint] = part('glint');
    runs.push(glint.animate(
        [{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: 'translateX(220%) skewX(-20deg)' }],
        { duration: 420, delay: panelIn + IN + 60, easing: 'ease-in-out', fill: 'both' }));

    // The name slides up under the logo and goes out with it.
    const [name] = part('name');
    runs.push(name.animate([
        { offset: 0, opacity: 0, transform: 'translateY(12px)' },
        { offset: (panelIn + IN) / off, opacity: 0, transform: 'translateY(12px)' },
        { offset: (panelIn + IN + 160) / off, opacity: 1, transform: 'translateY(0)' },
        { offset: panelOut / off, opacity: 1, transform: 'translateX(0)', easing: EASE_OUT },
        { offset: (panelOut + OUT * 0.7) / off, opacity: 0, transform: 'translateX(40vw)' },
        { offset: 1, opacity: 0, transform: 'translateX(40vw)' },
    ], { duration: TOTAL, fill: 'both' }));

    return runs;
};

const CUES = [[SWAP, 'onMidPoint'], [TOTAL, 'onComplete']];

/** `meta` from leagueMeta(): the league's name, logo and nation. */
const LeagueStinger = ({ isActive, meta, onMidPoint, onComplete }) => {
    const rootRef = useRef(null);
    useCuedAnimation(isActive, rootRef, play, CUES, { onMidPoint, onComplete });

    if (!isActive) return null;

    const colors = bandColors(meta.country);
    return (
        <div ref={rootRef} className="fixed inset-0 z-[200] pointer-events-none overflow-hidden" aria-hidden="true">
            {colors.map((color, i) => (
                <div
                    key={i}
                    data-part="band"
                    className="absolute inset-y-0 -left-[60%] w-[220%]"
                    style={{ background: color, transform: 'translateX(-100%) skewX(-18deg)', boxShadow: '0 0 40px rgb(0 0 0 / 0.5)' }}
                />
            ))}
            <div
                data-part="band"
                className="absolute inset-y-0 -left-[60%] w-[220%]"
                style={{
                    transform: 'translateX(-100%) skewX(-18deg)',
                    background: 'radial-gradient(ellipse at 50% 50%, #18181b, #09090b 70%)',
                    boxShadow: '0 0 60px rgb(0 0 0 / 0.6)',
                }}
            >
                {/* A thin light edge on the panel's leading side. */}
                <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-emerald-300 via-white to-cyan-300 opacity-80" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
                <div
                    data-part="logo"
                    className="relative w-40 h-40 md:w-52 md:h-52 rounded-full bg-white shadow-[0_0_60px_rgb(255_255_255/0.25),0_20px_50px_rgb(0_0_0/0.6)] flex items-center justify-center overflow-hidden opacity-0"
                >
                    <img src={meta.logo ?? '/logo.png'} alt="" className="w-3/5 h-3/5 object-contain" />
                    <span data-part="glint" className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent mix-blend-overlay" />
                </div>
                <div data-part="name" className="opacity-0 text-2xl md:text-4xl font-black uppercase tracking-[0.2em] text-white drop-shadow-lg text-center px-4">
                    {meta.name}
                </div>
            </div>
        </div>
    );
};

export default LeagueStinger;

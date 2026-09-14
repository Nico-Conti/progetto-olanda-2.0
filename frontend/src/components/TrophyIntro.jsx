import React, { useId, useRef } from 'react';
import { useCuedAnimation } from '../hooks/useCuedAnimation';

/*
   The trophy that opens the league picker on the landing page: a thin gold
   outline that draws itself over a soft glow, sends out one faint ring, and
   drifts away as the picker opens underneath. The flag-colour effects for
   choosing a nation live in utils/leaguePickerFx.js.
*/

const TROPHY_TOTAL = 800;
const TROPHY_CUES = [[400, 'onReveal'], [TROPHY_TOTAL, 'onDone']];

// lucide's trophy (the icon used across the app), reordered to draw cup
// first, then handles, stem, base. `delay` is each stroke's start, in ms.
const STROKES = [
    { d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z', delay: 0 },
    { d: 'M6 9H4.5a1 1 0 0 1 0-5H6', delay: 90 },
    { d: 'M18 9h1.5a1 1 0 0 0 0-5H18', delay: 90 },
    { d: 'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978', delay: 150 },
    { d: 'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978', delay: 150 },
    { d: 'M4 22h16', delay: 200 },
];
const DRAW = 280; // ms per stroke

// Easing goes on the keyframes, each covering the segment after it: an
// effect-level easing would bend the whole timeline instead.
const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const AWAY = 'cubic-bezier(0.55, 0, 0.75, 0.3)';

const playTrophy = (root) => {
    const part = (name) => [...root.querySelectorAll(`[data-part="${name}"]`)];
    const timing = { duration: TROPHY_TOTAL, fill: 'both' };
    return [
        part('dim')[0].animate(
            [{ opacity: 0, easing: OUT }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], timing),
        part('glow')[0].animate([
            { opacity: 0, transform: 'scale(0.7)', easing: OUT },
            { opacity: 1, transform: 'scale(1)', offset: 0.35 },
            { opacity: 0, transform: 'scale(1.15)' },
        ], timing),
        part('ring')[0].animate([
            { opacity: 0.7, transform: 'scale(0.6)', easing: OUT },
            { opacity: 0, transform: 'scale(2.2)' },
        ], { duration: 650, delay: 260, fill: 'both' }),
        // Settles in, holds while the strokes finish, then drifts up and away.
        part('trophy')[0].animate([
            { opacity: 0, transform: 'translateY(6px) scale(0.92)', easing: OUT },
            { opacity: 1, transform: 'translateY(0px) scale(1)', offset: 0.3 },
            { opacity: 1, transform: 'translateY(0px) scale(1)', offset: 0.6, easing: AWAY },
            { opacity: 0, transform: 'translateY(-24px) scale(0.96)' },
        ], timing),
        ...part('stroke').map((path, i) => path.animate(
            [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
            { duration: DRAW, delay: STROKES[i].delay, easing: OUT, fill: 'both' },
        )),
    ];
};

/**
 * The trophy itself, in gold: the "Select Your League" button shows the same
 * icon the intro draws. `pathProps` go on every stroke, the rest on the <svg>.
 */
export const TrophyIcon = ({ strokeWidth = 2, pathProps, ...svgProps }) => {
    // A gradient id per instance: the button and the intro can be on screen together.
    const gradient = `trophy-gold-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...svgProps}>
            <defs>
                {/* userSpaceOnUse: in the default bounding-box units a gradient on the
                    flat base line (zero height) is not rendered at all. */}
                <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22">
                    <stop offset="0%" stopColor="#fde68a" />
                    <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
            </defs>
            {STROKES.map(({ d }, i) => (
                <path key={i} d={d} stroke={`url(#${gradient})`} {...pathProps} />
            ))}
        </svg>
    );
};

/**
 * The trophy that opens the league picker. `onReveal` fires while it is still
 * on screen (open the picker then, so it arrives underneath), `onDone` when it
 * has gone.
 */
const TrophyIntro = ({ active, onReveal, onDone }) => {
    const rootRef = useRef(null);
    useCuedAnimation(active, rootRef, playTrophy, TROPHY_CUES, { onReveal, onDone });
    if (!active) return null;

    return (
        <div ref={rootRef} className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center overflow-hidden" aria-hidden="true">
            <div
                data-part="dim"
                className="absolute inset-0 opacity-0"
                style={{ background: 'radial-gradient(circle at 50% 50%, rgb(9 9 11 / 0.6), rgb(9 9 11 / 0.75))' }}
            />
            <div data-part="glow" className="absolute w-56 h-56 rounded-full bg-amber-400/15 blur-3xl opacity-0" />
            <div data-part="ring" className="absolute w-32 h-32 rounded-full border border-amber-300/60 opacity-0" />
            {/* pathLength 1 lets every stroke draw from dashoffset 1 to 0 without measuring it. */}
            <TrophyIcon
                data-part="trophy"
                className="relative w-24 h-24 opacity-0 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]"
                strokeWidth={0.8}
                pathProps={{ 'data-part': 'stroke', pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 }}
            />
        </div>
    );
};

export default TrophyIntro;

import React, { useRef } from 'react';
import { useCuedAnimation } from '../hooks/useCuedAnimation';

/*
   The page transition: the logo flies in along a spiral, trailing a comet of
   particles, lands in the centre and bursts into two rings.

   Timeline (ms). The view swaps mid-flight: rendering the Predictor takes a
   few hundred ms on its own, so starting it at 200 has the new page ready as
   the ball lands, instead of after the whole show - the old version held every
   navigation for 1.8s.

   Everything moves with transform and opacity through the Web Animations API,
   which runs on the compositor: swapping in a heavy view (the Predictor) blocks
   the main thread for a moment, and animations there would freeze with it.
*/
const FLIGHT = 460;   // ball travels the spiral
const SWAP = 200;     // onMidPoint: the view underneath starts changing
const TOTAL = 820;    // onComplete: overlay unmounts
const SAMPLES = 48;   // keyframes along the spiral

const TURNS = 1.25;
const START_ANGLE = 2.4;  // radians; bottom-left, just off-screen
const TIGHTNESS = 1.6;    // how quickly the radius collapses towards the centre

// Comet tail: each segment replays the ball's path a little later, thinner and
// fainter, shading from emerald-400 at the head to cyan-400 at the tip.
const TRAIL_GAP = 10; // ms between segments
const TRAIL = Array.from({ length: 16 }, (_, i) => {
    const f = i / 15;
    const thickness = 12 - 9 * f;
    const color = `rgb(${Math.round(52 - 18 * f)} 211 ${Math.round(153 + 85 * f)})`;
    return { thickness, color, opacity: 0.85 - 0.7 * f, delay: TRAIL_GAP * (i + 1) };
});
const SEGMENT = 20; // px, a segment's unstretched length

/**
 * Points on a logarithmic spiral from just off-screen into the viewport centre,
 * with the direction of travel and speed (px/ms) at each.
 */
const spiral = (width, height) => {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.hypot(width, height) / 2 + 60;
    const floor = Math.exp(-TIGHTNESS);
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const t = i / SAMPLES;
        const r = radius * (Math.exp(-TIGHTNESS * t) - floor) / (1 - floor);
        const angle = START_ANGLE + TURNS * 2 * Math.PI * t;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), t, angle };
    });
    const step = FLIGHT / SAMPLES;
    let heading = 0;
    points.forEach((p, i) => {
        const [a, b] = i < SAMPLES ? [p, points[i + 1]] : [points[i - 1], p];
        const raw = Math.atan2(b.y - a.y, b.x - a.x);
        // Unwrapped, so the segments never spin the long way round at ±180°.
        heading = i === 0 ? raw : heading + Math.atan2(Math.sin(raw - heading), Math.cos(raw - heading));
        p.heading = heading;
        p.speed = Math.hypot(b.x - a.x, b.y - a.y) / step;
    });
    return points;
};

const at = (x, y) => `translate(${x}px, ${y}px) translate(-50%, -50%)`;

/**
 * A tail segment at `p`: turned along the path and stretched to the distance
 * the ball covers in one TRAIL_GAP, so consecutive segments overlap into one
 * streak at speed and shrink to dots as the ball slows into the centre.
 * Needs `transform-origin: 0 0` on the element.
 */
const segment = (p) => {
    const stretch = Math.max(1, (p.speed * TRAIL_GAP * 1.6) / SEGMENT);
    return `translate(${p.x}px, ${p.y}px) rotate(${p.heading}rad) scaleX(${stretch}) translate(-50%, -50%)`;
};

/** Starts every animation for one run; returns them so they can be cancelled. */
const play = (root) => {
    const { innerWidth: w, innerHeight: h } = window;
    const path = spiral(w, h);
    const land = FLIGHT / TOTAL;
    const part = (name) => root.querySelectorAll(`[data-part="${name}"]`);
    const runs = [];

    // Ball: spins as it rolls, grows as it comes towards you, then pops and sinks.
    const [ball] = part('ball');
    const spin = (angle) => (angle - START_ANGLE) * 180 / Math.PI * 2;
    runs.push(ball.animate([
        ...path.map(p => ({
            offset: p.t * land,
            opacity: 1,
            transform: `${at(p.x, p.y)} rotate(${spin(p.angle)}deg) scale(${0.6 + 0.5 * p.t})`,
        })),
        { offset: (FLIGHT + 90) / TOTAL, opacity: 1, transform: `${at(w / 2, h / 2)} rotate(${spin(path[SAMPLES].angle) + 60}deg) scale(1.3)` },
        { offset: (FLIGHT + 260) / TOTAL, opacity: 0, transform: `${at(w / 2, h / 2)} rotate(${spin(path[SAMPLES].angle) + 140}deg) scale(0.2)` },
        { offset: 1, opacity: 0, transform: `${at(w / 2, h / 2)} scale(0.2)` },
    ], { duration: TOTAL, easing: 'linear', fill: 'both' }));

    // Tail segments follow the same path, and fade as they reach the centre.
    const segments = path.map(p => ({ transform: segment(p) }));
    part('trail').forEach((dot, i) => {
        const { opacity, delay } = TRAIL[i];
        runs.push(dot.animate(segments, { duration: FLIGHT, delay, fill: 'both' }));
        runs.push(dot.animate([{ opacity }, { opacity, offset: 0.85 }, { opacity: 0 }],
            { duration: FLIGHT, delay, fill: 'both' }));
    });

    // Impact: two rings burst out from the landing point.
    part('ring').forEach((ring, i) => {
        runs.push(ring.animate([
            { opacity: 0, transform: `${at(w / 2, h / 2)} scale(0.2)` },
            { opacity: 0.9, offset: 0.1 },
            { opacity: 0, transform: `${at(w / 2, h / 2)} scale(${3.4 - i})` },
        ], { duration: TOTAL - FLIGHT, delay: FLIGHT - 20 + 70 * i, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }));
    });

    // A vignette that peaks at the swap, so the old and new pages never cut hard.
    // Easing per keyframe: on the effect it would bend the timeline and move the peak.
    runs.push(part('dim')[0].animate(
        [{ opacity: 0, easing: 'ease-in-out' }, { opacity: 1, offset: SWAP / TOTAL, easing: 'ease-in-out' }, { opacity: 0 }],
        { duration: TOTAL, fill: 'both' }));

    return runs;
};

const CUES = [[SWAP, 'onMidPoint'], [TOTAL, 'onComplete']];

const TransitionAnimation = ({ isActive, onMidPoint, onComplete }) => {
    const rootRef = useRef(null);
    // The callbacks go through a ref inside the hook: App passes fresh inline
    // ones every render, and restarting the timers on each (onMidPoint itself
    // causes one) used to stretch the transition to ~2.7s.
    useCuedAnimation(isActive, rootRef, play, CUES, { onMidPoint, onComplete });

    if (!isActive) return null;

    // Everything starts invisible at the top-left; the animations place it.
    return (
        <div ref={rootRef} className="fixed inset-0 z-[200] pointer-events-none overflow-hidden" aria-hidden="true">
            <div
                data-part="dim"
                className="absolute inset-0 opacity-0"
                style={{ background: 'radial-gradient(circle at 50% 50%, rgb(9 9 11 / 0.25), rgb(9 9 11 / 0.8))' }}
            />
            {TRAIL.map(({ thickness, color }, i) => (
                <span
                    key={i}
                    data-part="trail"
                    className="absolute left-0 top-0 rounded-full opacity-0 origin-top-left"
                    style={{ width: SEGMENT, height: thickness, background: color, boxShadow: `0 0 ${thickness}px ${color}` }}
                />
            ))}
            <span data-part="ring" className="absolute left-0 top-0 w-28 h-28 rounded-full border-2 border-emerald-400 opacity-0 shadow-[0_0_24px_rgba(52,211,153,0.6)]" />
            <span data-part="ring" className="absolute left-0 top-0 w-28 h-28 rounded-full border border-cyan-400 opacity-0 shadow-[0_0_18px_rgba(34,211,238,0.5)]" />
            <img
                data-part="ball"
                src="/logo.png"
                alt=""
                className="absolute left-0 top-0 w-16 h-16 object-contain opacity-0 drop-shadow-[0_0_18px_rgba(16,185,129,0.7)]"
            />
        </div>
    );
};

export default TransitionAnimation;

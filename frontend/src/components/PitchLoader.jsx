import React, { useEffect, useState } from 'react';
import { t, tk } from '../i18n';
import { PITCH_LINES } from '../utils/pitch';

/*
   The loading screen: a pitch draws its own lines, the players step on, and
   the logo passes between them on curved balls with a comet tail - on a loop
   until the data is in. A headline under it changes every couple of seconds.

   The lines are CSS (a stroke-dashoffset draw, staggered); the passing is SVG
   <animateMotion> with keyPoints, which gives a hold at each player without
   any JavaScript per frame.

   Taken from the `simulatore` branch, loader only - PitchMatch, MatchViewer and
   the match animations in index.css stayed there, so `utils/pitch.js` has one
   consumer here rather than two.
*/
const DRAW = 1.5;       // s until the lines are down and play starts
const HOLD = 0.35;      // s the ball stays at a player's feet
const SPEED = 190;      // viewBox units per second on a pass
const TRAIL = 6;
const TRAIL_GAP = 0.03; // s
const HEADLINE_MS = 2200;

const HEADLINES = [
    tk('Counting corners…'),
    tk('Checking with VAR…'),
    tk('Measuring xG…'),
    tk('Waking up the goalkeeper…'),
    tk('Reading the referee’s notebook…'),
    tk('Studying the tactics board…'),
    tk('Inflating the balls…'),
    tk('Warming up on the touchline…'),
    tk('Interviewing the bookmakers…'),
    tk('Drawing the offside line…'),
];

// The move: round the players and back to the first.
const PLAYERS = [[78, 58], [128, 138], [160, 100], [200, 58], [250, 132]];
const ORDER = [0, 1, 2, 3, 4, 0];

/** A quadratic bezier's length, by sampling. */
const qLength = (a, c, b) => {
    let len = 0;
    let prev = a;
    for (let i = 1; i <= 24; i++) {
        const s = i / 24;
        const p = [0, 1].map(k => (1 - s) ** 2 * a[k] + 2 * (1 - s) * s * c[k] + s ** 2 * b[k]);
        len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        prev = p;
    }
    return len;
};

/**
 * The passing loop as one path, and the keyPoints / keyTimes / keySplines that
 * make the ball wait at each player and ease along each pass. Also when (as a
 * fraction of the loop) the ball reaches each player, for their pulse.
 */
const buildPlay = () => {
    const segs = ORDER.slice(1).map((to, i) => {
        const a = PLAYERS[ORDER[i]];
        const b = PLAYERS[to];
        const bend = (i % 2 ? 1 : -1) * 0.25;
        const c = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend];
        return { a, b, c, len: qLength(a, c, b) };
    });
    const total = segs.reduce((s, x) => s + x.len, 0);
    const dur = segs.reduce((s, x) => s + HOLD + x.len / SPEED, 0);

    const path = `M${segs[0].a.join(' ')}` + segs.map(s => `Q${s.c.join(' ')} ${s.b.join(' ')}`).join('');
    const points = [0];
    const times = [0];
    const splines = [];
    const arrivals = [];
    let dist = 0;
    let time = 0;
    segs.forEach((s, i) => {
        arrivals[ORDER[i]] = time / dur;
        time += HOLD;
        points.push(dist / total); times.push(time / dur); splines.push('0 0 1 1');
        dist += s.len;
        time += s.len / SPEED;
        points.push(dist / total); times.push(time / dur); splines.push('0.45 0 0.25 1');
    });
    times[times.length - 1] = 1;
    points[points.length - 1] = 1;
    const fmt = (list) => list.map(v => +v.toFixed(4)).join(';');
    return { path, dur, keyPoints: fmt(points), keyTimes: fmt(times), keySplines: splines.join(';'), arrivals };
};
const PLAY = buildPlay();

/** A player's ring flashing out as the ball arrives, `at` a fraction of the loop. */
const pulse = (at) => {
    const frames = [[0, 0, 5], [at, 0, 5], [at + 0.01, 0.9, 5], [Math.min(at + 0.14, 1), 0, 14], [1, 0, 14]]
        .filter((f, i, all) => i === all.length - 1 || f[0] < all[i + 1][0]);
    return {
        keyTimes: frames.map(f => +f[0].toFixed(4)).join(';'),
        opacity: frames.map(f => f[1]).join(';'),
        r: frames.map(f => f[2]).join(';'),
    };
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const motion = (begin) => (
    <animateMotion
        dur={`${PLAY.dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        path={PLAY.path}
        keyPoints={PLAY.keyPoints}
        keyTimes={PLAY.keyTimes}
        keySplines={PLAY.keySplines}
        calcMode="spline"
    />
);

const PitchLoader = () => {
    const [still] = useState(reducedMotion);
    const [headline, setHeadline] = useState(() => Math.floor(Math.random() * HEADLINES.length));
    useEffect(() => {
        const id = setInterval(() => setHeadline(i => (i + 1) % HEADLINES.length), HEADLINE_MS);
        return () => clearInterval(id);
    }, []);

    const [sx, sy] = PLAYERS[0];
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4" role="status">
            <svg viewBox="0 0 320 200" className="w-full max-w-md drop-shadow-[0_0_24px_rgb(16_185_129/0.25)]" aria-hidden="true">
                <defs>
                    <radialGradient id="loader-glow" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="rgb(16 185 129 / 0.16)" />
                        <stop offset="100%" stopColor="rgb(16 185 129 / 0)" />
                    </radialGradient>
                </defs>
                <rect x="10" y="10" width="300" height="180" rx="3" fill="url(#loader-glow)" className="pitch-turf" />
                {/* Mowing stripes. */}
                {Array.from({ length: 6 }, (_, i) => (
                    <rect key={i} x={10 + i * 50} y="10" width="25" height="180" className="pitch-turf" fill="rgb(255 255 255 / 0.018)" />
                ))}
                <g fill="none" stroke="rgb(209 250 229 / 0.7)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    {PITCH_LINES.map((d, i) => (
                        <path key={i} d={d} pathLength="1" className="pitch-line" style={{ animationDelay: `${i * 0.11}s` }} />
                    ))}
                </g>
                <circle cx="160" cy="100" r="1.8" fill="rgb(209 250 229 / 0.7)" className="pitch-turf" />

                {PLAYERS.map(([x, y], i) => {
                    const p = pulse(PLAY.arrivals[i]);
                    return (
                        <g key={i} className="pitch-player" style={{ animationDelay: `${DRAW - 0.4 + i * 0.07}s` }}>
                            {!still && (
                                <circle cx={x} cy={y} r="5" fill="none" stroke="#34d399" strokeWidth="1.2" opacity="0">
                                    <animate attributeName="opacity" values={p.opacity} keyTimes={p.keyTimes} dur={`${PLAY.dur}s`} begin={`${DRAW}s`} repeatCount="indefinite" />
                                    <animate attributeName="r" values={p.r} keyTimes={p.keyTimes} dur={`${PLAY.dur}s`} begin={`${DRAW}s`} repeatCount="indefinite" />
                                </circle>
                            )}
                            <circle cx={x} cy={y} r="4.5" fill="#10b981" stroke="#d1fae5" strokeWidth="1" />
                        </g>
                    );
                })}

                <g>
                    {!still && Array.from({ length: TRAIL }, (_, k) => (
                        <circle key={k} r={4.2 - k * 0.55} fill={k < 3 ? '#6ee7b7' : '#22d3ee'} opacity="0">
                            {motion(DRAW + (k + 1) * TRAIL_GAP)}
                            <set attributeName="opacity" to={0.55 - k * 0.08} begin={`${DRAW + (k + 1) * TRAIL_GAP}s`} />
                        </circle>
                    ))}
                    <g transform={still ? `translate(${sx} ${sy - 9})` : undefined} opacity={still ? 1 : 0}>
                        {!still && motion(DRAW)}
                        {!still && <set attributeName="opacity" to="1" begin={`${DRAW}s`} />}
                        <g>
                            {!still && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite" />}
                            <image href="/logo.png" x="-8" y="-8" width="16" height="16" />
                        </g>
                    </g>
                </g>
            </svg>

            <div className="h-6 overflow-hidden text-center">
                <span
                    key={headline}
                    className="pitch-headline t-shimmer block text-sm md:text-base font-semibold uppercase tracking-widest"
                    data-text={t(HEADLINES[headline])}
                >
                    {t(HEADLINES[headline])}
                </span>
            </div>
            <span className="sr-only">{t('Loading matches')}</span>
        </div>
    );
};

export default PitchLoader;

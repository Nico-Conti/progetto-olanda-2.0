import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../i18n';
import { PITCH_LINES } from '../utils/pitch';

/*
   A little match, for the landing page's "Watch a match": a pitch draws its
   own lines, two teams step on and play - passes (some intercepted), tackles,
   shots, saves and now and then a goal - to full time, then start again.

   The match is a tiny simulation on requestAnimationFrame that writes SVG
   attributes through refs, so React renders only when something happens (a
   goal, a steal), never per frame. Units are the SVG's: the pitch is
   x 10..310, y 10..190, goals at x 10 and 310 between y 88 and 112.
*/
const DRAW = 1.5;          // s until the lines are down and play starts

// Team 0 attacks right, team 1 left. Index 0 is the keeper.
const TEAMS = [
    { fill: '#10b981', stroke: '#d1fae5', goalX: 310 },
    { fill: '#f43f5e', stroke: '#ffe4e6', goalX: 10 },
];
const SHAPE = [[18, 100], [68, 58], [68, 142], [120, 100], [178, 68], [178, 132]];
const base = (team, i) => (team === 0 ? SHAPE[i] : [320 - SHAPE[i][0], SHAPE[i][1]]);

const DRIBBLE = 34;        // units/s with the ball
const RUN = 3.2;           // how fast players close on their spot (1/s)
const PRESS = 26;          // units/s, the presser
const TACKLE_RATE = 0.7;   // steals per second in contact
const INTERCEPT = 0.22;    // chance a pass is cut out
const GOAL_CHANCE = 0.5;   // chance a shot goes in
const SHOOT_RANGE = 95;
const CELEBRATE = 2.4;     // s
const MINUTES_PER_S = 2;   // match clock: 90' in 45 s
const FULL_TIME = 3;       // s the final score stays up before a new match

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const newMatch = () => ({
    players: TEAMS.flatMap((_, team) => SHAPE.map((_, i) => {
        const [x, y] = base(team, i);
        return { team, i, x, y, phase: rand(0, 6.28) };
    })),
    ball: { x: 160, y: 100, spin: 0 },
    owner: null,        // player with the ball
    flight: null,       // { from, ctrl, to, t, dur, receiver, kind }
    decide: 0.8,        // s until the owner acts
    mode: 'play',       // play | celebrate
    modeT: 0,
    scorer: null,
    time: 0,
    trail: [],
});

const kickoff = (m, team) => {
    m.players.forEach(p => { [p.x, p.y] = base(p.team, p.i); });
    m.owner = m.players.find(p => p.team === team && p.i === 3);
    m.owner.x = 160 + (team === 0 ? -6 : 6);
    m.owner.y = 100;
    m.flight = null;
    m.decide = 0.9;
    m.mode = 'play';
};

/** Launch the ball on a curve to `to`, landing with `receiver` (who may be null for a goal). */
const launch = (m, to, receiver, kind, speed) => {
    const from = { x: m.ball.x, y: m.ball.y };
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const bend = rand(-0.22, 0.22);
    const ctrl = { x: (from.x + to.x) / 2 - (to.y - from.y) * bend, y: (from.y + to.y) / 2 + (to.x - from.x) * bend };
    m.flight = { from, ctrl, to, t: 0, dur: Math.max(0.25, len / speed), receiver, kind };
    m.owner = null;
};

const act = (m, emit) => {
    const o = m.owner;
    const team = TEAMS[o.team];
    const mates = m.players.filter(p => p.team === o.team && p !== o && p.i !== 0);
    const foes = m.players.filter(p => p.team !== o.team);
    const toGoal = Math.abs(team.goalX - o.x);

    if (toGoal < SHOOT_RANGE && o.i !== 0) {
        const keeper = foes.find(p => p.i === 0);
        if (Math.random() < GOAL_CHANCE) {
            const y = rand(91, 109);
            // Keeper dives the wrong way.
            keeper.dive = { y: y > 100 ? rand(84, 96) : rand(104, 116) };
            launch(m, { x: team.goalX + (o.team === 0 ? 6 : -6), y }, null, 'goal', 260);
        } else {
            const y = rand(92, 108);
            keeper.dive = { y };
            launch(m, { x: keeper.x, y }, keeper, 'save', 240);
            emit('save', keeper);
        }
        return;
    }

    // Pass: prefer teammates further forward.
    const dir = o.team === 0 ? 1 : -1;
    const weights = mates.map(p => Math.max(0.2, 1 + (p.x - o.x) * dir / 60));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    const target = mates.find((_, k) => (r -= weights[k]) <= 0) ?? mates[0];
    const lead = { x: clamp(target.x + dir * 10, 14, 306), y: clamp(target.y + rand(-8, 8), 14, 186) };

    if (Math.random() < INTERCEPT) {
        const mid = { x: (o.x + lead.x) / 2, y: (o.y + lead.y) / 2 };
        const thief = foes.filter(p => p.i !== 0).sort((a, b) => dist(a, mid) - dist(b, mid))[0];
        launch(m, { x: thief.x, y: thief.y }, thief, 'intercept', 170);
        thief.runTo = { x: thief.x, y: thief.y };
        return;
    }
    target.runTo = lead;
    launch(m, lead, target, 'pass', 170);
};

/** One simulation step. `emit(kind, at)` reports events worth drawing. */
const step = (m, dt, emit) => {
    m.time += dt;
    m.modeT += dt;
    const { ball } = m;

    if (m.mode === 'celebrate') {
        if (m.modeT > CELEBRATE) kickoff(m, 1 - m.scorer.team);
    }

    // Where each team's block sits: it follows the ball, the side in
    // possession a little higher up the pitch.
    const shift = clamp((ball.x - 160) * 0.45, -60, 60);
    const holder = m.owner ?? m.flight?.receiver;
    const presser = m.owner && m.mode === 'play'
        ? m.players.filter(p => p.team !== m.owner.team && p.i !== 0).sort((a, b) => dist(a, m.owner) - dist(b, m.owner))[0]
        : null;

    for (const p of m.players) {
        if (p === m.owner && m.mode === 'play') continue;
        let tx, ty;
        const [bx, by] = base(p.team, p.i);
        if (m.mode === 'celebrate') {
            if (p === m.scorer) {
                // Off to the corner flag.
                const goalX = TEAMS[p.team].goalX;
                tx = goalX + (p.team === 0 ? -16 : 16); ty = p.y < 100 ? 18 : 182;
            } else if (p.team === m.scorer.team) {
                const a = p.phase;
                tx = m.scorer.x + Math.cos(a) * 9; ty = m.scorer.y + Math.sin(a) * 9;
            } else {
                tx = bx; ty = by;
            }
        } else if (p.i === 0) {
            tx = bx;
            ty = p.dive ? p.dive.y : 100 + (ball.y - 100) * 0.35;
        } else if (p === presser) {
            const d = dist(p, m.owner) || 1;
            const s = Math.min(PRESS * dt, d);
            p.x += (m.owner.x - p.x) / d * s;
            p.y += (m.owner.y - p.y) / d * s;
            continue;
        } else if (p.runTo && m.flight?.receiver === p) {
            tx = p.runTo.x; ty = p.runTo.y;
        } else {
            const attacking = holder && holder.team === p.team ? (p.team === 0 ? 14 : -14) : 0;
            tx = bx + shift + attacking + Math.sin(m.time * 0.9 + p.phase) * 7;
            ty = by + (ball.y - 100) * 0.2 + Math.cos(m.time * 0.7 + p.phase) * 6;
        }
        const k = Math.min(1, dt * (p.i === 0 ? 5 : RUN));
        p.x += (clamp(tx, 12, 308) - p.x) * k;
        p.y += (clamp(ty, 12, 188) - p.y) * k;
    }

    if (m.flight) {
        const f = m.flight;
        f.t += dt / f.dur;
        const s = Math.min(1, f.t);
        const e = 1 - (1 - s) ** 2;
        ball.x = (1 - e) ** 2 * f.from.x + 2 * (1 - e) * e * f.ctrl.x + e ** 2 * f.to.x;
        ball.y = (1 - e) ** 2 * f.from.y + 2 * (1 - e) * e * f.ctrl.y + e ** 2 * f.to.y;
        ball.spin += dt * 900;
        if (s >= 1) {
            m.flight = null;
            if (f.kind === 'goal') {
                m.mode = 'celebrate';
                m.modeT = 0;
                m.scorer = f.shooter;
                m.players.forEach(p => { p.dive = null; });
                emit('goal', { x: ball.x, y: ball.y, team: f.shooter.team });
            } else {
                m.owner = f.receiver;
                m.owner.runTo = null;
                m.owner.dive = null;
                m.decide = f.receiver.i === 0 ? 1 : rand(0.5, 1.3);
                if (f.kind === 'intercept') emit('steal', m.owner);
            }
        }
    } else if (m.owner && m.mode === 'play') {
        const o = m.owner;
        const goalX = TEAMS[o.team].goalX;
        const dir = o.team === 0 ? 1 : -1;
        if (o.i !== 0) {
            o.x = clamp(o.x + dir * DRIBBLE * dt, 14, 306);
            o.y = clamp(o.y + (100 - o.y) * dt * 0.6 + Math.sin(m.time * 2 + o.phase) * dt * 12, 14, 186);
        }
        ball.x = o.x + dir * 5;
        ball.y = o.y + 2;
        ball.spin += dt * 300;

        if (presser && dist(presser, o) < 7 && Math.random() < TACKLE_RATE * dt) {
            m.owner = presser;
            m.decide = rand(0.4, 0.9);
            emit('steal', presser);
            return;
        }
        m.decide -= dt;
        if (m.decide <= 0 || Math.abs(goalX - o.x) < SHOOT_RANGE * 0.6) {
            const shooter = o;
            act(m, emit);
            if (m.flight?.kind === 'goal') m.flight.shooter = shooter;
        }
    }

    m.trail.unshift({ x: ball.x, y: ball.y });
    m.trail.length = Math.min(m.trail.length, 8);
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pct = (x, y) => ({ left: `${(x / 320) * 100}%`, top: `${(y / 200) * 100}%` });

/** The TV scoreboard: teams, score, clock. */
const Scoreboard = ({ score, minute, fullTime }) => (
    <div className="pitch-turf flex items-stretch rounded-lg overflow-hidden border border-white/10 bg-zinc-900/80 shadow-lg text-white text-xs md:text-sm font-black uppercase tracking-wider" aria-hidden="true">
        {[0, 1].map(team => (
            <React.Fragment key={team}>
                {team === 1 && <span className="px-2 flex items-center text-zinc-500">-</span>}
                <span className={`flex items-center gap-2 ${team === 0 ? 'pl-3 flex-row' : 'pr-3 flex-row-reverse'}`}>
                    <span className="w-1.5 self-stretch -my-px" style={{ background: TEAMS[team].fill }} />
                    <span className="py-1.5 text-zinc-300">{team === 0 ? t('Home') : t('Away')}</span>
                    <span key={score[team]} className={`py-1.5 w-5 text-center text-lg md:text-xl tabular-nums ${score[team] ? 'pop-in' : ''}`}>{score[team]}</span>
                </span>
            </React.Fragment>
        ))}
        <span className={`ml-2 px-3 flex items-center tabular-nums ${fullTime ? 'bg-amber-400 text-zinc-950' : 'bg-emerald-500 text-zinc-950'}`}>
            {fullTime ? t('FT') : `${minute}'`}
        </span>
    </div>
);

/**
 * The match itself, with its scoreboard. Plays from kickoff to full time,
 * shows the result for a moment, and starts a new match.
 */
const PitchMatch = ({ className = '' }) => {
    const uid = useId();
    const [still] = useState(reducedMotion);
    const [score, setScore] = useState([0, 0]);
    const [minute, setMinute] = useState(0);
    const [fullTime, setFullTime] = useState(false);
    const [goal, setGoal] = useState(null);     // { id, x, y, team }
    const [flashes, setFlashes] = useState([]); // steals and saves
    const playerRefs = useRef([]);
    const ballRef = useRef(null);
    const spinRef = useRef(null);
    const trailRefs = useRef([]);

    useEffect(() => {
        if (still) return;
        const m = newMatch();
        kickoff(m, Math.random() < 0.5 ? 0 : 1);
        let paused = false;
        let seq = 0;
        const timers = [];
        const emit = (kind, at) => {
            const id = ++seq;
            if (kind === 'goal') {
                setScore(s => s.map((v, k) => (k === at.team ? v + 1 : v)));
                const bits = Array.from({ length: 18 }, (_, i) => {
                    const a = (i / 18) * Math.PI * 2;
                    return { dx: Math.cos(a) * rand(50, 110), dy: Math.sin(a) * rand(50, 110) - 30, rot: rand(-540, 540) };
                });
                setGoal({ id, ...at, bits });
            } else {
                setFlashes(list => [...list, { id, kind, x: at.x, y: at.y, team: at.team }]);
                timers.push(setTimeout(() => setFlashes(list => list.filter(f => f.id !== id)), 800));
            }
        };

        let raf;
        let last = null;
        const start = performance.now() + DRAW * 1000;
        const frame = (now) => {
            raf = requestAnimationFrame(frame);
            if (now < start) return;
            const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
            last = now;
            if (paused) return;
            step(m, dt, emit);
            m.players.forEach((p, k) => playerRefs.current[k]?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`));
            ballRef.current?.setAttribute('transform', `translate(${m.ball.x.toFixed(1)} ${m.ball.y.toFixed(1)})`);
            spinRef.current?.setAttribute('transform', `rotate(${(m.ball.spin % 360).toFixed(0)})`);
            trailRefs.current.forEach((c, k) => {
                const p = m.trail[k + 1];
                if (c && p) { c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); }
            });
        };
        raf = requestAnimationFrame(frame);

        // The clock, read four times a second. At 90' the whistle goes; after
        // a moment a fresh match kicks off.
        const clock = setInterval(() => {
            if (paused) return;
            const min = Math.floor(m.time * MINUTES_PER_S);
            setMinute(Math.min(90, min));
            if (min >= 90 && m.mode === 'play') {
                paused = true;
                setFullTime(true);
                timers.push(setTimeout(() => {
                    Object.assign(m, newMatch());
                    kickoff(m, Math.random() < 0.5 ? 0 : 1);
                    setScore([0, 0]);
                    setMinute(0);
                    setFullTime(false);
                    paused = false;
                    last = null;
                }, FULL_TIME * 1000));
            }
        }, 250);
        return () => { cancelAnimationFrame(raf); clearInterval(clock); timers.forEach(clearTimeout); };
    }, [still]);

    // Clears the goal overlay once it has played.
    useEffect(() => {
        if (!goal) return;
        const id = setTimeout(() => setGoal(null), CELEBRATE * 1000);
        return () => clearTimeout(id);
    }, [goal]);

    return (
        <div className={`flex flex-col items-center gap-5 w-full ${className}`}>
            <Scoreboard score={score} minute={minute} fullTime={fullTime} />

            <div className={`relative w-full ${goal ? 'pitch-shake' : ''}`} aria-hidden="true">
                <svg viewBox="0 0 320 200" className="w-full drop-shadow-[0_0_24px_rgb(16_185_129/0.25)] overflow-visible">
                    <defs>
                        <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="60%">
                            <stop offset="0%" stopColor="rgb(16 185 129 / 0.16)" />
                            <stop offset="100%" stopColor="rgb(16 185 129 / 0)" />
                        </radialGradient>
                        <pattern id={`${uid}net`} width="2.5" height="2.5" patternUnits="userSpaceOnUse">
                            <path d="M0 0L2.5 2.5M2.5 0L0 2.5" stroke="rgb(209 250 229 / 0.45)" strokeWidth="0.35" />
                        </pattern>
                    </defs>
                    <rect x="10" y="10" width="300" height="180" rx="3" fill={`url(#${uid}glow)`} className="pitch-turf" />
                    {Array.from({ length: 6 }, (_, i) => (
                        <rect key={i} x={10 + i * 50} y="10" width="25" height="180" className="pitch-turf" fill="rgb(255 255 255 / 0.018)" />
                    ))}
                    {goal && (
                        <rect key={goal.id} x="10" y="10" width="300" height="180" rx="3" className="pitch-flash" fill={TEAMS[goal.team].fill} />
                    )}
                    <g fill="none" stroke="rgb(209 250 229 / 0.7)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                        {PITCH_LINES.map((d, i) => (
                            <path key={i} d={d} pathLength="1" className="pitch-line" style={{ animationDelay: `${i * 0.11}s` }} />
                        ))}
                    </g>
                    <circle cx="160" cy="100" r="1.8" fill="rgb(209 250 229 / 0.7)" className="pitch-turf" />

                    {/* Goals: nets behind each line; the one scored in bulges. */}
                    {[{ x: 2, side: 1 }, { x: 310, side: 0 }].map(({ x, side }) => (
                        <g key={x} className="pitch-turf">
                            <rect
                                x={x} y="88" width="8" height="24"
                                fill={`url(#${uid}net)`} stroke="rgb(209 250 229 / 0.8)" strokeWidth="0.8"
                                className={goal && goal.team === side ? 'pitch-net-hit' : ''}
                                style={{ transformOrigin: `${x === 2 ? 10 : 310}px 100px` }}
                            />
                        </g>
                    ))}

                    {TEAMS.flatMap((team, ti) => SHAPE.map((_, i) => {
                        const [x, y] = base(ti, i);
                        const k = ti * SHAPE.length + i;
                        return (
                            <g key={k} ref={el => { playerRefs.current[k] = el; }} transform={`translate(${x} ${y})`}>
                                <g className="pitch-player" style={{ animationDelay: `${DRAW - 0.5 + k * 0.04}s` }}>
                                    <circle r="4.5" fill={team.fill} stroke={team.stroke} strokeWidth={i === 0 ? 1.8 : 1} />
                                </g>
                            </g>
                        );
                    }))}

                    {!still && Array.from({ length: 6 }, (_, k) => (
                        <circle
                            key={k}
                            ref={el => { trailRefs.current[k] = el; }}
                            cx="160" cy="100"
                            r={3.6 - k * 0.45}
                            fill={k < 3 ? '#6ee7b7' : '#22d3ee'}
                            opacity={0.5 - k * 0.07}
                            className="pitch-ball"
                            style={{ animationDelay: `${DRAW}s` }}
                        />
                    ))}
                    <g ref={ballRef} transform="translate(160 100)" className="pitch-ball" style={{ animationDelay: `${DRAW}s` }}>
                        <g ref={spinRef}>
                            <image href="/logo.png" x="-7" y="-7" width="14" height="14" />
                        </g>
                    </g>
                </svg>

                {/* Steals and saves: a ring where the ball changed hands. */}
                {flashes.map(f => (
                    <span
                        key={f.id}
                        className="pitch-ring absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 pointer-events-none"
                        style={{ ...pct(f.x, f.y), borderColor: TEAMS[f.team].fill }}
                    />
                ))}

                {goal && (
                    <div key={goal.id} className="absolute inset-0 pointer-events-none">
                        {goal.bits.map((b, i) => (
                            <span
                                key={i}
                                className="pitch-confetti absolute w-1.5 h-2.5 rounded-sm"
                                style={{
                                    ...pct(goal.x, goal.y),
                                    background: i % 3 === 2 ? '#fff' : TEAMS[goal.team].fill,
                                    '--dx': `${b.dx}px`,
                                    '--dy': `${b.dy}px`,
                                    '--rot': `${b.rot}deg`,
                                    animationDelay: `${i * 8}ms`,
                                }}
                            />
                        ))}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span
                                className="pitch-goal text-5xl md:text-7xl font-black italic tracking-tight"
                                style={{ color: TEAMS[goal.team].fill, textShadow: `0 0 30px ${TEAMS[goal.team].fill}, 0 4px 0 rgb(0 0 0 / 0.5)` }}
                            >
                                {t('GOAL!')}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PitchMatch;

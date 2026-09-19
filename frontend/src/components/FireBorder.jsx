import { useEffect, useRef } from 'react';

/**
 * Flames licking off a box's edge: the fire sibling of originkit's
 * ElectricBorder. Particles spawn along the perimeter - thickest on top, thinner
 * up the sides, a few on the bottom - rise, cool from white-yellow to red and
 * fade, drawn additively so where they crowd they burn brighter. The inside of
 * the box is erased every frame, so the fire hugs the outline and never sits
 * over the content.
 *
 * It redraws a canvas every frame: mount it only while it is on screen.
 */
const PAD = 90;
// White-hot to ember, as life runs out.
const STOPS = ['#ffe29a', '#ffb347', '#ff8a1f', '#f4511e', '#c62828', '#5d0f0f'];

const sprite = (color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, `${color}cc`);
    grad.addColorStop(0.6, `${color}44`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
};

export default function FireBorder({ borderRadius = 16, density = 1, height = 1, inset = 3 }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const sprites = STOPS.map(sprite);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = 0, h = 0, frame, last = performance.now();
        const parts = [];

        const resize = () => {
            const r = wrap.getBoundingClientRect();
            w = r.width;
            h = r.height;
            canvas.width = (w + 2 * PAD) * dpr;
            canvas.height = (h + 2 * PAD) * dpr;
            canvas.style.width = `${w + 2 * PAD}px`;
            canvas.style.height = `${h + 2 * PAD}px`;
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        // A point on the outline, and which way is out there.
        const spawn = () => {
            const top = w, side = h * 0.55, bottom = w * 0.15;
            const k = Math.random() * (top + 2 * side + bottom);
            let x, y, out;
            if (k < top) { x = Math.random() * w; y = 0; out = 0; }
            else if (k < top + side) { x = 0; y = Math.random() * h; out = -1; }
            else if (k < top + 2 * side) { x = w; y = Math.random() * h; out = 1; }
            else { x = Math.random() * w; y = h; out = 0; }
            const life = 0.35 + Math.random() * 0.45;
            parts.push({
                x, y, life, age: 0,
                vx: out * (10 + Math.random() * 20) + (Math.random() - 0.5) * 10,
                vy: -(45 + Math.random() * 60) * height,
                r: 10 + Math.random() * 12,
                seed: Math.random() * 10,
            });
        };

        const tick = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            // Spawn rate follows the perimeter, so a big panel burns as thickly as a small card.
            const want = (w + h) * 2.4 * density * dt;
            for (let n = want + Math.random(); n >= 1; n--) spawn();

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w + 2 * PAD, h + 2 * PAD);
            ctx.globalCompositeOperation = 'lighter';
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.age += dt;
                const k = p.age / p.life;
                if (k >= 1) { parts.splice(i, 1); continue; }
                // A flicker sideways, and a pull up as it heats.
                p.x += (p.vx + Math.sin(now / 140 + p.seed) * 18) * dt;
                p.y += p.vy * dt;
                p.vy -= 30 * dt * height;
                const size = p.r * (1 - k * 0.6);
                ctx.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - k) * 0.4;
                ctx.drawImage(sprites[Math.min(STOPS.length - 1, Math.floor(k * STOPS.length))],
                    PAD + p.x - size, PAD + p.y - size, size * 2, size * 2);
            }
            // Clear the inside, leaving a faint warmth behind the content.
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.roundRect(PAD + inset, PAD + inset, w - 2 * inset, h - 2 * inset, Math.max(0, borderRadius - inset));
            ctx.fill();
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(frame); ro.disconnect(); };
    }, [borderRadius, density, height, inset]);

    return (
        <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <canvas ref={canvasRef} className="absolute" style={{ left: -PAD, top: -PAD }} />
        </div>
    );
}

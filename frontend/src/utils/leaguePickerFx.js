/*
   Flag-colour effects for the league picker on the landing page (the trophy
   that opens it is TrophyIntro). Web Animations on transform and opacity only,
   like the page transition.
*/

export const motionAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Keyed by the country names the leagues table uses, in stripe order. A
// stripe is a colour, or [colour, width] (a whole number) when it is not the
// same width as the others. Black is lifted slightly so it still reads on the
// dark UI; confetti gets a light rim for the same reason.
const FLAG_COLORS = {
    Belgio: ['#27272a', '#fdda24', '#ef3340'],
    // Green field, yellow diamond, blue globe at the centre - not a tricolour.
    Brasile: [['#009c3b', 3], '#ffdf00', ['#002776', 2], '#ffdf00', ['#009c3b', 3]],
    Francia: ['#0055a4', '#ffffff', '#ef4135'],
    Germania: ['#27272a', '#dd0000', '#ffce00'],
    Inghilterra: ['#ffffff', '#ce1124'],
    Italia: ['#009246', '#ffffff', '#ce2b37'],
    // The cross read as a row of stripes: a narrow blue band between thin
    // white ones - three equal stripes looked like France.
    Norvegia: [['#ba0c2f', 3], '#ffffff', ['#00205b', 2], '#ffffff', ['#ba0c2f', 3]],
    Olanda: ['#ae1c28', '#ffffff', '#21468b'],
    Portogallo: [['#006600', 2], ['#ff0000', 3]],
    Scozia: ['#005eb8', '#ffffff'],
    Spagna: ['#aa151b', '#f1bf00', '#aa151b'],
    Turchia: ['#e30a17', '#ffffff'],
};

/**
 * A nation's flag as stripes, `{ color, weight }`; the app's emerald and cyan
 * for any nation not listed yet.
 */
export const flagColors = (country) => (FLAG_COLORS[country] ?? ['#34d399', '#22d3ee'])
    .map(stripe => (Array.isArray(stripe) ? { color: stripe[0], weight: stripe[1] } : { color: stripe, weight: 1 }));

/**
 * What the cards need to know about a league, from the `leagues` rows
 * (logo_url, country, country_flag).
 */
export const leagueMeta = (leagues, name) => {
    const row = leagues?.find(l => l.name === name);
    return {
        name: name || 'Unknown league',
        logo: row?.logo_url ?? null,
        country: row?.country ?? null,
        flag: row?.country_flag ?? null,
    };
};

/** Each stripe's colour with its start and end, as fractions of the whole. */
const spans = (stripes) => {
    const total = stripes.reduce((sum, s) => sum + s.weight, 0);
    let at = 0;
    return stripes.map(({ color, weight }) => {
        const from = at / total;
        at += weight;
        return { color, from, to: at / total };
    });
};

/** Hard-stop stripes, for a bar in the flag's colours. */
export const flagStripes = (stripes) => `linear-gradient(90deg, ${spans(stripes)
    .map(({ color, from, to }) => `${color} ${100 * from}% ${100 * to}%`)
    .join(', ')})`;

/** The same stripes wrapped around a circle, for a ring around the flag. */
export const flagRing = (stripes) => `conic-gradient(${spans(stripes)
    .map(({ color, from, to }) => `${color} ${360 * from}deg ${360 * to}deg`)
    .join(', ')})`;

/**
 * Confetti in the flag's colours, bursting up and out of `rect` and falling
 * away, each colour as common as its stripe is wide. A fixed layer on <body>,
 * so the modal's overflow does not clip it; removes itself when done.
 */
export const confettiBurst = (rect, stripes) => {
    const colors = stripes.flatMap(({ color, weight }) => Array(weight).fill(color));
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:210;overflow:hidden';
    document.body.appendChild(layer);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const runs = Array.from({ length: 34 }, (_, i) => {
        const w = 5 + Math.random() * 4;
        const h = w * (1.3 + Math.random() * 0.8);
        const piece = document.createElement('span');
        piece.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;`
            + `margin:${-h / 2}px 0 0 ${-w / 2}px;border-radius:1.5px;background:${colors[i % colors.length]};`
            + 'box-shadow:0 0 0 0.5px rgb(255 255 255 / 0.3)';
        layer.appendChild(piece);

        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4; // mostly upwards
        const speed = 110 + Math.random() * 150;
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;
        const spin = (Math.random() - 0.5) * 900;
        return piece.animate([
            { transform: 'translate(0px, 0px) rotate(0deg) scale(0.5)', opacity: 1 },
            { transform: `translate(${dx * 0.75}px, ${dy * 0.75}px) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${dx}px, ${dy + 170}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
        ], { duration: 950 + Math.random() * 300, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'both' });
    });
    Promise.all(runs.map(run => run.finished)).finally(() => layer.remove());
};

/**
 * The flag's stripes sweep across `panel` as skewed bands, each as wide as its
 * stripe; `onCovered` runs mid-sweep, which is when the content underneath
 * should change.
 */
export const flagWipe = (panel, stripes, onCovered) => {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;border-radius:inherit';
    panel.appendChild(layer);
    // In px, not %: a translate percentage is of the band's own width, so a
    // narrow band would travel less and never make it across.
    const width = panel.clientWidth;
    const lean = panel.clientHeight * 0.2; // how far the skew pushes a corner out
    const total = stripes.reduce((sum, s) => sum + s.weight, 0);
    const runs = stripes.map(({ color, weight }, i) => {
        const bandWidth = (1.2 * width * weight) / total;
        const band = document.createElement('div');
        band.style.cssText = `position:absolute;top:-10%;bottom:-10%;left:0;width:${bandWidth}px;background:${color};opacity:0.88`;
        layer.appendChild(band);
        return band.animate(
            [{ transform: `translateX(${-bandWidth - lean}px) skewX(-18deg)` }, { transform: `translateX(${width + lean}px) skewX(-18deg)` }],
            { duration: 640, delay: i * 70, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' },
        );
    });
    setTimeout(onCovered, 330); // when the first bands are crossing the middle
    Promise.all(runs.map(run => run.finished)).finally(() => layer.remove());
};

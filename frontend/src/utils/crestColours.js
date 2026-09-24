/**
 * A team's two colours, read off its crest - there is no colour column, and a
 * crest is the kit in miniature.
 *
 * Pixels are grouped into coarse buckets (16 levels a channel) and counted. The
 * crest's strong colours win over its white field and black outline when they
 * cover a fair share of it (8%); a black-and-white crest has none, so there the
 * greys themselves are the colours. The second colour is the most common one
 * clearly different from the first - and not merely a lighter or darker shade
 * of it, which is what a crest's anti-aliased edge is made of - or null.
 */
const SATURATED_SHARE = 0.08;
const MIN_DISTANCE = 90;

const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Hue in degrees and saturation 0-1, for telling a shade from a second colour. */
const hueSat = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return [0, 0];
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d / (255 - Math.abs(max + min - 255))];
};
const shadeOf = (a, b) => {
    const [ha, sa] = hueSat(a), [hb, sb] = hueSat(b);
    const gap = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
    return sa > 0.2 && sb > 0.2 && gap < 25;
};

export const dominantColours = (rgba) => {
    const all = new Map();
    const strong = new Map();
    let opaque = 0;
    let strongCount = 0;
    const add = (map, key, r, g, b) => {
        const cell = map.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        cell.n++; cell.r += r; cell.g += g; cell.b += b;
        map.set(key, cell);
    };
    for (let i = 0; i < rgba.length; i += 4) {
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        if (rgba[i + 3] < 200) continue;
        opaque++;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        add(all, key, r, g, b);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const light = (max + min) / 510;
        const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
        if (sat > 0.3 && light > 0.12 && light < 0.88) { add(strong, key, r, g, b); strongCount++; }
    }
    if (!opaque) return null;
    const ranked = (map) => [...map.values()].sort((a, b) => b.n - a.n).map(c => [c.r / c.n, c.g / c.n, c.b / c.n]);
    const pool = strongCount >= opaque * SATURATED_SHARE ? ranked(strong) : ranked(all);
    const first = pool[0];
    const other = (c) => distance(c, first) > MIN_DISTANCE && !shadeOf(c, first);
    const second = pool.find(other) ?? ranked(all).find(other);
    return [hex(first), second ? hex(second) : null];
};

const rgbOf = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lightness = ([r, g, b]) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

/**
 * A team's colours as a theme for the account window: the two colours for its
 * washes, and an accent for its buttons, tabs and chips - the more vivid of the
 * two, since a club's first colour is often a near-black; for a black-and-white
 * team, whose colours are both grey, the lighter one. `onAccent` is the text
 * colour that reads on it. A third colour, when given, is the accent outright.
 */
export const teamTheme = ([a, b, pinned]) => {
    const both = [a, b].filter(Boolean);
    const vivid = [...both].sort((x, y) => hueSat(rgbOf(y))[1] - hueSat(rgbOf(x))[1])[0];
    const accent = pinned ?? (hueSat(rgbOf(vivid))[1] >= 0.2 ? vivid : [...both].sort((x, y) => lightness(rgbOf(y)) - lightness(rgbOf(x)))[0]);
    const [r, g, bl] = rgbOf(accent).map(v => v / 255);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    return { a, b: b ?? a, accent, onAccent: luma > 0.55 ? '#18181b' : '#ffffff' };
};

/**
 * Kit colours for the clubs whose crests cannot be read: every Eredivisie crest
 * comes from a host that sends no CORS header, so the canvas is tainted. Keyed
 * by the team's name as the database spells it. Telstar and PEC Zwolle are left
 * out rather than guessed; they keep the app's emerald.
 *
 * Also the place to pin a club whose crest reads wrong: Livorno is amaranto
 * (#8E3145, the shade Wikipedia gives the club) with the crest's gold - and
 * amaranto the accent too, which the gold would otherwise take as more vivid.
 */
export const KIT_COLOURS = {
    Ajax: ['#d2122e', '#ffffff'],
    Alkmaar: ['#e30613', '#ffffff'],
    Breda: ['#ffd500', '#111111'],
    Excelsior: ['#e30613', '#111111'],
    'FC Volendam': ['#f37021', '#ffffff'],
    Feyenoord: ['#e30613', '#ffffff'],
    'G.A. Eagles': ['#ffd200', '#d6001c'],
    Groningen: ['#008c45', '#ffffff'],
    Heerenveen: ['#004b9b', '#ffffff'],
    Heracles: ['#111111', '#ffffff'],
    Livorno: ['#8e3145', '#f8c040', '#8e3145'],
    Nijmegen: ['#d6001c', '#00843d'],
    PSV: ['#ed1c24', '#ffffff'],
    Sittard: ['#ffd700', '#00843d'],
    'Sparta Rotterdam': ['#d2001e', '#ffffff'],
    Twente: ['#e2001a', '#ffffff'],
    Utrecht: ['#e30613', '#ffffff'],
};

// One read per crest per visit.
const cache = new Map();

/** The crest's colours, or null when it cannot be read (no CORS on its host, or no image). */
export const crestColours = (url) => {
    if (!url) return Promise.resolve(null);
    if (!cache.has(url)) {
        cache.set(url, new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 64;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0, 64, 64);
                    resolve(dominantColours(ctx.getImageData(0, 0, 64, 64).data));
                } catch {
                    resolve(null); // a crest served without CORS taints the canvas
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        }));
    }
    return cache.get(url);
};

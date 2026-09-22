// node src/utils/crestColours.check.mjs
import assert from 'node:assert/strict';
import { dominantColours, teamTheme } from './crestColours.js';

// A crest as runs of pixels: [[r, g, b, a], count].
const crest = (...runs) => Uint8ClampedArray.from(runs.flatMap(([px, n]) => Array.from({ length: n }, () => px).flat()));
const WHITE = [255, 255, 255, 255], BLACK = [10, 10, 10, 255], CLEAR = [0, 0, 0, 0];
const RED = [220, 30, 40, 255], BLUE = [20, 60, 200, 255];

// A white field with a red and blue badge: the colours win over the field.
assert.deepEqual(dominantColours(crest([WHITE, 600], [RED, 250], [BLUE, 150], [CLEAR, 400])), ['#dc1e28', '#143cc8']);
// Black and white only: the greys are the colours.
assert.deepEqual(dominantColours(crest([BLACK, 500], [WHITE, 300])), ['#0a0a0a', '#ffffff']);
// A sliver of colour (under 8%) does not beat the field.
assert.equal(dominantColours(crest([WHITE, 970], [RED, 30]))[0], '#ffffff');
// One colour, nothing else: no second.
assert.deepEqual(dominantColours(crest([RED, 400], [CLEAR, 100])), ['#dc1e28', null]);
// A shade of the first colour is its edge, not a second colour: yellow with a
// darker yellow rim and black text is yellow and black; red with a pink edge on white is red and white.
const YELLOW = [255, 242, 0, 255], DARK_YELLOW = [108, 103, 0, 255], PINK = [224, 99, 106, 255];
assert.deepEqual(dominantColours(crest([YELLOW, 500], [DARK_YELLOW, 200], [BLACK, 150])), ['#fff200', '#0a0a0a']);
assert.deepEqual(dominantColours(crest([RED, 400], [PINK, 200], [WHITE, 150])), ['#dc1e28', '#ffffff']);
// Nothing opaque.
assert.equal(dominantColours(crest([CLEAR, 100])), null);
// The accent: the vivid colour even when it comes second (Inter: black, blue),
// the lighter grey for a black-and-white side, and text that reads on it.
assert.equal(teamTheme(['#111111', '#001e9d']).accent, '#001e9d');
assert.deepEqual(teamTheme(['#000000', '#959595']), { a: '#000000', b: '#959595', accent: '#959595', onAccent: '#18181b' });
assert.equal(teamTheme(['#fff200', null]).onAccent, '#18181b'); // yellow: dark text
assert.equal(teamTheme(['#d2122e', '#ffffff']).onAccent, '#ffffff'); // red: white text
assert.equal(teamTheme(['#d2122e', null]).b, '#d2122e');
console.log('crestColours ok');

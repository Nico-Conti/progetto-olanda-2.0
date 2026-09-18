// A football pitch, 300 x 180 inside a 10-unit margin of a 320 x 200 viewBox:
// outline, halfway line, centre circle, both penalty and goal areas, both arcs.
// Each entry is drawn as its own path, so they can draw themselves in turn.
export const PITCH_LINES = [
    'M10 10H310V190H10Z',
    'M160 10V190',
    'M160 74A26 26 0 1 1 160 126A26 26 0 1 1 160 74',
    'M10 50H58V150H10',
    'M310 50H262V150H310',
    'M10 76H28V124H10',
    'M310 76H292V124H310',
    'M58 76.93A26 26 0 0 1 58 123.07',
    'M262 76.93A26 26 0 0 0 262 123.07',
];

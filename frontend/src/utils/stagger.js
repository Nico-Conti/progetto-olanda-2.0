/**
 * `animationDelay` for the i-th item of a list that cascades in.
 *
 * 40ms apart (transitions.dev --duration-stagger), and only the first 8 items
 * wait: the whole cascade stays under ~300ms, where 50-100ms per row made the
 * last of 20 table rows arrive a full second late.
 */
export const staggerDelay = (i) => `${Math.min(i, 8) * 40}ms`;

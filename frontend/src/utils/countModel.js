/**
 * Turning a predicted total into a distribution over totals.
 *
 * The shipped estimator returns a number - "25.3 fouls" - which is enough to
 * call over/under at one fixed line and useless against a real bookmaker. Books
 * post whichever line suits the match: foul lines of 20.5, 21.5, 22.5 and 24.5
 * were all observed on a single matchday, and only 46% of matches would be
 * priced at the 9.5 corner line the model is scored against.
 *
 * A distribution answers every line from one fit:
 *
 *     P(over L) = 1 - P(0) - P(1) - ... - P(floor(L))
 *
 * and it cannot contradict itself the way independently fitted per-line models
 * can, because every line reads off the same object.
 *
 * WHY NEGATIVE BINOMIAL, NOT POISSON
 * The Poisson is the natural distribution for counts, but it forces variance to
 * equal the mean. That is roughly true of goals and false of corners, fouls and
 * cards, which vary more between matches than a Poisson allows - so a Poisson
 * prices the tails overconfidently, and the tails are what decide a bet. The
 * negative binomial adds a dispersion r, with variance = mu + mu^2/r. Large r
 * approaches the Poisson; fitted values here run 32-128.
 *
 * WHY THIS IS SMALL
 * A feature-based negative binomial regression was tested (see
 * docs/prediction-model.md section 9) and measured no better than a logistic at
 * a single line - 0.6049 against 0.6053 on 21,097 held-out matches. The gain was
 * entirely structural. So this takes the mean from the estimator that is already
 * tuned and validated, and fits only the dispersion. Less machinery, same
 * benefit, and switching engines cannot move the central prediction.
 */

/** Log-gamma (Lanczos). Needed for the negative binomial's normalising term. */
const LANCZOS = [
    76.18009172947146, -86.50532032941678, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
];
export const lgamma = (x) => {
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    // Written as the double JS actually stores, not the textbook decimal.
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += LANCZOS[j] / ++y;
    return -tmp + Math.log(2.5066282746310007 * ser / x);
};

/** Dispersion at or above this is treated as Poisson - the difference is noise. */
export const POISSON_LIMIT = 512;

/** P(count = k) for mean `mu` and dispersion `r`. r >= POISSON_LIMIT is Poisson. */
export const countPmf = (mu, k, r) => {
    const m = Math.max(mu, 1e-9);
    if (!Number.isFinite(r) || r >= POISSON_LIMIT) {
        return Math.exp(-m + k * Math.log(m) - lgamma(k + 1));
    }
    return Math.exp(
        lgamma(k + r) - lgamma(r) - lgamma(k + 1)
        + r * Math.log(r / (r + m)) + k * Math.log(m / (r + m))
    );
};

/**
 * P(total > line).
 *
 * Sums the mass at or below the line rather than above it: the lower tail is
 * short and bounded, the upper one is not.
 */
export const probOver = (mu, line, r) => {
    if (!(mu > 0) || !Number.isFinite(line)) return null;
    let below = 0;
    for (let k = 0; k <= Math.floor(line); k++) below += countPmf(mu, k, r);
    return Math.min(Math.max(1 - below, 1e-6), 1 - 1e-6);
};

/** The distribution itself, for display. Truncated where the mass stops mattering. */
export const distribution = (mu, r, { minMass = 1e-4 } = {}) => {
    if (!(mu > 0)) return [];
    const out = [];
    const cap = Math.ceil(mu * 4) + 20;
    for (let k = 0; k <= cap; k++) {
        const p = countPmf(mu, k, r);
        if (p >= minMass || k <= mu) out.push({ count: k, p });
    }
    return out;
};

/** Candidate dispersions, geometric so the search is even in log space. */
const DISPERSION_GRID = [2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, POISSON_LIMIT];

/**
 * Fits the dispersion from (predicted mean, observed count) pairs.
 *
 * The mean comes from the existing estimator, so this is a one-parameter fit by
 * grid search on the likelihood - no gradients, no convergence failures, and
 * cheap enough to run in the browser. Returns POISSON_LIMIT when there is too
 * little history to say anything, which is the conservative choice: it assumes
 * no excess variance rather than inventing some.
 */
export const fitDispersion = (samples, { minSamples = 30 } = {}) => {
    const usable = (samples || []).filter(
        s => s && s.mu > 0 && Number.isFinite(s.actual) && s.actual >= 0
    );
    if (usable.length < minSamples) return POISSON_LIMIT;

    let best = POISSON_LIMIT;
    let bestLogLik = -Infinity;
    for (const r of DISPERSION_GRID) {
        let logLik = 0;
        for (const { mu, actual } of usable) {
            logLik += Math.log(Math.max(countPmf(mu, Math.round(actual), r), 1e-300));
        }
        if (Number.isFinite(logLik) && logLik > bestLogLik) {
            bestLogLik = logLik;
            best = r;
        }
    }
    return best;
};

/**
 * Every line a book might post for this statistic, priced from one distribution.
 * Handy for display; pricing a specific offer should call probOver directly.
 */
export const priceLadder = (mu, r, lines) =>
    (lines || []).map(line => ({ line, over: probOver(mu, line, r), under: 1 - probOver(mu, line, r) }));

/** Expected profit per unit staked at decimal odds `price`, given probability `p`. */
export const expectedValue = (p, price) =>
    (p == null || !(price > 1)) ? null : p * (price - 1) - (1 - p);

/**
 * Strips the overround from a two-way market, proportionally.
 *
 * A book quoting 1.85 both ways implies 54.1% each, summing to 108.1%. The extra
 * 8.1% is its margin; scaling both sides to sum to 1 recovers the market's
 * actual opinion, which is what a model probability should be compared against.
 */
export const devig = (overPrice, underPrice) => {
    if (!(overPrice > 1) || !(underPrice > 1)) return null;
    const a = 1 / overPrice;
    const b = 1 / underPrice;
    return { over: a / (a + b), under: b / (a + b), overround: a + b - 1 };
};

/**
 * Can the shipped goals model answer GG/NG?
 *
 * GG/NG (both teams to score) is captured in `odds_snapshots` and sits in
 * SLIP_ONLY_OPTIONS - priced, deliberately not modelled. The question is whether
 * it should be, and the tempting wrong answer is to read it off the total: it
 * cannot be done that way, because P(both score) is not a function of
 * expHome + expAway. 1-1 and 2-0 are both a total of 2 and opposite outcomes.
 * `countModel.probOver` is therefore the wrong object - its negative binomial is
 * fitted on the TOTAL, with one dispersion.
 *
 * What CAN work is the two marginals, which predictFromModel already returns
 * separately and already in target units with MEAN_BIAS applied:
 *
 *     P(GG) = (1 - P(home = 0)) * (1 - P(away = 0))
 *
 * That needs the two sides to be independent. Measured over 7,032 matches they
 * essentially are - corr(home goals, away goals) = -0.043, and actual BTTS
 * 55.63% against 55.49% from the empirical marginals, a gap of 0.14pp. This
 * script asks the harder question: does it still hold PER MATCH, once the
 * marginals come from the model rather than from the league average, and is the
 * result worth anything against the base rate and against the price.
 *
 *   node bttsComparison.mjs                       # our own dump
 *   DATA_FILE=./data_fd.json node bttsComparison.mjs
 *
 * Walk-forward and pooled, which is the canonical shipped configuration (see
 * CLAUDE.md, "every view must build its model the same way"): one goals model
 * over every league, each match predicted from only what came before it, with
 * `aggregatorOverride: null`.
 *
 * On folds: true leave-one-league-season-out does not fit a chronological
 * probability model - the shipped app predicts an upcoming fixture from
 * everything already played, across leagues. The analogue, and what the
 * per-league-season table below reports, is scoring each league-season's rows
 * while the pooled model saw only earlier matches. A league-season that
 * disagrees with the pooled headline is the finding worth having.
 */
import fs from 'fs';
import {
    createPredictionModel, addMatchToPredictionModel, predictFromModel,
    ENGINES, MIN_EFFECTIVE_FOR_EV,
} from '../predictTotal.js';
import { countPmf, fitDispersion, POISSON_LIMIT } from '../countModel.js';

const DATA = new URL(process.env.DATA_FILE ?? './data.json', import.meta.url);
const ODDS = new URL('./odds_closing.json', import.meta.url);
if (!fs.existsSync(DATA)) {
    console.error(`${DATA.pathname} not found - run dumpSeason.py first.`);
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA));

const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const goalsOf = (m) => {
    const g = m.stats?.goals;
    if (!g || g.home == null || g.away == null) return null;
    return { home: Number(g.home), away: Number(g.away) };
};

/**
 * Every (probability, outcome) pair the shipped goals model would have produced.
 *
 * Two probability variants, because the marginal's shape is a real choice and
 * the wrong one is a ONE-SIDED error - exactly what CLAUDE.md calls
 * manufacturing EV:
 *
 *   poisson  P(0) = exp(-lambda). Independent Poisson from the league means
 *            overstates BTTS by 0.70pp on our data: Poisson puts too little
 *            mass on nil.
 *   negbin   P(0) from countPmf with a dispersion fitted PER SIDE, walk-forward,
 *            from (predicted lambda, observed goals) pairs. Excess variance
 *            moves mass onto zero, so this should correct the sign of that gap.
 *            Falls back to Poisson until there are enough pairs to fit, which
 *            fitDispersion already does by returning POISSON_LIMIT.
 *
 * The dispersion is refitted as history accumulates rather than once at the end,
 * or the early rows would be scored with a parameter fitted on their own
 * outcomes.
 */
function collect() {
    const matches = data
        .filter(m => goalsOf(m) && m.date && m.squadre?.home && m.squadre?.away)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const model = createPredictionModel('goals', { trackResiduals: true });
    const homeSamples = [];
    const awaySamples = [];
    let rHome = POISSON_LIMIT;
    let rAway = POISSON_LIMIT;
    const rows = [];

    for (const m of matches) {
        const p = predictFromModel(model, m.squadre.home, m.squadre.away, {
            asOf: m.date, engine: ENGINES.CLASSIC, aggregatorOverride: null,
        });
        const actual = goalsOf(m);
        if (p && p.expHome > 0 && p.expAway > 0) {
            const lh = p.expHome;
            const la = p.expAway;
            rows.push({
                league: m.league,
                season: m.season,
                date: m.date,
                home: m.squadre.home,
                away: m.squadre.away,
                gg: actual.home > 0 && actual.away > 0,
                effective: p.effectiveMatches ?? 0,
                poisson: (1 - Math.exp(-lh)) * (1 - Math.exp(-la)),
                negbin: (1 - countPmf(lh, 0, rHome)) * (1 - countPmf(la, 0, rAway)),
                fitted: rHome < POISSON_LIMIT && rAway < POISSON_LIMIT,
                lambdaTotal: lh + la,
            });
            homeSamples.push({ mu: lh, actual: actual.home });
            awaySamples.push({ mu: la, actual: actual.away });
            // Refit occasionally rather than every match: the grid search is
            // O(grid x samples) and the answer does not move match to match.
            if (homeSamples.length % 250 === 0) {
                rHome = fitDispersion(homeSamples);
                rAway = fitDispersion(awaySamples);
            }
        }
        addMatchToPredictionModel(model, m);
    }
    return { rows, rHome, rAway };
}

/**
 * log loss, Brier and ECE for one probability column, against a LEAVE-ONE-OUT
 * base rate.
 *
 * Leave-one-out is not fussiness here. The base rate is built from the very rows
 * it then scores, so in-sample it is told the outcome it is about to be graded
 * on. It barely moves over thousands of rows and it decides the answer in the
 * thin per-league-season splits below - which is where it would get quoted.
 */
function score(rows, key) {
    if (rows.length < 2) return null;
    const hits = rows.filter(r => r.gg).length;
    let ll = 0, brier = 0, baseLL = 0, baseBrier = 0, right = 0;
    for (const r of rows) {
        const p = clamp(r[key]);
        ll += r.gg ? -Math.log(p) : -Math.log(1 - p);
        brier += (r[key] - (r.gg ? 1 : 0)) ** 2;
        const b = clamp((hits - (r.gg ? 1 : 0)) / (rows.length - 1));
        baseLL += r.gg ? -Math.log(b) : -Math.log(1 - b);
        baseBrier += (b - (r.gg ? 1 : 0)) ** 2;
        if ((p >= 0.5) === r.gg) right++;
    }
    const n = rows.length;
    // ECE over ten equal-width probability bins.
    const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
    for (const r of rows) {
        const b = bins[Math.min(9, Math.floor(clamp(r[key]) * 10))];
        b.n++; b.p += r[key]; b.y += r.gg ? 1 : 0;
    }
    const ece = bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
    return {
        n,
        rate: hits / n,
        mean: rows.reduce((s, r) => s + r[key], 0) / n,
        ll: ll / n,
        baseLL: baseLL / n,
        gain: (baseLL - ll) / baseLL,
        brier: brier / n,
        baseBrier: baseBrier / n,
        brierGain: (baseBrier - brier) / baseBrier,
        ece,
        acc: right / n,
    };
}

const line = (label, s) => s && console.log(
    `  ${label.padEnd(26)} n=${String(s.n).padStart(5)}  logloss ${s.ll.toFixed(5)} `
    + `vs base ${s.baseLL.toFixed(5)}  gain ${(s.gain * 100 >= 0 ? '+' : '')}${(s.gain * 100).toFixed(2)}%`
    + `  Brier ${(s.brierGain * 100 >= 0 ? '+' : '')}${(s.brierGain * 100).toFixed(2)}%`
    + `  ECE ${pct(s.ece, 1)}`
);

// ---------------------------------------------------------------- the market

/** Two-sided gg_ng closes joined to results, de-vigged. */
function marketRows(rows) {
    if (!fs.existsSync(ODDS)) return [];
    const odds = JSON.parse(fs.readFileSync(ODDS));
    const byFixture = new Map();
    for (const r of rows) byFixture.set(`${r.league}|${r.home}|${r.away}|${r.date.slice(0, 10)}`, r);

    const prices = new Map();
    for (const q of odds) {
        if (q.market !== 'gg_ng') continue;
        const k = `${q.league}|${q.home}|${q.away}|${q.date.slice(0, 10)}`;
        (prices.get(k) ?? prices.set(k, {}).get(k))[q.selection] = q.price;
    }
    const out = [];
    for (const [k, v] of prices) {
        const row = byFixture.get(k);
        // BOTH sides or nothing: a one-sided ladder cannot be de-vigged, and
        // reading an aggregate over one-sided quotes is what made shots and
        // shots-on-target look like free money (docs, odds-and-settlement).
        if (!row || v.gg == null || v.ng == null) continue;
        const vig = 1 / v.gg + 1 / v.ng;
        out.push({ ...row, priceGG: v.gg, priceNG: v.ng, market: (1 / v.gg) / vig, overround: vig });
    }
    return out;
}

/** Flat ROI of backing one side, bootstrapped BY FIXTURE. */
function roi(rows, pick, stake = () => true) {
    const bets = rows.filter(stake);
    if (!bets.length) return null;
    const pnl = bets.map(r => {
        const side = pick(r);
        if (!side) return null;
        const win = side === 'gg' ? r.gg : !r.gg;
        return (win ? (side === 'gg' ? r.priceGG : r.priceNG) : 0) - 1;
    }).filter(x => x != null);
    if (!pnl.length) return null;
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const draws = [];
    for (let i = 0; i < 4000; i++) {
        let s = 0;
        for (let j = 0; j < pnl.length; j++) s += pnl[(Math.random() * pnl.length) | 0];
        draws.push(s / pnl.length);
    }
    draws.sort((a, b) => a - b);
    return { n: pnl.length, roi: mean(pnl), lo: draws[100], hi: draws[3900] };
}

// ------------------------------------------------------------------- report

const { rows, rHome, rAway } = collect();
console.log(`GG/NG from the shipped goals model - ${rows.length} walk-forward predictions\n`);
console.log(`fitted dispersion: home r=${rHome}  away r=${rAway}`
    + `  (${POISSON_LIMIT} = Poisson, i.e. no excess variance found)`);
console.log(`actual GG rate: ${pct(rows.filter(r => r.gg).length / rows.length, 2)}\n`);

console.log('POOLED, walk-forward');
for (const key of ['poisson', 'negbin']) {
    const s = score(rows, key);
    line(key, s);
    console.log(`  ${''.padEnd(26)} mean p ${s.mean.toFixed(4)} vs actual ${s.rate.toFixed(4)}`
        + `  (${((s.mean - s.rate) * 100 >= 0 ? '+' : '')}${((s.mean - s.rate) * 100).toFixed(2)}pp)`
        + `   call accuracy ${pct(s.acc)}`);
}

// The EV path refuses a fixture under the confidence floor, so the number that
// would actually reach a user is this one, not the pooled headline above.
const confident = rows.filter(r => r.effective >= MIN_EFFECTIVE_FOR_EV);
console.log(`\nABOVE THE CONFIDENCE FLOOR (effective >= ${MIN_EFFECTIVE_FOR_EV})`);
for (const key of ['poisson', 'negbin']) line(key, score(confident, key));

console.log('\nCALIBRATION BY DECILE (negbin)');
const sorted = [...rows].sort((a, b) => a.negbin - b.negbin);
const q = Math.floor(sorted.length / 10);
for (let i = 0; i < 10; i++) {
    const chunk = i < 9 ? sorted.slice(i * q, (i + 1) * q) : sorted.slice(9 * q);
    const p = chunk.reduce((s, r) => s + r.negbin, 0) / chunk.length;
    const a = chunk.filter(r => r.gg).length / chunk.length;
    console.log(`  p≈${p.toFixed(3)}  actual ${a.toFixed(3)}  ${(a - p) * 100 >= 0 ? '+' : ''}`
        + `${((a - p) * 100).toFixed(1)}pp  n=${chunk.length}`);
}

console.log('\nPER LEAGUE-SEASON (pooled model, scored on each slice; >=100 rows)');
const groups = new Map();
for (const r of rows) {
    const k = `${r.league} ${r.season}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
}
const slices = [...groups].filter(([, v]) => v.length >= 100)
    .map(([k, v]) => [k, score(v, 'negbin')])
    .sort((a, b) => b[1].gain - a[1].gain);
for (const [k, s] of slices) {
    console.log(`  ${k.padEnd(28)} n=${String(s.n).padStart(4)}  gain ${(s.gain * 100 >= 0 ? '+' : '')}`
        + `${(s.gain * 100).toFixed(2)}%   rate ${pct(s.rate)}`);
}
const beaten = slices.filter(([, s]) => s.gain > 0).length;
console.log(`  --> beats its own base rate in ${beaten}/${slices.length} league-seasons`);

const mkt = marketRows(rows);
console.log(`\nAGAINST THE PRICE - ${mkt.length} fixtures with a two-sided gg_ng close`);
if (mkt.length < 30) {
    console.log('  too few to read. A GG/NG price is one quote per fixture, so the');
    console.log('  effective sample IS the fixture count - no correlated-lines discount,');
    console.log('  but no help from a ladder either.');
} else {
    const overround = [...mkt].map(r => r.overround).sort((a, b) => a - b)[mkt.length >> 1];
    const ggRate = mkt.filter(r => r.gg).length / mkt.length;
    const bookMean = mkt.reduce((s, r) => s + r.market, 0) / mkt.length;
    console.log(`  median overround ${overround.toFixed(4)}`);
    console.log(`  book mean P(GG) ${bookMean.toFixed(4)}  vs actual ${ggRate.toFixed(4)}`
        + `  (${((ggRate - bookMean) * 100 >= 0 ? '+' : '')}${((ggRate - bookMean) * 100).toFixed(2)}pp)`);
    for (const key of ['negbin', 'market']) line(key, score(mkt, key));
    const flat = roi(mkt, () => 'gg');
    console.log(`  flat-bet every GG        ROI ${pct(flat.roi)}  95% CI [${pct(flat.lo)}, ${pct(flat.hi)}]`);

    // THE VALIDITY CHECK. Backing both sides of a two-sided market must lose
    // roughly the overround - that is arithmetic, not a forecast. When it does
    // not, the sample is not representative (or the join is wrong), and every
    // ROI below it is measuring that instead of measuring the model. This is
    // the lesson from shots and shots-on-target: an impossible-looking return
    // was read as evidence about our counting for weeks, and it was an artefact.
    const both = roi([...mkt, ...mkt.map(r => ({ ...r, side: 'ng' }))], r => (r.side ? 'ng' : 'gg'));
    const expected = -(overround - 1);
    const drift = both.roi - expected;
    console.log(`  flat-bet BOTH sides      ROI ${pct(both.roi)}   (must be about ${pct(expected)})`);

    const unreadable = Math.abs(drift) > 0.015;
    if (unreadable) {
        console.log(`\n  !! VALIDITY CHECK FAILED: both sides drift ${(drift * 100 >= 0 ? '+' : '')}${(drift * 100).toFixed(1)}pp`);
        console.log('  !! from the overround. On this sample the outcome ran hot against the');
        console.log('  !! posted prices, so the EV table below is scoring THAT, not the model.');
        console.log('  !! Treat every number in it as unreadable until the sample grows.');
    }
    console.log('');
    for (const edge of [0, 0.02, 0.05]) {
        const r = roi(mkt, (x) => {
            const evGG = x.negbin * x.priceGG - 1;
            const evNG = (1 - x.negbin) * x.priceNG - 1;
            if (Math.max(evGG, evNG) < edge) return null;
            return evGG >= evNG ? 'gg' : 'ng';
        });
        const mark = unreadable ? '  [unreadable]' : '';
        console.log(r
            ? `  EV >= ${(edge * 100).toFixed(0).padStart(2)}%               n=${String(r.n).padStart(4)}  ROI ${pct(r.roi)}  95% CI [${pct(r.lo)}, ${pct(r.hi)}]${mark}`
            : `  EV >= ${(edge * 100).toFixed(0).padStart(2)}%               no bets`);
    }
}

console.log('\nRead this the way the notes ask: a log-loss gain is a better');
console.log('PROBABILITY, not an edge. Corners is correctly joined, properly');
console.log('modelled, and still returns -13.5% at EV >= 0.');

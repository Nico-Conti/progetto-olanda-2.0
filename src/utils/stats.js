export const processData = (matches) => {
  const teamStats = {};

  matches.forEach(match => {
    const homeTeam = match.squadre.home;
    const awayTeam = match.squadre.away;

    // Helper to parse int safely
    const p = (val) => parseInt(val || 0, 10);

    const stats = {
      corners: { h: p(match.calci_d_angolo.home), a: p(match.calci_d_angolo.away) },
      goals: { h: p(match.goals?.home), a: p(match.goals?.away) },
      shots: { h: p(match.shots?.home), a: p(match.shots?.away) },
      shots_ot: { h: p(match.shots_ot?.home), a: p(match.shots_ot?.away) },
      possession: { h: p(match.possession?.home), a: p(match.possession?.away) },
      yellow_cards: { h: p(match.yellow_cards?.home), a: p(match.yellow_cards?.away) },
      red_cards: { h: p(match.red_cards?.home), a: p(match.red_cards?.away) },
      fouls: { h: p(match.fouls?.home), a: p(match.fouls?.away) }
    };

    const giornata = match.giornata;

    const initTeam = () => ({
      home_corners_for: [], home_corners_ag: [], home_corners_total: [],
      away_corners_for: [], away_corners_ag: [], away_corners_total: [],

      home_goals_for: [], home_goals_ag: [],
      away_goals_for: [], away_goals_ag: [],

      home_shots_for: [], home_shots_ag: [],
      away_shots_for: [], away_shots_ag: [],

      home_shots_ot_for: [], home_shots_ot_ag: [],
      away_shots_ot_for: [], away_shots_ot_ag: [],

      home_possession_for: [], home_possession_ag: [],
      away_possession_for: [], away_possession_ag: [],

      home_cards_for: [], home_cards_ag: [], // Yellow + Red
      away_cards_for: [], away_cards_ag: [],

      all_matches: []
    });

    if (!teamStats[homeTeam]) teamStats[homeTeam] = initTeam();
    if (!teamStats[awayTeam]) teamStats[awayTeam] = initTeam();

    // Home Team Stats
    const ht = teamStats[homeTeam];
    ht.home_corners_for.push(stats.corners.h);
    ht.home_corners_ag.push(stats.corners.a);
    ht.home_corners_total.push(stats.corners.h + stats.corners.a);

    ht.home_goals_for.push(stats.goals.h);
    ht.home_goals_ag.push(stats.goals.a);

    ht.home_shots_for.push(stats.shots.h);
    ht.home_shots_ag.push(stats.shots.a);

    ht.home_shots_ot_for.push(stats.shots_ot.h);
    ht.home_shots_ot_ag.push(stats.shots_ot.a);

    ht.home_possession_for.push(stats.possession.h);
    ht.home_possession_ag.push(stats.possession.a);

    ht.home_cards_for.push(stats.yellow_cards.h + stats.red_cards.h);
    ht.home_cards_ag.push(stats.yellow_cards.a + stats.red_cards.a);

    ht.all_matches.push({
      opponent: awayTeam,
      location: 'Home',
      cornersFor: stats.corners.h,
      cornersAg: stats.corners.a,
      goalsFor: stats.goals.h,
      goalsAg: stats.goals.a,
      total: stats.corners.h + stats.corners.a,
      giornata
    });

    // Away Team Stats
    const at = teamStats[awayTeam];
    at.away_corners_for.push(stats.corners.a);
    at.away_corners_ag.push(stats.corners.h);
    at.away_corners_total.push(stats.corners.h + stats.corners.a);

    at.away_goals_for.push(stats.goals.a);
    at.away_goals_ag.push(stats.goals.h);

    at.away_shots_for.push(stats.shots.a);
    at.away_shots_ag.push(stats.shots.h);

    at.away_shots_ot_for.push(stats.shots_ot.a);
    at.away_shots_ot_ag.push(stats.shots_ot.h);

    at.away_possession_for.push(stats.possession.a);
    at.away_possession_ag.push(stats.possession.h);

    at.away_cards_for.push(stats.yellow_cards.a + stats.red_cards.a);
    at.away_cards_ag.push(stats.yellow_cards.h + stats.red_cards.h);

    at.all_matches.push({
      opponent: homeTeam,
      location: 'Away',
      cornersFor: stats.corners.a,
      cornersAg: stats.corners.h,
      goalsFor: stats.goals.a,
      goalsAg: stats.goals.h,
      total: stats.corners.h + stats.corners.a,
      giornata
    });
  });

  return teamStats;
};

export const getAvg = (list) => list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;

export const getTrendData = (list, nGames) => {
  if (!list || list.length === 0) return { season: 0, recent: 0, diff: 0 };

  const seasonAvg = getAvg(list);
  const recentSlice = nGames === 'all' ? list : list.slice(0, nGames);
  const recentAvg = getAvg(recentSlice);

  return {
    season: seasonAvg,
    recent: recentAvg,
    diff: recentAvg - seasonAvg
  };
};

// --- POISSON & ADVANCED STATS ---

const factorial = (n) => {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
};

export const poissonProbability = (k, lambda) => {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
};

// Simple Box-Muller transform for normal distribution (approximation for Poisson large lambda)
// But for Poisson we can use Knuth's algorithm or just inverse transform sampling for small lambda
// For JS, simple inverse transform is fine for small lambda, or just use a library.
// Since we don't have a library, we'll use a simple approximation or just stick to Poisson formula for exact probs.
// Actually, Monte Carlo is requested. Let's do a simple simulation.

const simulatePoisson = (lambda) => {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
};

export const monteCarloSimulation = (lambdaHome, lambdaAway, iterations = 5000) => {
  let over95 = 0;
  let over105 = 0;
  let totalCorners = 0;

  for (let i = 0; i < iterations; i++) {
    const h = simulatePoisson(lambdaHome);
    const a = simulatePoisson(lambdaAway);
    const t = h + a;

    totalCorners += t;
    if (t > 9.5) over95++;
    if (t > 10.5) over105++;
  }

  return {
    probOver95: over95 / iterations,
    probOver105: over105 / iterations,
    avgTotal: totalCorners / iterations
  };
};

export const predictMatchOutcome = (homeTeam, awayTeam, stats, nGames = 'all') => {
  if (!stats[homeTeam] || !stats[awayTeam]) return null;

  const hStats = stats[homeTeam];
  const aStats = stats[awayTeam];

  // Helper to get average based on nGames
  const getStatsAvg = (list) => {
    if (!list || list.length === 0) return 0;
    if (nGames === 'all') return getAvg(list);
    return getAvg(list.slice(-nGames));
  };

  const hFor = getStatsAvg(hStats.home_corners_for);
  const hAg = getStatsAvg(hStats.home_corners_ag);
  const aFor = getStatsAvg(aStats.away_corners_for);
  const aAg = getStatsAvg(aStats.away_corners_ag);

  const lambdaHome = (hFor + aAg) / 2;
  const lambdaAway = (aFor + hAg) / 2;
  const lambdaTotal = lambdaHome + lambdaAway;

  // Generate Probability Distribution (0 to 15+ corners)
  const distribution = [];
  let cumulativeProb = 0;

  for (let k = 0; k <= 20; k++) {
    const prob = poissonProbability(k, lambdaTotal);
    cumulativeProb += prob;
    distribution.push({ count: k, probability: prob, cumulative: cumulativeProb });
  }

  // Calculate specific "Over" probabilities (Poisson)
  const probOver85 = 1 - distribution.find(d => d.count === 8).cumulative;
  const probOver95 = 1 - distribution.find(d => d.count === 9).cumulative;
  const probOver105 = 1 - distribution.find(d => d.count === 10).cumulative;

  // Monte Carlo Simulation
  const mc = monteCarloSimulation(lambdaHome, lambdaAway);

  return {
    lambdaHome,
    lambdaAway,
    lambdaTotal,
    distribution,
    probOver85,
    probOver95,
    probOver105,
    hFor, hAg, aFor, aAg, // Return raw avgs for display
    monteCarlo: mc // Add Monte Carlo results
  };
};

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

export const processData = (matches, statistic = 'corners') => {
    const teamStats = {};

    // Sort matches by giornata descending (newest first) to ensure "Last N" works correctly
    const sortedMatches = [...matches].sort((a, b) => b.giornata - a.giornata);

    sortedMatches.forEach(match => {
        const homeTeam = match.squadre.home;
        const awayTeam = match.squadre.away;
        const statObj = match.stats?.[statistic] || { home: 0, away: 0 };
        const cHome = Number(statObj.home);
        const cAway = Number(statObj.away);
        const total = cHome + cAway;
        const giornata = match.giornata;

        if (!teamStats[homeTeam]) {
            teamStats[homeTeam] = { home_for: [], home_ag: [], home_totals: [], away_for: [], away_ag: [], away_totals: [], all_matches: [] };
        }
        if (!teamStats[awayTeam]) {
            teamStats[awayTeam] = { home_for: [], home_ag: [], home_totals: [], away_for: [], away_ag: [], away_totals: [], all_matches: [] };
        }

        // Home Team Stats
        teamStats[homeTeam].home_for.push(cHome);
        teamStats[homeTeam].home_ag.push(cAway);
        teamStats[homeTeam].home_totals.push(total);
        teamStats[homeTeam].all_matches.push({ team: homeTeam, opponent: awayTeam, location: 'Home', statFor: cHome, statAg: cAway, total, giornata, tldr: match.tldr, detailed_summary: match.detailed_summary });

        // Away Team Stats
        teamStats[awayTeam].away_for.push(cAway);
        teamStats[awayTeam].away_ag.push(cHome);
        teamStats[awayTeam].away_totals.push(total);
        teamStats[awayTeam].all_matches.push({ team: awayTeam, opponent: homeTeam, location: 'Away', statFor: cAway, statAg: cHome, total, giornata, tldr: match.tldr, detailed_summary: match.detailed_summary });
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

export const calculatePrediction = (home, away, stats, nGames = 5) => {
    if (!stats[home] || !stats[away]) return null;

    const getRelevant = (team, loc) => {
        let matches = stats[team].all_matches.filter(m => m.location === loc);
        matches.sort((a, b) => b.giornata - a.giornata);

        // Handle sample size: 'all', number, or default to 5 if invalid/empty
        const limit = nGames === 'all' ? null : (Number(nGames) || 5);
        if (limit) matches = matches.slice(0, limit);

        return matches;
    };

    const homeMatches = getRelevant(home, 'Home');
    const awayMatches = getRelevant(away, 'Away');

    const hFor = getAvg(homeMatches.map(m => m.statFor));
    const hAg = getAvg(homeMatches.map(m => m.statAg));
    const aFor = getAvg(awayMatches.map(m => m.statFor));
    const aAg = getAvg(awayMatches.map(m => m.statAg));

    const expHome = (hFor + aAg) / 2;
    const expAway = (aFor + hAg) / 2;
    const total = expHome + expAway;

    return { expHome, expAway, total, hFor, hAg, aFor, aAg, homeMatches, awayMatches };
};

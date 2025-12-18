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
        teamStats[homeTeam].all_matches.push({ team: homeTeam, opponent: awayTeam, location: 'Home', statFor: cHome, statAg: cAway, total, giornata, tldr: match.tldr, detailed_summary: match.detailed_summary, date: match.date });

        // Away Team Stats
        teamStats[awayTeam].away_for.push(cAway);
        teamStats[awayTeam].away_ag.push(cHome);
        teamStats[awayTeam].away_totals.push(total);
        teamStats[awayTeam].all_matches.push({ team: awayTeam, opponent: homeTeam, location: 'Away', statFor: cAway, statAg: cHome, total, giornata, tldr: match.tldr, detailed_summary: match.detailed_summary, date: match.date });
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

export const getStdDev = (list) => {
    if (!list || list.length === 0) return 0;
    const mean = getAvg(list);
    const squareDiffs = list.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    const avgSquareDiff = getAvg(squareDiffs);
    return Math.sqrt(avgSquareDiff);
};

export const calculateLeagueAverages = (stats) => {
    let totalHomeGoals = 0;
    let totalAwayGoals = 0;
    let totalHomeConceded = 0;
    let totalAwayConceded = 0;
    let totalHomeGames = 0;
    let totalAwayGames = 0;

    Object.values(stats).forEach(team => {
        if (team.home_for) {
            totalHomeGoals += team.home_for.reduce((a, b) => a + b, 0);
            totalHomeGames += team.home_for.length;
        }
        if (team.home_ag) {
            totalHomeConceded += team.home_ag.reduce((a, b) => a + b, 0);
        }
        if (team.away_for) {
            totalAwayGoals += team.away_for.reduce((a, b) => a + b, 0);
            totalAwayGames += team.away_for.length;
        }
        if (team.away_ag) {
            totalAwayConceded += team.away_ag.reduce((a, b) => a + b, 0);
        }
    });

    return {
        avgHomeGoals: totalHomeGames > 0 ? totalHomeGoals / totalHomeGames : 0,
        avgAwayGoals: totalAwayGames > 0 ? totalAwayGoals / totalAwayGames : 0,
        avgHomeConceded: totalHomeGames > 0 ? totalHomeConceded / totalHomeGames : 0,
        avgAwayConceded: totalAwayGames > 0 ? totalAwayConceded / totalAwayGames : 0
    };
};

export const getOpponentAdjustedStats = (matches, stats, context, leagueAvgs) => {
    if (!matches || matches.length === 0) return [];

    return matches.map(m => {
        const opponent = m.opponent;
        const opponentStats = stats[opponent];
        if (!opponentStats) return context.includes('For') ? m.statFor : m.statAg; // Fallback if no opponent stats

        let numerator, denominator, value;

        if (context === 'HomeOffense') {
            // We scored m.statFor. Opponent was Away. 
            // Comparison: Opponent Away Conceded vs League Away Conceded
            value = m.statFor;
            numerator = leagueAvgs.avgAwayConceded;
            denominator = getAvg(opponentStats.away_ag);
        } else if (context === 'HomeDefense') {
            // We conceded m.statAg. Opponent was Away.
            // Comparison: Opponent Away Scored vs League Away Scored
            value = m.statAg;
            numerator = leagueAvgs.avgAwayGoals;
            denominator = getAvg(opponentStats.away_for);
        } else if (context === 'AwayOffense') {
            // We scored m.statFor. Opponent was Home.
            // Comparison: Opponent Home Conceded vs League Home Conceded
            value = m.statFor;
            numerator = leagueAvgs.avgHomeConceded;
            denominator = getAvg(opponentStats.home_ag);
        } else if (context === 'AwayDefense') {
            // We conceded m.statAg. Opponent was Home.
            // Comparison: Opponent Home Scored vs League Home Scored
            value = m.statAg;
            numerator = leagueAvgs.avgHomeGoals;
            denominator = getAvg(opponentStats.home_for);
        }

        if (!denominator || denominator === 0) return value; // Avoid division by zero

        return value * (numerator / denominator);
    });
};

export const calculatePrediction = (home, away, stats, nGames = 5, useAdjustedMode = false) => {
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

    let hForList, hAgList, aForList, aAgList;
    let hFor, hAg, aFor, aAg;
    let hForStd, hAgStd, aForStd, aAgStd;

    if (useAdjustedMode) {
        const leagueAvgs = calculateLeagueAverages(stats);

        // 1. Get Adjusted Lists (Normalized Ratings)
        hForList = getOpponentAdjustedStats(homeMatches, stats, 'HomeOffense', leagueAvgs);
        hAgList = getOpponentAdjustedStats(homeMatches, stats, 'HomeDefense', leagueAvgs);
        aForList = getOpponentAdjustedStats(awayMatches, stats, 'AwayOffense', leagueAvgs);
        aAgList = getOpponentAdjustedStats(awayMatches, stats, 'AwayDefense', leagueAvgs);

        // 2. Calculate Averages of Ratings
        hFor = getAvg(hForList);
        hAg = getAvg(hAgList);
        aFor = getAvg(aForList);
        aAg = getAvg(aAgList);

        // 3. Std Dev of Ratings
        hForStd = getStdDev(hForList);
        hAgStd = getStdDev(hAgList);
        aForStd = getStdDev(aForList);
        aAgStd = getStdDev(aAgList);

    } else {
        // Standard Mode (Raw Stats)
        hForList = homeMatches.map(m => m.statFor);
        hAgList = homeMatches.map(m => m.statAg);
        aForList = awayMatches.map(m => m.statFor);
        aAgList = awayMatches.map(m => m.statAg);

        hFor = getAvg(hForList);
        hAg = getAvg(hAgList);
        aFor = getAvg(aForList);
        aAg = getAvg(aAgList);

        hForStd = getStdDev(hForList);
        hAgStd = getStdDev(hAgList);
        aForStd = getStdDev(aForList);
        aAgStd = getStdDev(aAgList);
    }

    // Calculate prediction totals
    // We derive the totals from the (potentially adjusted) lists to ensure consistency
    const hTotalList = hForList.map((val, i) => val + hAgList[i]);
    const aTotalList = aForList.map((val, i) => val + aAgList[i]);

    // Calculate standard deviation for the total prediction
    // We use the combined list of totals from both contexts to represent the overall variability
    const totalStd = getStdDev([...hTotalList, ...aTotalList]);

    let expHome = (hFor + aAg) / 2;
    let expAway = (aFor + hAg) / 2;

    if (useAdjustedMode) {
        // 4. Apply Upcoming Opponent Multipliers (Project)
        // Home Exp depends on Upcoming Away Team's Defense (Away Conceded)
        const leagueAvgs = calculateLeagueAverages(stats);

        // Upcoming Away Team Conceded Avg (when away)
        const upcomingAwayConceded = getAvg(stats[away].away_ag);
        if (leagueAvgs.avgAwayConceded > 0) {
            const multiplier = upcomingAwayConceded / leagueAvgs.avgAwayConceded;
            expHome = expHome * multiplier;
        }

        // Upcoming Home Team Conceded Avg (when home)
        const upcomingHomeConceded = getAvg(stats[home].home_ag);
        if (leagueAvgs.avgHomeConceded > 0) {
            const multiplier = upcomingHomeConceded / leagueAvgs.avgHomeConceded;
            expAway = expAway * multiplier;
        }
    }

    const total = expHome + expAway;

    // Calculate standard deviation for the expectations
    // Std(ExpHome) = 0.5 * sqrt(Std(hFor)^2 + Std(aAg)^2)
    const expHomeStd = 0.5 * Math.sqrt(Math.pow(hForStd, 2) + Math.pow(aAgStd, 2));
    const expAwayStd = 0.5 * Math.sqrt(Math.pow(aForStd, 2) + Math.pow(hAgStd, 2));

    return {
        expHome,
        expAway,
        total,
        hFor,
        hAg,
        aFor,
        aAg,
        hForStd,
        aForStd,
        expHomeStd,
        expAwayStd,
        totalStd,
        homeMatches,
        awayMatches
    };
};

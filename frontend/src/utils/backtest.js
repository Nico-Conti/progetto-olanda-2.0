
import { processData, calculatePrediction } from './stats';

// Parameters to test
const N_GAMES_OPTIONS = [3, 5, 10, 'all'];
const FORCE_MEAN_OPTIONS = [false, true];
const USE_GENERAL_STATS_OPTIONS = [false, true];

/**
 * Evaluates a single strategy on a set of historical matches.
 * @param {Array} matches - Sorted historical matches for a specific league.
 * @param {String} statistic - The statistic to predict (e.g., 'corners').
 * @param {Object} modelParams - { nGames, forceMean, useGeneralStats }
 * @param {Object} bettingParams - { softBuffer, minPrediction, maxLineCap }
 * @returns {Object} { winRate, totalBets, wins }
 */
export const evaluateStrategy = (matches, statistic, modelParams, bettingParams = {}) => {
    let wins = 0;
    let totalBets = 0;
    const { softBuffer = 0, minPrediction = 0, maxLineCap = null } = bettingParams;

    // We need at least some history to predict. 
    for (let i = 0; i < matches.length; i++) {
        const targetMatch = matches[i];

        // Skip if target match doesn't have the stat (can't verify win/loss)
        if (!targetMatch.stats || !targetMatch.stats[statistic]) continue;

        const actualHome = Number(targetMatch.stats[statistic].home);
        const actualAway = Number(targetMatch.stats[statistic].away);
        const actualTotal = actualHome + actualAway;

        // Get history strictly BEFORE this match
        const pastMatches = matches.slice(0, i);

        const stats = processData(pastMatches, statistic);

        const homeTeam = targetMatch.home || targetMatch.squadre?.home;
        const awayTeam = targetMatch.away || targetMatch.squadre?.away;

        const prediction = calculatePrediction(
            homeTeam,
            awayTeam,
            stats,
            modelParams.nGames,
            false, // useAdjustedMode (default false in HotMatches)
            modelParams.useGeneralStats,
            statistic,
            modelParams.forceMean ? 'mean' : null // aggregator override
        );

        if (prediction && prediction.total > 0) {
            // Check Min Prediction
            if (minPrediction > 0 && prediction.total < minPrediction) continue;

            // Apply Soft Buffer
            let adjustedTotal = prediction.total;
            if (softBuffer > 0) {
                adjustedTotal -= softBuffer;
            }

            // Calculate Implied Line
            let impliedLine = Math.round(adjustedTotal) - 0.5;

            // Apply Max Cap
            if (maxLineCap !== null && maxLineCap > 0) {
                if (impliedLine > maxLineCap) {
                    impliedLine = maxLineCap;
                }
            }

            const isWin = actualTotal > impliedLine;

            wins += (isWin ? 1 : 0);
            totalBets++;
        }
    }

    return {
        winRate: totalBets > 0 ? (wins / totalBets) : 0,
        totalBets,
        wins
    };
};

/**
 * Finds the best parameter combination for a specific league.
 * @param {Array} matches - Historical matches for the league.
 * @param {String} statistic - The statistic to optimize for.
 * @param {Object} bettingParams - { softBuffer, minPrediction, maxLineCap }
 * @returns {Object|null} Best params { nGames, forceMean, useGeneralStats } or null if no data
 */
export const findBestStrategy = (matches, statistic, bettingParams = {}) => {
    if (!matches || matches.length < 5) return null; // Not enough data to optimize

    // Sort matches by date ascending
    const sortedMatches = [...matches].filter(m => m.stats && m.stats[statistic]).sort((a, b) => {
        if (a.date && b.date) return new Date(a.date) - new Date(b.date);
        const getG = (s) => parseInt(String(s).replace(/\D/g, '')) || 0;
        return getG(a.giornata) - getG(b.giornata);
    });

    let bestWinRate = -1;
    let bestParams = null;
    let bestTotalBets = 0;

    // Iterate all combinations
    for (const nGames of N_GAMES_OPTIONS) {
        for (const forceMean of FORCE_MEAN_OPTIONS) {
            for (const useGeneralStats of USE_GENERAL_STATS_OPTIONS) {
                const modelParams = { nGames, forceMean, useGeneralStats };
                const result = evaluateStrategy(sortedMatches, statistic, modelParams, bettingParams);

                // Strategy Selection Logic
                // Prioritize Win Rate.
                // Tie-breaker: Total Bets (Reliability).

                if (result.winRate > bestWinRate) {
                    bestWinRate = result.winRate;
                    bestParams = modelParams;
                    bestTotalBets = result.totalBets;
                } else if (Math.abs(result.winRate - bestWinRate) < 0.0001) {
                    // If win rate is effectively equal, prefer more bets
                    if (result.totalBets > bestTotalBets) {
                        bestWinRate = result.winRate;
                        bestParams = modelParams;
                        bestTotalBets = result.totalBets; // Update tie-breaker
                    }
                }
            }
        }
    }

    if (!bestParams) return null;

    return {
        ...bestParams,
        winRate: bestWinRate,
        totalBets: bestTotalBets
    };
};

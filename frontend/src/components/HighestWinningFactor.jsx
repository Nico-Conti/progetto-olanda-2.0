import React, { useState, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import Header from './Header';
import ConfigurationPanel from './highest-winning-factor/ConfigurationPanel';
import ResultsList from './highest-winning-factor/ResultsList';
import { processData } from '../utils/stats';
import { STAT_CONFIG } from '../utils/statistics';

import StatisticSelector from './StatisticSelector';

const HighestWinningFactor = ({ onBack, isAnimationEnabled, onToggleAnimation, matchData, notStartedLeagues = [], fixturesData, onMatchClick, teamLogos, bets, addToBet, removeFromBet, onOpenBetSlip }) => {
    const [selectedStatistic, setSelectedStatistic] = useState('corners');
    const [analysisMode, setAnalysisMode] = useState('total'); // 'total' or 'individual'
    const [operator, setOperator] = useState('over');
    const [threshold, setThreshold] = useState(STAT_CONFIG['corners'].total.default);
    const [nGames, setNGames] = useState(5);
    const [displayLimit, setDisplayLimit] = useState(5);
    const [selectedLeague, setSelectedLeague] = useState('All');

    // Update threshold when statistic or mode changes
    useEffect(() => {
        const config = STAT_CONFIG[selectedStatistic] || { total: { default: 0.5 }, individual: { default: 0.5 } };
        setThreshold(config[analysisMode].default);
    }, [selectedStatistic, analysisMode]);

    // Helper to adjust threshold
    const adjustThreshold = (delta) => {
        setThreshold(prev => {
            const newVal = prev + delta;
            return Math.max(0, Math.round(newVal * 10) / 10); // Keep 1 decimal place
        });
    };

    const currentConfig = (STAT_CONFIG[selectedStatistic] || { total: { step: 0.5, options: [] }, individual: { step: 0.5, options: [] } })[analysisMode];

    // With a single league selected, only that league's absence is worth
    // reporting; on 'All', every unstarted league is.
    const relevantNotStarted = useMemo(
        () => (selectedLeague === 'All'
            ? notStartedLeagues
            : notStartedLeagues.filter(l => l.league === selectedLeague)),
        [notStartedLeagues, selectedLeague]
    );

    // Includes leagues with no results yet: dropping them from the picker would
    // make an unstarted league indistinguishable from one that does not exist.
    // Selecting it shows the notice above instead of an unexplained empty list.
    const availableLeagues = useMemo(() => {
        const leagues = new Set((matchData || []).map(m => m.league).filter(Boolean));
        notStartedLeagues.forEach(l => leagues.add(l.league));
        return ['All', ...Array.from(leagues).sort()];
    }, [matchData, notStartedLeagues]);

    // Calculate Winning Factors
    const rankedTeams = useMemo(() => {
        if (!matchData || matchData.length === 0) return [];

        const filteredMatchData = selectedLeague === 'All'
            ? matchData
            : matchData.filter(m => m.league === selectedLeague);

        const processedStats = processData(filteredMatchData, selectedStatistic);
        const teams = Object.keys(processedStats);
        const results = [];

        teams.forEach(team => {
            const teamData = processedStats[team];
            const allMatches = [...teamData.all_matches].sort((a, b) => b.giornata - a.giornata);
            const recentMatches = nGames === 'all' ? allMatches : allMatches.slice(0, nGames);

            if (recentMatches.length === 0) return;

            let winCount = 0;
            recentMatches.forEach(match => {
                const value = analysisMode === 'total' ? match.total : match.statFor;
                if (operator === 'over' && value > threshold) {
                    winCount++;
                } else if (operator === 'under' && value < threshold) {
                    winCount++;
                }
            });

            const winRate = (winCount / recentMatches.length) * 100;

            results.push({
                team,
                winCount,
                totalGames: recentMatches.length,
                winRate,
                matches: recentMatches
            });
        });

        // Sort by Win Rate descending, then by Win Count descending
        const sorted = results.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.winCount - a.winCount;
        });

        // Add nextMatch info for each team
        return sorted.map(res => {
            let nextMatch = null;
            if (fixturesData) {
                const teamFixtures = fixturesData.filter(f => f.home === res.team || f.away === res.team);
                const unplayed = teamFixtures.filter(f => {
                    return !matchData.some(m =>
                        ((m.squadre.home === f.home && m.squadre.away === f.away) ||
                            (m.squadre.home === f.away && m.squadre.away === f.home)) &&
                        (m.giornata === f.matchday) &&
                        // Season as well as matchday: the same pairing recurs at
                        // the same matchday every year, so without this a brand
                        // new fixture matches last season's and is hidden.
                        (!f.season || !m.season || m.season === f.season)
                    );
                }).sort((a, b) => (a.matchday || 0) - (b.matchday || 0));

                if (unplayed.length > 0) {
                    nextMatch = unplayed[0];
                }
            }
            return { ...res, nextMatch };
        });
    }, [matchData, fixturesData, selectedStatistic, operator, threshold, nGames, selectedLeague, analysisMode]);

    // Most matches any one team has played - the point at which the "+" stepper
    // in ResultsList snaps to "Season".
    //
    // This used to read m.home_team / m.away_team, which do not exist on this
    // shape: useMatchData nests them under `squadre`, so every increment landed
    // on counts[undefined] and maxGames came back as twice the number of matches
    // (~760 rather than 38). The stepper could therefore never reach 'Season'.
    const maxGames = useMemo(() => {
        if (!matchData || matchData.length === 0) return 38;
        const counts = {};
        matchData.forEach(m => {
            counts[m.squadre?.home] = (counts[m.squadre?.home] || 0) + 1;
            counts[m.squadre?.away] = (counts[m.squadre?.away] || 0) + 1;
        });
        const values = Object.values(counts);
        return values.length > 0 ? Math.max(...values) : 38;
    }, [matchData]);

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
            Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
        </h1>
    );

    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            Malissimo<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Pisello</span>
        </h1>
    );

    return (
        <div className="min-h-screen text-zinc-200 font-sans relative pb-12">
            {/* Navbar */}
            <Header
                title={appTitle}
                onLogoClick={onBack}
                showSound={true}
                showAnimationToggle={true}
                isAnimationEnabled={isAnimationEnabled}
                onToggleAnimation={onToggleAnimation}
                pageName={pageName}
                showBetSlip={true}
                betsCount={bets.length}
                onOpenBetSlip={onOpenBetSlip}
            >
                <StatisticSelector
                    value={selectedStatistic}
                    onChange={(e) => setSelectedStatistic(e.target.value)}
                    className="w-[180px]"
                />
            </Header>

            <main className="max-w-7xl mx-auto px-4 md:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Configuration Panel */}
                    {/* relative z-50: both panels are glass panels, and a glass
                        panel's backdrop-blur creates a stacking context - stacked
                        below `lg`, the Select dropdowns here would otherwise open
                        behind the results panel. */}
                    <div className="lg:col-span-4 space-y-6 relative z-50">
                        <ConfigurationPanel
                            selectedLeague={selectedLeague}
                            setSelectedLeague={setSelectedLeague}
                            availableLeagues={availableLeagues}
                            analysisMode={analysisMode}
                            setAnalysisMode={setAnalysisMode}
                            operator={operator}
                            setOperator={setOperator}
                            threshold={threshold}
                            setThreshold={setThreshold}
                            adjustThreshold={adjustThreshold}
                            currentConfig={currentConfig}
                        />
                    </div>

                    {/* Results List */}
                    <div className="lg:col-span-8 space-y-4">
                        {/* This view counts only matches played in the season now
                            being played, so a league whose season has not kicked
                            off yet has nothing to rank. Say which, rather than
                            letting it go missing without explanation. */}
                        {relevantNotStarted.length > 0 && (
                            <div className="glass-panel rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-zinc-300 leading-relaxed">
                                    {relevantNotStarted.length === 1
                                        ? <>No match has been played yet in <span className="font-bold text-amber-300">{relevantNotStarted[0].league} {relevantNotStarted[0].season}</span>, so it cannot be ranked.</>
                                        : <>{relevantNotStarted.length} leagues have not started their current season yet, so they are not ranked: <span className="font-bold text-amber-300">{relevantNotStarted.map(l => l.league).join(', ')}</span>.</>}
                                    {' '}Only matches from the season in progress count here - last season's
                                    form is deliberately excluded. They appear as soon as their first results are in.
                                </p>
                            </div>
                        )}

                        <ResultsList
                            rankedTeams={rankedTeams}
                            displayLimit={displayLimit}
                            setDisplayLimit={setDisplayLimit}
                            nGames={nGames}
                            setNGames={setNGames}
                            maxGames={maxGames}
                            teamLogos={teamLogos}
                            bets={bets}
                            addToBet={addToBet}
                            removeFromBet={removeFromBet}
                            analysisMode={analysisMode}
                            selectedStatistic={selectedStatistic}
                            operator={operator}
                            threshold={threshold}
                            onTeamClick={(team) => {
                                if (fixturesData && onMatchClick) {
                                    // 1. Find all fixtures for this team
                                    const teamFixtures = fixturesData.filter(f => f.home === team || f.away === team);

                                    // 2. Filter out matches that have already been played (exist in matchData)
                                    // We use matchData to check if a match is "finished/recorded"
                                    const unplayedFixtures = teamFixtures.filter(f => {
                                        const isPlayed = matchData.some(m =>
                                            ((m.squadre.home === f.home && m.squadre.away === f.away) ||
                                                (m.squadre.home === f.away && m.squadre.away === f.home)) && // Check both ways just in case specific logic differs
                                            (m.giornata === f.matchday) && // Strict matchday check
                                            (!f.season || !m.season || m.season === f.season) // ...and same season
                                        );
                                        return !isPlayed;
                                    });

                                    // 3. Sort by matchday to find the "next" one
                                    unplayedFixtures.sort((a, b) => {
                                        if (a.matchday && b.matchday) return a.matchday - b.matchday;
                                        return 0; // Fallback
                                    });

                                    if (unplayedFixtures.length > 0) {
                                        const nextMatch = unplayedFixtures[0];

                                        // 4. Check if the match's league is valid (exists in matchData)
                                        // If not, use the team's primary league from matchData to allow prediction using domestic stats
                                        const validLeagues = new Set(matchData.map(m => m.league).filter(Boolean));

                                        if (!validLeagues.has(nextMatch.league)) {
                                            const teamEntry = matchData.find(m => m.squadre.home === team || m.squadre.away === team);
                                            if (teamEntry && teamEntry.league) {
                                                console.log(`League mismatch for ${team}. Fixture: ${nextMatch.league}, Using: ${teamEntry.league}`);
                                                // Create a copy with the valid league
                                                onMatchClick({ ...nextMatch, league: teamEntry.league });
                                                return;
                                            }
                                        }

                                        onMatchClick(nextMatch);
                                    } else {
                                        console.log("No upcoming unplayed matches found for", team);
                                        // Optional: Show a toast or alert? For now just log.
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default HighestWinningFactor;

import React, { useState, useEffect, useMemo } from 'react';
import Header from './Header';
import ConfigurationPanel from './highest-winning-factor/ConfigurationPanel';
import ResultsList from './highest-winning-factor/ResultsList';
import { processData } from '../utils/stats';

const STAT_CONFIG = {
    corners: {
        total: { default: 9.5, step: 1, options: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5] }
    },
    goals: {
        total: { default: 2.5, step: 1, options: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    shots: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 12.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5, 14.5] }
    },
    shots_on_target: {
        total: { default: 8.5, step: 1, options: [6.5, 7.5, 8.5, 9.5, 10.5, 11.5] },
        individual: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] }
    },
    fouls: {
        total: { default: 24.5, step: 1, options: [20.5, 22.5, 24.5, 26.5, 28.5, 30.5] },
        individual: { default: 11.5, step: 1, options: [9.5, 10.5, 11.5, 12.5, 13.5] }
    },
    yellow_cards: {
        total: { default: 4.5, step: 1, options: [2.5, 3.5, 4.5, 5.5, 6.5] },
        individual: { default: 1.5, step: 1, options: [0.5, 1.5, 2.5, 3.5] }
    },
    red_cards: {
        total: { default: 0.5, step: 0.5, options: [0.5] },
        individual: { default: 0.5, step: 0.5, options: [0.5] }
    },
    possession: {
        total: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] },
        individual: { default: 50.5, step: 5, options: [40.5, 45.5, 50.5, 55.5, 60.5] }
    },
};

import StatisticSelector from './StatisticSelector';

const HighestWinningFactor = ({ onBack, isAnimationEnabled, onToggleAnimation, matchData, teamLogos, bets, addToBet, removeFromBet, onOpenBetSlip }) => {
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

    const availableLeagues = useMemo(() => {
        if (!matchData) return [];
        const leagues = new Set(matchData.map(m => m.league).filter(Boolean));
        return ['All', ...Array.from(leagues).sort()];
    }, [matchData]);

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
        return results.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.winCount - a.winCount;
        });
    }, [matchData, selectedStatistic, operator, threshold, nGames, selectedLeague, analysisMode]);

    // Calculate max games played by any team to set the limit for "Season"
    const maxGames = useMemo(() => {
        if (!matchData || matchData.length === 0) return 38;
        const counts = {};
        matchData.forEach(m => {
            counts[m.home_team] = (counts[m.home_team] || 0) + 1;
            counts[m.away_team] = (counts[m.away_team] || 0) + 1;
        });
        return Math.max(0, ...Object.values(counts));
    }, [matchData]);

    const appTitle = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
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
                    <div className="lg:col-span-4 space-y-6">
                        <ConfigurationPanel
                            selectedLeague={selectedLeague}
                            setSelectedLeague={setSelectedLeague}
                            availableLeagues={availableLeagues}
                            analysisMode={analysisMode}
                            setAnalysisMode={setAnalysisMode}
                            selectedStatistic={selectedStatistic}
                            setSelectedStatistic={setSelectedStatistic}
                            operator={operator}
                            setOperator={setOperator}
                            threshold={threshold}
                            setThreshold={setThreshold}
                            adjustThreshold={adjustThreshold}
                            currentConfig={currentConfig}
                        />
                    </div>

                    {/* Results List */}
                    <div className="lg:col-span-8">
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
                            selectedStatistic={selectedStatistic}
                            operator={operator}
                            threshold={threshold}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default HighestWinningFactor;

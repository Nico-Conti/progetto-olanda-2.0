import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Info, Zap } from 'lucide-react';
import Header from './Header';
import StatisticSelector from './StatisticSelector';
import ConfigurationPanel from './highest-winning-factor/ConfigurationPanel';
import ResultsList from './highest-winning-factor/ResultsList';
import { processData } from '../utils/stats';
import { STAT_CONFIG } from '../utils/statistics';

import ElectricBorder from './originkit/ElectricBorder';
import { motionAllowed } from '../utils/leaguePickerFx';
import { t, tx } from '../i18n';

const HighestWinningFactor = ({ onBack, matchData, notStartedLeagues = [], fixturesData, onMatchClick, teamLogos, leagues, bets, addToBet, removeFromBet, onOpenBetSlip }) => {
    const [selectedStatistic, setSelectedStatistic] = useState('corners');
    const [analysisMode, setAnalysisMode] = useState('total'); // 'total' or 'individual'
    const [operator, setOperator] = useState('over');
    const [threshold, setThreshold] = useState(STAT_CONFIG['corners'].total.default);
    const [nGames, setNGames] = useState(5);
    const [displayLimit, setDisplayLimit] = useState(5);
    const [selectedLeague, setSelectedLeague] = useState('All');

    // The homepage card's electric edge, round the header. It redraws a canvas
    // every frame, so it only runs while the header is on screen.
    const heroRef = useRef(null);
    const [heroVisible, setHeroVisible] = useState(false);
    const [electric] = useState(motionAllowed);
    useEffect(() => {
        if (!electric) return;
        const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting));
        io.observe(heroRef.current);
        return () => io.disconnect();
    }, [electric]);

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
        // Which league each team plays in, for the row's league tag. The next
        // fixture's league wins below; this covers a team with none scheduled.
        const leagueOf = new Map();
        filteredMatchData.forEach(m => {
            leagueOf.set(m.squadre.home, m.league);
            leagueOf.set(m.squadre.away, m.league);
        });
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
            return { ...res, nextMatch, league: nextMatch?.league ?? leagueOf.get(res.team) };
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

    // Split the same way Market Moves does: first word plain, the rest in the
    // page's own gradient. Translated, so it reads as the card that opened it.
    const title = t('Winning Factor').split(' ');
    const pageName = (
        <h1 className="text-lg font-black tracking-tight text-white leading-none">
            {title[0]} <span className="bp-gold-text">{title.slice(1).join(' ')}</span>
        </h1>
    );

    return (
        <div className="fx-volt min-h-screen text-zinc-200 font-sans relative pb-12">
            {/* Navbar */}
            <Header
                title={appTitle}
                onLogoClick={onBack}
                pageName={pageName}
                showBetSlip={true}
                betsCount={bets.length}
                onOpenBetSlip={onOpenBetSlip}
            />

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-4">
                <div className="space-y-8">
                    {/* One panel: title and the ranking's rules. z-50: its Select
                        dropdowns open over the results below. */}
                    <section ref={heroRef} className={`bp-hero bp-hero-open animate-waterfall relative z-50 ${electric ? 'bp-live-edge' : ''}`}>
                        {electric && heroVisible && (
                            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                                <ElectricBorder color="#e9d5ff" bgColor="transparent" glowColor="#a855f7"
                                    glowIntensity={4} chaos={1.2} thickness={1.5} speed={1} borderRadius={24} />
                            </div>
                        )}
                        <div className="bp-orbs" aria-hidden="true">
                            <div className="bp-orb bp-orb-a" />
                            <div className="bp-orb bp-orb-b" />
                            <div className="bp-orb bp-orb-c" />
                        </div>
                        <div className="relative flex flex-col lg:flex-row lg:items-center gap-4">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="bp-icon"><Zap className="w-7 h-7 text-purple-300" /></div>
                                <div className="min-w-0">
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                                        {title[0]} <span className="bp-gold-text">{title.slice(1).join(' ')}</span>
                                    </h2>
                                    <p className="text-sm text-zinc-400 mt-2">
                                        {t('The teams that clear your line most often in their recent games.')}
                                    </p>
                                </div>
                            </div>
                            {/* Same slot as Hot Matches and Market Moves. It sits
                                above the rules below, not among them: it decides
                                what the ranking is OF, not how it is filtered.
                                Note this one is the page's OWN statistic - see
                                the useState below - not the app-wide one. */}
                            <div className="flex items-center gap-2 self-start lg:self-center">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{t('Statistic')}</span>
                                <StatisticSelector
                                    value={selectedStatistic}
                                    onChange={(e) => setSelectedStatistic(e.target.value)}
                                    className="w-[160px]"
                                />
                            </div>
                        </div>
                        <div className="relative mt-5 pt-5 border-t border-white/5">
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
                    </section>

                    <div className="space-y-4 animate-waterfall" style={{ animationDelay: '120ms' }}>
                        {/* This view counts only matches played in the season now
                            being played, so a league whose season has not kicked
                            off yet has nothing to rank. Say which, rather than
                            letting it go missing without explanation. */}
                        {relevantNotStarted.length > 0 && (
                            <div className="glass-panel rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-zinc-300 leading-relaxed">
                                    {relevantNotStarted.length === 1
                                        ? tx('No match has been played yet in {league}, so it cannot be ranked.', { league: <span className="font-bold text-amber-300">{relevantNotStarted[0].league} {relevantNotStarted[0].season}</span> })
                                        : tx('{n} leagues have not started their current season yet, so they are not ranked: {leagues}.', { n: relevantNotStarted.length, leagues: <span className="font-bold text-amber-300">{relevantNotStarted.map(l => l.league).join(', ')}</span> })}
                                    {' '}{t("Only matches from the season in progress count here - last season's form is deliberately excluded. They appear as soon as their first results are in.")}
                                </p>
                            </div>
                        )}

                        <ResultsList
                            rankedTeams={rankedTeams}
                            dealKey={`${selectedLeague}|${selectedStatistic}|${analysisMode}|${operator}|${threshold}|${nGames}`}
                            displayLimit={displayLimit}
                            setDisplayLimit={setDisplayLimit}
                            nGames={nGames}
                            setNGames={setNGames}
                            maxGames={maxGames}
                            teamLogos={teamLogos}
                            leagues={leagues}
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

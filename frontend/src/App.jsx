import React, { useState, useMemo } from 'react';
import { TrendingUp, Calculator, Trophy, Home, ListOrdered } from 'lucide-react';
import LeagueTrends from './components/LeagueTrends';
import Predictor from './components/Predictor';
import HotMatches from './components/HotMatches';
import LandingPage from './components/LandingPage';
import HighestWinningFactor from './components/HighestWinningFactor';
import SafestBets from './components/SafestBets';
import TransitionAnimation from './components/TransitionAnimation';
import BackgroundAnimation from './components/BackgroundAnimation';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';
import { seasonsForLeague, latestSeasonForLeague, modelSeasonsForLeague } from './utils/seasons';
import { usePredictionEngine } from './hooks/usePredictionEngine';
import { useOdds } from './hooks/useOdds';
import { useModelSettings } from './hooks/useModelSettings';
import { useBackendHealth } from './hooks/useBackendHealth';
import StatisticSelector from './components/StatisticSelector';
import ToggleSwitch from './components/ui/ToggleSwitch';
import BetSlipModal from './components/BetSlipModal';
import Header from './components/Header';
import TeamDetails from './components/TeamDetails';
import LeagueTable from './components/LeagueTable';
import SeasonResults from './components/SeasonResults';
import Select from './components/ui/Select';
const STANDINGS_VIEWS = [
  { id: 'table', label: 'Table', Icon: Trophy },
  { id: 'results', label: 'Results', Icon: ListOrdered },
];

const TABS = [
  { id: 'trends', label: 'Trends', Icon: TrendingUp },
  { id: 'predictor', label: 'Predictor', Icon: Calculator },
  { id: 'standings', label: 'Standings', Icon: Trophy },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [view, setView] = useState('landing'); // landing | dashboard | hot-matches | safest-bets | highest-winning-factor
  const [selectedStatistic, setSelectedStatistic] = useState('corners');
  // Standings-only: null follows the league's current season, a label pins to
  // a past one. Trends and the Predictor always stay on the current season.
  const [standingsSeason, setStandingsSeason] = useState(null);
  const [standingsView, setStandingsView] = useState('table');
  const { matchData, fixturesData, teamLogos, leagues, loading } = useMatchData();
  const isBackendOnline = useBackendHealth();
  const [previousTab, setPreviousTab] = useState('trends');

  // Animation State
  const [isAnimationEnabled, setIsAnimationEnabled] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingLeague, setPendingLeague] = useState(undefined);
  const [pendingView, setPendingView] = useState(null);
  const [matchStatistics, setMatchStatistics] = useState({});
  const [preSelectedMatch, setPreSelectedMatch] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [backView, setBackView] = useState('hot-matches');
  const [backLabel, setBackLabel] = useState('Back to Hot Matches');

  // Bet Slip State
  const [bets, setBets] = useState([]);
  const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);

  const addToBet = (game, option, value, stat, team = 'total') => {
    setBets(prev => {
      const existingIndex = prev.findIndex(b => b.game === game && b.stat === stat && b.team === team);
      if (existingIndex >= 0) {
        const newBets = [...prev];
        newBets[existingIndex] = { game, option, value, stat, team };
        return newBets;
      }
      return [...prev, { game, option, value, stat, team }];
    });
  };

  const removeFromBet = (game, stat = null, team = null) => {
    setBets(prev => prev.filter(b => {
      if (stat && team) {
        return !(b.game === game && b.stat === stat && b.team === team);
      }
      return b.game !== game;
    }));
  };

  const clearBets = () => {
    setBets([]);
  };

  const handleTabChange = (tab) => {
    if (tab === activeTab || isAnimating) return;

    if (isAnimationEnabled) {
      setPendingTab(tab);
      setIsAnimating(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleLeagueChange = (league) => {
    if ((league === selectedLeague && view === 'dashboard') || isAnimating) return;

    if (isAnimationEnabled) {
      setPendingLeague(league);
      setPendingView('dashboard'); // Switch to dashboard view when league selected
      setPendingTab('trends'); // Reset to trends tab
      setIsAnimating(true);
      setSelectedTeam(null); // Clear selected team
    } else {
      setSelectedLeague(league);
      setView('dashboard');
      setActiveTab('trends'); // Reset to trends tab
      setSelectedTeam(null); // Clear selected team
    }
  };

  const handleViewChange = (newView) => {
    if (newView === view || isAnimating) return;

    if (newView === 'landing') {
      setPreSelectedMatch(null);
    }

    if (isAnimationEnabled) {
      setPendingView(newView);
      setIsAnimating(true);
    } else {
      setView(newView);
    }
  };

  const handleTeamClick = (team) => {
    setPreviousTab(activeTab);
    setSelectedTeam(team);
    handleTabChange('team-details');
  };

  // Extract unique leagues from data
  const availableLeagues = useMemo(() => {
    const leagues = new Set(matchData.map(m => m.league).filter(Boolean));
    // Fallback if league is missing in some data
    if (leagues.size === 0 && matchData.length > 0) return ['Eredivisie', 'La Liga'];
    return Array.from(leagues).sort();
  }, [matchData]);

  // Seasons available for the league in view, newest first
  const availableSeasons = useMemo(
    () => seasonsForLeague([...matchData, ...fixturesData], selectedLeague),
    [matchData, fixturesData, selectedLeague]
  );

  // The season in progress for this league - what the dashboard shows by default
  const latestSeason = useMemo(
    () => latestSeasonForLeague(matchData, fixturesData, selectedLeague),
    [matchData, fixturesData, selectedLeague]
  );

  // The newest season this league actually has *results* for. Between seasons
  // these differ: fixtures for 2026/27 exist from the day the calendar is
  // published, but no match has been played, so anything that looks backwards
  // must fall back to the last season that has data or it renders empty.
  const latestResultSeason = useMemo(
    () => seasonsForLeague(matchData, selectedLeague)[0] ?? latestSeason,
    [matchData, selectedLeague, latestSeason]
  );

  // Standings default to the season in progress, and offer the earlier ones in
  // the dropdown. A pinned season only applies while it exists for the league in
  // view; switching leagues otherwise strands you on a season it never played.
  const activeStandingsSeason = (standingsSeason && availableSeasons.includes(standingsSeason))
    ? standingsSeason
    : latestSeason;

  // Trends and team details look backwards, so they use the latest season with
  // results. Season matters as much as league here: without it, two seasons of
  // results blend into one table and one set of team form.
  const filteredMatchData = useMemo(() => {
    if (!selectedLeague) return [];
    return matchData.filter(m =>
      (m.league === selectedLeague || !m.league) &&
      (!latestResultSeason || !m.season || m.season === latestResultSeason)
    );
  }, [matchData, selectedLeague, latestResultSeason]);

  // The Predictor sees the season being played AND the one before it. That
  // carry-over used to be excluded on purpose, on the reasoning that last
  // year's form would pollute this year's. Measured over 30,037 matches it is
  // the reverse: recency decay weights the old season lightly, and without it
  // the model has nothing at all to work from until about matchday five. In the
  // opening 30 days of a season carrying it over raises coverage from ~54% to
  // ~85% and accuracy with it. See docs/prediction-model.md section 10.
  const predictorMatchData = useMemo(() => {
    if (!selectedLeague) return [];
    const seasons = modelSeasonsForLeague(matchData, fixturesData, selectedLeague);
    return matchData.filter(m =>
      m.league === selectedLeague && (!m.season || seasons.has(m.season))
    );
  }, [matchData, fixturesData, selectedLeague]);

  // Standings can look back at any season of the same league.
  const standingsMatchData = useMemo(() => {
    if (!selectedLeague) return [];
    return matchData.filter(m =>
      m.league === selectedLeague && m.season === activeStandingsSeason
    );
  }, [matchData, selectedLeague, activeStandingsSeason]);

  const filteredFixtures = useMemo(() => {
    if (!selectedLeague) return [];
    // League as well as season. This used to return every fixture in the DB;
    // it only looked correct because predictions came back null for teams
    // outside the selected league and those rows were dropped further down.
    return fixturesData.filter(f =>
      f.league === selectedLeague &&
      (!latestSeason || !f.season || f.season === latestSeason)
    );
  }, [fixturesData, selectedLeague, latestSeason]);

  // Cross-league views (Hot Matches / Safest Bets) model the same two seasons
  // per league as the Predictor, for the same reason - and per league, since
  // Brazil's calendar season turns over at a different time from everyone else's.
  const currentSeasonMatchData = useMemo(() => {
    const seasonsByLeague = {};
    [...new Set(matchData.map(m => m.league).filter(Boolean))].forEach(lg => {
      seasonsByLeague[lg] = modelSeasonsForLeague(matchData, fixturesData, lg);
    });
    return matchData.filter(m => !m.season || seasonsByLeague[m.league]?.has(m.season));
  }, [matchData, fixturesData]);

  const currentSeasonFixtures = useMemo(() => {
    const latestByLeague = {};
    [...new Set(fixturesData.map(f => f.league).filter(Boolean))].forEach(lg => {
      latestByLeague[lg] = latestSeasonForLeague(matchData, fixturesData, lg);
    });
    return fixturesData.filter(f => !f.season || f.season === latestByLeague[f.league]);
  }, [matchData, fixturesData]);

  // Winning Factor counts raw hit rates over matches already played, so unlike
  // the predictor it must see exactly one season. Two reasons, and the second is
  // the one that bites:
  //
  //  - "how often did this team go over X" is a claim about a season, and
  //    blending two makes it a claim about neither.
  //  - it slices "last N games" by giornata, and giornata does not order across
  //    a season boundary. With last season present, its MD38 sorts above this
  //    season's MD3, so on 2026-08-24 "Last 5" for Ajax returned five matches
  //    from April and May and ignored the three already played in 2026/2027.
  //
  // Per league, and strictly the season being PLAYED - newest across results and
  // fixtures, the same season the Predictor's fixture list is drawn from. This
  // deliberately does not fall back to the newest season with results: on
  // 2026-08-24 five of nine leagues (Bundesliga, Ligue 1, Premier League, Serie A,
  // Serie B) had 2026/2027 fixtures published and nothing played in them, so a
  // fallback showed 2025/2026 form - last season - which is exactly what this
  // view must not do. Those leagues rank nothing until their first matchday, and
  // `winningFactorNotStarted` below names them so the gap is stated, not silent.
  const winningFactorSeasons = useMemo(() => {
    const byLeague = {};
    [...new Set(matchData.map(m => m.league).filter(Boolean))].forEach(lg => {
      byLeague[lg] = latestSeasonForLeague(matchData, fixturesData, lg);
    });
    return byLeague;
  }, [matchData, fixturesData]);

  const winningFactorMatchData = useMemo(
    () => matchData.filter(m => !m.season || m.season === winningFactorSeasons[m.league]),
    [matchData, winningFactorSeasons]
  );

  // Leagues whose current season has no results yet, so Winning Factor cannot
  // rank them at all. Named in the UI rather than quietly missing.
  const winningFactorNotStarted = useMemo(() => {
    const played = new Set(winningFactorMatchData.map(m => m.league));
    return Object.keys(winningFactorSeasons)
      .filter(lg => !played.has(lg))
      .map(lg => ({ league: lg, season: winningFactorSeasons[lg] }))
      .sort((a, b) => a.league.localeCompare(b.league));
  }, [winningFactorMatchData, winningFactorSeasons]);

  // Which prediction engine is running. Persisted, and defaulting to the
  // measured `classic` model - a new engine is opted into, never imposed.
  const { engine, setEngine } = usePredictionEngine();
  // Bookmaker prices, if any have been captured. Optional throughout.
  const { priceFor, priceForBet, pricedLines } = useOdds();
  // One copy of the model knobs for every screen that predicts. Held here, not
  // per screen: three private copies gave the same fixture different expected
  // values depending on which view you were standing in.
  const modelSettingsApi = useModelSettings();

  const stats = useMemo(() => processData(filteredMatchData, selectedStatistic), [filteredMatchData, selectedStatistic]);
  const predictorStats = useMemo(() => processData(predictorMatchData, selectedStatistic), [predictorMatchData, selectedStatistic]);
  const allStats = useMemo(() => processData(currentSeasonMatchData, selectedStatistic), [currentSeasonMatchData, selectedStatistic]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-200">Loading...</div>;
  }


  return (
    <div className="min-h-screen text-zinc-200 selection:bg-emerald-500/30 font-sans relative">
      <BackgroundAnimation />
      <TransitionAnimation
        isActive={isAnimating}
        onMidPoint={() => {
          if (pendingTab) setActiveTab(pendingTab);
          if (pendingLeague !== undefined) setSelectedLeague(pendingLeague);
          if (pendingView) setView(pendingView);
        }}
        onComplete={() => {
          setIsAnimating(false);
          setPendingTab(null);
          setPendingLeague(undefined);
          setPendingView(null);
        }}
      />

      <BetSlipModal
        isOpen={isBetSlipOpen}
        onClose={() => setIsBetSlipOpen(false)}
        bets={bets}
        priceFor={priceForBet}
        onRemove={removeFromBet}
        onClear={clearBets}
      />


      {view === 'landing' && (
        <LandingPage
          availableLeagues={availableLeagues}
          leaguesData={leagues}
          onSelectLeague={handleLeagueChange}
          isAnimationEnabled={isAnimationEnabled}
          onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
          onOpenTopCorners={() => handleViewChange('hot-matches')}
          onOpenHighestWinningFactor={() => handleViewChange('highest-winning-factor')}
          onOpenSafestBets={() => handleViewChange('safest-bets')}
        />
      )}

      {view === 'highest-winning-factor' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <HighestWinningFactor
            onBack={() => handleViewChange('landing')}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            matchData={winningFactorMatchData}
            notStartedLeagues={winningFactorNotStarted}
            fixturesData={currentSeasonFixtures}
            teamLogos={teamLogos}
            bets={bets}
            addToBet={addToBet}
            removeFromBet={removeFromBet}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
            onMatchClick={(match) => {
              setPreSelectedMatch(match);
              setBackView('highest-winning-factor');
              setBackLabel('Back to Winning Factor');
              if (isAnimationEnabled) {
                setPendingLeague(match.league);
                setPendingTab('predictor');
                setPendingView('dashboard');
                setIsAnimating(true);
              } else {
                setSelectedLeague(match.league);
                setActiveTab('predictor');
                setView('dashboard');
              }
            }}
          />
        </div>
      )}

      {view === 'hot-matches' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <HotMatches
            {...modelSettingsApi}
            engine={engine}
            onEngineChange={setEngine}
            priceFor={priceFor}
            pricedLines={pricedLines}
            stats={allStats}
            fixtures={currentSeasonFixtures}
            teamLogos={teamLogos}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            selectedStatistic={selectedStatistic}
            matchData={currentSeasonMatchData}
            onStatisticChange={(e) => setSelectedStatistic(e.target.value)}
            onBack={() => handleViewChange('landing')}
            onMatchClick={(match) => {
              setPreSelectedMatch(match);
              setBackView('hot-matches');
              setBackLabel('Back to Hot Matches');
              if (isAnimationEnabled) {
                setPendingLeague(match.league);
                setPendingTab('predictor');
                setPendingView('dashboard');
                setIsAnimating(true);
              } else {
                setSelectedLeague(match.league);
                setActiveTab('predictor');
                setView('dashboard');
              }
            }}
          />
        </div>
      )}

      {view === 'safest-bets' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <SafestBets
            {...modelSettingsApi}
            engine={engine}
            onEngineChange={setEngine}
            stats={allStats}
            fixtures={currentSeasonFixtures}
            teamLogos={teamLogos}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            selectedStatistic={selectedStatistic}
            matchData={currentSeasonMatchData}
            onStatisticChange={(e) => setSelectedStatistic(e.target.value)}
            onBack={() => handleViewChange('landing')}
            onMatchClick={(match) => {
              setPreSelectedMatch(match);
              setBackView('safest-bets');
              setBackLabel('Back to Safest Bets');
              if (isAnimationEnabled) {
                setPendingLeague(match.league);
                setPendingTab('predictor');
                setPendingView('dashboard');
                setIsAnimating(true);
              } else {
                setSelectedLeague(match.league);
                setActiveTab('predictor');
                setView('dashboard');
              }
            }}
          />
        </div>
      )}

      {view === 'dashboard' && (
        <>
          <Header
            onLogoClick={() => handleViewChange('landing')}
            title={
              <h1
                className="text-sm md:text-lg font-black tracking-tight text-white leading-none cursor-pointer hidden sm:block"
              >
                Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
              </h1>
            }
            showBackendStatus={true}
            isBackendOnline={isBackendOnline}
            showSound={true}
            showAnimationToggle={true}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            showBetSlip={true}
            betsCount={bets.length}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
          >
            {/* Mobile and tablet: compact icon row. Switches at lg, not md: the
                desktop pill measures ~943px and md is 768px, so an iPad in
                portrait got a header wider than its own screen. */}
            <div className="flex items-center gap-2 lg:hidden">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  title={tab.label}
                  className={`p-2.5 rounded-lg border transition-all ${activeTab === tab.id
                    ? 'bg-zinc-800 border-white/10 text-emerald-400 shadow-sm'
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-white'
                    }`}
                >
                  <tab.Icon className="w-5 h-5" />
                </button>
              ))}

              <StatisticSelector
                value={selectedStatistic}
                onChange={(e) => setSelectedStatistic(e.target.value)}
                className="w-[140px]"
              />

            </div>

            {/* Desktop: navigation pill + secondary actions */}
            <div className="hidden lg:flex items-center gap-3">
              <StatisticSelector
                value={selectedStatistic}
                onChange={(e) => setSelectedStatistic(e.target.value)}
                className="w-[150px]"
              />

              <div className="flex bg-zinc-900/80 p-1 rounded-full border border-white/5 shadow-lg shadow-black/20">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-all ${activeTab === tab.id
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <tab.Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pl-2 border-l border-white/5">
                <button
                  onClick={() => handleViewChange('landing')}
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  title="Change League"
                >
                  <Home className="w-5 h-5" />
                </button>
              </div>
            </div>
          </Header>

          <main className="max-w-7xl mx-auto px-4 md:px-8 pb-12">
            {activeTab === 'trends' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LeagueTrends
                  stats={stats}
                  teamLogos={teamLogos}
                  selectedStatistic={selectedStatistic}
                  onTeamClick={handleTeamClick}
                  season={latestResultSeason}
                  currentSeason={latestSeason}
                />
              </div>
            )}

            {activeTab === 'team-details' && selectedTeam && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <TeamDetails
                  team={selectedTeam}
                  teamLogo={teamLogos[selectedTeam]}
                  stats={stats[selectedTeam]}
                  fixtures={filteredFixtures}
                  onBack={() => handleTabChange(previousTab)}
                  teamLogos={teamLogos}
                  selectedStatistic={selectedStatistic}
                  onMatchClick={(match) => {
                    setBackView('dashboard');
                    setBackLabel('Back to ' + selectedTeam + '\'s details');
                    setPreSelectedMatch(match);
                    handleTabChange('predictor');
                  }}
                />
              </div>
            )}

            {activeTab === 'predictor' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <Predictor
                  {...modelSettingsApi}
                  engine={engine}
                  onEngineChange={setEngine}
                  priceFor={priceFor}
                  pricedLines={pricedLines}
                  stats={predictorStats}
                  // The prediction MODEL is built on every league, exactly as Hot
                  // Matches and Safest Bets build theirs. One pooled model measured
                  // better than seven per-league ones, and more immediately: goals
                  // are converted from box touches by a ratio taken over whatever
                  // the model was trained on, so a league-only model gave the same
                  // fixture a different total (3.51 vs 2.91 for Jong Utrecht v
                  // Heracles) and flipped the sign of its EV between the two views.
                  modelMatchData={currentSeasonMatchData}
                  fixtures={filteredFixtures}
                  teams={teams}
                  teamLogos={teamLogos}
                  selectedStatistic={selectedStatistic}
                  matchData={predictorMatchData}
                  matchStatistics={matchStatistics}
                  setMatchStatistics={setMatchStatistics}
                  addToBet={addToBet}
                  removeFromBet={removeFromBet}
                  bets={bets}
                  preSelectedMatch={preSelectedMatch}
                  onExitPreview={() => {
                    setPreSelectedMatch(null);
                    if (backView === 'dashboard') {
                      if (selectedTeam) setActiveTab('team-details');
                      else setActiveTab('trends');
                    } else {
                      handleViewChange(backView);
                    }
                  }}
                  backButtonLabel={backLabel}
                />
              </div>
            )}

            {activeTab === 'standings' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                {/* Season bar - its own control, separate from the table's
                    sample/view filters, plus a switch between the table and
                    that season's results. */}
                {/* relative z-50: glass-panel applies backdrop-blur, which creates
                    a stacking context, so without this the season dropdown opens
                    behind the panel below it. */}
                <div className="glass-panel rounded-xl border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3 relative z-50">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Season</span>
                    {availableSeasons.length > 1 ? (
                      <Select
                        accent="emerald"
                        value={activeStandingsSeason}
                        onChange={setStandingsSeason}
                        options={availableSeasons.map(sn => ({
                          value: sn,
                          label: sn === latestSeason ? `${sn} (current)` : sn,
                        }))}
                        className="w-[180px]"
                      />
                    ) : (
                      <span className="text-sm font-bold text-white px-3 py-2">{activeStandingsSeason ?? '-'}</span>
                    )}
                  </div>

                  <div className="flex bg-zinc-900/80 p-1 rounded-full border border-white/5">
                    {STANDINGS_VIEWS.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setStandingsView(v.id)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${standingsView === v.id
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                          }`}
                      >
                        <v.Icon className="w-3.5 h-3.5" />
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {standingsView === 'table' ? (
                  <LeagueTable
                    matchData={standingsMatchData}
                    teamLogos={teamLogos}
                    leagueLogo={leagues.find(l => l.name === selectedLeague)?.logo_url || null}
                    onTeamClick={handleTeamClick}
                    selectedStatistic={selectedStatistic}
                    season={activeStandingsSeason}
                    latestSeason={latestSeason}
                  />
                ) : (
                  <SeasonResults
                    matchData={standingsMatchData}
                    teamLogos={teamLogos}
                    season={activeStandingsSeason}
                  />
                )}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

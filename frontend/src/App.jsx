import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Calculator, Trophy, Home } from 'lucide-react';
import Predictor from './components/Predictor';
import HotMatches from './components/HotMatches';
import LandingPage from './components/LandingPage';
import HighestWinningFactor from './components/HighestWinningFactor';
import MarketMoves from './components/MarketMoves';
import TransitionAnimation from './components/TransitionAnimation';
import LeagueStinger from './components/LeagueStinger';
import { leagueMeta } from './utils/leaguePickerFx';
import BackgroundAnimation from './components/BackgroundAnimation';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';
import { seasonsForLeague, latestSeasonForLeague, modelSeasonsForLeague } from './utils/seasons';
import { useOdds } from './hooks/useOdds';
import { useModelSettings } from './hooks/useModelSettings';
import StatisticSelector from './components/StatisticSelector';
import BetSlipModal from './components/BetSlipModal';
import AccountModal from './components/AccountModal';
import { AccountContext, useAuthUser } from './hooks/useAuth';
import Header from './components/Header';
import TeamDetails from './components/TeamDetails';
import Standings from './components/Standings';
import Select from './components/ui/Select';
import SlidingTabs from './components/ui/SlidingTabs';
import LiquidNav from './components/ui/LiquidNav';
import { cssMs } from './hooks/usePresence';
import { t, tk, useLanguage, setLanguage } from './i18n';

// Per-dot pulse order for the loading screen's matrix loader (transitions.dev #31).
const MATRIX_TWINKLE = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4];

const TABS = [
  { id: 'predictor', label: tk('Predictor'), Icon: Calculator },
  { id: 'standings', label: tk('Standings'), Icon: Trophy },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('predictor');
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [view, setView] = useState('landing'); // landing | dashboard | hot-matches | market-moves | highest-winning-factor
  const [selectedStatistic, setSelectedStatistic] = useState('corners');
  // Standings-only: null follows the league's current season, a label pins to
  // a past one. The Predictor always stays on the current season.
  const [standingsSeason, setStandingsSeason] = useState(null);
  const [standingsView, setStandingsView] = useState('table');
  const { matchData, fixturesData, teamLogos, leagues, loading } = useMatchData();
  // Where Back on a team page leads: one entry per team page opened, holding
  // the tab, team page and open match it was opened from, so hopping from
  // opponent to opponent unwinds one step at a time and a badge clicked on a
  // match page returns to that match.
  const [teamTrail, setTeamTrail] = useState([]);
  // Bumped to remount the Predictor on its fixture list, when a match it was
  // showing as a preview is closed while its tab stays open.
  const [predictorKey, setPredictorKey] = useState(0);

  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingLeague, setPendingLeague] = useState(undefined);
  const [pendingView, setPendingView] = useState(null);
  const [matchStatistics, setMatchStatistics] = useState({});
  const [preSelectedMatch, setPreSelectedMatch] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [backView, setBackView] = useState('hot-matches');
  const [backLabel, setBackLabel] = useState(tk('Back to Hot Matches'));

  // Bet Slip State
  const [bets, setBets] = useState([]);
  const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);

  // Account. Opens by itself when the page was reached from a password-reset link.
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const openAccount = useCallback(() => setIsAccountOpen(true), []);
  const user = useAuthUser(openAccount);
  const account = useMemo(() => ({ user, openAccount }), [user, openAccount]);

  // English unless chosen otherwise. Subscribing here re-renders the whole app
  // on a switch; a signed-in user's saved choice (Profile) wins once known.
  useLanguage();
  const savedLanguage = user?.user_metadata?.language;
  useEffect(() => { if (savedLanguage) setLanguage(savedLanguage); }, [savedLanguage]);
  const tabs = TABS.map(tab => ({ ...tab, label: t(tab.label) }));

  // `date` is the fixture's kickoff, and it is here so a SAVED slip can be
  // settled later. "Milan vs Lecce" does not identify a fixture - the same
  // ordered pair meets twice in a two-legged tie - and a slip already written
  // without it can never be repaired, so it is recorded at the moment the bet
  // is made rather than inferred afterwards. Not part of a bet's identity: the
  // three keys below still decide what replaces what.
  const addToBet = (game, option, value, stat, team = 'total', date = null) => {
    setBets(prev => {
      const existingIndex = prev.findIndex(b => b.game === game && b.stat === stat && b.team === team);
      if (existingIndex >= 0) {
        const newBets = [...prev];
        newBets[existingIndex] = { game, option, value, stat, team, date };
        return newBets;
      }
      return [...prev, { game, option, value, stat, team, date }];
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

  // The spiral transition is for entering a section - a league, Hot Matches,
  // Market Moves, Winning Factor. Moving around inside one (these tabs, a team,
  // a match) is instant.
  const handleTabChange = (tab) => {
    if (tab === activeTab || isAnimating) return;
    setActiveTab(tab);
  };

  // Opening a match is going to a fixture, not entering a section, so it is
  // instant - the rule above, which the team page already followed and these
  // three did not. It also keeps the league stinger where it belongs: only
  // `handleLeagueChange` sets `pendingLeague` now, so only the landing page's
  // league picker plays it.
  const openMatchFrom = (match, from, label) => {
    setPreSelectedMatch(match);
    setBackView(from);
    setBackLabel(label);
    setSelectedLeague(match.league);
    setActiveTab('predictor');
    setView('dashboard');
  };

  const handleLeagueChange = (league) => {
    if ((league === selectedLeague && view === 'dashboard') || isAnimating) return;

    setPendingLeague(league);
    setPendingView('dashboard'); // Switch to dashboard view when league selected
    setPendingTab('predictor'); // A league opens on the Predictor
    setIsAnimating(true);
    setSelectedTeam(null); // Clear selected team
    setTeamTrail([]);
  };

  const handleViewChange = (newView) => {
    if (newView === view || isAnimating) return;

    if (newView === 'landing') {
      setPreSelectedMatch(null);
    }

    // Going back to the landing page is leaving a section, not entering one.
    if (newView !== 'landing') {
      setPendingView(newView);
      setIsAnimating(true);
    } else {
      setView(newView);
    }
  };

  // `fromMatch`: the match on screen when the badge was clicked, to return to.
  const handleTeamClick = (team, fromMatch = null) => {
    if (isAnimating) return;
    setTeamTrail(trail => [...trail, {
      tab: activeTab, team: selectedTeam, match: fromMatch,
      preview: Boolean(preSelectedMatch), backView, backLabel,
    }]);
    setSelectedTeam(team);
    setActiveTab('team-details');
  };

  const handleTeamBack = () => {
    const back = teamTrail.at(-1);
    setTeamTrail(trail => trail.slice(0, -1));
    if (!back) {
      setSelectedTeam(null);
      setActiveTab('standings');
      return;
    }
    setSelectedTeam(back.team);
    if (back.match) {
      // Reopened as a preview. One opened from the fixture list closes back to
      // that list; one that was already a preview closes where it did before.
      setPreSelectedMatch(back.match);
      setBackView(back.preview ? back.backView : 'dashboard');
      setBackLabel(back.preview ? back.backLabel : tk('Back to Fixtures'));
    }
    setActiveTab(back.tab);
  };

  // The header's tabs start afresh: no team page to return to.
  const handleNavTab = (tab) => {
    setTeamTrail([]);
    setSelectedTeam(null);
    handleTabChange(tab);
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

  // Team details look backwards, so they use the latest season with
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

  // Cross-league views (Hot Matches / Market Moves) model the same two seasons
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

  // Bookmaker prices, if any have been captured. Optional throughout.
  const { priceFor, priceForBet, pricedLines, outcomesFor, loadMarket, betslipUrl } = useOdds();
  // One copy of the model knobs for every screen that predicts. Held here, not
  // per screen: three private copies gave the same fixture different expected
  // values depending on which view you were standing in.
  const modelSettingsApi = useModelSettings();

  const predictorStats = useMemo(() => processData(predictorMatchData, selectedStatistic), [predictorMatchData, selectedStatistic]);
  const allStats = useMemo(() => processData(currentSeasonMatchData, selectedStatistic), [currentSeasonMatchData, selectedStatistic]);

  if (loading) {
    // transitions.dev matrix loader, "twinkle" variant, dots scaled up from 2px.
    const cycle = cssMs('--matrix-cycle', 1200);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <div className="t-matrix [grid-template-columns:repeat(4,6px)] auto-rows-[6px] gap-[5px]" aria-hidden="true">
          {MATRIX_TWINKLE.map((order, i) => (
            <i key={i} className="rounded-full" style={{ '--d': Math.round(order * (cycle / 16)) }} />
          ))}
        </div>
        <span className="t-shimmer text-sm font-semibold uppercase tracking-widest" data-text={t('Loading matches')}>
          {t('Loading matches')}
        </span>
      </div>
    );
  }


  const transitionCues = {
    onMidPoint: () => {
      if (pendingTab) setActiveTab(pendingTab);
      if (pendingLeague !== undefined) setSelectedLeague(pendingLeague);
      if (pendingView) setView(pendingView);
    },
    onComplete: () => {
      setIsAnimating(false);
      setPendingTab(null);
      setPendingLeague(undefined);
      setPendingView(null);
    },
  };

  return (
    <AccountContext.Provider value={account}>
    <div className="min-h-screen text-zinc-200 selection:bg-emerald-500/30 font-sans relative">
      <BackgroundAnimation />
      {/* Entering a league plays its stinger; the other sections, the spiral. */}
      {pendingLeague
        ? <LeagueStinger isActive={isAnimating} meta={leagueMeta(leagues, pendingLeague)} {...transitionCues} />
        : <TransitionAnimation isActive={isAnimating} {...transitionCues} />}

      <BetSlipModal
        isOpen={isBetSlipOpen}
        onClose={() => setIsBetSlipOpen(false)}
        bets={bets}
        priceFor={priceForBet}
        betslipUrl={betslipUrl}
        onRemove={removeFromBet}
        onClear={clearBets}
      />

      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        leagues={availableLeagues}
        // Slip history settles itself against played matches, and every stat it
        // needs is already here - no endpoint, no stored result.
        matchData={matchData}
      />


      {view === 'landing' && (
        <LandingPage
          availableLeagues={availableLeagues}
          leaguesData={leagues}
          onSelectLeague={handleLeagueChange}
          onOpenTopCorners={() => handleViewChange('hot-matches')}
          onOpenHighestWinningFactor={() => handleViewChange('highest-winning-factor')}
          onOpenMarketMoves={() => handleViewChange('market-moves')}
        />
      )}

      {view === 'highest-winning-factor' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <HighestWinningFactor
            onBack={() => handleViewChange('landing')}
            matchData={winningFactorMatchData}
            notStartedLeagues={winningFactorNotStarted}
            fixturesData={currentSeasonFixtures}
            teamLogos={teamLogos}
            leagues={leagues}
            bets={bets}
            addToBet={addToBet}
            removeFromBet={removeFromBet}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
            onMatchClick={(match) => openMatchFrom(match, 'highest-winning-factor', tk('Back to Winning Factor'))}
          />
        </div>
      )}

      {view === 'hot-matches' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <HotMatches
            {...modelSettingsApi}
            priceFor={priceFor}
            pricedLines={pricedLines}
            outcomesFor={outcomesFor}
            loadMarket={loadMarket}
            stats={allStats}
            fixtures={currentSeasonFixtures}
            teamLogos={teamLogos}
            leagues={leagues}
            selectedStatistic={selectedStatistic}
            matchData={currentSeasonMatchData}
            onStatisticChange={(e) => setSelectedStatistic(e.target.value)}
            onBack={() => handleViewChange('landing')}
            bets={bets}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
            onMatchClick={(match) => openMatchFrom(match, 'hot-matches', tk('Back to Hot Matches'))}
          />
        </div>
      )}

      {view === 'market-moves' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <MarketMoves
            modelSettings={modelSettingsApi.modelSettings}
            teamLogos={teamLogos}
            leagues={leagues}
            selectedStatistic={selectedStatistic}
            matchData={currentSeasonMatchData}
            onStatisticChange={(e) => setSelectedStatistic(e.target.value)}
            onBack={() => handleViewChange('landing')}
            bets={bets}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
            onMatchClick={(match) => openMatchFrom(match, 'market-moves', tk('Back to Market Moves'))}
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
            showSound={true}
            showBetSlip={true}
            betsCount={bets.length}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
          >
            {/* Mobile and tablet: compact icon row. Switches at lg, not md: the
                desktop pill measures ~943px and md is 768px, so an iPad in
                portrait got a header wider than its own screen. */}
            <div className="flex items-center gap-2 lg:hidden">
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

              <SlidingTabs
                items={tabs}
                value={activeTab}
                onChange={handleNavTab}
                className="border border-white/5 shadow-lg shadow-black/20"
                tabClassName="font-semibold"
              />

              <div className="flex items-center gap-2 pl-2 border-l border-white/5">
                <button
                  onClick={() => handleViewChange('landing')}
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  title={t('Change League')}
                >
                  <Home className="w-5 h-5" />
                </button>
              </div>
            </div>
          </Header>

          {/* Mobile and tablet: floating bottom bar (test). */}
          <div className="lg:hidden">
            <LiquidNav
              items={[{ id: 'home', label: t('Leagues'), Icon: Home }, ...tabs]}
              value={activeTab}
              onChange={(id) => (id === 'home' ? handleViewChange('landing') : handleNavTab(id))}
            />
          </div>

          <main className="max-w-7xl mx-auto px-4 md:px-8 pb-28 lg:pb-12">
            {activeTab === 'team-details' && selectedTeam && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <TeamDetails
                  key={selectedTeam}
                  team={selectedTeam}
                  teamLogos={teamLogos}
                  matches={filteredMatchData}
                  fixtures={filteredFixtures}
                  leagues={leagues}
                  league={selectedLeague}
                  season={latestResultSeason}
                  modelMatchData={currentSeasonMatchData}
                  modelSettings={modelSettingsApi.modelSettings}
                  onBack={handleTeamBack}
                  onTeamClick={(team) => handleTeamClick(team)}
                  selectedStatistic={selectedStatistic}
                  onMatchClick={(match) => {
                    setBackView('dashboard');
                    setBackLabel(t('Back to {team}', { team: selectedTeam }));
                    setPreSelectedMatch(match);
                    handleTabChange('predictor');
                  }}
                />
              </div>
            )}

            {activeTab === 'predictor' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <Predictor
                  key={predictorKey}
                  {...modelSettingsApi}
                  priceFor={priceFor}
                  pricedLines={pricedLines}
                  outcomesFor={outcomesFor}
                  loadMarket={loadMarket}
                  stats={predictorStats}
                  // The prediction MODEL is built on every league, exactly as Hot
                  // Matches and Market Moves build theirs. One pooled model measured
                  // better than seven per-league ones, and more immediately: goals
                  // are converted from box touches by a ratio taken over whatever
                  // the model was trained on, so a league-only model gave the same
                  // fixture a different total (3.51 vs 2.91 for Jong Utrecht v
                  // Heracles) and flipped the sign of its EV between the two views.
                  modelMatchData={currentSeasonMatchData}
                  fixtures={filteredFixtures}
                  teamLogos={teamLogos}
                  leagues={leagues}
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
                      else setPredictorKey(k => k + 1);
                    } else {
                      // Instant, like the way in: `openMatchFrom` does not
                      // animate, so animating the way out was a spiral on one
                      // leg of the same round trip.
                      setView(backView);
                    }
                  }}
                  // Only when it is somewhere else: from the fixture list the
                  // back button already lands on the league.
                  onExitToLeague={backView === 'dashboard' ? undefined : () => {
                    setPreSelectedMatch(null);
                    setPredictorKey(k => k + 1);
                  }}
                  backButtonLabel={backLabel}
                  onTeamClick={handleTeamClick}
                />
              </div>
            )}

            {activeTab === 'standings' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <Standings
                  matchData={standingsMatchData}
                  teamLogos={teamLogos}
                  onTeamClick={handleTeamClick}
                  league={selectedLeague}
                  seasons={availableSeasons}
                  season={activeStandingsSeason}
                  latestSeason={latestSeason}
                  onSeasonChange={setStandingsSeason}
                  view={standingsView}
                  onViewChange={setStandingsView}
                  selectedStatistic={selectedStatistic}
                />
              </div>
            )}
          </main>
        </>
      )}
    </div>
    </AccountContext.Provider>
  );
}

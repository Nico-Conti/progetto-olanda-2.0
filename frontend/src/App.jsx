import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Trophy, Home } from 'lucide-react';
import Predictor from './components/Predictor';
import HotMatches from './components/HotMatches';
import LandingPage from './components/LandingPage';
import HighestWinningFactor from './components/HighestWinningFactor';
import MarketMoves from './components/MarketMoves';
import BonusPlanner from './components/BonusPlanner';
import TransitionAnimation from './components/TransitionAnimation';
import LeagueStinger from './components/LeagueStinger';
import PitchLoader from './components/PitchLoader';
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
import LegalFooter from './components/ui/LegalFooter';
import { t, tk, useLanguage, setLanguage } from './i18n';
import { parseRoute, buildPath, resolveBySlug } from './utils/routes';
import { useDeferredLocation } from './hooks/useDeferredLocation';

const TABS = [
  { id: 'predictor', label: tk('Predictor'), Icon: Calculator },
  { id: 'standings', label: tk('Standings'), Icon: Trophy },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('predictor');

  /* The URL is the source of truth for WHERE we are; `shown` is what is
     currently PAINTED, which lags behind it for the length of an entry
     animation. `navigate()` fires on the click, so Back, Forward, a refresh
     and a pasted link all work; the animation only delays the swap.

     This replaces `isAnimating` + pendingView/pendingLeague/pendingTab: the
     pending state IS `location`, and "are we animating" is the two disagreeing.
     It also makes cancellation free - see `useDeferredLocation`. */
  const navigate = useNavigate();
  const { location, shown, cue, animating, commit } = useDeferredLocation();
  const route = parseRoute(shown.pathname);

  const [selectedStatistic, setSelectedStatistic] = useState('corners');
  // Standings-only: null follows the league's current season, a label pins to
  // a past one. The Predictor always stays on the current season.
  const [standingsSeason, setStandingsSeason] = useState(null);
  const [standingsView, setStandingsView] = useState('table');
  const { matchData, fixturesData, teamLogos, leagues, shellLoading, loading, error, refetch } = useMatchData();
  // Where Back on a team page leads: one entry per team page opened, holding
  // the tab, team page and open match it was opened from, so hopping from
  // opponent to opponent unwinds one step at a time and a badge clicked on a
  // match page returns to that match.
  const [teamTrail, setTeamTrail] = useState([]);
  // Bumped to remount the Predictor on its fixture list, when a match it was
  // showing as a preview is closed while its tab stays open.
  const [predictorKey, setPredictorKey] = useState(0);

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
  // The setter is listed although React guarantees its identity: without it
  // React Compiler cannot preserve this memo and skips optimising the whole of
  // App. Semantically a no-op; do not "tidy" it back to [].
  const openAccount = useCallback(() => setIsAccountOpen(true), [setIsAccountOpen]);
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
    if (tab === activeTab || animating) return;
    setActiveTab(tab);
  };

  // Opening a match is going to a fixture, not entering a section, so it is
  // instant - the rule above, which the team page already followed and these
  // three did not. It also keeps the league stinger where it belongs:
  // `transitionFor` only plays it when the journey STARTS at the landing page.
  const openMatchFrom = (match, from, label) => {
    setPreSelectedMatch(match);
    setBackView(from);
    setBackLabel(label);
    setActiveTab('predictor');
    // Commit 4 gives a match its own URL. Until then this lands on the
    // league's path and keeps the match in `preSelectedMatch`, which is the
    // behaviour it had before - instant, no stinger.
    navigate(buildPath({ view: 'dashboard', league: match.league }), { state: { from: location.pathname } });
  };

  const handleLeagueChange = (league) => {
    const to = buildPath({ view: 'dashboard', league });
    if (to === location.pathname || animating) return;
    setSelectedTeam(null);
    setTeamTrail([]);
    setActiveTab('predictor');  // a league opens on the Predictor (was `pendingTab`)
    navigate(to);
  };

  /* Which animation plays is no longer decided here: `transitionFor` derives
     it from where we came from, so leaving a section stays instant and the
     FORWARD button replays the stinger, which the old machine could not do. */
  const handleViewChange = (newView) => {
    const to = buildPath({ view: newView });
    if (to === location.pathname || animating) return;
    if (newView === 'landing') setPreSelectedMatch(null);
    navigate(to);
  };

  // `fromMatch`: the match on screen when the badge was clicked, to return to.
  const handleTeamClick = (team, fromMatch = null) => {
    if (animating) return;
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
    const fromMatches = new Set(matchData.map(m => m.league).filter(Boolean));
    // Fallback if league is missing in some data
    if (fromMatches.size === 0 && matchData.length > 0) return ['Eredivisie', 'La Liga'];
    // /matches is 5.5MB and ~12s away; the League table is 5KB and already here,
    // so the picker fills from it in the meantime. Match data wins the moment it
    // lands, because that table is hand-maintained and can name a league that
    // has no matches - this way it only ever covers the gap, never outlives it.
    if (fromMatches.size === 0) return leagues.map(l => l.name).filter(Boolean).sort();
    return Array.from(fromMatches).sort();
  }, [matchData, leagues]);

  /* The league in the URL, resolved to its display name. Slugs are lossy, so
     this compares slugified candidates rather than parsing the slug back.
     It resolves off the 5KB shell (availableLeagues falls back to the League
     table), so a league deep link paints its chrome in ~0.3s and only the
     content waits on the 5.5MB. */
  const selectedLeague = route.league ? resolveBySlug(availableLeagues, route.league) : null;

  /* Commit 5 replaces both of these fallbacks with a real not-found panel and
     a retry. Until then an unknown path or an unresolvable league renders the
     landing page rather than crashing - wrong URL, but nothing breaks. */
  const unresolved = route.view === 'dashboard' && !shellLoading && !selectedLeague;
  const view = (route.view === 'not-found' || unresolved) ? 'landing' : route.view;

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
  const { priceFor, priceForBet, pricedLines, outcomesFor, loadMarket, betslipUrl, rows: oddsRows, loading: oddsLoading } = useOdds();
  // One copy of the model knobs for every screen that predicts. Held here, not
  // per screen: three private copies gave the same fixture different expected
  // values depending on which view you were standing in.
  const modelSettingsApi = useModelSettings();

  const predictorStats = useMemo(() => processData(predictorMatchData, selectedStatistic), [predictorMatchData, selectedStatistic]);
  const allStats = useMemo(() => processData(currentSeasonMatchData, selectedStatistic), [currentSeasonMatchData, selectedStatistic]);

  /* The landing page renders as soon as the shell is in (~0.3s). Only a
     league's dashboard waits on the 5.5MB of match data, so the pause lands
     after you have chosen a league, not before you can see the site at all.

     A FLAG, NOT AN EARLY RETURN - and that fixes a bug that predates routing.
     Returning here short-circuited the whole tree, overlay included: entering
     a league before /matches had landed unmounted the stinger mid-flight, so
     its onComplete never fired, the pending state was never cleared, and the
     stinger played a SECOND time when the data arrived. Rendered inside the
     tree the loader sits under the overlay, which is what the midpoint swap
     was designed for. */
  const busy = shellLoading || (loading && view !== 'landing');


  /* The swap happens under the cover, exactly as before - only what it swaps
     is the rendered LOCATION rather than three pending variables. `onComplete`
     is a safety net: `shown === location` is what unmounts the overlay, so
     both cues are idempotent. */
  const transitionCues = { onMidPoint: commit, onComplete: commit };

  return (
    <AccountContext.Provider value={account}>
    <div className="min-h-screen text-zinc-200 selection:bg-emerald-500/30 font-sans relative">
      <BackgroundAnimation />
      {/* Entering a league plays its stinger; the other sections, the spiral. */}
      {/* keyed on the destination, so a second navigation restarts the
          overlay rather than being refused by a nav lock: last click wins. */}
      {cue?.kind === 'stinger'
        ? <LeagueStinger key={location.key} isActive={animating}
            meta={leagueMeta(leagues, resolveBySlug(availableLeagues, cue.league))} {...transitionCues} />
        : <TransitionAnimation key={location.key} isActive={animating && cue?.kind === 'spiral'} {...transitionCues} />}

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


      {busy && <PitchLoader />}

      {!busy && (<>
      {view === 'landing' && (
        <LandingPage
          availableLeagues={availableLeagues}
          leaguesData={leagues}
          loadError={error}
          onRetry={refetch}
          onSelectLeague={handleLeagueChange}
          onOpenTopCorners={() => handleViewChange('hot-matches')}
          onOpenHighestWinningFactor={() => handleViewChange('highest-winning-factor')}
          onOpenMarketMoves={() => handleViewChange('market-moves')}
          onOpenBonusPlanner={() => handleViewChange('bonus-planner')}
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

      {view === 'bonus-planner' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <BonusPlanner
            oddsRows={oddsRows}
            // Matches load after the shell now; without them the model has
            // nothing, and slips ranked on the book alone would reshuffle when they land.
            oddsLoading={oddsLoading || loading}
            loadMarket={loadMarket}
            matchData={currentSeasonMatchData}
            modelSettings={modelSettingsApi.modelSettings}
            teamLogos={teamLogos}
            onBack={() => handleViewChange('landing')}
            bets={bets}
            addToBet={addToBet}
            removeFromBet={removeFromBet}
            onOpenBetSlip={() => setIsBetSlipOpen(true)}
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

          {/* The bottom clearance for the fixed LiquidNav moved to LegalFooter
              below, which is now the last thing in the scroll flow. */}
          <main className="max-w-7xl mx-auto px-4 md:px-8 pb-8 lg:pb-12">
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
                      // leg of the same round trip. It stays instant for free
                      // now - `transitionFor` only animates away from '/'.
                      navigate(buildPath({ view: backView }));
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

          <LegalFooter />
        </>
      )}
      </>)}
    </div>
    </AccountContext.Provider>
  );
}

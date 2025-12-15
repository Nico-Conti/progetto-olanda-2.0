import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, Calculator, Trophy, Menu, X } from 'lucide-react';
import LeagueTrends from './components/LeagueTrends';
import Predictor from './components/Predictor';
import HotMatches from './components/HotMatches';
import LandingPage from './components/LandingPage';
import HighestWinningFactor from './components/HighestWinningFactor';
import TransitionAnimation from './components/TransitionAnimation';
import BackgroundAnimation from './components/BackgroundAnimation';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';
import { useBackendHealth } from './hooks/useBackendHealth';
import StatisticSelector from './components/StatisticSelector';
import ToggleSwitch from './components/ui/ToggleSwitch';
import BetSlipModal from './components/BetSlipModal';
import Header from './components/Header';
export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'hot-matches'
  const [selectedStatistic, setSelectedStatistic] = useState('corners');
  const { matchData, fixturesData, teamLogos, leagues, loading } = useMatchData();
  const isBackendOnline = useBackendHealth();

  // Animation State
  const [isAnimationEnabled, setIsAnimationEnabled] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingLeague, setPendingLeague] = useState(undefined);
  const [pendingView, setPendingView] = useState(null);
  const [matchStatistics, setMatchStatistics] = useState({});
  const [preSelectedMatch, setPreSelectedMatch] = useState(null);
  const [backView, setBackView] = useState('hot-matches');
  const [backLabel, setBackLabel] = useState('Back to Hot Matches');

  // Bet Slip State
  const [bets, setBets] = useState([]);
  const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const addToBet = (game, option, value, stat) => {
    setBets(prev => {
      const existingIndex = prev.findIndex(b => b.game === game);
      if (existingIndex >= 0) {
        const newBets = [...prev];
        newBets[existingIndex] = { game, option, value, stat };
        return newBets;
      }
      return [...prev, { game, option, value, stat }];
    });
  };

  const removeFromBet = (game) => {
    setBets(prev => prev.filter(b => b.game !== game));
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
      setIsAnimating(true);
    } else {
      setSelectedLeague(league);
      setView('dashboard');
    }
  };

  const handleViewChange = (newView) => {
    if (newView === view || isAnimating) return;

    if (isAnimationEnabled) {
      setPendingView(newView);
      setIsAnimating(true);
    } else {
      setView(newView);
    }
  };

  // Extract unique leagues from data
  const availableLeagues = useMemo(() => {
    const leagues = new Set(matchData.map(m => m.league).filter(Boolean));
    // Fallback if league is missing in some data
    if (leagues.size === 0 && matchData.length > 0) return ['Eredivisie', 'La Liga'];
    return Array.from(leagues).sort();
  }, [matchData]);

  // Filter data based on selection
  const filteredMatchData = useMemo(() => {
    if (!selectedLeague) return [];
    return matchData.filter(m => m.league === selectedLeague || !m.league); // !m.league fallback for old data
  }, [matchData, selectedLeague]);

  const filteredFixtures = useMemo(() => {
    if (!selectedLeague) return [];
    // Fixtures might not have league column yet? Assuming they do or we filter by team names present in matchData
    // For now, let's assume fixtures also have league or we just show all if we can't filter easily.
    // Ideally fixtures table should have league column.
    return fixturesData;
  }, [fixturesData, selectedLeague]);

  const stats = useMemo(() => processData(filteredMatchData, selectedStatistic), [filteredMatchData, selectedStatistic]);
  const allStats = useMemo(() => processData(matchData, selectedStatistic), [matchData, selectedStatistic]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-200">Loading...</div>;
  }

  const appTitle = (
    <h1 className="text-lg font-black tracking-tight text-white leading-none">
      Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
    </h1>
  );

  const hotMatchesTitle = (
    <h1 className="text-lg font-black tracking-tight text-white leading-none">
      Hot <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Matches</span>
    </h1>
  );

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
        />
      )}

      {view === 'highest-winning-factor' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <HighestWinningFactor
            onBack={() => handleViewChange('landing')}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            matchData={matchData}
            fixturesData={fixturesData}
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
            stats={allStats}
            fixtures={fixturesData}
            teamLogos={teamLogos}
            isAnimationEnabled={isAnimationEnabled}
            onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
            selectedStatistic={selectedStatistic}
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

      {view === 'dashboard' && (
        <>
          {/* Navbar */}
          {/* Navbar */}
          <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 mb-8 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between">
              <div className="flex flex-col items-center gap-0.5">
                <img
                  src="/logo.png"
                  alt="Progetto Olanda 2.0"
                  className="w-10 h-10 md:w-12 md:h-12 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
                  onClick={() => handleViewChange('landing')}
                />
                <h1
                  className="text-sm md:text-lg font-black tracking-tight text-white leading-none cursor-pointer hidden sm:block"
                  onClick={() => handleViewChange('landing')}
                >
                  Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                </h1>
                <div className="flex items-center gap-2 mt-1 hidden sm:flex">
                  <div className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isBackendOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isBackendOnline ? 'Backend Online' : 'Backend Offline'}
                  </span>
                </div>
              </div>

              {/* Mobile Actions (Bet Slip + Menu) */}
              <div className="flex items-center gap-3 md:hidden">
                <button
                  onClick={() => setIsBetSlipOpen(true)}
                  className="relative p-2 bg-zinc-900 border border-white/10 rounded-lg text-zinc-400"
                >
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                    {bets.length}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </button>
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-4">

                <StatisticSelector
                  value={selectedStatistic}
                  onChange={(e) => setSelectedStatistic(e.target.value)}
                  className="w-[180px]"
                />
                <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-white/5">

                  <button
                    onClick={() => handleTabChange('trends')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'trends'
                      ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden md:inline">Trends</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('predictor')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'predictor'
                      ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                  >
                    <Calculator className="w-4 h-4" />
                    <span className="hidden md:inline">Predictor</span>
                  </button>
                  <button
                    onClick={() => handleViewChange('landing')}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  >
                    <Trophy className="w-4 h-4" />
                    <span className="hidden md:inline">Change League</span>
                  </button>
                  <button
                    onClick={() => {
                      const audio = new Audio('/sounds/malepisello.mp3');
                      audio.playbackRate = Math.random() * (1.5 - 0.5) + 0.5;
                      audio.play().catch(e => console.log("Audio play failed (file might be missing):", e));
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    title="Play Sound"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                    >
                      <path d="M10 13V6a2 2 0 0 1 4 0v7" />
                      <circle cx="8" cy="15" r="3" />
                      <circle cx="16" cy="15" r="3" />
                    </svg>
                  </button>

                </div>

                {/* Bet Slip Button */}
                <button
                  onClick={() => setIsBetSlipOpen(true)}
                  className="relative p-2 bg-zinc-900 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:border-emerald-500/50 transition-all group ml-4"
                >
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                    {bets.length}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 group-hover:scale-110 transition-transform">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </button>

                {/* Animation Toggle */}
                <ToggleSwitch
                  isOn={isAnimationEnabled}
                  onToggle={() => setIsAnimationEnabled(!isAnimationEnabled)}
                />
              </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
              <div className="md:hidden border-t border-white/5 bg-zinc-950/95 backdrop-blur-xl animate-in slide-in-from-top-2">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">View</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { handleTabChange('trends'); setIsMobileMenuOpen(false); }}
                        className={`p-3 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'trends' ? 'bg-zinc-800 border-emerald-500/50 text-white' : 'bg-zinc-900/50 border-white/10 text-zinc-400'}`}
                      >
                        <TrendingUp className="w-4 h-4" /> Trends
                      </button>
                      <button
                        onClick={() => { handleTabChange('predictor'); setIsMobileMenuOpen(false); }}
                        className={`p-3 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'predictor' ? 'bg-zinc-800 border-emerald-500/50 text-white' : 'bg-zinc-900/50 border-white/10 text-zinc-400'}`}
                      >
                        <Calculator className="w-4 h-4" /> Predictor
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Statistic</label>
                    <StatisticSelector
                      value={selectedStatistic}
                      onChange={(e) => setSelectedStatistic(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => { handleViewChange('landing'); setIsMobileMenuOpen(false); }}
                      className="p-3 bg-zinc-900 rounded-lg border border-white/10 text-zinc-300 text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <Trophy className="w-4 h-4" /> Change League
                    </button>
                    <div className="flex items-center justify-between bg-zinc-900 p-2 px-3 rounded-lg border border-white/10">
                      <span className="text-xs font-bold text-zinc-400">Animations</span>
                      <ToggleSwitch
                        isOn={isAnimationEnabled}
                        onToggle={() => setIsAnimationEnabled(!isAnimationEnabled)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </nav>

          <main className="max-w-7xl mx-auto px-4 md:px-8 pb-12">
            {activeTab === 'trends' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LeagueTrends stats={stats} teamLogos={teamLogos} selectedStatistic={selectedStatistic} />
              </div>
            )}

            {activeTab === 'predictor' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <Predictor
                  stats={stats}
                  fixtures={filteredFixtures}
                  teams={teams}
                  teamLogos={teamLogos}
                  selectedStatistic={selectedStatistic}
                  matchData={filteredMatchData}
                  matchStatistics={matchStatistics}
                  setMatchStatistics={setMatchStatistics}
                  addToBet={addToBet}
                  bets={bets}
                  preSelectedMatch={preSelectedMatch}
                  onExitPreview={() => {
                    setPreSelectedMatch(null);
                    handleViewChange(backView);
                  }}
                  backButtonLabel={backLabel}
                />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

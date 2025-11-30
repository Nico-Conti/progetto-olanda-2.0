import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, Calculator, Trophy, Zap, ZapOff } from 'lucide-react';
import LeagueTrends from './components/LeagueTrends';
import Predictor from './components/Predictor';
import TransitionAnimation from './components/TransitionAnimation';
import LandingPage from './components/LandingPage';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';
import { useBackendHealth } from './hooks/useBackendHealth';

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isAnimationEnabled, setIsAnimationEnabled] = useState(true);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingLeague, setPendingLeague] = useState(undefined);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const { matchData, fixturesData, loading } = useMatchData();
  const isBackendOnline = useBackendHealth();

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

  const stats = useMemo(() => processData(filteredMatchData), [filteredMatchData]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

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
    if (league === selectedLeague || isAnimating) return;

    if (isAnimationEnabled) {
      setPendingLeague(league);
      setIsAnimating(true);
    } else {
      setSelectedLeague(league);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-200">Loading...</div>;
  }

  // If no league selected, show Landing Page
  // But we still want to render the TransitionAnimation if it's active!
  // So we cannot just return early here if we want the animation to be visible ON TOP of the landing page
  // OR we render LandingPage as a component inside the main return.

  // Current structure:
  // if (!selectedLeague) return <LandingPage ... />

  // If we are animating FROM LandingPage TO Main, selectedLeague is null initially.
  // Animation starts. Midpoint: selectedLeague becomes 'Eredivisie'.
  // Component re-renders. !selectedLeague is false. Main renders.

  // If we are animating FROM Main TO LandingPage, selectedLeague is 'Eredivisie'.
  // Animation starts. Midpoint: selectedLeague becomes null.
  // Component re-renders. !selectedLeague is true. LandingPage renders.

  // The TransitionAnimation needs to be rendered in BOTH cases.
  // So we should wrap the conditional rendering inside the main return, or include TransitionAnimation in LandingPage too?
  // Better: Lift TransitionAnimation to the top level and conditionally render content below it.

  return (
    <div className="min-h-screen text-zinc-200 pb-12 selection:bg-emerald-500/30 font-sans">
      <TransitionAnimation
        isActive={isAnimating}
        onMidPoint={() => {
          if (pendingTab) setActiveTab(pendingTab);
          if (pendingLeague !== undefined) setSelectedLeague(pendingLeague);
        }}
        onComplete={() => {
          setIsAnimating(false);
          setPendingTab(null);
          setPendingLeague(undefined);
        }}
      />

      {!selectedLeague ? (
        <LandingPage
          availableLeagues={availableLeagues}
          onSelectLeague={handleLeagueChange}
          isAnimationEnabled={isAnimationEnabled}
          onToggleAnimation={() => setIsAnimationEnabled(!isAnimationEnabled)}
        />
      ) : (
        <>
          {/* Navbar */}
          <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 mb-8 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between">
              <div className="flex flex-col items-center gap-0.5">
                <img
                  src="/logo.png"
                  alt="Progetto Olanda 2.0"
                  className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
                  onClick={() => handleLeagueChange(null)}
                />
                <h1
                  className="text-lg font-black tracking-tight text-white leading-none cursor-pointer"
                  onClick={() => handleLeagueChange(null)}
                >
                  Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isBackendOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isBackendOnline ? 'Backend Online' : 'Backend Offline'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
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
                    onClick={() => handleLeagueChange(null)}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  >
                    <Trophy className="w-4 h-4" />
                    <span className="hidden md:inline">Change League</span>
                  </button>
                  <button
                    onClick={() => {
                      const audio = new Audio('/sounds/malepisello.mp3');
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

                {/* Animation Toggle */}
                <button
                  onClick={() => setIsAnimationEnabled(!isAnimationEnabled)}
                  className={`p-2 rounded-lg border transition-all ${isAnimationEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300'
                    }`}
                  title={isAnimationEnabled ? "Disable Animations" : "Enable Animations"}
                >
                  {isAnimationEnabled ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </nav>

          <main className="max-w-7xl mx-auto px-4 md:px-8">
            {activeTab === 'trends' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LeagueTrends stats={stats} />
              </div>
            )}

            {activeTab === 'predictor' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <Predictor
                  stats={stats}
                  fixtures={filteredFixtures}
                  teams={teams}
                />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

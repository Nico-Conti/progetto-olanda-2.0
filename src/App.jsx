import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, Calculator } from 'lucide-react';
import LeagueTrends from './components/LeagueTrends';
import Predictor from './components/Predictor';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const { matchData, fixturesData, loading } = useMatchData();

  const stats = useMemo(() => processData(matchData), [matchData]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-200">Loading...</div>;
  }

  return (
    <div className="min-h-screen text-zinc-200 pb-12 selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 mb-8 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-400 to-cyan-500 p-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Activity className="w-5 h-5 text-zinc-950" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">
              Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
            </h1>
          </div>

          <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-white/5">
            <button
              onClick={() => setActiveTab('trends')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'trends'
                ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="hidden md:inline">Trends</span>
            </button>
            <button
              onClick={() => setActiveTab('predictor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'predictor'
                ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden md:inline">Predictor</span>
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
              fixtures={fixturesData}
              teams={teams}
            />
          </div>
        )}
      </main>
    </div>
  );
}

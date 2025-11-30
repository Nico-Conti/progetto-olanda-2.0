import React, { useState, useEffect, useMemo } from 'react';
import { Activity, TrendingUp, Zap, Server } from 'lucide-react';
import LeagueTrends from './components/LeagueTrends';
import Predictor from './components/Predictor';
import { useMatchData } from './hooks/useMatchData';
import { processData } from './utils/stats';
import { checkHealth } from './services/api';

const App = () => {
  const [activeTab, setActiveTab] = useState('predictor');
  const { matchData, fixturesData, loading, error } = useMatchData();
  const [backendStatus, setBackendStatus] = useState(false);

  const stats = useMemo(() => processData(matchData), [matchData]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

  useEffect(() => {
    const verifyBackend = async () => {
      const health = await checkHealth();
      setBackendStatus(!!health);
    };
    verifyBackend();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          <div className="text-zinc-400 font-mono animate-pulse">Loading Eredivisie Data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-red-500 font-mono">Error loading data: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-2 flex items-center gap-3">
              <Activity className="w-10 h-10 text-emerald-500" />
              PROGETTO OLANDA <span className="text-emerald-500">2.0</span>
            </h1>
            <p className="text-zinc-400 font-medium flex items-center gap-2">
              Advanced Eredivisie Analytics & Predictions
              {backendStatus ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  <Server className="w-3 h-3" /> Backend Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                  <Server className="w-3 h-3" /> Backend Offline
                </span>
              )}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex bg-zinc-900/50 p-1.5 rounded-xl border border-white/5 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('predictor')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all duration-300 ${activeTab === 'predictor'
                ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <Zap className="w-4 h-4" />
              Match Predictor
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all duration-300 ${activeTab === 'trends'
                ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <TrendingUp className="w-4 h-4" />
              League Trends
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'predictor' ? (
            <Predictor stats={stats} fixtures={fixturesData} teams={teams} />
          ) : (
            <LeagueTrends stats={stats} />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;

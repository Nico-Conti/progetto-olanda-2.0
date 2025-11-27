import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Activity,
  Calculator,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Snowflake,
  ChevronRight,
  Trophy,
  Calendar
} from 'lucide-react';
import MATCH_DATA from './data/eredivisie_con_giornate.json';

// --- UTILS & LOGIC ---

const processData = (matches) => {
  const teamStats = {};

  matches.forEach(match => {
    const homeTeam = match.squadre.home;
    const awayTeam = match.squadre.away;
    const cHome = parseInt(match.calci_d_angolo.home, 10);
    const cAway = parseInt(match.calci_d_angolo.away, 10);
    const total = cHome + cAway;
    const giornata = match.giornata;

    if (!teamStats[homeTeam]) {
      teamStats[homeTeam] = { home_for: [], home_ag: [], home_totals: [], away_for: [], away_ag: [], away_totals: [], all_matches: [] };
    }
    if (!teamStats[awayTeam]) {
      teamStats[awayTeam] = { home_for: [], home_ag: [], home_totals: [], away_for: [], away_ag: [], away_totals: [], all_matches: [] };
    }

    // Home Team Stats
    teamStats[homeTeam].home_for.push(cHome);
    teamStats[homeTeam].home_ag.push(cAway);
    teamStats[homeTeam].home_totals.push(total);
    teamStats[homeTeam].all_matches.push({ opponent: awayTeam, location: 'Home', cornersFor: cHome, cornersAg: cAway, total, giornata });

    // Away Team Stats
    teamStats[awayTeam].away_for.push(cAway);
    teamStats[awayTeam].away_ag.push(cHome);
    teamStats[awayTeam].away_totals.push(total);
    teamStats[awayTeam].all_matches.push({ opponent: homeTeam, location: 'Away', cornersFor: cAway, cornersAg: cHome, total, giornata });
  });

  return teamStats;
};

const getAvg = (list) => list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;

const getTrendData = (list, nGames) => {
  if (!list || list.length === 0) return { season: 0, recent: 0, diff: 0 };

  const seasonAvg = getAvg(list);
  const recentSlice = nGames === 'all' ? list : list.slice(0, nGames);
  const recentAvg = getAvg(recentSlice);

  return {
    season: seasonAvg,
    recent: recentAvg,
    diff: recentAvg - seasonAvg
  };
};

const TrendBadge = ({ diff }) => {
  if (diff > 1.5) return (
    <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.2)]">
      <Flame className="w-3.5 h-3.5 fill-current" />
      <span>Very Hot</span>
    </div>
  );
  if (diff > 0.5) return (
    <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-orange-500/20 shadow-[0_0_10px_rgba(251,146,60,0.2)]">
      <TrendingUp className="w-3.5 h-3.5" />
      <span>Hot</span>
    </div>
  );
  if (diff < -0.5) return (
    <div className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-500/20">
      <Snowflake className="w-3.5 h-3.5" />
      <span>Cold</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 text-zinc-500 bg-zinc-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-500/20">
      <Minus className="w-3.5 h-3.5" />
      <span>Stable</span>
    </div>
  );
};

// --- COMPONENTS ---

const LeagueTrends = ({ stats, nGames = 5 }) => {
  const teams = Object.keys(stats).sort();

  return (
    <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
      <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/40">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            League Trends
          </h2>
          <p className="text-zinc-400 text-sm mt-1">Analysis based on last {nGames} games</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-zinc-300">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
            <tr>
              <th className="px-5 py-3 font-bold tracking-wider text-sm">Team</th>
              <th className="px-3 py-3 text-center border-l border-white/5 bg-emerald-500/5 text-emerald-500 font-bold" colSpan={4}>Home Stats</th>
              <th className="px-3 py-3 text-center border-l border-white/5 bg-blue-500/5 text-blue-500 font-bold" colSpan={4}>Away Stats</th>
            </tr>
            <tr>
              <th className="px-5 py-3"></th>

              <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-emerald-500/5">Avg For</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5">Avg Ag.</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-400">Tot (L{nGames})</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5">Trend</th>

              <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-blue-500/5">Avg For</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5">Avg Ag.</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-400">Tot (L{nGames})</th>
              <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm">
            {teams.map(team => {
              const hTrend = getTrendData(stats[team].home_totals, nGames);
              const aTrend = getTrendData(stats[team].away_totals, nGames);

              const hForAvg = getAvg(stats[team].home_for);
              const hAgAvg = getAvg(stats[team].home_ag);
              const aForAvg = getAvg(stats[team].away_for);
              const aAgAvg = getAvg(stats[team].away_ag);

              return (
                <tr key={team} className="hover:bg-white/[0.03] transition-colors group">
                  <td className="px-5 py-3 font-bold text-white text-base group-hover:text-emerald-400 transition-colors border-r border-white/5">
                    {team}
                  </td>

                  {/* Home Stats */}
                  <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base">{hForAvg.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{hAgAvg.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center font-black text-white font-mono text-lg bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">{hTrend.recent.toFixed(1)}</td>
                  <td className="px-3 py-3 flex justify-center items-center h-full"><TrendBadge diff={hTrend.diff} /></td>

                  {/* Away Stats */}
                  <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base border-l border-white/5">{aForAvg.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{aAgAvg.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center font-black text-white font-mono text-lg bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">{aTrend.recent.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center"><TrendBadge diff={aTrend.diff} /></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Predictor = ({ stats, teams }) => {
  const [home, setHome] = useState(teams[0]);
  const [away, setAway] = useState(teams[1]);
  const [nGames, setNGames] = useState(5);

  const getRelevantMatches = (team, locationFilter, n) => {
    if (!stats[team]) return [];
    let matches = stats[team].all_matches.filter(m => m.location === locationFilter);
    matches.sort((a, b) => b.giornata - a.giornata);
    if (n !== 'all') matches = matches.slice(0, n);
    return matches;
  };

  const homeMatches = getRelevantMatches(home, 'Home', nGames);
  const awayMatches = getRelevantMatches(away, 'Away', nGames);

  const calculatePrediction = () => {
    if (!stats[home] || !stats[away]) return null;
    const hFor = getAvg(homeMatches.map(m => m.cornersFor));
    const hAg = getAvg(homeMatches.map(m => m.cornersAg));
    const aFor = getAvg(awayMatches.map(m => m.cornersFor));
    const aAg = getAvg(awayMatches.map(m => m.cornersAg));

    const expHome = (hFor + aAg) / 2;
    const expAway = (aFor + hAg) / 2;
    const total = expHome + expAway;

    return { expHome, expAway, total };
  };

  const prediction = calculatePrediction();

  const MatchHistoryCard = ({ team, matches, type }) => (
    <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
        <h4 className="font-bold text-white flex items-center gap-3 text-lg">
          {type === 'Home' ? <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> : <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
          {team}
        </h4>
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{type} Form</span>
      </div>
      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
        {matches.length > 0 ? matches.map(m => (
          <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 font-bold uppercase">MD {m.giornata}</span>
              <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">For</span>
                <span className="text-sm font-bold text-emerald-400">{m.cornersFor}</span>
              </div>
              <div className="w-px h-6 bg-white/10"></div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Ag</span>
                <span className="text-sm font-bold text-red-400">{m.cornersAg}</span>
              </div>
              <div className="w-px h-6 bg-white/10"></div>
              <div className="flex flex-col items-center min-w-[30px]">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                <span className="text-base font-black text-white">{m.total}</span>
              </div>
            </div>
          </div>
        )) : <p className="text-zinc-500 text-sm italic text-center py-4">No matches found.</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Controls & Prediction Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Controls */}
        <div className="lg:col-span-4 space-y-4">
          <div className="glass-panel p-5 rounded-xl border border-white/10">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-400" />
              Configuration
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Home Team</label>
                  <div className="relative">
                    <select
                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium"
                      value={home}
                      onChange={(e) => setHome(e.target.value)}
                    >
                      {teams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Away Team</label>
                  <div className="relative">
                    <select
                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                      value={away}
                      onChange={(e) => setAway(e.target.value)}
                    >
                      {teams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Sample Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 'all'].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNGames(n)}
                      className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                          ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                    >
                      {n === 'all' ? 'Season' : `Last ${n}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prediction Result */}
        <div className="lg:col-span-8">
          {prediction && (
            <div className="h-full glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-emerald-500/20 transition-all duration-700"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700"></div>

              <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                <div className="flex items-center justify-center gap-8 mb-8 w-full">
                  <div className="text-right flex-1">
                    <div className="text-2xl font-bold text-white truncate">{home}</div>
                    <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {prediction.expHome.toFixed(2)}</div>
                  </div>

                  <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${prediction.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                    {prediction.total.toFixed(1)}
                  </div>

                  <div className="text-left flex-1">
                    <div className="text-2xl font-bold text-white truncate">{away}</div>
                    <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {prediction.expAway.toFixed(2)}</div>
                  </div>
                </div>

                {prediction.total > 11.5 ? (
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                    <Flame className="w-4 h-4 fill-current" />
                    <span className="font-bold text-sm uppercase tracking-wide">High Over Trend</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                    <Info className="w-4 h-4" />
                    <span className="font-medium text-sm">Standard Projection</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MatchHistoryCard team={home} matches={homeMatches} type="Home" />
        <MatchHistoryCard team={away} matches={awayMatches} type="Away" />
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');

  const stats = useMemo(() => processData(MATCH_DATA), []);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

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
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-8">
        {activeTab === 'trends' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <LeagueTrends stats={stats} nGames={5} />
          </div>
        )}

        {activeTab === 'predictor' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Predictor stats={stats} teams={teams} />
          </div>
        )}
      </main>
    </div>
  );
}

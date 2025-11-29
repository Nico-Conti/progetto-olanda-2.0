import React, { useState, useMemo, useEffect } from 'react';
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
import { TEAM_LOGOS } from './data/teamLogos';
import { supabase } from './lib/supabaseClient';

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

const LeagueTrends = ({ stats }) => {
  const [sliderValue, setSliderValue] = useState(1); // 0: 3, 1: 5, 2: 10, 3: All
  const options = [3, 5, 10, 'all'];
  const nGames = options[sliderValue];

  const teams = Object.keys(stats).sort();

  return (
    <div className="space-y-6">
      {/* Controls & Legend */}
      <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-col gap-2 w-full md:w-1/3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-zinc-400 uppercase tracking-wide">Trend Sample</span>
            <span className="text-emerald-400 font-bold font-mono text-lg">
              {nGames === 'all' ? 'Season' : `Last ${nGames}`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={sliderValue}
            onChange={(e) => setSliderValue(parseInt(e.target.value))}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase px-1">
            <span>3</span>
            <span>5</span>
            <span>10</span>
            <span>All</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-zinc-900/50 p-4 rounded-xl border border-white/5 w-full md:w-auto">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-zinc-400" />
            <span className="font-bold text-zinc-300 uppercase text-xs">Trend Legend</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="font-mono bg-white/5 px-1 rounded">Diff</span>
              <span>= Avg(L{nGames}) - Avg(Season)</span>
            </div>
            <div className="w-px h-4 bg-white/10 hidden md:block"></div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-red-400" />
              <span className="font-bold text-red-400">&gt; +1.5</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <span className="font-bold text-orange-400">&gt; +0.5</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Snowflake className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-blue-400">&lt; -0.5</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
        <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/40">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              League Trends
            </h2>
            <p className="text-zinc-400 text-sm mt-1">Comparing Season Averages vs Recent Form ({nGames === 'all' ? 'Entire Season' : `Last ${nGames} Games`})</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-zinc-300">
            <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
              <tr>
                <th className="px-5 py-3 font-bold tracking-wider text-sm">Team</th>
                <th className="px-3 py-3 text-center border-l border-white/5 bg-emerald-500/5 text-emerald-500 font-bold" colSpan={5}>Home Stats</th>
                <th className="px-3 py-3 text-center border-l border-white/5 bg-blue-500/5 text-blue-500 font-bold" colSpan={5}>Away Stats</th>
              </tr>
              <tr>
                <th className="px-5 py-3"></th>

                <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-emerald-500/5" title="Season Average For">Avg For (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5" title="Season Average Against">Avg Ag (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-zinc-400" title="Season Average Total">Avg Tot (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-400" title={`Average Total Last ${nGames}`}>Avg Tot (L{nGames})</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5">Trend</th>

                <th className="px-3 py-3 text-center font-bold tracking-wider border-l border-white/5 bg-blue-500/5" title="Season Average For">Avg For (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5" title="Season Average Against">Avg Ag (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-zinc-400" title="Season Average Total">Avg Tot (Sea)</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-400" title={`Average Total Last ${nGames}`}>Avg Tot (L{nGames})</th>
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
                    <td className="px-5 py-3 font-bold text-white text-base group-hover:text-emerald-400 transition-colors border-r border-white/5 flex items-center gap-3">
                      <img src={TEAM_LOGOS[team]} alt={team} className="w-6 h-6 object-contain" />
                      {team}
                    </td>

                    {/* Home Stats */}
                    <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base">{hForAvg.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{hAgAvg.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center text-zinc-400 font-mono font-medium text-base">{hTrend.season.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center font-black text-white font-mono text-lg bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">{hTrend.recent.toFixed(1)}</td>
                    <td className="px-3 py-3 flex justify-center items-center h-full"><TrendBadge diff={hTrend.diff} /></td>

                    {/* Away Stats */}
                    <td className="px-3 py-3 text-center text-emerald-300 font-mono font-medium text-base border-l border-white/5">{aForAvg.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center text-red-300 font-mono font-medium text-base">{aAgAvg.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center text-zinc-400 font-mono font-medium text-base">{aTrend.season.toFixed(1)}</td>
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
    </div>
  );
};

const calculatePrediction = (home, away, stats, nGames = 5) => {
  if (!stats[home] || !stats[away]) return null;

  const getRelevant = (team, loc) => {
    let matches = stats[team].all_matches.filter(m => m.location === loc);
    matches.sort((a, b) => b.giornata - a.giornata);

    // Handle sample size: 'all', number, or default to 5 if invalid/empty
    const limit = nGames === 'all' ? null : (Number(nGames) || 5);
    if (limit) matches = matches.slice(0, limit);

    return matches;
  };

  const homeMatches = getRelevant(home, 'Home');
  const awayMatches = getRelevant(away, 'Away');

  const getAvg = (list) => list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;

  const hFor = getAvg(homeMatches.map(m => m.cornersFor));
  const hAg = getAvg(homeMatches.map(m => m.cornersAg));
  const aFor = getAvg(awayMatches.map(m => m.cornersFor));
  const aAg = getAvg(awayMatches.map(m => m.cornersAg));

  const expHome = (hFor + aAg) / 2;
  const expAway = (aFor + hAg) / 2;
  const total = expHome + expAway;

  return { expHome, expAway, total, hFor, hAg, aFor, aAg, homeMatches, awayMatches };
};

const Predictor = ({ stats, fixtures, teams }) => {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [nGames, setNGames] = useState(5);
  const [selectedMatchday, setSelectedMatchday] = useState(null);

  // Custom Matchup State
  const [customHome, setCustomHome] = useState('');
  const [customAway, setCustomAway] = useState('');
  const [showCustomPrediction, setShowCustomPrediction] = useState(false);

  // Initialize custom teams
  useEffect(() => {
    if (teams.length > 0 && !customHome) {
      setCustomHome(teams[0]);
      setCustomAway(teams[1]);
    }
  }, [teams, customHome]);

  const customPrediction = useMemo(() => {
    if (!customHome || !customAway || !showCustomPrediction) return null;
    return calculatePrediction(customHome, customAway, stats, nGames);
  }, [customHome, customAway, stats, nGames, showCustomPrediction]);

  const upcomingMatches = useMemo(() => {
    if (!fixtures || !stats) return [];

    // Filter fixtures that haven't been played yet
    // A match is considered played if the home team has a recorded match against the away team at home
    const unplayed = fixtures.filter(f => {
      if (!stats[f.home]) return true; // If we don't have stats for home team, assume unplayed or invalid
      const played = stats[f.home].all_matches.some(m => m.opponent === f.away && m.location === 'Home');
      return !played;
    });

    // Calculate predictions for all unplayed matches
    const predictions = unplayed.map(match => {
      const pred = calculatePrediction(match.home, match.away, stats, nGames);
      return { ...match, prediction: pred };
    }).filter(m => m.prediction !== null); // Filter out matches where we couldn't calc prediction (e.g. missing team stats)

    return predictions.sort((a, b) => a.matchday - b.matchday);
  }, [fixtures, stats, nGames]);

  // Get available matchdays from upcoming matches
  const availableMatchdays = useMemo(() => {
    const days = [...new Set(upcomingMatches.map(m => m.matchday))];
    return days.sort((a, b) => a - b);
  }, [upcomingMatches]);

  // Set default selected matchday
  useEffect(() => {
    if (availableMatchdays.length > 0 && selectedMatchday === null) {
      setSelectedMatchday(availableMatchdays[0]);
    }
  }, [availableMatchdays, selectedMatchday]);

  // Filter matches by selected matchday
  const displayedMatches = useMemo(() => {
    if (!selectedMatchday) return [];
    return upcomingMatches.filter(m => m.matchday === selectedMatchday);
  }, [upcomingMatches, selectedMatchday]);

  if (selectedMatch) {
    const { home, away, prediction } = selectedMatch;
    // Recalculate prediction for selected match to ensure it uses the current nGames if changed in detail view
    // Actually, we can just use the one from the list or recalculate.
    // Let's recalculate to be safe and simple with the existing UI components that might need specific props.
    const detailPred = calculatePrediction(home, away, stats, nGames);

    if (!detailPred) return <div>Error loading match details</div>;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={() => setSelectedMatch(null)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span className="font-bold text-sm uppercase tracking-wide">Back to Fixtures</span>
        </button>

        {/* Configuration (Sample Size Only) */}
        <div className="glass-panel p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Match Analysis
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-400 uppercase">Sample Size:</span>
            <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5">
              {[3, 5, 'all'].map((n) => (
                <button
                  key={n}
                  onClick={() => setNGames(n)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {n === 'all' ? 'Season' : `Last ${n}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Prediction Hero */}
        <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

          <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
            <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

            <div className="flex items-center justify-center gap-8 mb-8 w-full">
              <div className="text-right flex-1 flex flex-col items-end">
                <img src={TEAM_LOGOS[home]} alt={home} className="w-16 h-16 object-contain mb-2" />
                <div className="text-2xl font-bold text-white truncate">{home}</div>
                <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {detailPred.expHome.toFixed(2)}</div>
              </div>

              <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${detailPred.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                {detailPred.total.toFixed(1)}
              </div>

              <div className="text-left flex-1 flex flex-col items-start">
                <img src={TEAM_LOGOS[away]} alt={away} className="w-16 h-16 object-contain mb-2" />
                <div className="text-2xl font-bold text-white truncate">{away}</div>
                <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {detailPred.expAway.toFixed(2)}</div>
              </div>
            </div>

            {detailPred.total > 11.5 ? (
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

        {/* Stats Analysis Breakdown */}
        <div className="glass-panel p-5 rounded-xl border border-white/10">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Stats Analysis (Last {nGames === 'all' ? 'Season' : nGames} Games)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Home Team Stats */}
            <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                  <img src={TEAM_LOGOS[home]} alt={home} className="w-6 h-6 object-contain" />
                  {home} <span className="text-zinc-500 text-xs font-normal">(Home Matches)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                    <div className="text-2xl font-mono font-bold text-white">{detailPred.hFor.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                    <div className="text-2xl font-mono font-bold text-red-400">{detailPred.hAg.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Away Team Stats */}
            <div className="bg-zinc-900/40 p-4 rounded-lg border border-white/5 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                  <img src={TEAM_LOGOS[away]} alt={away} className="w-6 h-6 object-contain" />
                  {away} <span className="text-zinc-500 text-xs font-normal">(Away Matches)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner in favour</div>
                    <div className="text-2xl font-mono font-bold text-white">{detailPred.aFor.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-950/50 p-3 rounded border border-white/5">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Avg Corner conceded</div>
                    <div className="text-2xl font-mono font-bold text-red-400">{detailPred.aAg.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed History */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
              <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                <img src={TEAM_LOGOS[home]} alt={home} className="w-6 h-6 object-contain" />
                {home}
              </h4>
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {detailPred.homeMatches.map(m => (
                <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                    <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center min-w-[30px]">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                      <span className="text-base font-black text-white">{m.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
              <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                <img src={TEAM_LOGOS[away]} alt={away} className="w-6 h-6 object-contain" />
                {away}
              </h4>
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {detailPred.awayMatches.map(m => (
                <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                    <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center min-w-[30px]">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                      <span className="text-base font-black text-white">{m.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Master Table View
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Upcoming Fixtures & Predictions
          </h2>
          <p className="text-zinc-400 text-sm mt-1">Predictions based on {nGames === 'all' ? 'Season' : `Last ${nGames || 5}`} games form</p>
        </div>

        <div className="flex items-center gap-6">
          {/* Matchday Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-400 uppercase">Matchday:</span>
            <div className="relative">
              <select
                value={selectedMatchday || ''}
                onChange={(e) => setSelectedMatchday(parseInt(e.target.value))}
                className="bg-zinc-900 border border-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-1.5 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-bold"
              >
                {availableMatchdays.map(day => (
                  <option key={day} value={day}>MD {day}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 rotate-90 pointer-events-none" />
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 hidden md:block"></div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-400 uppercase">Sample:</span>
            <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5 items-center gap-1">
              {[3, 5, 'all'].map((n) => (
                <button
                  key={n}
                  onClick={() => setNGames(n)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${nGames === n
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {n === 'all' ? 'Season' : `Last ${n}`}
                </button>
              ))}
              <div className="w-px h-4 bg-white/10 mx-1"></div>
              <div className="flex items-center gap-1 px-2">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Custom:</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={nGames === 'all' ? '' : nGames}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setNGames('');
                    } else {
                      const parsed = parseInt(val);
                      if (!isNaN(parsed) && parsed > 0) setNGames(parsed);
                    }
                  }}
                  placeholder="#"
                  className="w-10 bg-zinc-950 border border-zinc-800 rounded text-center text-xs text-white py-1 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-zinc-300">
            <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/80 border-b border-white/5">
              <tr>
                <th className="px-5 py-3 font-bold tracking-wider">Date</th>
                <th className="px-5 py-3 font-bold tracking-wider">Matchup</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-emerald-500/5 text-emerald-500">Home Exp</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-blue-500/5 text-blue-500">Away Exp</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider bg-white/5 text-white">Total Exp</th>
                <th className="px-3 py-3 text-center font-bold tracking-wider">Trend</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {displayedMatches.length > 0 ? displayedMatches.map((match, idx) => (
                <tr
                  key={idx}
                  onClick={() => setSelectedMatch(match)}
                  className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-4 whitespace-nowrap font-medium text-zinc-400">{match.date}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-[120px] justify-end">
                        <span className={`font-bold ${match.prediction.expHome > match.prediction.expAway ? 'text-white' : 'text-zinc-400'}`}>{match.home}</span>
                        <img src={TEAM_LOGOS[match.home]} alt={match.home} className="w-6 h-6 object-contain" />
                      </div>
                      <span className="text-zinc-600 font-bold text-xs">VS</span>
                      <div className="flex items-center gap-2 w-[120px]">
                        <img src={TEAM_LOGOS[match.away]} alt={match.away} className="w-6 h-6 object-contain" />
                        <span className={`font-bold ${match.prediction.expAway > match.prediction.expHome ? 'text-white' : 'text-zinc-400'}`}>{match.away}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center font-mono font-bold text-emerald-400 bg-emerald-500/5">{match.prediction.expHome.toFixed(2)}</td>
                  <td className="px-3 py-4 text-center font-mono font-bold text-blue-400 bg-blue-500/5">{match.prediction.expAway.toFixed(2)}</td>
                  <td className="px-3 py-4 text-center font-black text-white bg-white/5 text-lg">{match.prediction.total.toFixed(1)}</td>
                  <td className="px-3 py-4 text-center">
                    {match.prediction.total > 11.5 && (
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 animate-pulse">
                        <Flame className="w-4 h-4 fill-current" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors inline-block" />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="px-5 py-8 text-center text-zinc-500">
                    No upcoming fixtures found for this matchday.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Matchup Selector */}
      <div className="glass-panel p-6 rounded-xl border border-white/10 mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Custom Matchup Analysis
          </h3>
          <button
            onClick={() => setShowCustomPrediction(!showCustomPrediction)}
            className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${showCustomPrediction ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {showCustomPrediction ? 'Hide Analysis' : 'Analyze Matchup'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5 ml-1">Home Team</label>
            <div className="relative">
              <select
                className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg p-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium"
                value={customHome}
                onChange={(e) => setCustomHome(e.target.value)}
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
                value={customAway}
                onChange={(e) => setCustomAway(e.target.value)}
              >
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90 pointer-events-none" />
            </div>
          </div>
        </div>

        {showCustomPrediction && customPrediction && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {/* Prediction Hero (Reused) */}
            <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10 bg-zinc-900/40">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

              <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                <div className="flex items-center justify-center gap-8 mb-8 w-full">
                  <div className="text-right flex-1 flex flex-col items-end">
                    <img src={TEAM_LOGOS[customHome]} alt={customHome} className="w-16 h-16 object-contain mb-2" />
                    <div className="text-2xl font-bold text-white truncate">{customHome}</div>
                    <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {customPrediction.expHome.toFixed(2)}</div>
                  </div>

                  <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${customPrediction.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                    {customPrediction.total.toFixed(1)}
                  </div>

                  <div className="text-left flex-1 flex flex-col items-start">
                    <img src={TEAM_LOGOS[customAway]} alt={customAway} className="w-16 h-16 object-contain mb-2" />
                    <div className="text-2xl font-bold text-white truncate">{customAway}</div>
                    <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {customPrediction.expAway.toFixed(2)}</div>
                  </div>
                </div>

                {customPrediction.total > 11.5 ? (
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

            {/* Detailed History (Reused) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                  <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                    <img src={TEAM_LOGOS[customHome]} alt={customHome} className="w-6 h-6 object-contain" />
                    {customHome}
                  </h4>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Home Form</span>
                </div>
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {customPrediction.homeMatches.map(m => (
                    <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                        <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center min-w-[30px]">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                          <span className="text-base font-black text-white">{m.total}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel rounded-xl p-5 h-full border border-white/10">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                  <h4 className="font-bold text-white flex items-center gap-3 text-lg">
                    <img src={TEAM_LOGOS[customAway]} alt={customAway} className="w-6 h-6 object-contain" />
                    {customAway}
                  </h4>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Away Form</span>
                </div>
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {customPrediction.awayMatches.map(m => (
                    <div key={m.giornata} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">MD {m.giornata}</span>
                        <span className="text-sm text-zinc-200 font-semibold truncate max-w-[120px]">{m.opponent}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center min-w-[30px]">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Tot</span>
                          <span className="text-base font-black text-white">{m.total}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const [matchData, setMatchData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("Fetching data from Supabase...");

        // Fetch Matches
        const { data: matches, error: matchError } = await supabase
          .from('matches')
          .select('*');

        if (matchError) {
          console.error("Error fetching matches:", matchError);
          throw matchError;
        }
        console.log("Matches fetched:", matches?.length);

        // Fetch Fixtures
        const { data: fixtures, error: fixtureError } = await supabase
          .from('fixtures')
          .select('*')
          .order('match_date', { ascending: true });

        if (fixtureError) {
          console.error("Error fetching fixtures:", fixtureError);
          throw fixtureError;
        }
        console.log("Fixtures fetched:", fixtures?.length);

        // Transform fixtures to a flat list for easier consumption
        const flatFixtures = fixtures.map(f => {
          let dateStr = 'TBD';
          try {
            if (f.match_date) {
              dateStr = new Date(f.match_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
            }
          } catch (e) {
            console.error("Invalid date:", f.match_date);
          }

          // Handle potential column name differences (matchday vs giornata) and ensure number type
          const mDay = f.matchday || f.giornata;

          return {
            home: f.home_team || 'Unknown',
            away: f.away_team || 'Unknown',
            date: dateStr,
            matchday: mDay ? parseInt(mDay, 10) : 0
          };
        });

        console.log("Formatted fixtures:", flatFixtures);
        setFixturesData(flatFixtures);

        // Transform matches data to match the expected structure for processData
        const formattedData = matches.map(match => ({
          squadre: {
            home: match.home_team || 'Unknown',
            away: match.away_team || 'Unknown'
          },
          calci_d_angolo: {
            home: (match.home_corners ?? 0).toString(),
            away: (match.away_corners ?? 0).toString()
          },
          giornata: match.giornata || 0,
          // Add other fields if needed by processData (currently it uses corners and giornata)
        }));

        setMatchData(formattedData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const stats = useMemo(() => processData(matchData), [matchData]);
  const teams = useMemo(() => Object.keys(stats).sort(), [stats]);

  // Calculate next matchday
  const lastPlayedMatchday = useMemo(() => {
    if (!matchData || matchData.length === 0) return 0;
    return Math.max(...matchData.map(m => m.giornata));
  }, [matchData]);

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

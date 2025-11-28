import React, { useState, useMemo, useEffect } from 'react';
import { processData } from './utils/stats';
import Navbar from './components/layout/Navbar';
import LeagueTrends from './components/features/LeagueTrends';
import Predictor from './components/features/Predictor';
import TeamDetails from './components/features/TeamDetails';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('trends');
  const [matchData, setMatchData] = useState([]);
  const [squadsData, setSquadsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch Matches
        const { data: matches, error: matchError } = await supabase
          .from('matches')
          .select('*');

        if (matchError) throw matchError;

        // Fetch Squads
        const { data: squads, error: squadError } = await supabase
          .from('squads')
          .select('*');

        if (squadError) throw squadError;

        // Process Squads into a map for easy lookup
        const squadsMap = {};
        squads.forEach(squad => {
          squadsMap[squad.name] = squad;
        });
        setSquadsData(squadsMap);

        // Transform data to match the expected structure
        const formattedData = matches.map(match => ({
          squadre: {
            home: match.home_team,
            away: match.away_team
          },
          calci_d_angolo: {
            home: match.home_corners.toString(),
            away: match.away_corners.toString()
          },
          goals: {
            home: (match.home_goals || 0).toString(),
            away: (match.away_goals || 0).toString()
          },
          shots: {
            home: (match.home_shots || 0).toString(),
            away: (match.away_shots || 0).toString()
          },
          shots_ot: {
            home: (match.home_shots_on_target || 0).toString(),
            away: (match.away_shots_on_target || 0).toString()
          },
          possession: {
            home: (match.home_possession || 0).toString(),
            away: (match.away_possession || 0).toString()
          },
          yellow_cards: {
            home: (match.home_yellow_cards || 0).toString(),
            away: (match.away_yellow_cards || 0).toString()
          },
          red_cards: {
            home: (match.home_red_cards || 0).toString(),
            away: (match.away_red_cards || 0).toString()
          },
          fouls: {
            home: (match.home_fouls || 0).toString(),
            away: (match.away_fouls || 0).toString()
          },
          giornata: match.giornata
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

  // Lifted state for persistence
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  // Set default teams once data is loaded
  useEffect(() => {
    if (teams.length > 0 && !home) {
      setHome(teams[0]);
      setAway(teams[1]);
    }
  }, [teams, home]);

  const handleTeamClick = (team) => {
    setSelectedTeam(team);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToTrends = () => {
    setSelectedTeam(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-200">Loading...</div>;
  }

  return (
    <div className="min-h-screen text-zinc-200 pb-12 selection:bg-emerald-500/30">
      <Navbar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedTeam(null); }} />

      <main className="max-w-7xl mx-auto px-4 md:px-8">
        {selectedTeam ? (
          <TeamDetails
            teamName={selectedTeam}
            stats={stats}
            teamInfo={squadsData[selectedTeam]}
            onBack={handleBackToTrends}
          />
        ) : (
          <>
            {activeTab === 'trends' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LeagueTrends stats={stats} onTeamClick={handleTeamClick} />
              </div>
            )}

            {activeTab === 'predictor' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Predictor
                  stats={stats}
                  teams={teams}
                  home={home}
                  setHome={setHome}
                  away={away}
                  setAway={setAway}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

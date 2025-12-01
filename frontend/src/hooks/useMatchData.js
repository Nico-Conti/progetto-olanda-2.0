import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_BASE_URL } from '../config';

export const useMatchData = () => {
    const [matchData, setMatchData] = useState([]);
    const [fixturesData, setFixturesData] = useState([]);
    const [teamLogos, setTeamLogos] = useState({});
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                console.log(`Fetching data from Backend (${API_BASE_URL})...`);

                // Fetch Matches
                const matchesResponse = await fetch(`${API_BASE_URL}/matches`);
                if (!matchesResponse.ok) {
                    throw new Error(`Error fetching matches: ${matchesResponse.statusText}`);
                }
                const matches = await matchesResponse.json();
                console.log("Matches fetched:", matches?.length);

                // Fetch Fixtures
                const fixturesResponse = await fetch(`${API_BASE_URL}/fixtures`);
                if (!fixturesResponse.ok) {
                    throw new Error(`Error fetching fixtures: ${fixturesResponse.statusText}`);
                }
                const fixtures = await fixturesResponse.json();
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

                // Fetch Teams (Logos)
                const teamsResponse = await fetch(`${API_BASE_URL}/teams`);
                let teamLogosMap = {};
                if (teamsResponse.ok) {
                    const teams = await teamsResponse.json();
                    teams.forEach(t => {
                        teamLogosMap[t.name] = t.logo_url;
                    });
                } else {
                    console.error("Failed to fetch teams:", teamsResponse.statusText);
                }

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
                    league: match.league, // Include league for filtering
                    tldr: match["tl dr corner"] || match.tldr || "",
                    detailed_summary: match["detailed comment corner"] || match.detailed_summary || ""
                }));

                setMatchData(formattedData);
                setTeamLogos(teamLogosMap);

                // Fetch Leagues
                const leaguesResponse = await fetch(`${API_BASE_URL}/leagues`);
                if (leaguesResponse.ok) {
                    const leaguesData = await leaguesResponse.json();
                    setLeagues(leaguesData);
                } else {
                    console.error("Failed to fetch leagues:", leaguesResponse.statusText);
                }

            } catch (err) {
                console.error('Error fetching data:', err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return { matchData, fixturesData, teamLogos, leagues, loading, error };
};

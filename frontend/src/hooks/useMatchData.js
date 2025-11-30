import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useMatchData = () => {
    const [matchData, setMatchData] = useState([]);
    const [fixturesData, setFixturesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                console.log("Fetching data from Backend (localhost:8000)...");

                // Fetch Matches
                const matchesResponse = await fetch('http://localhost:8000/matches');
                if (!matchesResponse.ok) {
                    throw new Error(`Error fetching matches: ${matchesResponse.statusText}`);
                }
                const matches = await matchesResponse.json();
                console.log("Matches fetched:", matches?.length);

                // Fetch Fixtures
                const fixturesResponse = await fetch('http://localhost:8000/fixtures');
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
                    tldr: match["tl dr corner"] || match.tldr || "",
                    detailed_summary: match["detailed comment corner"] || match.detailed_summary || ""
                    // Add other fields if needed by processData (currently it uses corners and giornata)
                }));

                setMatchData(formattedData);
            } catch (err) {
                console.error('Error fetching data:', err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return { matchData, fixturesData, loading, error };
};

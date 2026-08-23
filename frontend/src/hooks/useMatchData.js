import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

// A match row and an analysis row have to agree on what identifies a match.
// Both come from the same table, so the raw column values compare directly -
// do not normalise one side only.
const analysisKey = (league, season, date, home, away) =>
    `${league}|${season}|${date}|${home}|${away}`;

export const useMatchData = () => {
    const [matchData, setMatchData] = useState([]);
    const [fixturesData, setFixturesData] = useState([]);
    const [teamLogos, setTeamLogos] = useState({});
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);

            // These four are independent. Awaiting them one after another cost
            // the sum of their latencies for no reason; /matches alone is ~5s.
            const [matchesResponse, fixturesResponse, teamsResponse, leaguesResponse] =
                await Promise.all([
                    fetch(`${API_BASE_URL}/matches`),
                    fetch(`${API_BASE_URL}/fixtures`),
                    fetch(`${API_BASE_URL}/teams`),
                    fetch(`${API_BASE_URL}/leagues`),
                ]);

            // Matches and fixtures are load-bearing: without them there is
            // nothing to render, so a failure is an error. Teams and leagues
            // only decorate, and are handled softly below.
            if (!matchesResponse.ok) {
                throw new Error(`Error fetching matches: ${matchesResponse.statusText}`);
            }
            if (!fixturesResponse.ok) {
                throw new Error(`Error fetching fixtures: ${fixturesResponse.statusText}`);
            }

            const [matches, fixtures] = await Promise.all([
                matchesResponse.json(),
                fixturesResponse.json(),
            ]);

            // Transform fixtures to a flat list for easier consumption
            const flatFixtures = fixtures.map(f => {
                // Handle potential column name differences (matchday vs giornata) and ensure number type
                const mDay = f.matchday || f.giornata;

                return {
                    home: f.home_team || 'Unknown',
                    away: f.away_team || 'Unknown',
                    date: f.match_date, // Keep raw date for sorting/filtering
                    matchday: mDay ? parseInt(mDay, 10) : 0,
                    league: f.league,
                    season: f.season || null,
                    status: f.status
                };
            });

            setFixturesData(flatFixtures);

            // Teams (Logos)
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
                stats: {
                    corners: { home: match.home_corners ?? 0, away: match.away_corners ?? 0 },
                    fouls: { home: match.home_fouls ?? 0, away: match.away_fouls ?? 0 },
                    yellow_cards: { home: match.home_yellow_cards ?? 0, away: match.away_yellow_cards ?? 0 },
                    red_cards: { home: match.home_red_cards ?? 0, away: match.away_red_cards ?? 0 },
                    shots: { home: match.home_shots ?? 0, away: match.away_shots ?? 0 },
                    shots_on_target: { home: match.home_shots_on_target ?? 0, away: match.away_shots_on_target ?? 0 },
                    goals: { home: match.home_goals ?? 0, away: match.away_goals ?? 0 },
                    possession: { home: match.home_possession ?? 0, away: match.away_possession ?? 0 },
                    // Scraped and stored since the start, but only exposed by
                    // /matches recently. Keys are named after the DB columns:
                    // `blocked_shots` holds diretta's "Palle intercettate"
                    // (interceptions), which the syncer writes there on purpose
                    // - see backend/services/supabase_syncer.py:92.
                    xg: { home: match.home_xg ?? 0, away: match.away_xg ?? 0 },
                    xgot: { home: match.home_xgot ?? 0, away: match.away_xgot ?? 0 },
                    big_chances: { home: match.home_big_chances ?? 0, away: match.away_big_chances ?? 0 },
                    box_touches: { home: match.home_box_touches ?? 0, away: match.away_box_touches ?? 0 },
                    crosses: { home: match.home_crosses ?? 0, away: match.away_crosses ?? 0 },
                    goalkeeper_saves: { home: match.home_goalkeeper_saves ?? 0, away: match.away_goalkeeper_saves ?? 0 },
                    blocked_shots: { home: match.home_blocked_shots ?? 0, away: match.away_blocked_shots ?? 0 },
                },
                giornata: match.giornata || 0,
                league: match.league, // Include league for filtering
                season: match.season || null,
                // summary_match / detail_corner no longer ride along with
                // /matches - they were 27% of it and nothing shows them until a
                // match is opened. They arrive from /matches/analysis just
                // below and are merged in; until then these stay empty, which
                // is what every consumer already falls back on.
                tldr: "",
                detailed_summary: "",
                date: match.match_date
            }));

            setMatchData(formattedData);
            setTeamLogos(teamLogosMap);

            if (leaguesResponse.ok) {
                const leaguesData = await leaguesResponse.json();
                setLeagues(leaguesData);
            } else {
                console.error("Failed to fetch leagues:", leaguesResponse.statusText);
            }

            // Deliberately not awaited: the app is already usable, and the
            // prose only matters once someone opens a match. A failure here
            // leaves the empty-string fallbacks in place rather than breaking
            // a load that has otherwise succeeded.
            fetch(`${API_BASE_URL}/matches/analysis`)
                .then(res => (res.ok ? res.json() : Promise.reject(res.statusText)))
                .then(rows => {
                    const byKey = new Map(rows.map(r => [
                        analysisKey(r.league, r.season || null, r.match_date,
                                    r.home_team || 'Unknown', r.away_team || 'Unknown'),
                        r,
                    ]));
                    setMatchData(prev => prev.map(m => {
                        const hit = byKey.get(analysisKey(
                            m.league, m.season, m.date, m.squadre.home, m.squadre.away));
                        return hit
                            ? { ...m,
                                tldr: hit.summary_match || "",
                                detailed_summary: hit.detail_corner || "" }
                            : m;
                    }));
                })
                .catch(err => console.error('Error fetching match analysis:', err));

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    return { matchData, fixturesData, teamLogos, leagues, loading, error, refetch: fetchData };
};

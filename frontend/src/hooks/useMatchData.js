import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export const useMatchData = () => {
    const [matchData, setMatchData] = useState([]);
    const [fixturesData, setFixturesData] = useState([]);
    const [teamLogos, setTeamLogos] = useState({});
    // squads.stadium_image_url, set by hand in Supabase: it beats TheSportsDB's photo (hooks/useJersey).
    const [stadiumPhotos, setStadiumPhotos] = useState({});
    const [leagues, setLeagues] = useState([]);
    // TWO loading states, because the two halves differ by three orders of
    // magnitude: /leagues and /teams are 5KB and 120KB and land in ~0.3s, while
    // /matches alone is 5.5MB and takes ~12s with the backend WARM. Awaiting all
    // four together meant nothing at all rendered for twelve seconds - far past
    // the budget a crawler's renderer allows, which is why Google only ever saw
    // this page fail to load and flagged the site as a deceptive shell. The
    // landing page needs the shell; only a league's dashboard needs the matches.
    const [shellLoading, setShellLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Leagues and crests. Small, fast, and all the landing page needs. */
    const fetchShell = async () => {
        try {
            const [teamsResponse, leaguesResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/teams`),
                fetch(`${API_BASE_URL}/leagues`),
            ]);

            if (teamsResponse.ok) {
                const teams = await teamsResponse.json();
                const teamLogosMap = {};
                const stadiumPhotosMap = {};
                teams.forEach(t => {
                    teamLogosMap[t.name] = t.logo_url;
                    if (t.stadium_image_url) stadiumPhotosMap[t.name] = t.stadium_image_url;
                });
                setTeamLogos(teamLogosMap);
                setStadiumPhotos(stadiumPhotosMap);
            } else {
                console.error("Failed to fetch teams:", teamsResponse.statusText);
            }

            if (leaguesResponse.ok) {
                setLeagues(await leaguesResponse.json());
            } else {
                console.error("Failed to fetch leagues:", leaguesResponse.statusText);
            }
        } catch (err) {
            // Decoration only - a missing crest or league row must not stop the
            // page rendering, so this deliberately does NOT set `error`, which
            // is what turns the picker into a retry.
            console.error('Error fetching leagues/teams:', err);
        } finally {
            setShellLoading(false);
        }
    };

    /** Matches and fixtures. Megabytes, and only a dashboard needs them. */
    const fetchData = async () => {
        try {
            setLoading(true);
            // Cleared on every attempt, or a successful retry leaves the picker
            // still offering to retry instead of opening.
            setError(null);

            const [matchesResponse, fixturesResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/matches`),
                fetch(`${API_BASE_URL}/fixtures`),
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

            // Transform matches data to match the expected structure for processData
            const formattedData = matches.map(match => ({
                squadre: {
                    home: match.home_team || 'Unknown',
                    away: match.away_team || 'Unknown'
                },
                stats: {
                    // NULL stays NULL. `?? 0` here was harmless while every stored
                    // match had every column, and became a live mispricing the
                    // moment the football-data backfill started inserting rows
                    // with real gaps: it turns "not measured" into a measured
                    // zero, which is the one thing `statPair` cannot see - it
                    // guards a MISSING key, and this guaranteed the key is always
                    // present.
                    //
                    // Belgium's 312 backfilled matches carry no box_touches, so
                    // every one of them entered the goals model as 0 box touches.
                    // Westerlo v St. Liege came out at 0.66 expected goals
                    // against a true ~3.5, P(under 0.5) at 52% against ~3%, and
                    // +417% EV at a price of 10.00 - top of Hot Matches. The
                    // error is one-sided and systematic, so it reads as an edge
                    // rather than as noise. Exactly the failure section 7fb9579
                    // fixed, arriving through the mapping instead of the scrape.
                    //
                    // `second_bookings` keeps its `?? 0` below, and that stays
                    // deliberate - see the note on card_points.
                    corners: { home: match.home_corners ?? null, away: match.away_corners ?? null },
                    fouls: { home: match.home_fouls ?? null, away: match.away_fouls ?? null },
                    yellow_cards: { home: match.home_yellow_cards ?? null, away: match.away_yellow_cards ?? null },
                    red_cards: { home: match.home_red_cards ?? null, away: match.away_red_cards ?? null },
                    // The bookmaker's card market settles on POINTS, not on a
                    // count: a yellow is 1 and a red is 2 (domusbet's published
                    // rules). Derived here rather than stored, so it costs no
                    // payload and every consumer - processData, predictTotal,
                    // the backtest - sees it like any scraped statistic.
                    //
                    // Exact, given second_bookings. A dismissal for a second
                    // yellow is filed by diretta as one yellow AND one red, so
                    // `yellows + 2*reds` scores it 4 where the bookmaker scores
                    // 3 (first yellow 1 + red 2). Subtracting the count of such
                    // dismissals corrects exactly that, and only that.
                    //
                    // Verified on Cesena-Sampdoria (2026-08-23): the timeline
                    // reads David A. yellow 43', David A. yellow-red 50',
                    // Shpendi yellow 57', Cicconi yellow 38', and the statistics
                    // panel says gialli 3-1, rossi 1-0 - three home yellows only
                    // reachable by counting the 50' second booking. True points
                    // 5, naive 6, corrected 4 + 2 - 1 = 5.
                    //
                    // `second_bookings` is NULL for every match scraped before
                    // migration 005, so `?? 0` leaves those at the old, slightly
                    // high value rather than dropping them from the model. That
                    // is a deliberate choice: the bias is ~0.06 points a match
                    // (33.3% of reds are second bookings, measured over 98
                    // matches), which is far smaller than the cost of discarding
                    // the history. It decays away as matches are rescraped.
                    //
                    // Off-pitch cards need no correction here: diretta tags them
                    // "Non Dal Campo" and leaves them out of the statistics
                    // panel, exactly as the bookmaker's rules require, so the
                    // yellow and red columns are already on the right basis.
                    card_points: {
                        home: match.home_yellow_cards == null || match.home_red_cards == null
                            ? null
                            : match.home_yellow_cards + 2 * match.home_red_cards
                              - (match.home_second_bookings ?? 0),
                        away: match.away_yellow_cards == null || match.away_red_cards == null
                            ? null
                            : match.away_yellow_cards + 2 * match.away_red_cards
                              - (match.away_second_bookings ?? 0),
                    },
                    shots: { home: match.home_shots ?? null, away: match.away_shots ?? null },
                    shots_on_target: { home: match.home_shots_on_target ?? null, away: match.away_shots_on_target ?? null },
                    goals: { home: match.home_goals ?? null, away: match.away_goals ?? null },
                    possession: { home: match.home_possession ?? null, away: match.away_possession ?? null },
                    // Scraped and stored since the start, but only exposed by
                    // /matches recently. Keys are named after the DB columns:
                    // `blocked_shots` holds diretta's "Palle intercettate"
                    // (interceptions), which the syncer writes there on purpose
                    // - see backend/services/supabase_syncer.py:92.
                    xg: { home: match.home_xg ?? null, away: match.away_xg ?? null },
                    xgot: { home: match.home_xgot ?? null, away: match.away_xgot ?? null },
                    big_chances: { home: match.home_big_chances ?? null, away: match.away_big_chances ?? null },
                    box_touches: { home: match.home_box_touches ?? null, away: match.away_box_touches ?? null },
                    crosses: { home: match.home_crosses ?? null, away: match.away_crosses ?? null },
                    goalkeeper_saves: { home: match.home_goalkeeper_saves ?? null, away: match.away_goalkeeper_saves ?? null },
                    blocked_shots: { home: match.home_blocked_shots ?? null, away: match.away_blocked_shots ?? null },
                },
                giornata: match.giornata || 0,
                league: match.league, // Include league for filtering
                season: match.season || null,
                date: match.match_date
            }));

            setMatchData(formattedData);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // The heavy fetch starts AFTER the shell has landed, not alongside it.
        // Fired together, /matches' 5.5MB competes with /leagues' 5KB for the
        // same connection and the landing page's time-to-usable swung between
        // 2.7s and 8.1s. Serialising costs the dashboard ~0.3s and makes the
        // first screen deterministic. fetchShell swallows its own errors, so
        // this chain always continues.
        fetchShell().then(fetchData);
    }, []);

    const refetch = () => { fetchShell().then(fetchData); };

    return { matchData, fixturesData, teamLogos, stadiumPhotos, leagues, shellLoading, loading, error, refetch };
};

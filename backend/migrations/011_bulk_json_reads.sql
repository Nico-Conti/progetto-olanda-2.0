-- Serve /matches and /fixtures in ONE round trip instead of nine.
--
-- PostgREST caps a page at 1000 rows and ignores a wider Range header, so
-- `fetch_all_data` walks the table a page at a time. Measured 2026-09-22
-- against production, warm:
--
--   1 row .......... 156 ms     a 1-row request costs the same as a 100-row
--   100 rows ....... 149 ms     one, so this is latency, not query time
--   1000 rows ...... 220 ms
--   all 7,216 rows . 2,783 ms   over 9 requests
--
--   of which ~1,400 ms is nine lots of per-request overhead, and only ~466 ms
--   is real work. EXPLAIN ANALYZE on the json_agg below: **117.8 ms**, Seq
--   Scan, `Buffers: shared hit=416` with zero reads - the whole table is
--   already in Postgres's buffer cache. The database was never the problem.
--
-- So: one call, ~620 ms, saving ~2.1s. A Seq Scan is correct here and an
-- index would only add work - every row is wanted.
--
-- TWO NAMED FUNCTIONS, NOT ONE GENERIC ONE. The tempting version takes a
-- table name and a column list and builds the query with format()/%I. Do not
-- write it: SECURITY DEFINER bypasses RLS, so `rows_as_json('slips', ...)`
-- would hand any caller every user's saved slips. These two read tables that
-- are public data anyway, take no arguments, and have no injection surface.
--
-- They are NOT security definer for the same reason - they do not need to be.
-- Whatever key the backend holds already reads these tables.
--
-- The column lists below MUST match MATCH_COLUMNS / FIXTURE_COLUMNS in
-- backend/main.py. They are in two places and nothing but this comment stops
-- them drifting, so `fetch_all_json()` compares the keys it gets back against
-- the list it expected and falls back to paging when they differ, rather than
-- silently serving a payload the frontend cannot read.

CREATE OR REPLACE FUNCTION public.matches_json() RETURNS json
LANGUAGE sql STABLE SET search_path = '' AS $$
    -- COALESCE so an empty table returns [] rather than SQL NULL, which the
    -- client would otherwise have to special-case.
    SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT home_team, away_team, giornata, league, season, match_date,
               home_goals, away_goals, home_corners, away_corners,
               home_fouls, away_fouls, home_yellow_cards, away_yellow_cards,
               home_red_cards, away_red_cards,
               home_second_bookings, away_second_bookings,
               home_shots, away_shots,
               home_shots_on_target, away_shots_on_target,
               home_possession, away_possession, home_xg, away_xg,
               home_xgot, away_xgot, home_big_chances, away_big_chances,
               home_box_touches, away_box_touches, home_crosses, away_crosses,
               home_goalkeeper_saves, away_goalkeeper_saves,
               home_blocked_shots, away_blocked_shots
          FROM public.matches
    ) t;
$$;

CREATE OR REPLACE FUNCTION public.fixtures_json() RETURNS json
LANGUAGE sql STABLE SET search_path = '' AS $$
    -- `prediction_*` and `is_hot_match` are deliberately absent: the frontend
    -- models all of that itself and reads none of them, and they were 77% of
    -- this payload.
    SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT home_team, away_team, match_date, league, season, status, giornata
          FROM public.fixtures
    ) t;
$$;

GRANT EXECUTE ON FUNCTION public.matches_json()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fixtures_json() TO anon, authenticated, service_role;

-- Verification: both exist, are STABLE (provolatile 's') and not SECURITY
-- DEFINER (prosecdef false), and return the row counts you expect.
SELECT p.proname, p.provolatile, p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('matches_json', 'fixtures_json');

SELECT json_array_length(public.matches_json())  AS matches,
       json_array_length(public.fixtures_json()) AS fixtures;

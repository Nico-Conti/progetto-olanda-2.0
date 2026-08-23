-- Multi-season support.
--
-- Run this in the Supabase SQL editor before running the season importer or
-- the updated scrapers. Everything here is idempotent.
--
-- Context for the backfill values below (measured against the live DB on
-- 2026-08-21, 2909 matches / 3034 fixtures):
--   * Every European league holds one complete season, giornate 1-38 (or 1-34),
--     scraped between Nov 2025 and May 2026 -> that is 2025/2026.
--   * Serie A Betano holds 177 matches, giornate 1-18, scraped Apr-Jun 2026.
--     Brazil plays Apr-Dec inside a single calendar year -> that is 2026.

-- 1. Season on both tables ---------------------------------------------------
ALTER TABLE matches  ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS season TEXT;

-- 2. Match dates -------------------------------------------------------------
-- `matches` has never had a date: build_stats_payload() only ever wrote teams,
-- giornata, league, url, goals and stats. That is why the frontend sorts by
-- giornata and falls back everywhere a date is expected. The season importer
-- populates this going forward.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_date TIMESTAMPTZ;

-- 3. Indexes for the season+league filtering the UI now does -----------------
CREATE INDEX IF NOT EXISTS matches_season_league_idx  ON matches  (season, league);
CREATE INDEX IF NOT EXISTS fixtures_season_league_idx ON fixtures (season, league);

-- 4. Backfill existing rows --------------------------------------------------
UPDATE matches SET season = '2025/2026'
 WHERE season IS NULL AND league <> 'Serie A Betano';

UPDATE matches SET season = '2026'
 WHERE season IS NULL AND league  = 'Serie A Betano';

-- fixtures do have dates, so their season is derived rather than assumed.
-- Split seasons roll over in July; Brazil is labelled by its calendar year.
UPDATE fixtures SET season = CASE
        WHEN league = 'Serie A Betano' THEN to_char(match_date, 'YYYY')
        WHEN EXTRACT(MONTH FROM match_date) >= 7
            THEN EXTRACT(YEAR FROM match_date)::int || '/' || (EXTRACT(YEAR FROM match_date)::int + 1)
        ELSE (EXTRACT(YEAR FROM match_date)::int - 1) || '/' || EXTRACT(YEAR FROM match_date)::int
    END
 WHERE season IS NULL AND match_date IS NOT NULL;

-- 5. Check the result --------------------------------------------------------
-- Expect one season per league. Anything showing two seasons for a league, or
-- a giornata range that looks like two seasons stacked, needs a closer look.
SELECT 'matches' AS tbl, league, season, COUNT(*) AS n,
       MIN(giornata) AS min_g, MAX(giornata) AS max_g
  FROM matches GROUP BY 1,2,3
UNION ALL
SELECT 'fixtures', league, season, COUNT(*), MIN(giornata), MAX(giornata)
  FROM fixtures GROUP BY 1,2,3
 ORDER BY 1,2,3;

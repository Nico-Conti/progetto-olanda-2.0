-- Repair 20 Serie A fixtures that carry the wrong year.
--
-- These are 2025/26 matchday 1-2 fixtures (Sassuolo, Cremonese, Pisa - the
-- 2025/26 side of Serie A) whose match_date was written as August 2026 instead
-- of August 2025. 001_add_season.sql then derived "2026/2027" from those dates,
-- which is why Serie A showed 360 fixtures at 2025/2026 starting from giornata
-- 3, plus 20 at 2026/2027 - 380 in total, i.e. exactly one season's worth.
--
-- Cause: fixtures_scraper.parse_date() guessed the year as "within +/- 6 months
-- of today", which dates a season's August fixtures to the wrong year on any
-- scrape from February onwards. That function is now anchored to the season
-- being scraped, so this cannot recur.
--
-- Verify first - this should list 20 rows, all Serie A, giornate 1-2:
--   SELECT giornata, home_team, away_team, match_date FROM fixtures
--    WHERE league = 'Serie A' AND season = '2026/2027' ORDER BY giornata, match_date;

UPDATE fixtures
   SET match_date = match_date - INTERVAL '1 year',
       season     = '2025/2026'
 WHERE league = 'Serie A'
   AND season = '2026/2027'
   AND match_date >= '2026-08-01'
   AND match_date <  '2026-09-15';

-- Expect a single Serie A row at 2025/2026 with n = 380, giornate 1-38.
SELECT league, season, COUNT(*) AS n, MIN(giornata) AS min_g, MAX(giornata) AS max_g
  FROM fixtures
 WHERE league = 'Serie A'
 GROUP BY 1, 2
 ORDER BY 2;

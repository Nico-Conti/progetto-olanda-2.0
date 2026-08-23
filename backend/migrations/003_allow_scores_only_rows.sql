-- Optional: allow matches that only have scores.
--
-- The stat columns on `matches` are NOT NULL, so a row can only be inserted if
-- every one of them has a value. The season importer reads a season's results
-- page, which carries the score but none of the detailed stats - it cannot
-- insert a match without inventing zeros for corners, shots, cards and so on.
-- Zeros are indistinguishable from real values and would drag down every
-- average computed from them, so the importer skips those rows by default.
--
-- Run this only if you want the importer to fill in matches the nightly scraper
-- missed. NULL then honestly means "not scraped", and the frontend already
-- coalesces missing stats (`match.home_corners ?? 0`) when reading.
--
-- After running this, re-run the importer with --insert-missing.

ALTER TABLE matches ALTER COLUMN home_corners           DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_corners           DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_shots             DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_shots             DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_shots_on_target   DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_shots_on_target   DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_fouls             DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_fouls             DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_yellow_cards      DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_yellow_cards      DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_red_cards         DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_red_cards         DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_possession        DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_possession        DROP NOT NULL;

-- Which stat columns are still NOT NULL:
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'matches'
   AND (column_name LIKE 'home\_%' OR column_name LIKE 'away\_%')
 ORDER BY is_nullable, column_name;

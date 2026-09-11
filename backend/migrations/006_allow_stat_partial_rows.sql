-- Let a match row carry scores and some statistics, without inventing the rest.
--
-- Run this INSTEAD of re-running 003, not as well as it: 003 did run (its other
-- twelve columns are nullable on the live table), and everything it still owes
-- is repeated below. Re-running it would be harmless but pointless.
--
-- Probed against the live table on 2026-09-10 by inserting rows and reading back
-- what the server stored. Two separate problems, and the second is the dangerous
-- one.
--
--
-- 1. Three columns still reject a stats-partial insert
--
-- `home_corners`, `away_corners` and `giornata` are NOT NULL with no default, so
-- `season_importer --insert-missing` failed all 320 Belgian rows with
-- "23502 null value in column home_corners violates not-null constraint" and
-- wrote nothing. The corners pair is the FIRST two statements of 003, while the
-- twelve after them took effect - the signature of running a highlighted block
-- in the SQL editor and missing the top of it.
--
-- `giornata` was never in 003 at all. It is here because a round header with no
-- digits in it - Belgium ends its season on "Play-off" - leaves the matchday
-- genuinely unknown, and 0 would be a lie that sorts above matchday 1.
--
--
-- 2. Fourteen columns silently fabricate a zero, box_touches among them
--
-- These are nullable but carry DEFAULT 0, so an INSERT that OMITS them stores a
-- real 0 rather than NULL. An explicit NULL is accepted and stored as NULL -
-- only omission triggers the default.
--
-- That is exactly the failure the scraper was fixed for on 2026-09-09, arriving
-- through the schema instead: `statPair()` cannot skip these rows, because they
-- are real zeros and not missing keys. Goals are predicted FROM box touches, so
-- backfilling Belgium's 320 matches would have pushed 320 observations of "zero
-- box touches" into the pooled goals model - the fabricated zero, at scale, in
-- the one statistic that path depends on.
--
-- Dropping the default makes the honest value the automatic one. Existing rows
-- are untouched: a default only applies at insert time, and every row currently
-- in `matches` was written by the full scraper with real values.
--
-- Idempotent: DROP NOT NULL and DROP DEFAULT are no-ops where already absent.


-- 1. Columns that block the insert outright.
ALTER TABLE matches ALTER COLUMN home_corners DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_corners DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN giornata     DROP NOT NULL;

-- 2. Columns that would quietly store 0 for "not measured".
ALTER TABLE matches ALTER COLUMN home_box_touches      DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_box_touches      DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_xg               DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_xg               DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_xgot             DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_xgot             DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_big_chances      DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_big_chances      DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_blocked_shots    DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_blocked_shots    DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_crosses          DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_crosses          DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN home_goalkeeper_saves DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN away_goalkeeper_saves DROP DEFAULT;


-- Verification. Every row should read is_nullable = YES and column_default = NULL.
SELECT column_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'matches'
   AND column_name IN (
     'home_corners', 'away_corners', 'giornata',
     'home_box_touches', 'away_box_touches', 'home_xg', 'away_xg',
     'home_xgot', 'away_xgot', 'home_big_chances', 'away_big_chances',
     'home_blocked_shots', 'away_blocked_shots', 'home_crosses', 'away_crosses',
     'home_goalkeeper_saves', 'away_goalkeeper_saves')
 ORDER BY column_name;

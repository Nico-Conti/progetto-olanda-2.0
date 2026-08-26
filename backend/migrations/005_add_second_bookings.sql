-- 005: second bookings (dismissal for a second yellow), per side.
--
-- Total cards on the bookmaker's scale are POINTS, not a count: a yellow is 1
-- and a red is 2, so a dismissal for a second yellow scores 3 - the first
-- yellow plus the red, with the second yellow not counted again.
--
-- diretta files such a dismissal as one yellow AND one red, so computing
-- `yellows + 2*reds` scores it 4 and overstates the match by exactly one.
-- These columns make it exact:
--
--     card_points = yellows + 2*reds - second_bookings
--
-- Measured 2026-08-26 over 98 sampled red-card matches: 39 of 117 reds (33.3%)
-- are second bookings, ~0.06 points per match against a base of 4.32.
--
-- NULL means "not known for this match" and is deliberately distinct from 0.
-- Rows scraped before this migration are NULL; the timeline occasionally fails
-- to render, and writing 0 there would silently understate the correction.
-- Idempotent.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_second_bookings smallint;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_second_bookings smallint;

COMMENT ON COLUMN matches.home_second_bookings IS
  'Home dismissals for a second yellow. card_points = yellows + 2*reds - second_bookings. NULL = unknown, not zero.';
COMMENT ON COLUMN matches.away_second_bookings IS
  'Away dismissals for a second yellow. card_points = yellows + 2*reds - second_bookings. NULL = unknown, not zero.';

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'matches' AND column_name LIKE '%second_bookings%'
ORDER BY column_name;

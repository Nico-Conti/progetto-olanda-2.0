-- Keep domusbet's own identifier for each captured selection.
--
-- domusbet's web app loads a betslip straight from a URL:
--
--   https://www.domusbet.it/betslip
--     ?selectionsData=<leg>|<leg>|<leg>&lingua=IT&systemCode=DOMUSBET
--
--   leg = <pal>_<avv>_<marketCode>_<handicap>_<esito>_<isLive>
--
-- Verified empirically on 2026-09-11 against Serie A fixtures: a single leg
-- loaded Lecce-Monza under 10.5 corners at 1.20, and a three-leg URL produced
-- the treble 1.20 x 1.31 x 1.26 = 1.98 with all three fixtures in the slip. `|`
-- is the separator - `;`, `,` and `-` each silently loaded only the FIRST leg,
-- which is the failure mode to watch for if this ever stops working. The app
-- consumes the parameter and strips it from the URL on arrival.
--
-- The capture already reads every field and threw them all away: `pal` and `avv`
-- ride on each row out of `parse()`, and marketCode/handicap/esito are the exact
-- tuple `event_markets()` uses as its dedup key.
--
-- Stored as ONE assembled token rather than five columns, because nothing needs
-- the parts: the button is `legs.join('|')`. Splitting them would add
-- reconstruction logic whose only job is to rebuild this string.
--
-- Nullable on purpose. Every row captured before this migration has no token and
-- cannot be linked, so the UI has to degrade rather than build a partial slip
-- and present it as the whole one.

ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS selection_ref text;

-- Verification: the column exists and is nullable.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'odds_snapshots'
   AND column_name = 'selection_ref';

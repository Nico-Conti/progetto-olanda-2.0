-- Store bookmaker and exchange prices, so a prediction can be scored against
-- what the market actually charged for it.
--
-- Nothing in the app has ever held an odds figure. The betting lines in
-- `frontend/src/utils/statistics.js` are hardcoded constants (corners 9.5,
-- goals 2.5), so every accuracy number the project has produced was measured
-- against a line no bookmaker necessarily offered. Measured on 2,891 matches,
-- only 46% of them would actually be priced at the 9.5 corner line - see
-- docs/prediction-model.md section 4. Without real prices there is no expected
-- value, no return on investment and no closing-line value, and "56% accurate"
-- stays a model-quality number rather than a claim about money.
--
-- Rows are SNAPSHOTS, not one row per match. The movement between the opening
-- and the closing price is what closing-line value is measured against, and it
-- is the reason to start capturing early: historical prices for the niche
-- markets cannot be bought or backfilled later.

CREATE TABLE IF NOT EXISTS odds_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    league       TEXT        NOT NULL,   -- display name, matching matches.league
    season       TEXT        NOT NULL,
    home_team    TEXT        NOT NULL,   -- our names, resolved via backend/odds/aliases.py
    away_team    TEXT        NOT NULL,
    match_date   TIMESTAMPTZ,
    market       TEXT        NOT NULL,   -- 'total_goals' | 'total_corners' | 'total_cards' | '1x2'
    line         NUMERIC,                -- 2.5, 9.5, ...; NULL for 1x2
    selection    TEXT        NOT NULL,   -- 'over' | 'under' | 'home' | 'draw' | 'away'
    price        NUMERIC     NOT NULL,   -- decimal odds
    back_price   NUMERIC,                -- exchange only; price is the mid of these two
    lay_price    NUMERIC,
    source       TEXT        NOT NULL,   -- 'betfair' | 'footballdata' | 'manual'
    bookmaker    TEXT,                   -- 'betfair_exchange', 'pinnacle', 'bet365', 'average'
    is_closing   BOOLEAN     NOT NULL DEFAULT FALSE,
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One price per book per selection per capture. COALESCE on `line` because a
-- NULL never equals a NULL, so 1x2 rows would otherwise duplicate freely.
CREATE UNIQUE INDEX IF NOT EXISTS odds_snapshot_uniq ON odds_snapshots
    (league, season, home_team, away_team, market, COALESCE(line, -1),
     selection, source, COALESCE(bookmaker, ''), captured_at);

-- The join the evaluation does: find every price for one fixture and market.
CREATE INDEX IF NOT EXISTS odds_lookup_idx ON odds_snapshots
    (league, season, home_team, away_team, market);

-- Finding the closing price of each fixture, which is what CLV compares against.
CREATE INDEX IF NOT EXISTS odds_closing_idx ON odds_snapshots
    (league, season, market, is_closing, match_date);

-- Row Level Security: ON, with no policies at all.
--
-- Supabase warns about a table created without RLS, and it is right to. Here the
-- correct answer is to enable it and grant nothing:
--
--   * the backend authenticates with a service_role key, which bypasses RLS, so
--     every reader and writer of this table keeps working unchanged;
--   * nothing else needs access. The frontend has no Supabase client - it was
--     deleted, and the React app talks only to FastAPI - so no anon or
--     authenticated key ever touches this table.
--
-- With RLS enabled and no policy defined, anon and authenticated keys can read
-- and write nothing, which is exactly right for a table holding the odds history
-- this project cannot buy or backfill.
ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;

-- Verification: the table and its columns.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'odds_snapshots'
 ORDER BY ordinal_position;

-- Verification: RLS should be enabled, with zero policies.
SELECT relname,
       relrowsecurity  AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.tablename = c.relname) AS policy_count
  FROM pg_class c
 WHERE c.relname = 'odds_snapshots';

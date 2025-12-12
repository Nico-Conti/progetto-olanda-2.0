-- Migration to add advanced statistics columns to the matches table

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS home_xg FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_xg FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_xgot FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_xgot FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_big_chances INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_big_chances INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_box_touches INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_box_touches INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_crosses INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_crosses INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_goalkeeper_saves INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_goalkeeper_saves INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_blocked_shots INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_blocked_shots INT DEFAULT 0;

-- Comment on columns for clarity
COMMENT ON COLUMN matches.home_box_touches IS 'Palloni toccati nell''area avversaria';
COMMENT ON COLUMN matches.home_xgot IS 'Expected Goals on Target';

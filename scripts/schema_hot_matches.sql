-- Add columns for Hot Matches feature
ALTER TABLE fixtures 
ADD COLUMN IF NOT EXISTS is_hot_match BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hot_match_reason TEXT;

-- Index for faster querying of hot matches
CREATE INDEX IF NOT EXISTS idx_fixtures_hot_match ON fixtures(is_hot_match);

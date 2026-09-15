-- Accounts: a saved history of played slips, and profile pictures.
--
-- Registration, login and passwords are Supabase Auth - nothing here stores a
-- credential. Username and favourite leagues live on the auth user's own
-- `user_metadata`, which only that user can write, so there is no profiles
-- table to keep in step with auth.users.
--
-- The frontend talks to these two objects directly with the anon key, so row
-- level security is the ONLY thing between one user and another's slips. Every
-- policy below keys on auth.uid(); without them the table is either wide open
-- or (with RLS on and no policy) invisible to everyone.

CREATE TABLE IF NOT EXISTS slips (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The slip exactly as the app holds it ({game, option, value, stat, team}),
    -- plus the price each leg had when it was played.
    legs        JSONB       NOT NULL CHECK (jsonb_typeof(legs) = 'array' AND jsonb_array_length(legs) > 0),
    -- Combined decimal odds. NULL when any leg had no captured price: a partial
    -- product would understate the return and read as the whole slip.
    odds        NUMERIC     CHECK (odds > 1),
    stake       NUMERIC     CHECK (stake > 0),
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'won', 'lost', 'void'))
);

CREATE INDEX IF NOT EXISTS slips_user_created ON slips (user_id, created_at DESC);

ALTER TABLE slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own slips" ON slips;
CREATE POLICY "own slips" ON slips FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Avatars: public to read (they are shown as <img>), writable only inside the
-- folder named after your own user id. Size and type are capped by the bucket
-- itself, so a crafted request cannot bypass the checks in the upload form.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- FOR ALL, not INSERT alone: the upload is an upsert, which needs SELECT and
-- UPDATE on the existing object as well.
DROP POLICY IF EXISTS "own avatar" ON storage.objects;
CREATE POLICY "own avatar" ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Verification: RLS is on and both policies exist.
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'slips';
SELECT tablename, policyname FROM pg_policies WHERE policyname IN ('own slips', 'own avatar');

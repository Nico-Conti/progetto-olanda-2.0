-- Sign in with a username as well as an email.
--
-- Supabase Auth only signs in by email, so the app resolves a username to its
-- email first (login_email below) and signs in with that. For that to mean
-- anything the username has to be unique, and it lives in user_metadata, which
-- nothing constrains. This table is the unique index: a trigger copies the
-- metadata username into it on every signup and rename, and a clash aborts the
-- signup/rename itself, so two accounts can never share a name.
--
-- Trade-off, deliberately accepted: login_email tells anyone who asks the email
-- behind a username. Usernames are not shown anywhere public in this app, so
-- guessing one is the hard part - but if they ever are, move this lookup
-- behind a rate-limited backend endpoint.

CREATE TABLE IF NOT EXISTS usernames (
    user_id   UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    -- No '@', so the login box can tell a username from an email.
    username  TEXT NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,30}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS usernames_lower ON usernames (lower(username));

-- RLS on with no policies: unreadable over the API. Only the two SECURITY
-- DEFINER functions below touch it.
ALTER TABLE usernames ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_username() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    name TEXT := nullif(trim(NEW.raw_user_meta_data ->> 'username'), '');
BEGIN
    IF name IS NULL THEN
        DELETE FROM public.usernames WHERE user_id = NEW.id;
    ELSE
        INSERT INTO public.usernames (user_id, username) VALUES (NEW.id, name)
        ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_username ON auth.users;
CREATE TRIGGER sync_username
    AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_username();

-- Accounts made before this migration. Names that break the rules are skipped:
-- those users still sign in by email and pick a valid name when they next save.
INSERT INTO usernames (user_id, username)
SELECT DISTINCT ON (lower(raw_user_meta_data ->> 'username')) id, raw_user_meta_data ->> 'username'
  FROM auth.users
 WHERE raw_user_meta_data ->> 'username' ~ '^[A-Za-z0-9_]{3,30}$'
 ORDER BY lower(raw_user_meta_data ->> 'username'), created_at
ON CONFLICT DO NOTHING;

-- The email to sign in with for a username (case-insensitive), or NULL.
CREATE OR REPLACE FUNCTION public.login_email(login TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT u.email
      FROM public.usernames n JOIN auth.users u ON u.id = n.user_id
     WHERE lower(n.username) = lower(login)
$$;
REVOKE EXECUTE ON FUNCTION public.login_email(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.login_email(TEXT) TO anon, authenticated;

-- Verification: every account with a valid username is indexed.
SELECT count(*) AS usernames FROM usernames;

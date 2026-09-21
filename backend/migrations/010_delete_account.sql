-- Let a user delete their own account from inside the app.
--
-- GDPR art. 17 is satisfied by handling a request sent to the controller, and
-- that is what the privacy policy promises - but "write us an email" is a poor
-- answer when the account was created with two clicks. This is the button.
--
-- It has to be a SECURITY DEFINER function. Deleting an account means deleting
-- the row in auth.users, which the anon key cannot do and which the client
-- library only exposes through `auth.admin`, i.e. the service_role key. That
-- key must never reach the browser: it bypasses RLS entirely, so shipping it
-- would hand every visitor the whole database. (frontend/.env holds one under a
-- VITE_ prefix and nothing imports it; keep it that way.)
--
-- What goes, and how:
--   slips      - ON DELETE CASCADE from auth.users (migration 008)
--   usernames  - ON DELETE CASCADE from auth.users (migration 009)
--   avatar     - NOT cascaded, and NOT deletable from here. storage.objects
--                does not follow the user, so the file would be left in a
--                PUBLIC bucket after the account that owns it is gone - but
--                Supabase refuses direct DML on the storage tables ("Direct
--                deletion from storage tables is not allowed. Use the Storage
--                API instead."), and it is right to: the row is only an index,
--                so deleting it would strand the actual object in the bucket
--                rather than remove it. The client calls storage.remove()
--                BEFORE this function, while its own "own avatar" RLS policy
--                still resolves. See DeleteAccount in AccountModal.jsx.
--
-- `search_path = ''` means every name must be schema-qualified; an unqualified
-- one is how a SECURITY DEFINER function gets hijacked by a shadowing object.

-- Returns the deleted id rather than void, deliberately: PostgREST turns a
-- void function into a null body, which the caller cannot tell apart from a
-- successful call that did nothing. An id coming back IS the confirmation.
CREATE OR REPLACE FUNCTION public.delete_account() RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
BEGIN
    -- Without this the function would run as its owner with a NULL uid and
    -- delete nothing, reporting success. Fail loudly instead.
    IF uid IS NULL THEN
        RAISE EXCEPTION 'delete_account: no authenticated user';
    END IF;

    DELETE FROM auth.users WHERE id = uid;
    RETURN uid;
END $$;

-- Only a signed-in user, and only ever their own account: the function takes no
-- argument, so there is nothing to point at anyone else.
REVOKE EXECUTE ON FUNCTION public.delete_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

-- Verification: the function exists, is SECURITY DEFINER (prosecdef), and is
-- executable by `authenticated` but not by `anon`.
SELECT p.proname,
       p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_may,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_may
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'delete_account';

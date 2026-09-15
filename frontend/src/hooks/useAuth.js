import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// The ANON/publishable key only - it ships in the bundle. What a signed-in user
// may touch is decided by the RLS policies in backend/migrations/008.
// Null when unconfigured, so a build without the env vars loses accounts
// rather than the whole app.
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_KEY: key } = import.meta.env;
export const supabase = url && key ? createClient(url, key) : null;

/** `{ user, openAccount }` for anything that shows the account button or saves a slip. */
export const AccountContext = createContext({ user: null, openAccount: () => {} });
export const useAccount = () => useContext(AccountContext);

/**
 * The signed-in user, or null. `onRecovery` fires when the page was opened from
 * a password-reset email: Supabase has already signed them in from the link,
 * and what they need next is the change-password form.
 */
export function useAuthUser(onRecovery) {
    const [user, setUser] = useState(null);
    useEffect(() => {
        if (!supabase) return;
        // Fires INITIAL_SESSION straight away, so no separate getSession().
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            if (event === 'PASSWORD_RECOVERY') onRecovery?.();
        });
        return () => data.subscription.unsubscribe();
    }, [onRecovery]);
    return user;
}

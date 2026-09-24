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

    // The account can change elsewhere: another tab hears it from Supabase's
    // BroadcastChannel, but only in the same browser on the same address. A
    // second browser, a private window, the deployed site beside localhost or
    // a phone would otherwise keep showing the old favourite team (or leagues,
    // language, picture) until a token refresh an hour later. So read the user
    // afresh whenever this tab comes back into view. Unchanged, it keeps the
    // same object, so nothing re-renders.
    useEffect(() => {
        if (!supabase) return;
        const refresh = async () => {
            if (document.visibilityState !== 'visible') return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) return;
            setUser(prev => (prev?.id === data.user.id && prev.updated_at === data.user.updated_at
                && JSON.stringify(prev.user_metadata) === JSON.stringify(data.user.user_metadata) ? prev : data.user));
        };
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, []);
    return user;
}

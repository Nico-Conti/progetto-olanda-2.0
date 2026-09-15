import React, { useEffect, useState } from 'react';
import { X, User, LogOut, History, Trash2, Star, Camera } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import { supabase, useAccount } from '../hooks/useAuth';
import SlidingTabs from './ui/SlidingTabs';
import { betMarket, betPick } from '../utils/statistics';
import { settleSlip, slipReturn, UNGRADEABLE } from '../utils/settle';

const INPUT = 'w-full bg-zinc-950/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50';
const PRIMARY = 'w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL = 'block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1';
const STATUS_STYLE = {
    pending: 'text-zinc-300', won: 'text-emerald-400', lost: 'text-red-400', void: 'text-zinc-500',
};

// Per-leg verdict. `null` is "cannot say" - not played, not scraped, or a market
// we deliberately do not grade - and it must read differently from a loss.
const LEG_MARK = {
    won: { mark: '✓', cls: 'text-emerald-400', title: 'Won' },
    lost: { mark: '✗', cls: 'text-red-400', title: 'Lost' },
    void: { mark: '—', cls: 'text-zinc-500', title: 'Void - stake returned for this leg' },
    null: { mark: '·', cls: 'text-zinc-600', title: 'Not settled yet' },
};

/**
 * One Supabase call with a busy flag and a message line. Every Supabase method
 * answers `{ data, error }` rather than throwing, so this is the whole error path.
 */
const useAction = () => {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const run = async (call, okText) => {
        setBusy(true);
        setMsg(null);
        const { data, error } = await call();
        setBusy(false);
        setMsg(error ? { text: error.message } : okText ? { ok: true, text: okText } : null);
        return error ? null : data;
    };
    return { busy, msg, setMsg, run };
};

/**
 * The email to sign in with: typed directly, or looked up from a username
 * (migration 009). Usernames cannot contain '@', so that is the whole test.
 */
const emailFor = async (login) => {
    if (login.includes('@')) return login;
    const { data } = await supabase.rpc('login_email', { login });
    return data;
};
// Same shape as a Supabase answer, so `run` shows it like any other error.
const fail = (message) => ({ error: { message } });
const USERNAME_RULES = { pattern: '[A-Za-z0-9_]{3,30}', title: '3-30 letters, numbers or _' };

const Message = ({ msg }) => msg && (
    <p role="status" className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
);

export const Avatar = ({ user, className = 'w-9 h-9' }) => {
    const meta = user?.user_metadata ?? {};
    const name = meta.username || user?.email || '';
    return (
        <span className={`${className} rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0`}>
            {meta.avatar_url
                ? <img src={meta.avatar_url} alt="" className="w-full h-full object-cover" />
                : user
                    ? <span className="font-bold text-emerald-400 uppercase">{name[0]}</span>
                    : <User className="w-1/2 h-1/2 text-zinc-400" />}
        </span>
    );
};

/** Header/landing entry point: the avatar when signed in, a person icon otherwise. */
export const AccountButton = () => {
    const { user, openAccount } = useAccount();
    if (!supabase) return null;
    return (
        <button
            onClick={openAccount}
            aria-label={user ? 'Your account' : 'Sign in'}
            title={user ? 'Your account' : 'Sign in'}
            className="rounded-full hover:ring-2 hover:ring-emerald-500/50 transition"
        >
            <Avatar user={user} />
        </button>
    );
};

// `onSignedIn` closes the modal once a session comes back, so signing in lands
// on the page underneath rather than on the profile.
const AuthForm = ({ onSignedIn }) => {
    const [mode, setMode] = useState('login');
    const { busy, msg, setMsg, run } = useAction();

    const submit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const login = form.get('login').trim();
        const password = form.get('password');
        if (mode === 'login') {
            // An unknown username gets the same answer as a wrong password.
            const data = await run(async () => {
                const email = await emailFor(login);
                return email ? supabase.auth.signInWithPassword({ email, password }) : fail('Invalid login credentials');
            });
            if (data?.session) onSignedIn();
            return;
        }
        const username = form.get('username').trim();
        // The database refuses a duplicate anyway (migration 009); asking first
        // turns its generic "Database error" into a message that says why.
        const data = await run(async () => (await emailFor(username))
            ? fail('That username is taken.')
            : supabase.auth.signUp({ email: login, password, options: { data: { username } } }));
        // No session back means the project requires email confirmation.
        if (data && !data.session) setMsg({ ok: true, text: 'Almost there - confirm the link we emailed you, then sign in.' });
        else if (data?.session) onSignedIn();
    };

    const forgot = (e) => {
        const login = e.currentTarget.form.login.value.trim();
        if (!login) return setMsg({ text: 'Type your email or username first, then press "Forgot password".' });
        run(async () => {
            const email = await emailFor(login);
            return email
                ? supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
                : fail('No account with that username.');
        }, 'Reset link sent - open it and set a new password here.');
    };

    return (
        <form onSubmit={submit} className="space-y-3">
            <SlidingTabs
                items={[{ id: 'login', label: 'Sign in' }, { id: 'register', label: 'Register' }]}
                value={mode}
                onChange={(m) => { setMode(m); setMsg(null); }}
                className="w-full"
                tabClassName="flex-1 font-semibold"
            />
            {mode === 'register' && (
                <label className="block">
                    <span className={LABEL}>Username</span>
                    <input name="username" required {...USERNAME_RULES} autoComplete="username" className={INPUT} />
                </label>
            )}
            <label className="block">
                <span className={LABEL}>{mode === 'login' ? 'Email or username' : 'Email'}</span>
                <input
                    name="login" required type={mode === 'login' ? 'text' : 'email'}
                    autoComplete={mode === 'login' ? 'username' : 'email'} className={INPUT}
                />
            </label>
            <label className="block">
                <span className={LABEL}>Password</span>
                <input
                    name="password" type="password" required minLength={8}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className={INPUT}
                />
            </label>
            <Message msg={msg} />
            <button type="submit" disabled={busy} className={PRIMARY}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            {mode === 'login' && (
                <button type="button" onClick={forgot} disabled={busy} className="w-full text-xs text-zinc-500 hover:text-zinc-300">
                    Forgot password?
                </button>
            )}
        </form>
    );
};

const ProfileTab = ({ user, leagues }) => {
    const meta = user.user_metadata ?? {};
    // Local copy so two quick clicks each build on the other, not on a stale user.
    const [favourites, setFavourites] = useState(meta.favourite_leagues ?? []);
    const { busy, msg, run } = useAction();
    const saveMeta = (data, okText) => run(() => supabase.auth.updateUser({ data }), okText);

    const uploadAvatar = async (file) => {
        if (!file) return;
        const path = `${user.id}/avatar`;
        // Size and type are enforced by the bucket (migration 008); its refusal
        // comes back as the error message.
        const ok = await run(() => supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type }));
        if (!ok) return;
        const { publicUrl } = supabase.storage.from('avatars').getPublicUrl(path).data;
        // Same path every time, so bust the browser's cache of the old picture.
        saveMeta({ avatar_url: `${publicUrl}?v=${Date.now()}` }, 'Picture updated.');
    };

    const toggleFavourite = (league) => {
        const next = favourites.includes(league) ? favourites.filter(l => l !== league) : [...favourites, league];
        setFavourites(next);
        saveMeta({ favourite_leagues: next });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group" title="Change picture">
                    <Avatar user={user} className="w-16 h-16 text-2xl" />
                    <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center justify-center transition">
                        <Camera className="w-5 h-5 text-white" />
                    </span>
                    <input
                        type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only"
                        aria-label="Upload profile picture" disabled={busy}
                        onChange={(e) => uploadAvatar(e.target.files[0])}
                    />
                </label>
                <form
                    className="flex-1 flex gap-2 items-end"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const username = e.currentTarget.username.value.trim();
                        run(async () => {
                            const owner = await emailFor(username);
                            return owner && owner !== user.email
                                ? fail('That username is taken.')
                                : supabase.auth.updateUser({ data: { username } });
                        }, 'Username saved.');
                    }}
                >
                    <label className="flex-1">
                        <span className={LABEL}>Username</span>
                        <input name="username" defaultValue={meta.username ?? ''} required {...USERNAME_RULES} className={INPUT} />
                    </label>
                    <button disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/15 text-white disabled:opacity-50">Save</button>
                </form>
            </div>
            <p className="text-xs text-zinc-500 -mt-4">{user.email}</p>

            <div>
                <span className={LABEL}>Favourite leagues</span>
                <p className="text-[11px] text-zinc-500 mb-2">Pinned to the landing page for one-click access.</p>
                <div className="flex flex-wrap gap-2">
                    {leagues.map(league => {
                        const on = favourites.includes(league);
                        return (
                            <button
                                key={league}
                                onClick={() => toggleFavourite(league)}
                                aria-pressed={on}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'}`}
                            >
                                <Star className={`w-3 h-3 ${on ? 'fill-amber-400 text-amber-400' : ''}`} />
                                {league}
                            </button>
                        );
                    })}
                </div>
            </div>

            <form
                className="flex gap-2 items-end"
                onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    if (await run(() => supabase.auth.updateUser({ password: form.password.value }), 'Password changed.')) form.reset();
                }}
            >
                <label className="flex-1">
                    <span className={LABEL}>New password</span>
                    <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
                </label>
                <button disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/15 text-white disabled:opacity-50">Change</button>
            </form>

            <Message msg={msg} />

            <button
                onClick={() => supabase.auth.signOut()}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition border border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center gap-2"
            >
                <LogOut className="w-4 h-4" /> Sign out
            </button>
        </div>
    );
};

const HistoryTab = ({ matchData }) => {
    const [slips, setSlips] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        // RLS returns only this user's rows; no user filter needed here.
        // ponytail: newest 200 only - page it when someone plays more.
        supabase.from('slips').select('*').order('created_at', { ascending: false }).limit(200)
            .then(({ data, error }) => { setSlips(data ?? []); setError(error?.message); });
    }, []);

    const setStatus = async (id, status) => {
        const { error } = await supabase.from('slips').update({ status }).eq('id', id);
        if (error) return setError(error.message);
        setSlips(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
    };

    const remove = async (id) => {
        if (!window.confirm('Delete this slip from your history?')) return;
        const { error } = await supabase.from('slips').delete().eq('id', id);
        if (error) return setError(error.message);
        setSlips(prev => prev.filter(s => s.id !== id));
    };

    if (!slips) return <p className="text-center text-zinc-500 py-8 text-sm">Loading…</p>;

    // Every slip graded against what was actually played. Derived on read rather
    // than written back: a match re-scraped tomorrow (a corrected statistic, a
    // postponement finally played) simply grades differently next time, where a
    // stored verdict would keep the old answer for ever.
    //
    // The stored `status` stays as a manual OVERRIDE - anything the user has set
    // by hand wins, which is what settles the markets we refuse to grade
    // ourselves and anything the book voided for its own reasons.
    const rows = slips.map((slip) => {
        const settled = settleSlip(slip, matchData);
        const status = slip.status !== 'pending' ? slip.status : settled.status;
        const auto = slip.status === 'pending' && status !== 'pending';
        return { slip, settled: { ...settled, status }, status, auto };
    });

    const done = rows.filter(r => r.status === 'won' || r.status === 'lost' || r.status === 'void');
    const returns = done.map(r => slipReturn(r.slip, r.settled)).filter(Boolean);
    const profit = returns.reduce((sum, r) => sum + r.profit, 0);
    const staked = done.reduce((sum, r) => sum + (Number(r.slip.stake) > 0 ? Number(r.slip.stake) : 0), 0);
    // Only slips carrying a stake can enter a ledger, so say how many did.
    const counted = returns.length;

    return (
        <div className="space-y-3">
            {error && <Message msg={{ text: error }} />}
            {slips.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                    <p>No played slips yet.</p>
                    <p className="text-xs mt-1">Use "Save as played" in the bet slip.</p>
                </div>
            ) : (
                <>
                    <div className="flex justify-between text-xs text-zinc-400 px-1">
                        <span>{slips.length} slips · {counted} settled</span>
                        <span className={`font-mono font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            P/L {profit >= 0 ? '+' : '−'}€{Math.abs(profit).toFixed(2)}
                        </span>
                    </div>
                    {staked > 0 && (
                        <p className="text-[10px] text-zinc-500 px-1 -mt-1">
                            €{staked.toFixed(2)} staked · {(100 * profit / staked).toFixed(1)}% ROI.
                            Settled from played matches; pick an outcome by hand to override.
                        </p>
                    )}
                    {rows.map(({ slip, settled, status, auto }) => (
                        <div key={slip.id} className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-zinc-500">
                                    {new Date(slip.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                                <div className="flex items-center gap-1">
                                    {auto && (
                                        <span
                                            title="Graded from the played match. Choose an outcome to override."
                                            className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 border border-white/10 rounded px-1.5 py-0.5"
                                        >
                                            auto
                                        </span>
                                    )}
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(slip.id, e.target.value)}
                                        aria-label="Slip outcome"
                                        className={`bg-zinc-950/60 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold uppercase ${STATUS_STYLE[status]}`}
                                    >
                                        {Object.keys(STATUS_STYLE).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button onClick={() => remove(slip.id)} aria-label="Delete slip" className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <ul className="space-y-1">
                                {settled.legs.map(({ leg: bet, status: legStatus }, i) => (
                                    <li key={i} className="text-xs flex justify-between gap-2">
                                        <span className="text-white font-semibold truncate">
                                            <span className={`mr-1.5 font-mono ${(LEG_MARK[legStatus] ?? LEG_MARK.null).cls}`}
                                                  title={(LEG_MARK[legStatus] ?? LEG_MARK.null).title}>
                                                {(LEG_MARK[legStatus] ?? LEG_MARK.null).mark}
                                            </span>
                                            {bet.game}
                                        </span>
                                        <span className="shrink-0 text-zinc-400">
                                            <span className="uppercase text-[10px]">{betMarket(bet)}</span>{' '}
                                            <span className="text-emerald-400 font-mono font-bold">{betPick(bet)}</span>
                                            {bet.price && <span className="font-mono text-zinc-500"> @{bet.price.toFixed(2)}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {status === 'pending' && settled.graded < settled.total && (
                                <p className="text-[10px] text-zinc-500">
                                    {settled.graded} of {settled.total} legs settled
                                    {settled.legs.some(l => UNGRADEABLE.has(l.leg?.stat))
                                        && ' · one of these is a market we do not settle ourselves'}
                                    .
                                </p>
                            )}
                            <div className="flex justify-between text-xs text-zinc-400 border-t border-white/5 pt-2 font-mono">
                                <span>odds {slip.odds ? Number(slip.odds).toFixed(2) : '—'}</span>
                                <span>stake {slip.stake ? `€${Number(slip.stake).toFixed(2)}` : '—'}</span>
                                <span>
                                    {status === 'won' || status === 'lost' || status === 'void' ? 'returned' : 'returns'}{' '}
                                    {(() => {
                                        const r = slipReturn(slip, settled);
                                        if (r) return `€${r.returned.toFixed(2)}`;
                                        return slip.odds && slip.stake ? `€${(slip.odds * slip.stake).toFixed(2)}` : '—';
                                    })()}
                                </span>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};

const TABS = [
    { id: 'profile', label: 'Profile', Icon: User },
    { id: 'history', label: 'Slip history', Icon: History },
];

const AccountModal = ({ isOpen, onClose, leagues, matchData }) => {
    const { user } = useAccount();
    const mounted = usePresence(isOpen, '--modal-close-dur');
    const [tab, setTab] = useState('profile');
    // Opened signed out, it stays the sign-in form until it has closed: the
    // user arrives a moment before signInWithPassword returns, and would flash
    // the profile on the way out. A reset link opens it with the user already
    // set (same render), so that still gets the profile and its password form.
    const [wasOpen, setWasOpen] = useState(isOpen);
    const [signedOutAtOpen, setSignedOutAtOpen] = useState(!user);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) setSignedOutAtOpen(!user);
    }

    if (!mounted || !supabase) return null;

    return (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity starting:opacity-0 ${isOpen ? 'duration-250' : 'duration-150 opacity-0'}`}>
            <div
                role="dialog" aria-modal="true" aria-label="Account"
                className={`t-modal ${isOpen ? 'is-open' : 'is-closing'} bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
                        {user && !signedOutAtOpen ? <Avatar user={user} className="w-7 h-7 text-sm" /> : <User className="w-5 h-5 text-emerald-400" />}
                        <span className="truncate">{user && !signedOutAtOpen ? (user.user_metadata?.username || 'Your account') : 'Welcome'}</span>
                    </h3>
                    <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto custom-scrollbar space-y-4">
                    {!user || signedOutAtOpen ? <AuthForm onSignedIn={onClose} /> : (
                        <>
                            <SlidingTabs items={TABS} value={tab} onChange={setTab} className="w-full" tabClassName="flex-1 font-semibold" />
                            {tab === 'profile'
                                ? <ProfileTab key={user.id} user={user} leagues={leagues} />
                                : <HistoryTab key={user.id} matchData={matchData} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountModal;

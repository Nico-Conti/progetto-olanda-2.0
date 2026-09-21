import React, { useEffect, useState } from 'react';
import { X, User, LogOut, History, Trash2, Star, Camera, ChevronRight } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import { supabase, useAccount } from '../hooks/useAuth';
import SlidingTabs from './ui/SlidingTabs';
import { betMarket, betPick } from '../utils/statistics';
import { settleSlip, slipReturn, UNGRADEABLE } from '../utils/settle';
import { t, tk, dateLocale, getLanguage, setLanguage, LANGUAGES } from '../i18n';
import { privacyHref, termsHref } from '../utils/legal';

const INPUT = 'w-full bg-zinc-950/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50';
const PRIMARY = 'w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL = 'block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1';
const LEGAL_LINK = 'underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-400 hover:decoration-emerald-400/60';
const STATUS_LABEL = { pending: tk('pending'), won: tk('won'), lost: tk('lost'), void: tk('void') };
const STATUS_STYLE = {
    pending: 'text-zinc-300', won: 'text-emerald-400', lost: 'text-red-400', void: 'text-zinc-500',
};

// Per-leg verdict. `null` is "cannot say" - not played, not scraped, or a market
// we deliberately do not grade - and it must read differently from a loss.
const LEG_MARK = {
    won: { mark: '✓', cls: 'text-emerald-400', title: tk('Won') },
    lost: { mark: '✗', cls: 'text-red-400', title: tk('Lost') },
    void: { mark: '—', cls: 'text-zinc-500', title: tk('Void - stake returned for this leg') },
    null: { mark: '·', cls: 'text-zinc-600', title: tk('Not settled yet') },
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
            aria-label={user ? t('Your account') : t('Sign in')}
            title={user ? t('Your account') : t('Sign in')}
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
                return email ? supabase.auth.signInWithPassword({ email, password }) : fail(t('Invalid login credentials'));
            });
            if (data?.session) onSignedIn();
            return;
        }
        const username = form.get('username').trim();
        // The database refuses a duplicate anyway (migration 009); asking first
        // turns its generic "Database error" into a message that says why.
        // `emailRedirectTo` or the confirmation link goes to the project's Site
        // URL, which is one fixed value and cannot be right for both localhost
        // and the deployed site. Sending them back to the origin they signed up
        // from is, which is what the reset link below already does. The origin
        // must be in Supabase's Redirect URLs allow-list or it is ignored and
        // the Site URL is used anyway - silently.
        const data = await run(async () => (await emailFor(username))
            ? fail(t('That username is taken.'))
            : supabase.auth.signUp({
                email: login,
                password,
                options: { data: { username }, emailRedirectTo: window.location.origin },
            }));
        // No session back means the project requires email confirmation.
        if (data && !data.session) setMsg({ ok: true, text: t('Almost there - confirm the link we emailed you, then sign in.') });
        else if (data?.session) onSignedIn();
    };

    const forgot = (e) => {
        const login = e.currentTarget.form.login.value.trim();
        if (!login) return setMsg({ text: t('Type your email or username first, then press "Forgot password".') });
        run(async () => {
            const email = await emailFor(login);
            return email
                ? supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
                : fail(t('No account with that username.'));
        }, t('Reset link sent - open it and set a new password here.'));
    };

    return (
        <form onSubmit={submit} className="space-y-3">
            <SlidingTabs
                items={[{ id: 'login', label: t('Sign in') }, { id: 'register', label: t('Register') }]}
                value={mode}
                onChange={(m) => { setMode(m); setMsg(null); }}
                className="w-full"
                tabClassName="flex-1 font-semibold"
            />
            {mode === 'register' && (
                <label className="block">
                    <span className={LABEL}>{t('Username')}</span>
                    <input name="username" required {...USERNAME_RULES} autoComplete="username" className={INPUT} />
                </label>
            )}
            <label className="block">
                <span className={LABEL}>{mode === 'login' ? t('Email or username') : t('Email')}</span>
                <input
                    name="login" required type={mode === 'login' ? 'text' : 'email'}
                    autoComplete={mode === 'login' ? 'username' : 'email'} className={INPUT}
                />
            </label>
            <label className="block">
                <span className={LABEL}>{t('Password')}</span>
                <input
                    name="password" type="password" required minLength={8}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className={INPUT}
                />
            </label>
            {/* GDPR art. 13 wants the information where the data is given, not
                only on a page you have to go looking for - so the notice sits on
                the register tab itself rather than in the footer.

                The age box is a real `required` checkbox, not a line of prose:
                this site covers betting markets and the policy says 18+, so the
                claim has to be the user's, made deliberately. It carries no
                `name`, because nothing about it is worth storing - the browser
                enforces it and that is the whole job. */}
            {mode === 'register' && (
                <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2 text-xs text-zinc-400">
                        <input type="checkbox" required className="mt-0.5 accent-emerald-500" />
                        <span>{t('I am at least 18 years old.')}</span>
                    </label>
                    {/* Whole sentences, with the links on their own line. Splicing
                        an <a> into the middle of a translated string forces every
                        language to keep our word order. */}
                    <p className="text-xs leading-relaxed text-zinc-400">
                        {t('By registering you accept the terms of service and the privacy policy.')}
                    </p>
                    <p className="text-xs text-zinc-400">
                        <a href={termsHref()} target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
                            {t('Terms of service')}
                        </a>
                        <span aria-hidden="true" className="mx-2 text-zinc-700">/</span>
                        <a href={privacyHref()} target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
                            {t('Privacy policy')}
                        </a>
                    </p>
                </div>
            )}
            <Message msg={msg} />
            <button type="submit" disabled={busy} className={PRIMARY}>
                {mode === 'login' ? t('Sign in') : t('Create account')}
            </button>
            {mode === 'login' && (
                <button type="button" onClick={forgot} disabled={busy} className="w-full text-xs text-zinc-500 hover:text-zinc-300">
                    {t('Forgot password?')}
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
        saveMeta({ avatar_url: `${publicUrl}?v=${Date.now()}` }, t('Picture updated.'));
    };

    const toggleFavourite = (league) => {
        const next = favourites.includes(league) ? favourites.filter(l => l !== league) : [...favourites, league];
        setFavourites(next);
        saveMeta({ favourite_leagues: next });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group" title={t('Change picture')}>
                    <Avatar user={user} className="w-16 h-16 text-2xl" />
                    <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center justify-center transition">
                        <Camera className="w-5 h-5 text-white" />
                    </span>
                    <input
                        type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only"
                        aria-label={t('Upload profile picture')} disabled={busy}
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
                                ? fail(t('That username is taken.'))
                                : supabase.auth.updateUser({ data: { username } });
                        }, t('Username saved.'));
                    }}
                >
                    <label className="flex-1">
                        <span className={LABEL}>{t('Username')}</span>
                        <input name="username" defaultValue={meta.username ?? ''} required {...USERNAME_RULES} className={INPUT} />
                    </label>
                    <button disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/15 text-white disabled:opacity-50">{t('Save')}</button>
                </form>
            </div>
            <p className="text-xs text-zinc-500 -mt-4">{user.email}</p>

            <div>
                <span className={LABEL}>{t('Language')}</span>
                <SlidingTabs
                    items={LANGUAGES}
                    value={getLanguage()}
                    onChange={(lang) => { setLanguage(lang); saveMeta({ language: lang }); }}
                    className="w-full"
                    tabClassName="flex-1 font-semibold"
                />
            </div>

            <div>
                <span className={LABEL}>{t('Favourite leagues')}</span>
                <p className="text-[11px] text-zinc-500 mb-2">{t('Pinned to the landing page for one-click access.')}</p>
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
                    if (await run(() => supabase.auth.updateUser({ password: form.password.value }), t('Password changed.'))) form.reset();
                }}
            >
                <label className="flex-1">
                    <span className={LABEL}>{t('New password')}</span>
                    <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
                </label>
                <button disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/15 text-white disabled:opacity-50">{t('Change')}</button>
            </form>

            <Message msg={msg} />

            <button
                onClick={() => supabase.auth.signOut()}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition border border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center gap-2"
            >
                <LogOut className="w-4 h-4" /> {t('Sign out')}
            </button>

            <DeleteAccount user={user} />
        </div>
    );
};

/**
 * Deleting your own account, from inside the app.
 *
 * GDPR art. 17 is met by handling an emailed request, and the privacy policy
 * says so - but an account made with two clicks should not need a letter to
 * undo. The work happens in `delete_account()` (migration 010): auth.users
 * cannot be touched with the anon key, and the service_role key that could must
 * never reach the browser.
 *
 * Unlike every other destructive action here this one cannot be undone and
 * takes the saved slips with it, so `window.confirm` - what a single slip gets
 * - is not enough. The name has to be typed. Two steps, and the second is not
 * a button you can land on by reflex.
 */
const DeleteAccount = ({ user }) => {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const { busy, msg, run } = useAction();

    const name = user.user_metadata?.username || user.email;
    // Case-insensitive on purpose. The gate is "type it out deliberately", not
    // "reproduce the capitalisation" - and see the label below for how badly
    // that went when the two could disagree.
    const confirmed = typed.trim().toLowerCase() === name.toLowerCase();

    const destroy = async () => {
        if (!confirmed) return;
        // The avatar goes FIRST, and from here rather than from the function.
        // Supabase refuses direct DML on storage.objects, and rightly: that row
        // is an index, so deleting it would strand the file in a PUBLIC bucket
        // instead of removing it. This runs while the user's own "own avatar"
        // RLS policy still resolves - after the auth row is gone it would not.
        // Removing a path that is not there is not an error, so this is safe
        // for an account that never uploaded one.
        const ok = await run(async () => {
            const gone = await supabase.storage.from('avatars').remove([`${user.id}/avatar`]);
            // Stop rather than proceed: the policy promises the picture goes
            // with the account, and a half-done deletion that leaves a public
            // photo behind is the one outcome worth refusing. Retrying is safe.
            if (gone.error) return gone;
            return supabase.rpc('delete_account');
        });
        if (!ok) return;
        // The row is gone, so the access token no longer resolves to anyone and
        // a server-side sign-out would answer with an error about a user that
        // does not exist. Clearing the local session is the whole job.
        await supabase.auth.signOut({ scope: 'local' });
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition text-zinc-500 hover:text-red-400 flex items-center justify-center gap-2"
            >
                <Trash2 className="w-3.5 h-3.5" /> {t('Delete account')}
            </button>
        );
    }

    return (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs leading-relaxed text-zinc-300">
                {t('This deletes your account, your saved slips and your profile picture. It cannot be undone.')}
            </p>
            {/* The name is NOT interpolated into LABEL. That class carries
                `uppercase`, so a lowercase username rendered through it told the
                user to type something that could never match, and the confirm
                button stayed dead with nothing on screen explaining why.
                Anything the user has to reproduce character by character must be
                shown in its own casing - `normal-case` here defends it against
                LABEL coming back. */}
            <label className="block">
                <span className={LABEL}>{t('Type your username to confirm')}</span>
                <span className="mb-1 block select-all font-mono text-sm normal-case text-zinc-200">{name}</span>
                <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    aria-label={t('Type your username to confirm')}
                    className={INPUT}
                />
            </label>
            <Message msg={msg} />
            <div className="flex gap-2">
                <button
                    onClick={() => { setOpen(false); setTyped(''); }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-white/10 text-zinc-300 hover:bg-white/5"
                >
                    {t('Cancel')}
                </button>
                <button
                    onClick={destroy}
                    disabled={!confirmed || busy}
                    className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide bg-red-500/90 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {t('Delete for ever')}
                </button>
            </div>
        </div>
    );
};

/**
 * The kickoff of a leg whose match has not been played yet, or null.
 *
 * `addToBet` stores the fixture's date on every bet, so a saved slip already
 * carries this - nothing is looked up against matchData. A postponed fixture
 * has a date and no kick-off time (it stores as 22:00Z the previous day), and
 * diretta's date-only rows have no `T`, so the time is shown only when there
 * genuinely is one.
 */
const upcomingKickoff = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d) || d <= new Date()) return null;
    const day = d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' });
    if (!String(date).includes('T')) return day;
    return `${day} ${d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`;
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

    const remove = async (id) => {
        if (!window.confirm(t('Delete this slip from your history?'))) return;
        const { error } = await supabase.from('slips').delete().eq('id', id);
        if (error) return setError(error.message);
        setSlips(prev => prev.filter(s => s.id !== id));
    };

    if (!slips) return <p className="text-center text-zinc-500 py-8 text-sm">{t('Loading…')}</p>;

    // Every slip graded against what was actually played, and ONLY against that.
    // Derived on read rather than written back: a match re-scraped tomorrow (a
    // corrected statistic, a postponement finally played) simply grades
    // differently next time, where a stored verdict would keep the old answer.
    //
    // There is deliberately no way to set an outcome by hand. A ledger whose
    // entries the owner can edit is not a record of anything, and the honest
    // answer for a leg we cannot grade is "pending", not whatever the user
    // would like it to be. The `slips.status` column is consequently written by
    // nothing and read by nothing.
    const rows = slips.map((slip) => {
        const settled = settleSlip(slip, matchData);
        return { slip, settled, status: settled.status };
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
                    <p>{t('No played slips yet.')}</p>
                    <p className="text-xs mt-1">{t('Use "Save as played" in the bet slip.')}</p>
                </div>
            ) : (
                <>
                    <div className="flex justify-between text-xs text-zinc-400 px-1">
                        <span>{t('{slips} slips · {settled} settled', { slips: slips.length, settled: counted })}</span>
                        <span className={`font-mono font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            P/L {profit >= 0 ? '+' : '−'}€{Math.abs(profit).toFixed(2)}
                        </span>
                    </div>
                    {staked > 0 && (
                        <p className="text-[10px] text-zinc-500 px-1 -mt-1">
                            {t('€{staked} staked · {roi}% ROI, over settled slips only.',
                                { staked: staked.toFixed(2), roi: (100 * profit / staked).toFixed(1) })}
                        </p>
                    )}
                    {rows.map(({ slip, settled, status }) => (
                        // <details> rather than a useState per card: the browser
                        // already does this, with the keyboard and screen-reader
                        // behaviour we would otherwise have to write. Collapsed by
                        // default - the header carries what you scan for, and the
                        // legs are the detail you open for.
                        <details key={slip.id} className="group bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-white/5">
                                <ChevronRight className="w-4 h-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" />
                                <span className="text-xs text-zinc-500 shrink-0">
                                    {new Date(slip.created_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                                </span>
                                <span className="text-xs text-zinc-500 shrink-0">
                                    {t('{n} legs', { n: settled.total })}
                                </span>
                                {/* The numbers being scanned for, so the common case
                                    needs no expanding at all. */}
                                <span className="ml-auto text-xs font-mono text-zinc-400 shrink-0">
                                    {slip.stake ? `€${Number(slip.stake).toFixed(2)}` : '—'}
                                    {' @ '}
                                    {slip.odds ? Number(slip.odds).toFixed(2) : '—'}
                                </span>
                                <span
                                    aria-label={t('Slip outcome')}
                                    className={`px-2 py-1 text-xs font-bold uppercase shrink-0 ${STATUS_STYLE[status]}`}
                                >
                                    {t(STATUS_LABEL[status])}
                                </span>
                                <button
                                    // Inside a <summary>, so without this the click
                                    // toggles the card open on its way up.
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(slip.id); }}
                                    aria-label={t('Delete slip')}
                                    className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg shrink-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </summary>

                            <div className="px-3 pb-3 space-y-2">
                                <ul className="space-y-1">
                                    {settled.legs.map(({ leg: bet, status: legStatus, actual }, i) => (
                                        // Stacked at EVERY width, and that is the
                                        // unusual part. A combo's market and pick
                                        // together are wider than this card, and a
                                        // too-narrow flex sibling CLIPS rather than
                                        // overflowing - the fixture name vanished
                                        // entirely while the page reported no overflow
                                        // at all. A `sm:` breakpoint looked like the
                                        // fix and is wrong here: Tailwind breakpoints
                                        // read the VIEWPORT, but this modal is
                                        // `max-w-md` on every screen, so `sm:flex-row`
                                        // would put the clipping back on every desktop.
                                        <li key={i} className="text-xs flex flex-col">
                                            {/* The name TRUNCATES and the kickoff does not:
                                                this card is max-w-md at every width, and a
                                                flex sibling that cannot shrink clips instead
                                                of overflowing - which is how the fixture name
                                                once vanished entirely. The date is short and
                                                fixed-width, so the name is the one that yields. */}
                                            <span className="text-white font-semibold flex items-baseline gap-1.5 min-w-0">
                                                <span className={`shrink-0 font-mono ${(LEG_MARK[legStatus] ?? LEG_MARK.null).cls}`}
                                                      title={t((LEG_MARK[legStatus] ?? LEG_MARK.null).title)}>
                                                    {(LEG_MARK[legStatus] ?? LEG_MARK.null).mark}
                                                </span>
                                                <span className="truncate">{bet.game}</span>
                                                {upcomingKickoff(bet.date) && (
                                                    <span className="ml-auto shrink-0 font-normal font-mono text-[10px] text-zinc-500 tabular-nums">
                                                        {upcomingKickoff(bet.date)}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="shrink-0 text-zinc-400 truncate pl-[1.375rem]">
                                                <span className="uppercase text-[10px]">{betMarket(bet)}</span>{' '}
                                                <span className="text-emerald-400 font-mono font-bold">{betPick(bet)}</span>
                                                {bet.price && <span className="font-mono text-zinc-500"> @{bet.price.toFixed(2)}</span>}
                                                {/* What actually happened, beside the
                                                    verdict. Absent for a market we do
                                                    not settle ourselves, so it never
                                                    shows our count where the
                                                    bookmaker's belongs. */}
                                                {actual && (
                                                    <span className="font-mono text-zinc-300" title={t('Actual result')}>
                                                        {' · '}{actual}
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {status === 'pending' && settled.graded < settled.total && (
                                    <p className="text-[10px] text-zinc-500">
                                        {t('{graded} of {total} legs settled',
                                            { graded: settled.graded, total: settled.total })}
                                        {settled.legs.some(l => UNGRADEABLE.has(l.leg?.stat))
                                            && ` · ${t('one of these is a market we do not settle ourselves')}`}
                                        .
                                    </p>
                                )}
                                <div className="flex justify-between text-xs text-zinc-400 border-t border-white/5 pt-2 font-mono">
                                    <span>
                                        {new Date(slip.created_at).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                    <span>
                                        {status === 'won' || status === 'lost' || status === 'void' ? t('returned') : t('returns')}{' '}
                                        {(() => {
                                            const r = slipReturn(slip, settled);
                                            if (r) return `€${r.returned.toFixed(2)}`;
                                            return slip.odds && slip.stake ? `€${(slip.odds * slip.stake).toFixed(2)}` : '—';
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </details>

                    ))}
                </>
            )}
        </div>
    );
};

const TABS = [
    { id: 'profile', label: tk('Profile'), Icon: User },
    { id: 'history', label: tk('Slip history'), Icon: History },
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
                role="dialog" aria-modal="true" aria-label={t('Account')}
                className={`t-modal ${isOpen ? 'is-open' : 'is-closing'} bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
                        {user && !signedOutAtOpen ? <Avatar user={user} className="w-7 h-7 text-sm" /> : <User className="w-5 h-5 text-emerald-400" />}
                        <span className="truncate">{user && !signedOutAtOpen ? (user.user_metadata?.username || t('Your account')) : t('Welcome')}</span>
                    </h3>
                    <button onClick={onClose} aria-label={t('Close')} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto custom-scrollbar space-y-4">
                    {!user || signedOutAtOpen ? <AuthForm onSignedIn={onClose} /> : (
                        <>
                            <SlidingTabs items={TABS.map(tab => ({ ...tab, label: t(tab.label) }))} value={tab} onChange={setTab} className="w-full" tabClassName="flex-1 font-semibold" />
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

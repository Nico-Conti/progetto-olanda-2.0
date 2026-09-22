import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ticket, Minus, Plus, Check, Search, ChevronUp, ChevronDown, ListChecks, CalendarCheck, ShieldCheck, Gem, Sparkles, ShoppingCart, SearchX } from 'lucide-react';
import Header from './Header';
import SlidingTabs from './ui/SlidingTabs';
import { planSlips, PLANNER_MARKETS } from '../utils/bonusPlanner';
import { buildPredictionModel, predictFromModel, ENGINES } from '../utils/predictTotal';
import { getStatLabel, formatSelection } from '../utils/statistics';
import { gameKey } from '../utils/bets';
import { staggerDelay } from '../utils/stagger';
import { useCountUp } from '../hooks/useCountUp';
import { usePersistedPrefs } from '../hooks/usePersistedPrefs';
import { t, dateLocale } from '../i18n';
import { CoinCascade } from './LandingPage';

const SLIP_MARKETS = PLANNER_MARKETS.filter(m => m.slipOnly).map(m => m.id);
const MODELLED = PLANNER_MARKETS.filter(m => !m.slipOnly);

const legLabel = (leg, market) => (market.slipOnly
    ? `${getStatLabel(market.stat)}${leg.line != null ? ` ${leg.line}` : ''} · ${formatSelection(leg.selection)}`
    : `${getStatLabel(market.stat)} ${formatSelection(leg.selection, leg.line)}`);

/**
 * A number the punter sets: type it or nudge it. What is typed is held as text
 * and only passed on once it reads as a number in range, so the field can be
 * emptied mid-edit (it used to snap back to 0) and "1," reads as the start of
 * "1,50". Leaving the field shows the last good value again.
 */
const NumberField = ({ label, value, onChange, step, min, max, decimals = 0, prefix }) => {
    const [draft, setDraft] = useState(null);
    const clamp = (v) => Math.min(max, Math.max(min, +v.toFixed(decimals)));
    const type = (text) => {
        setDraft(text);
        const v = parseFloat(text.replace(',', '.'));
        if (Number.isFinite(v) && v >= min && v <= max) onChange(+v.toFixed(decimals));
    };
    return (
        <div className="min-w-0">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 truncate">{label}</span>
            <div className="bp-control flex items-center h-10 rounded-lg">
                <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min}
                    aria-label={t('Decrease')} className="bp-nudge"><Minus className="w-3.5 h-3.5" /></button>
                {prefix && <span className="text-sm font-bold text-zinc-500">{prefix}</span>}
                <input inputMode="decimal" value={draft ?? value.toFixed(decimals)} aria-label={label}
                    onChange={e => type(e.target.value)} onBlur={() => setDraft(null)}
                    className="w-full min-w-0 bg-transparent text-center text-sm font-black text-white tabular-nums outline-none" />
                <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max}
                    aria-label={t('Increase')} className="bp-nudge"><Plus className="w-3.5 h-3.5" /></button>
            </div>
        </div>
    );
};

/** Chance of the whole slip landing, as a ring that fills. */
const ChanceRing = ({ prob }) => {
    const shown = useCountUp(prob, 1100);
    const r = 34;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <defs>
                    <linearGradient id="bp-ring" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fbbf24" />
                        <stop offset="1" stopColor="#e879f9" />
                    </linearGradient>
                </defs>
                <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="7" />
                <circle cx="40" cy="40" r={r} fill="none" stroke="url(#bp-ring)" strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - shown)} className="bp-ring-glow" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-white tabular-nums leading-none">{(shown * 100).toFixed(0)}%</span>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">{t('Chance')}</span>
            </div>
        </div>
    );
};

/** What `addToBet` takes for a leg: slip-only markets carry the book's own selection. */
const betArgs = (leg) => {
    const market = PLANNER_MARKETS.find(m => m.id === leg.market);
    return market.slipOnly
        ? { game: gameKey(leg.home_team, leg.away_team), option: leg.selection, value: leg.line, stat: market.stat }
        : { game: gameKey(leg.home_team, leg.away_team), option: leg.selection === 'over' ? 'O' : 'U', value: Number(leg.line), stat: market.stat };
};

const Chance = ({ leg }) => (
    <span className="text-[10px] tabular-nums"
        title={leg.model != null
            ? t('Model {model}% · bookmaker {book}%', { model: (leg.model * 100).toFixed(0), book: (leg.bookProb * 100).toFixed(0) })
            : t('Bookmaker {book}% - no model for this market', { book: (leg.bookProb * 100).toFixed(0) })}>
        <span className={leg.model != null ? 'text-emerald-400 font-bold' : 'text-zinc-400 font-bold'}>{(leg.prob * 100).toFixed(0)}%</span>
        <span className="text-zinc-600"> {leg.model != null ? t('model') : t('book')}</span>
    </span>
);

const kickoffLabel = (leg) => leg.kickoff.toLocaleString(dateLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * A suggested slip, cut in the shape of the section's ticket icon: a notch
 * bitten out of each side, and a perforated stub on the right holding the
 * totals and the button.
 */
const SlipTicket = ({ slip, rank, stake, teamLogos, onAdd, style }) => {
    const odds = useCountUp(slip.odds, 1100);
    const payout = useCountUp(slip.odds * stake, 1100);
    return (
        <div className={`bp-ticket-wrap ${rank === 0 ? 'bp-ticket-best' : ''}`} style={style}>
            <article className="bp-ticket">
                <div className="bp-holo" aria-hidden="true" />
                <div className="relative min-w-0 py-4 pl-6 pr-3 space-y-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${rank === 0
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                        {rank === 0 && <Sparkles className="w-3 h-3" />}
                        {rank === 0 ? t('Best slip') : t('Option {n}', { n: rank + 1 })}
                    </span>
                    <ul className="space-y-1.5">
                        {slip.legs.map((leg, i) => (
                            <li key={leg.key} className="bp-leg flex items-center gap-2"
                                style={{ animationDelay: `calc(${style?.animationDelay ?? '0ms'} + 250ms + ${staggerDelay(i)})` }}>
                                <img src={teamLogos?.[leg.home_team]} alt="" className="w-5 h-5 object-contain shrink-0" />
                                <div className="flex-1 min-w-0 leading-tight">
                                    <div className="text-xs font-bold text-white truncate">{leg.home_team} – {leg.away_team}</div>
                                    <div className="text-[10px] text-fuchsia-300 font-semibold truncate">
                                        {legLabel(leg, PLANNER_MARKETS.find(m => m.id === leg.market))}
                                    </div>
                                </div>
                                <span className="text-xs font-black text-amber-300 tabular-nums">{leg.price.toFixed(2)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bp-stub relative">
                    <ChanceRing prob={slip.prob} />
                    <div className="text-center">
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{t('Total odds')}</div>
                        <div className="text-2xl font-black tracking-tighter tabular-nums bp-gold-text leading-none">{odds.toFixed(2)}</div>
                        {stake > 0 && <div className="text-[10px] text-zinc-400 tabular-nums mt-0.5">{t('Pays')} <b className="text-white">€{payout.toFixed(2)}</b></div>}
                    </div>
                    <button type="button" onClick={() => onAdd(slip)} className="bp-cta w-full" aria-label={t('Add to bet slip')}>
                        <ShoppingCart className="w-4 h-4" /> {t('Add')}
                    </button>
                </div>
            </article>
        </div>
    );
};

// Five at a time; the arrows roll the list on a page like a fruit machine. Beside
// the stacked tickets (wide screens) a page is as many rows as their height fits.
const PER_PAGE = 5;
const SIDE_BY_SIDE = '(min-width: 1280px)';

/** Every leg the rules allow, each addable on its own. */
const EventList = ({ legs, bets, teamLogos, onToggle, perPage = PER_PAGE }) => {
    const [query, setQuery] = useState('');
    // `dir` is which way the reels spin: 1 rolls up to the next five, -1 back down.
    const [{ page: rawPage, dir }, setView] = useState({ page: 0, dir: 1 });
    const q = query.trim().toLowerCase();
    const found = q
        ? legs.filter(l => `${l.home_team} ${l.away_team} ${l.league}`.toLowerCase().includes(q))
        : legs;
    const pages = Math.ceil(found.length / perPage);
    // The page size moves with the layout; stay on a page that still exists.
    const page = Math.min(rawPage, Math.max(0, pages - 1));
    const shown = found.slice(page * perPage, (page + 1) * perPage);
    const go = (step) => setView({ page: page + step, dir: step });
    const inSlip = (leg) => {
        const a = betArgs(leg);
        return bets.some(b => b.game === a.game && b.stat === a.stat && b.team === 'total'
            && String(b.option) === String(a.option) && String(b.value) === String(a.value));
    };

    return (
        <>
            {/* The up arrow shares the search row, so the table starts right under it,
                centred to sit exactly above the down arrow. The search stops short of
                the middle so the two never overlap. */}
            <div className="relative flex items-center">
                <div className="relative w-[calc(50%-1.75rem)] max-w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input type="search" value={query} onChange={e => { setQuery(e.target.value); setView({ page: 0, dir: 1 }); }}
                        placeholder={t('Search team or league')} aria-label={t('Search team or league')}
                        className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-950/60 border border-white/10 text-sm text-white outline-none focus:border-amber-400/50 transition-colors" />
                </div>
                {page > 0 && (
                    <button type="button" onClick={() => go(-1)} className="bp-arrow bp-arrow-up absolute left-1/2 -translate-x-1/2" aria-label={t('Previous events')}>
                        <ChevronUp className="w-5 h-5" />
                    </button>
                )}
            </div>
            {found.length > 0 && (
                <div className="bp-reels">
                    <ul className="bp-events">
                        {shown.map((leg, i) => {
                            const added = inSlip(leg);
                            return (
                                // Each row is a reel window; keyed by page so a turn spins it afresh.
                                <li key={`${page}|${leg.key}`} className="bp-slot">
                                    <div className={`bp-event ${dir > 0 ? 'bp-spin-down' : 'bp-spin-up'}`} style={{ animationDelay: `${i * 55}ms` }}>
                                        <div className="flex -space-x-2 shrink-0">
                                            {[leg.home_team, leg.away_team].map(team => (
                                                <img key={team} src={teamLogos?.[team]} alt="" className="w-7 h-7 object-contain rounded-full bg-zinc-900 ring-2 ring-zinc-900" />
                                            ))}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{leg.home_team} – {leg.away_team}</div>
                                            <div className="text-[11px] text-zinc-500 truncate">{leg.league} · {kickoffLabel(leg)}</div>
                                        </div>
                                        <span className="bp-market">{legLabel(leg, PLANNER_MARKETS.find(m => m.id === leg.market))}</span>
                                        <div className="w-16 text-right shrink-0 leading-tight">
                                            <div className="text-base font-black text-amber-300 tabular-nums">{leg.price.toFixed(2)}</div>
                                            <Chance leg={leg} />
                                        </div>
                                        <button type="button" onClick={() => onToggle(leg, added)} aria-pressed={added}
                                            aria-label={added ? t('Remove from bet slip') : t('Add to bet slip')}
                                            className={`bp-add ${added ? 'bp-add-on' : ''}`}>
                                            {added ? <Check key="on" className="w-4 h-4 bp-add-icon" /> : <Plus key="off" className="w-4 h-4 bp-add-icon" />}
                                            <span className="hidden sm:inline">{added ? t('Added') : t('Add')}</span>
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-center text-[11px] font-bold text-zinc-500 tabular-nums">
                        {t('{from}-{to} of {n}', { from: page * perPage + 1, to: page * perPage + shown.length, n: found.length })}
                    </p>
                    {page < pages - 1 && (
                        <button type="button" onClick={() => go(1)} className="bp-arrow bp-arrow-down" aria-label={t('Next events')}>
                            <ChevronDown className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}
            {!found.length && <p className="text-center py-8 text-sm text-zinc-500">{t('No event fits these rules right now.')}</p>}
        </>
    );
};

const SectionTitle = ({ icon, title, count, children }) => (
    <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-lg font-black text-white tracking-tight">
            {icon} {title}
            {count != null && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-400 tabular-nums">{count}</span>}
        </h3>
        <p className="text-xs text-zinc-500">{children}</p>
    </div>
);

const BonusPlanner = ({ oddsRows, oddsLoading, loadMarket, matchData, modelSettings, teamLogos, onBack, bets, addToBet, removeFromBet, onOpenBetSlip }) => {
    // Remembered between visits: the same bonus tends to come back with the same rules.
    const [prefs, set] = usePersistedPrefs('olanda_bonus_planner', {
        events: 4, minOdds: 1.5, maxOdds: 10, sameDay: false, stake: 5, mode: 'safe',
        markets: PLANNER_MARKETS.map(m => m.id),
    });
    const { events, minOdds, maxOdds, sameDay, stake, mode, markets } = prefs;
    // The two bounds push each other rather than cross.
    const setMinOdds = (v) => set({ minOdds: v, maxOdds: Math.max(maxOdds, v) });
    const setMaxOdds = (v) => set({ maxOdds: v, minOdds: Math.min(minOdds, v) });

    // GG/NG and multigol are served on request only (see useOdds.loadMarket).
    const [loadingSlip, setLoadingSlip] = useState(true);
    useEffect(() => {
        Promise.all(SLIP_MARKETS.map(m => loadMarket(m))).finally(() => setLoadingSlip(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // One model per modelled statistic, built exactly as Hot Matches builds its one.
    const models = useMemo(() => Object.fromEntries(MODELLED.map(m =>
        [m.id, buildPredictionModel(matchData, m.stat, { trackResiduals: true })])), [matchData]);

    // Our chance for a leg, or null to fall back to the book's: no model for the
    // market, or a prediction below the confidence floor Hot Matches also uses.
    const modelProb = useMemo(() => {
        const { nGames, useGeneralStats, forceMean } = modelSettings;
        const preds = new Map();
        return (r) => {
            const model = models[r.market];
            if (!model || r.line == null) return null;
            const key = `${r.market}|${r.home_team}|${r.away_team}`;
            if (!preds.has(key)) {
                preds.set(key, predictFromModel(model, r.home_team, r.away_team, {
                    nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
                    asOf: new Date(r.match_date), engine: ENGINES.COUNT,
                }));
            }
            const pred = preds.get(key);
            const over = pred?.confident ? pred.probOver?.(Number(r.line)) : null;
            if (over == null) return null;
            return r.selection === 'over' ? over : 1 - over;
        };
    }, [models, modelSettings]);

    const { slips, legs, eligible } = useMemo(
        () => planSlips(oddsRows, { events, minOdds, maxOdds, sameDay, markets, mode, modelProb }),
        [oddsRows, events, minOdds, maxOdds, sameDay, markets, mode, modelProb]
    );
    // Remounts the tickets on a rule change, so they deal in afresh.
    const deal = `${events}|${minOdds}|${maxOdds}|${sameDay}|${mode}|${markets.join()}`;

    const loading = oddsLoading || loadingSlip;

    // Wide screens: as many event rows as it takes to reach the bottom of the
    // stacked tickets, so the two columns end level. Measured, not guessed: a
    // slip of 8 events is twice as tall as one of 4. The tickets' contents keep
    // their own height (align-self: center), so what they NEED is measurable even
    // while the ticket around them is stretched to meet the table.
    const leftRef = useRef(null);
    const rightRef = useRef(null);
    const [perPage, setPerPage] = useState(PER_PAGE);
    useLayoutEffect(() => {
        const left = leftRef.current;
        const right = rightRef.current;
        if (!left || !right) return undefined;
        const fit = () => {
            const rows = left.querySelectorAll('.bp-slot');
            const stack = right.querySelector('.bp-tickets');
            if (!window.matchMedia(SIDE_BY_SIDE).matches || !rows.length || !stack) return setPerPage(PER_PAGE);
            const rowH = rows[0].offsetHeight;
            const tickets = [...stack.querySelectorAll('.bp-ticket')];
            if (!tickets.length) return setPerPage(PER_PAGE);
            const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
            const need = tickets.reduce((sum, el) =>
                sum + Math.max(...[...el.children].filter(c => !c.classList.contains('bp-holo')).map(c => c.offsetHeight)), 0) + gap * (tickets.length - 1);
            const rightTop = right.offsetHeight - stack.offsetHeight;
            const leftTop = left.offsetHeight - rows.length * rowH;
            setPerPage(Math.max(PER_PAGE, Math.ceil((rightTop + need - leftTop) / rowH)));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(left);
        observer.observe(right);
        return () => observer.disconnect();
    }, [slips, legs, loading]);

    const addLeg = (leg) => {
        const a = betArgs(leg);
        addToBet(a.game, a.option, a.value, a.stat, 'total', leg.match_date);
    };
    const toggleLeg = (leg, added) => {
        if (!added) return addLeg(leg);
        const a = betArgs(leg);
        removeFromBet(a.game, a.stat, 'total');
    };
    const addSlip = (slip) => {
        slip.legs.forEach(addLeg);
        onOpenBetSlip();
    };

    const toggleMarket = (id) => set({
        markets: markets.includes(id) ? markets.filter(m => m !== id) : [...markets, id],
    });

    return (
        <div className="fx-bonus min-h-screen text-zinc-200 font-sans relative pb-12">
            <Header
                title={(
                    <h1 className="text-lg font-black tracking-tight text-white leading-none hidden sm:block">
                        Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                    </h1>
                )}
                onLogoClick={onBack}
                showBetSlip={true}
                betsCount={bets?.length ?? 0}
                onOpenBetSlip={onOpenBetSlip}
                pageName={(
                    <h1 className="text-lg font-black tracking-tight leading-none">
                        <span className="bp-gold-text">{t('Bonus Planner')}</span>
                    </h1>
                )}
            />

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-4 space-y-8">
                {/* One panel, as on the other pages: title and mode, then every rule. */}
                <section className="bp-hero animate-waterfall">
                    <CoinCascade />
                    <div className="bp-orb bp-orb-a" aria-hidden="true" />
                    <div className="bp-orb bp-orb-b" aria-hidden="true" />
                    <div className="relative flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="bp-icon"><Ticket className="w-7 h-7 text-amber-300" /></div>
                            <div className="min-w-0">
                                <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none">
                                    <span className="bp-gold-text">{t('Bonus Planner')}</span>
                                </h2>
                                <p className="text-sm text-zinc-400 mt-1.5">
                                    {t('Set your bonus rules and get the strongest slips on the board right now.')}
                                </p>
                            </div>
                        </div>
                        <SlidingTabs
                            items={[
                                { id: 'safe', label: t('Safest'), Icon: ShieldCheck },
                                { id: 'value', label: t('Best value'), Icon: Gem },
                            ]}
                            value={mode}
                            onChange={v => set({ mode: v })}
                            className="self-start lg:self-center"
                            tabClassName="font-semibold"
                        />
                    </div>

                    <div className="relative mt-5 pt-5 border-t border-white/5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                        <NumberField label={t('Events')} value={events} step={1} min={1} max={12}
                            onChange={v => set({ events: v })} />
                        <NumberField label={t('Minimum odds per event')} value={minOdds} step={0.05} min={1.01} max={20} decimals={2}
                            onChange={setMinOdds} />
                        <NumberField label={t('Maximum odds per event')} value={maxOdds} step={0.05} min={1.01} max={20} decimals={2}
                            onChange={setMaxOdds} />
                        <NumberField label={t('Bonus amount')} value={stake} step={5} min={0} max={100000} prefix="€"
                            onChange={v => set({ stake: v })} />
                        <label className="bp-control bp-check col-span-2 md:col-span-1 flex items-center gap-3 h-10 px-3 rounded-lg cursor-pointer">
                            <input type="checkbox" checked={sameDay} onChange={e => set({ sameDay: e.target.checked })} className="peer sr-only" />
                            <span className="bp-toggle" aria-hidden="true" />
                            <CalendarCheck className="w-4 h-4 shrink-0 text-zinc-500 peer-checked:text-amber-300 transition-colors" />
                            <span className="text-sm font-semibold text-zinc-300 truncate">{t('Matches today only')}</span>
                        </label>
                    </div>

                    <div className="relative mt-4 flex flex-wrap gap-2">
                        {PLANNER_MARKETS.map(m => {
                            const on = markets.includes(m.id);
                            return (
                                <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleMarket(m.id)}
                                    className={`bp-chip ${on ? 'bp-chip-on' : ''}`}>
                                    {getStatLabel(m.stat)}
                                </button>
                            );
                        })}
                    </div>
                    <p className="relative text-[11px] text-zinc-500 mt-3">
                        {mode === 'safe'
                            ? t('Safest: the legs most likely to land, one per match, each at or above your minimum. Our model decides for goals, corners, fouls and cards; the bookmaker for the rest.')
                            : t('Best value: the highest chance times price - positive expected value where our model rates a leg above its price.')}
                    </p>
                </section>

                {/* Every market or none: slips drawn from half the board ranked GG/NG
                    alone whenever it answered before the main /odds fetch. */}
                <div className="bp-split">
                    <section ref={leftRef} className="bp-split-left w-full max-w-3xl mx-auto space-y-4 animate-waterfall" style={{ animationDelay: '160ms' }}>
                        <SectionTitle icon={<ListChecks className="w-5 h-5 text-amber-300" />} title={t('All events')} count={loading ? null : legs.length}>
                            {t('Every bet that fits your rules. Add the ones you like and build your own slip.')}
                        </SectionTitle>
                        {loading
                            ? <div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="bp-skeleton h-14" style={{ animationDelay: `${i * 80}ms` }} />)}</div>
                            : <EventList key={deal} legs={legs} bets={bets ?? []} teamLogos={teamLogos} onToggle={toggleLeg} perPage={perPage} />}
                    </section>

                    <section ref={rightRef} className="bp-split-right space-y-4">
                        <SectionTitle icon={<Ticket className="w-5 h-5 text-amber-300" />} title={t('Suggested slips')}>
                            {t('Ready-made slips of {events} events, one per match. Add a whole slip in one tap.', { events })}
                        </SectionTitle>
                        {loading ? (
                            <div className="bp-tickets">
                                {[0, 1, 2].map(i => <div key={i} className="bp-skeleton h-64" style={{ animationDelay: `${i * 120}ms` }} />)}
                            </div>
                        ) : slips.length ? (
                            <div key={deal} className="bp-tickets">
                                {slips.map((slip, i) => (
                                    <SlipTicket key={i} slip={slip} rank={i} stake={stake} teamLogos={teamLogos}
                                        onAdd={addSlip} style={{ animationDelay: `${i * 110}ms` }} />
                                ))}
                            </div>
                        ) : (
                            <div className="bp-empty animate-waterfall">
                                <SearchX className="w-10 h-10 text-zinc-600" />
                                <p className="text-white font-bold">{t('No slip fits these rules right now.')}</p>
                                <p className="text-sm text-zinc-500">
                                    {t('{n} matches qualify, {events} needed. Widen the odds range, allow more markets or other days.', { n: eligible, events })}
                                </p>
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
};

export default BonusPlanner;

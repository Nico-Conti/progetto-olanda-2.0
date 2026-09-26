import React, { useMemo, useState } from 'react';
import { X, Trash2, FileText, ExternalLink, History } from 'lucide-react';
import Modal from './ui/Modal';
import { FixtureCrests } from './TeamBadge';
import { supabase, useAccount } from '../hooks/useAuth';
import { betMarket, betPick } from '../utils/statistics';
import { snapshotLegs } from '../utils/modelSnapshot';
import { useCountUp } from '../hooks/useCountUp';
import { staggerDelay } from '../utils/stagger';
import { t } from '../i18n';

/**
 * The slip's own accent pair, in the brand's emerald-to-cyan rather than a
 * section's. These four vars are the whole theming contract the feature panels
 * use (`index.css`, "--fx-a"): they drive the drifting orbs behind the panel,
 * the glow on the icon tile and the flow across the title, so the slip is
 * dressed by the same rules as Bonus Planner or Market Moves instead of being
 * a zinc box dropped on top of them. `--ctl` is left at the root's emerald, so
 * the inputs stay the colour of the action beside them.
 */
const THEME = { '--fx-a': '#10b981', '--fx-b': '#22d3ee', '--fx-light': '#6ee7b7', '--fx-light-b': '#67e8f9' };

const EYEBROW = 'block text-[10px] font-bold uppercase tracking-wider text-zinc-500';
const money = (x) => `€${x.toFixed(2)}`;

const BetSlipModal = ({ isOpen, onClose, bets, onRemove, onClear, priceFor, betslipUrl, teamLogos, modelMatchData, modelSettings }) => {
    /**
     * The accumulator: every selection must land, so the payout multiplies.
     *
     * Priced only when every leg has a real bookmaker price. A partial product
     * would understate the return and read as if it were the whole slip, which
     * is worse than showing nothing - so legs without a price are counted and
     * reported instead.
     */
    const combined = useMemo(() => {
        if (!bets?.length || !priceFor) return null;
        let multiplier = 1;
        let priced = 0;
        for (const bet of bets) {
            const price = priceFor(bet);
            if (price > 1) {
                multiplier *= price;
                priced++;
            }
        }
        return { multiplier, priced, total: bets.length };
    }, [bets, priceFor]);

    /**
     * The same slip as a domusbet link, when their ids are known for it.
     *
     * Null unless at least one leg carries a `selection_ref`, which is every
     * price captured since migration 007. Legs without one cannot be linked, so
     * `linked`/`total` are reported rather than quietly handing over a shorter
     * slip than the one on screen.
     */
    const handover = useMemo(
        () => (bets?.length && betslipUrl ? betslipUrl(bets) : null),
        [bets, betslipUrl],
    );

    // Saving to the account's slip history. Odds default to the captured
    // combined price, but the bookmaker reprices on arrival, so what was
    // actually played can be typed over it. `savedBets` disables the button for
    // this exact slip, so a double click does not record it twice.
    const { user, openAccount } = useAccount();
    const [stake, setStake] = useState('10');
    const [odds, setOdds] = useState('');
    const [savedBets, setSavedBets] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const capturedOdds = combined && combined.priced === combined.total ? combined.multiplier : null;
    // One stake for the whole modal. It used to be two: a hardcoded €10 in the
    // payout line and a separate field for saving, so the number you read and
    // the number you recorded were unrelated. The field drives both now, and it
    // is outside the signed-in branch because the return preview is worth
    // having whether or not the slip is ever recorded.
    //
    // Two prices, deliberately. The preview follows the number shown above it,
    // partial product included, so the modal never displays odds of 5.59 and a
    // return of nothing; the caveat beside it says how many legs it covers.
    // What gets SAVED falls back only to a fully priced slip, because a partial
    // product recorded as the played price would be wrong in the ledger.
    //
    // Rounded to the 2dp the hero displays, or stake 10 at 5.594 reads "5.59"
    // and "€55.94" side by side and invites the arithmetic. It is also the
    // precision the slip is saved at, so preview and ledger agree.
    const playedOdds = Number(odds) || capturedOdds;
    const shownOdds = Number(odds) || (combined ? Math.round(combined.multiplier * 100) / 100 : null);
    const returns = Number(stake) > 0 && shownOdds > 1 ? Number(stake) * shownOdds : null;
    // Counted up, as every other headline figure on the site is.
    const hero = useCountUp(combined?.multiplier ?? 0);

    const saveSlip = async () => {
        setSaveError(null);
        const priced = bets.map(bet => ({ ...bet, price: priceFor?.(bet) > 1 ? priceFor(bet) : null }));
        // What the model said, for the recap once the slip settles. Best
        // effort: a slip saved without it still settles and still recaps (on
        // the margins alone), whereas a slip not saved at all is lost.
        let legs = priced;
        try {
            if (modelMatchData?.length && modelSettings) legs = snapshotLegs(priced, modelMatchData, modelSettings);
        } catch (e) {
            console.warn('model snapshot skipped:', e);
        }
        const { error } = await supabase.from('slips').insert({
            legs,
            odds: playedOdds > 1 ? Math.round(playedOdds * 100) / 100 : null,
            stake: Number(stake) > 0 ? Number(stake) : null,
        });
        if (error) setSaveError(error.message);
        else setSavedBets(bets);
    };

    const numeric = 'w-full min-w-0 bg-transparent text-center text-sm font-black text-white tabular-nums outline-none placeholder:font-bold placeholder:text-zinc-600';
    const action = 'flex-1 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 transition duration-300 disabled:opacity-50 disabled:cursor-default disabled:shadow-none';

    return (
        <Modal open={isOpen} onClose={onClose} label={t('Your Bet Slip')} className="w-[min(92vw,30rem)]">
            <div style={THEME} className="relative glass-panel bg-zinc-950/80 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-left">
                <div className="bp-orbs slip-orbs" aria-hidden="true">
                    <span className="bp-orb bp-orb-a" />
                    <span className="bp-orb bp-orb-b" />
                </div>

                {/* The feature-panel header: icon tile, title in the accent
                    flow, and the count under it - the same shape the Bonus
                    Planner and the other sections open with. */}
                <div className="relative px-5 py-4 border-b border-white/10 shrink-0">
                    <button
                        onClick={onClose}
                        aria-label={t('Close')}
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-4 pr-8">
                        <div className="bp-icon"><FileText className="w-7 h-7 text-emerald-300" /></div>
                        <div className="min-w-0">
                            <h3 className="text-2xl font-black tracking-tight leading-none truncate">
                                <span className="bp-gold-text">{t('Your Bet Slip')}</span>
                            </h3>
                            {/* Clear sits beside the count, not opposite it: on
                                the right it landed under the close button and
                                read as part of it. */}
                            <div className="mt-1.5 flex items-baseline gap-2 text-[10px] font-bold uppercase tracking-wider">
                                <span className="text-zinc-400 tabular-nums">{bets.length === 1 ? t('1 leg') : t('{n} legs', { n: bets.length })}</span>
                                {bets.length > 0 && (
                                    <>
                                        <span className="text-zinc-700">•</span>
                                        <button onClick={onClear} className="text-zinc-500 hover:text-red-400 transition-colors">
                                            {t('Clear')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {bets.length === 0 ? (
                    <div className="relative px-5 py-12 text-center">
                        <FileText className="w-10 h-10 mx-auto mb-4 text-zinc-700" />
                        <p className="text-sm font-bold text-zinc-400">{t('No bets added yet.')}</p>
                        <p className="text-xs mt-1 text-zinc-600">{t('Select matches to build your slip.')}</p>
                    </div>
                ) : (
                    <ul className="relative p-4 space-y-2 overflow-y-auto custom-scrollbar">
                        {bets.map((bet, index) => (
                            <li
                                key={index}
                                style={{ animationDelay: staggerDelay(index) }}
                                className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-900/60 backdrop-blur-md p-3 shadow-lg transition duration-300 hover:border-white/20 animate-waterfall"
                            >
                                <FixtureCrests game={bet.game} teamLogos={teamLogos} />
                                <div className="min-w-0 flex-1">
                                    {/* The name truncates and the PICK NEVER
                                        DOES. At 380px "Corners Under 10.5" is
                                        wider than the row, and truncating it
                                        dropped the line - the one number the
                                        bet actually is. The fixture you can
                                        recognise from half its name; the pick
                                        wraps to a second line instead. */}
                                    <p className="truncate text-sm font-black text-white">{bet.game}</p>
                                    <p className="text-xs mt-0.5 leading-snug">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{betMarket(bet)}</span>{' '}
                                        <span className="font-mono font-bold text-emerald-400">{betPick(bet)}</span>
                                    </p>
                                </div>
                                {priceFor && (priceFor(bet) > 1
                                    ? <span className="shrink-0 min-w-12 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-center text-sm font-black text-white tabular-nums">
                                        {priceFor(bet).toFixed(2)}
                                    </span>
                                    : <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">{t('no price')}</span>)}
                                {/* Always visible, not hover-revealed: on a
                                    touch screen there is no hover, so the only
                                    way to drop a leg was to clear the slip. */}
                                <button
                                    onClick={() => onRemove(bet.game, bet.stat, bet.team)}
                                    title={t('Remove')}
                                    aria-label={t('Remove')}
                                    className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {bets.length > 0 && (
                    <div className="relative border-t border-white/10 bg-zinc-950/40 shrink-0">
                        {/* The accumulator price, lit from behind like every
                            other headline number on the site. */}
                        {combined && combined.priced > 0 && (
                            <div className="flex items-end justify-between gap-4 px-5 py-4">
                                <div className="min-w-0">
                                    <span className={EYEBROW}>{t('Combined odds')}</span>
                                    <p className="mt-1 text-[10px] text-zinc-500">
                                        {combined.priced === combined.total
                                            ? t('all {n} selections priced', { n: combined.total })
                                            : t('{priced} of {total} priced — the rest have no odds stored', { priced: combined.priced, total: combined.total })}
                                    </p>
                                </div>
                                <div className="relative shrink-0">
                                    <div className="absolute left-1/2 top-1/2 w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-2xl pointer-events-none" aria-hidden="true" />
                                    <div className="relative text-5xl font-black tracking-tighter tabular-nums leading-none text-transparent bg-clip-text bg-gradient-to-b from-emerald-200 via-emerald-400 to-cyan-500">
                                        {hero.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Stake, the odds actually played, and what the two
                            come to - read left to right as one sentence. */}
                        <div className="flex items-end gap-3 px-5">
                            <label className="w-20 shrink-0">
                                <span className={`${EYEBROW} mb-1`}>{t('Stake €')}</span>
                                <div className="bp-control flex items-center h-10 rounded-lg px-2">
                                    <input type="number" min="0" step="any" value={stake} aria-label={t('Stake €')}
                                        onChange={(e) => setStake(e.target.value)} className={numeric} />
                                </div>
                            </label>
                            <label className="w-20 shrink-0">
                                <span className={`${EYEBROW} mb-1`}>{t('Odds')}</span>
                                <div className="bp-control flex items-center h-10 rounded-lg px-2">
                                    <input type="number" min="1" step="0.01" value={odds} aria-label={t('Odds')}
                                        placeholder={capturedOdds ? capturedOdds.toFixed(2) : '—'}
                                        onChange={(e) => setOdds(e.target.value)} className={numeric} />
                                </div>
                            </label>
                            {/* h-10: the inputs' height, so the figure sits on
                                their centre line instead of floating below. */}
                            <div className="flex-1 min-w-0 text-right">
                                <span className={`${EYEBROW} mb-1`}>{t('returns')}</span>
                                <div className="h-10 flex items-center justify-end text-2xl font-black tabular-nums text-white">
                                    {returns ? money(returns) : '—'}
                                </div>
                            </div>
                        </div>

                        {/* Hand the slip to domusbet, who load it from the URL:
                            it opens their slip for confirmation, deliberately
                            does not place the bet, and the price there is
                            theirs at that moment, not the one captured up to
                            three hours ago.

                            Both actions are tinted outlines that light up on
                            hover, the same treatment as the feature cards on
                            the landing page - a solid fill made one of them the
                            only shouting thing on the screen. Cyan for the
                            handover keeps it apart from the emerald save
                            without leaving the palette. */}
                        <div className="flex gap-2 px-5 pt-4">
                            {handover && (
                                <a href={handover.url} target="_blank" rel="noopener noreferrer"
                                    className={`${action} border-cyan-500/30 bg-cyan-500/5 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:shadow-[0_0_24px_rgba(34,211,238,0.18)]`}>
                                    <ExternalLink className="w-4 h-4" />
                                    {t('Open on domusbet')}
                                </a>
                            )}
                            {supabase && user && (
                                <button onClick={saveSlip} disabled={savedBets === bets}
                                    className={`${action} border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:border-emerald-400/60 hover:bg-emerald-500/15 hover:shadow-[0_0_24px_rgba(16,185,129,0.18)]`}>
                                    <History className="w-4 h-4" />
                                    {savedBets === bets ? t('Saved') : t('Save as played')}
                                </button>
                            )}
                        </div>

                        <div className="px-5 pt-2.5 pb-4 space-y-1 text-center">
                            {handover && (
                                <p className="text-[10px] text-zinc-500">
                                    {handover.linked === handover.total
                                        ? t('all {n} selections — odds are re-read by domusbet', { n: handover.total })
                                        : t('{linked} of {total} selections — the rest were captured without a bookmaker id', { linked: handover.linked, total: handover.total })}
                                </p>
                            )}
                            {supabase && !user && (
                                <button onClick={openAccount} className="text-xs font-semibold text-zinc-400 hover:text-emerald-400 transition-colors">
                                    {t('Sign in to keep a history of your played slips')}
                                </button>
                            )}
                            {saveError && <p role="status" className="text-xs text-red-400">{saveError}</p>}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default BetSlipModal;

import React, { useMemo, useState } from 'react';
import { X, Trash2, Trophy, ExternalLink, History } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import { supabase, useAccount } from '../hooks/useAuth';
import { betMarket, betPick } from '../utils/statistics';
import { snapshotLegs } from '../utils/modelSnapshot';
import { t } from '../i18n';

const BetSlipModal = ({ isOpen, onClose, bets, onRemove, onClear, priceFor, betslipUrl, modelMatchData, modelSettings }) => {
    const mounted = usePresence(isOpen, '--modal-close-dur');

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
    const playedOdds = Number(odds) || capturedOdds;

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

    if (!mounted) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity starting:opacity-0 ${isOpen ? 'duration-250' : 'duration-150 opacity-0'}`}>
            <div className={`t-modal ${isOpen ? 'is-open' : 'is-closing'} bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]`}>
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-emerald-400" />
                        {t('Your Bet Slip')}
                    </h3>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onClear}
                            disabled={bets.length === 0}
                            title={t('Clear')}
                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors text-zinc-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:bg-transparent"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t('Clear')}
                        </button>
                        <button
                            onClick={onClose}
                            aria-label={t('Close')}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto custom-scrollbar flex-grow">
                    {bets.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            <p>{t('No bets added yet.')}</p>
                            <p className="text-xs mt-1">{t('Select matches to build your slip.')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {bets.map((bet, index) => (
                                <div key={index} className="bet-item bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between group">
                                    <div>
                                        <div className="game font-bold text-white text-sm">{bet.game}</div>
                                        <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                                            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold text-zinc-300 stat-label">
                                                {betMarket(bet)}
                                            </span>
                                            <span className="selection text-emerald-400 font-mono font-bold text-sm">
                                                {betPick(bet)}
                                            </span>
                                            {priceFor && (
                                                priceFor(bet) > 1
                                                    ? <span className="font-mono font-black text-sm text-white bg-white/10 px-1.5 py-0.5 rounded">
                                                        {priceFor(bet).toFixed(2)}
                                                    </span>
                                                    : <span className="text-[10px] uppercase font-bold text-zinc-600">{t('no price')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(bet.game, bet.stat, bet.team)}
                                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                                        title={t('Remove')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Combined odds for the slip as an accumulator. */}
                {combined && combined.priced > 0 && (
                    <div className="px-4 py-3 border-t border-white/10 bg-emerald-500/5">
                        <div className="flex items-baseline justify-between">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                                    {t('Combined odds')}
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                    {combined.priced === combined.total
                                        ? t('all {n} selections priced', { n: combined.total })
                                        : t('{priced} of {total} priced — the rest have no odds stored', { priced: combined.priced, total: combined.total })}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums">
                                    {combined.multiplier.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                    €10 returns €{(10 * combined.multiplier).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hand the slip to domusbet, who will load it from the URL.
                    Opens their slip for confirmation - it deliberately does not
                    place the bet, and the price there is theirs at that moment,
                    not the one captured up to three hours ago.

                    Outlined in cyan rather than filled: every other button in
                    this modal is a border and tinted text ("Save as played" is
                    the same shape in emerald), so a solid fill with a glow made
                    this the one shouting element on the screen. Cyan keeps it
                    distinct from the emerald save action without leaving the
                    palette. */}
                {handover && (
                    <div className="px-4 pt-3">
                        <a
                            href={handover.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 flex items-center justify-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            {t('Open on domusbet')}
                        </a>
                        <div className="text-[10px] text-zinc-500 mt-1.5 text-center">
                            {handover.linked === handover.total
                                ? t('all {n} selections — odds are re-read by domusbet', { n: handover.total })
                                : t('{linked} of {total} selections — the rest were captured without a bookmaker id', { linked: handover.linked, total: handover.total })}
                        </div>
                    </div>
                )}

                {supabase && bets.length > 0 && (
                    // pb-4: this is the last thing in the modal now that the
                    // print footer is gone, so it has to hold its own bottom gap.
                    <div className="px-4 pt-3 pb-4">
                        {user ? (
                            <div className="flex gap-2 items-end">
                                <label className="w-20">
                                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">{t('Stake €')}</span>
                                    <input type="number" min="0" step="any" value={stake} onChange={(e) => setStake(e.target.value)}
                                        className="w-full bg-zinc-950/60 border border-white/10 rounded-lg px-2 py-2 text-sm text-white font-mono" />
                                </label>
                                <label className="w-20">
                                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">{t('Odds')}</span>
                                    <input type="number" min="1" step="0.01" value={odds} onChange={(e) => setOdds(e.target.value)}
                                        placeholder={capturedOdds ? capturedOdds.toFixed(2) : '—'}
                                        className="w-full bg-zinc-950/60 border border-white/10 rounded-lg px-2 py-2 text-sm text-white font-mono placeholder:text-zinc-500" />
                                </label>
                                <button
                                    onClick={saveSlip}
                                    disabled={savedBets === bets}
                                    className="flex-1 py-2 rounded-xl font-bold text-sm uppercase tracking-wide transition border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2"
                                >
                                    <History className="w-4 h-4" />
                                    {savedBets === bets ? t('Saved') : t('Save as played')}
                                </button>
                            </div>
                        ) : (
                            <button onClick={openAccount} className="w-full text-xs text-zinc-400 hover:text-emerald-400">
                                {t('Sign in to keep a history of your played slips')}
                            </button>
                        )}
                        {saveError && <p role="status" className="text-xs text-red-400 mt-1.5">{saveError}</p>}
                    </div>
                )}

            </div>
        </div>
    );
};

export default BetSlipModal;

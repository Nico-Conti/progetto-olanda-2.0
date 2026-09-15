import React, { useMemo, useState } from 'react';
import { X, Trash2, Printer, Trophy, ExternalLink, History } from 'lucide-react';
import { usePresence } from '../hooks/usePresence';
import { supabase, useAccount } from '../hooks/useAuth';
import { betMarket, betPick } from '../utils/statistics';

const BetSlipModal = ({ isOpen, onClose, bets, onRemove, onClear, priceFor, betslipUrl }) => {
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
        const { error } = await supabase.from('slips').insert({
            legs: bets.map(bet => ({ ...bet, price: priceFor?.(bet) > 1 ? priceFor(bet) : null })),
            odds: playedOdds > 1 ? Math.round(playedOdds * 100) / 100 : null,
            stake: Number(stake) > 0 ? Number(stake) : null,
        });
        if (error) setSaveError(error.message);
        else setSavedBets(bets);
    };

    if (!mounted) return null;

    const handlePrint = () => {
        const printContent = document.getElementById('bet-slip-content').innerHTML;

        // Create a new window for printing
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Bet Slip</title>');
        printWindow.document.write('<style>');
        printWindow.document.write(`
            body { font-family: sans-serif; padding: 20px; color: black; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            .logo { width: 40px; height: 40px; object-fit: contain; }
            .app-name { font-size: 20px; font-weight: bold; color: #000; }
            .gradient-text {
                background: linear-gradient(to right, #34d399, #22d3ee) !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                background-clip: text !important;
                color: transparent !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            h2 { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            .bet-item { border-bottom: 1px solid #eee; padding: 10px 0; display: flex; justify-content: space-between; }
            .game { font-weight: bold; }
            .selection { color: #059669; font-weight: bold; }
            .stat-label { font-size: 10px; text-transform: uppercase; color: #666; margin-right: 5px; }
            .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #666; }
            .no-print { display: none !important; }
        `);
        printWindow.document.write('</style></head><body>');

        // Add Header with Logo and Name
        const logoUrl = window.location.origin + '/logo.png';
        printWindow.document.write(`
            <div class="header">
                <img src="${logoUrl}" class="logo" alt="Logo" />
                <span class="app-name">Progetto <span class="gradient-text">Olanda 2.0</span></span>
            </div>
        `);

        printWindow.document.write(printContent);
        printWindow.document.write('<div class="footer">Generated by Progetto Olanda 2.0</div>');
        printWindow.document.close();

        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity starting:opacity-0 ${isOpen ? 'duration-250' : 'duration-150 opacity-0'}`}>
            <div className={`t-modal ${isOpen ? 'is-open' : 'is-closing'} bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]`}>
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-emerald-400" />
                        Your Bet Slip
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto custom-scrollbar flex-grow" id="bet-slip-content">
                    {bets.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            <p>No bets added yet.</p>
                            <p className="text-xs mt-1">Select matches to build your slip.</p>
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
                                                    : <span className="text-[10px] uppercase font-bold text-zinc-600">no price</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(bet.game, bet.stat, bet.team)}
                                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100 no-print"
                                        title="Remove"
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
                                    Combined odds
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                    {combined.priced === combined.total
                                        ? `all ${combined.total} selections priced`
                                        : `${combined.priced} of ${combined.total} priced — the rest have no odds stored`}
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
                    not the one captured up to three hours ago. */}
                {handover && (
                    <div className="px-4 pt-3">
                        <a
                            href={handover.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition-all bg-cyan-500 hover:bg-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.2)] flex items-center justify-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Open on domusbet
                        </a>
                        <div className="text-[10px] text-zinc-500 mt-1.5 text-center">
                            {handover.linked === handover.total
                                ? `all ${handover.total} selections — odds are re-read by domusbet`
                                : `${handover.linked} of ${handover.total} selections — the rest were captured without a bookmaker id`}
                        </div>
                    </div>
                )}

                {supabase && bets.length > 0 && (
                    <div className="px-4 pt-3">
                        {user ? (
                            <div className="flex gap-2 items-end">
                                <label className="w-20">
                                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Stake €</span>
                                    <input type="number" min="0" step="any" value={stake} onChange={(e) => setStake(e.target.value)}
                                        className="w-full bg-zinc-950/60 border border-white/10 rounded-lg px-2 py-2 text-sm text-white font-mono" />
                                </label>
                                <label className="w-20">
                                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Odds</span>
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
                                    {savedBets === bets ? 'Saved' : 'Save as played'}
                                </button>
                            </div>
                        ) : (
                            <button onClick={openAccount} className="w-full text-xs text-zinc-400 hover:text-emerald-400">
                                Sign in to keep a history of your played slips
                            </button>
                        )}
                        {saveError && <p role="status" className="text-xs text-red-400 mt-1.5">{saveError}</p>}
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-zinc-950/50 flex gap-3">
                    <button
                        onClick={onClear}
                        disabled={bets.length === 0}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={bets.length === 0}
                        className="flex-[2] py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide transition bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        <Printer className="w-4 h-4" />
                        Print to PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BetSlipModal;

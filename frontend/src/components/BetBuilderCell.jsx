import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { isSlipOnly, formatSelection } from '../utils/statistics';

/**
 * The add/remove button's icon: Plus and X cross-fade (transitions.dev icon
 * swap), and right after an add a check draws itself in (success check).
 */
export const SlipIcon = ({ isInSlip, justAdded }) => justAdded ? (
    <span className="t-success-check" data-state="in">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    </span>
) : (
    <span className="t-icon-swap" data-state={isInSlip ? 'b' : 'a'}>
        <span className="t-icon" data-icon="a"><Plus className="w-3.5 h-3.5" /></span>
        <span className="t-icon" data-icon="b"><X className="w-3.5 h-3.5" /></span>
    </span>
);

const BetBuilderCell = ({ game, home, away, teamLogos, stat, prediction, onAdd, onRemove, bets, existingBet, priceFor, outcomesFor }) => {
    // A market we only price has no line ladder and no over/under: a multigol
    // band IS the selection. Show what was captured and let it be added
    // directly, rather than pretending there is a total to step through.
    const slipOutcomes = isSlipOnly(stat) && outcomesFor
        ? outcomesFor(home, away, stat)
        : null;

    const [team, setTeam] = useState(existingBet ? (existingBet.team || 'total') : 'total');
    const [option, setOption] = useState(existingBet ? existingBet.option : 'O');
    const [value, setValue] = useState(existingBet ? existingBet.value : null);
    const [justAdded, setJustAdded] = useState(false);

    // Check if current selection is in slip
    const isInSlip = useMemo(() => {
        if (!bets) return false;
        if (stat === 'main') {
            // For main, we check game, stat='main', and value. option is always 'Result', team is always 'match'
            return bets.some(b => b.game === game && b.stat === 'main' && b.value === value);
        }
        // For others
        return bets.some(b => b.game === game && b.stat === stat && b.team === team && b.option === option && b.value === value);
    }, [bets, game, stat, value, team, option]);

    /**
     * The bookmaker's price for what is currently selected, if we captured one.
     *
     * Only match totals are priced: the capture stores over/under on the whole
     * match, so a team-specific or 1X2 selection has no stored equivalent and
     * shows nothing rather than borrowing an unrelated number.
     */
    const currentPrice = useMemo(() => {
        if (!priceFor || stat === 'main' || team !== 'total' || value == null) return null;
        return priceFor(home, away, stat, Number(value), option === 'O');
    }, [priceFor, home, away, stat, team, value, option]);

    // Reset "Added" feedback after a delay
    const handleAdd = () => {
        onAdd(game, option, value, stat, team);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1500);
    };

    const handleRemove = () => {
        if (onRemove) {
            onRemove(game, stat, stat === 'main' ? 'match' : team);
        }
    };

    const getDynamicOptions = (stat, team, prediction) => {
        if (stat === 'main') return ['1', 'X', '2', '1X', '12', 'X2', 'GG', 'NG'];
        if (!prediction) return [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];

        let baseVal = 0;
        if (team === 'home') baseVal = prediction.expHome;
        else if (team === 'away') baseVal = prediction.expAway;
        else baseVal = prediction.total;

        // For possession, ranges are different (usually % based)
        if (stat === 'possession') {
            return [40.5, 42.5, 44.5, 46.5, 48.5, 50.5, 52.5, 54.5, 56.5, 58.5, 60.5];
        }

        // For red cards, it's usually just 0.5
        if (stat === 'red_cards') return [0.5];

        // For others, generate a range around the expectation
        const roundedBase = Math.round(baseVal);
        let start = Math.max(0.5, roundedBase - 3.5);

        // Adjust start for very low expectations
        if (stat === 'goals' || stat === 'yellow_cards') {
            start = Math.max(0.5, roundedBase - 1.5);
        }

        const opts = [];
        for (let i = 0; i < 8; i++) {
            opts.push(start + i);
        }
        return opts;
    };

    const options = getDynamicOptions(stat, team, prediction);

    // Initial value setup or sync with existingBet.
    //
    // This is derived state, so it is adjusted during render (React's
    // "adjusting state when props change" pattern) rather than in an effect,
    // which would render once with a stale value and then again to correct it.
    const [syncedFrom, setSyncedFrom] = useState(null);
    const syncKey = { stat, team, prediction, existingBet };
    const needsSync = !syncedFrom
        || syncedFrom.stat !== stat
        || syncedFrom.team !== team
        || syncedFrom.prediction !== prediction
        || syncedFrom.existingBet !== existingBet;

    if (needsSync) {
        setSyncedFrom(syncKey);

        if (existingBet) {
            setValue(existingBet.value);
            setTeam(existingBet.team || 'total');
            setOption(existingBet.option);
        } else if (value === null || !options.includes(value)) {
            if (stat === 'main') {
                setValue('1');
            } else {
                // Pick the option closest to prediction
                const target = prediction
                    ? (team === 'home' ? prediction.expHome : team === 'away' ? prediction.expAway : prediction.total)
                    : 2.5;
                let closest = options[0];
                let minDiff = Math.abs(options[0] - target);

                options.forEach(opt => {
                    const diff = Math.abs(opt - target);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = opt;
                    }
                });
                setValue(closest);
            }
        }
    }

    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useClickOutside(isOpen, dropdownRef, useCallback(() => setIsOpen(false), []));

    if (stat === 'main') {
        const getStyle = (val) => {
            switch (val) {
                case '1': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/50 hover:bg-emerald-500/20';
                case '2': return 'text-blue-400 bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20';
                case 'X': return 'text-zinc-200 bg-white/5 border-white/20 hover:bg-white/10';
                default: return 'text-zinc-400 bg-zinc-900 border-zinc-700 hover:text-zinc-200 hover:border-zinc-500';
            }
        };

        const currentStyle = getStyle(value);

        return (
            <div className="flex flex-wrap items-center justify-center gap-2 relative" ref={dropdownRef}>
                <div className="relative">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={`w-[60px] h-[30px] rounded-lg border text-xs font-black flex items-center justify-center transition ${isOpen ? 'ring-2 ring-white/10' : ''} ${currentStyle}`}
                    >
                        {value || '-'}
                    </button>

                    {/* Custom Popover */}
                    <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[160px] bg-zinc-950 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl p-2 z-50 grid grid-cols-3 gap-1.5 transition duration-200 origin-top ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}>
                        {/* Main Options */}
                        <button
                            onClick={() => { setValue('1'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs hover:bg-emerald-500/20 hover:border-emerald-500/50 transition"
                        >
                            1
                        </button>
                        <button
                            onClick={() => { setValue('X'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-white/5 border border-white/10 text-white font-black text-xs hover:bg-white/10 hover:border-white/30 transition"
                        >
                            X
                        </button>
                        <button
                            onClick={() => { setValue('2'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-xs hover:bg-blue-500/20 hover:border-blue-500/50 transition"
                        >
                            2
                        </button>

                        {/* Double Chance Options */}
                        {['1X', '12', 'X2', 'GG', 'NG'].map(opt => (
                            <button
                                key={opt}
                                onClick={() => { setValue(opt); setIsOpen(false); }}
                                className={`h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[10px] hover:text-white hover:border-zinc-600 transition ${value === opt ? 'bg-zinc-800 border-zinc-500 text-white' : ''}`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-px h-6 bg-white/10 mx-1"></div>

                <button
                    onClick={() => {
                        if (isInSlip) {
                            handleRemove();
                        } else {
                            onAdd(game, 'Result', value, stat, 'match');
                            setJustAdded(true);
                            setTimeout(() => setJustAdded(false), 1500);
                        }
                    }}
                    // justAdded is checked first: the add lands in the slip at
                    // once, so testing isInSlip first hid the "Added" state.
                    className={`h-[30px] px-3 rounded-lg transition flex items-center justify-center font-bold text-[10px] uppercase tracking-wide gap-1.5 ${justAdded
                        ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105'
                        : isInSlip
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                            : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700 hover:text-white hover:border-white/10'
                        }`}
                    title={justAdded ? 'Added' : (isInSlip ? 'Remove from Slip' : 'Add to Slip')}
                >
                    <SlipIcon isInSlip={isInSlip} justAdded={justAdded} />
                    <span>{justAdded ? 'Added' : isInSlip ? 'Remove' : 'Add'}</span>
                </button>
            </div>
        );
    }

    if (slipOutcomes) {
        const inSlip = (sel) => (bets ?? []).some(
            b => b.game === game && b.stat === stat && b.option === sel,
        );
        return (
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[340px]">
                {slipOutcomes.length === 0 ? (
                    // About us, not about the book: these markets are only
                    // collected by an occasional --slip-markets run.
                    <span className="text-[10px] text-zinc-600">no prices captured</span>
                ) : slipOutcomes.map((o, i) => {
                    const on = inSlip(o.selection);
                    return (
                        <button
                            key={i}
                            onClick={() => (on
                                ? onRemove?.(game, stat, 'total')
                                : onAdd(game, o.selection, o.line, stat, 'total'))}
                            title={on ? 'In your slip' : 'Add to slip'}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                                on
                                    ? 'bg-emerald-500 border-emerald-400 text-white'
                                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                            }`}
                        >
                            {formatSelection(o.selection, o.line)}
                            <span className={`ml-1.5 font-mono ${on ? 'text-white' : 'text-emerald-400'}`}>
                                {o.price.toFixed(2)}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        // The row is ~335px. On a 390px screen the fixture card is ~310px, so it
        // must wrap or the line and the Add button get clipped away entirely.
        // From `lg` up there is room, and it belongs on one line as it always
        // was - `flex-wrap` alone applied the phone fix to every width.
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-center gap-2 lg:gap-1.5">
            {/* Team Selector */}
            <div className="flex bg-zinc-950/50 border border-white/10 rounded-lg p-0.5 w-[110px] lg:w-[92px] items-stretch">
                {['total', 'home', 'away'].map((t) => (
                    <button
                        key={t}
                        onClick={() => setTeam(t)}
                        className={`flex-1 overflow-hidden py-1 px-1 rounded transition flex items-center justify-center ${team === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {t === 'total' ? (
                            <span className="text-[9px] font-bold uppercase leading-none">Tot</span>
                        ) : (
                            <img
                                src={teamLogos?.[t === 'home' ? home : away]}
                                alt={t}
                                className="w-4 h-4 object-contain opacity-80"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Over/Under Toggle */}
            <div className="flex bg-zinc-950/50 border border-white/10 rounded-lg p-0.5">
                <button
                    onClick={() => setOption('O')}
                    className={`px-2 lg:px-1.5 py-1 text-[10px] font-bold rounded transition-colors ${option === 'O' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    O
                </button>
                <button
                    onClick={() => setOption('U')}
                    className={`px-2 lg:px-1.5 py-1 text-[10px] font-bold rounded transition-colors ${option === 'U' ? 'bg-red-500/20 text-red-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    U
                </button>
            </div>

            {priceFor && stat !== 'main' && team === 'total' && (
                <span
                    className={`min-w-[42px] lg:min-w-[36px] text-center px-1.5 lg:px-1 py-1 rounded text-[11px] font-mono font-black tabular-nums ${
                        currentPrice > 1
                            ? 'bg-white/10 text-white'
                            : 'text-zinc-600'
                    }`}
                    title={currentPrice > 1
                        ? `Bookmaker price for ${option === 'O' ? 'over' : 'under'} ${value}`
                        : currentPrice === undefined
                            ? 'Loading prices'
                            : 'No price captured for this line'}
                >
                    {currentPrice > 1 ? currentPrice.toFixed(2)
                        : currentPrice === undefined ? '·' : '—'}
                </span>
            )}

            <select
                value={value || ''}
                onChange={(e) => setValue(parseFloat(e.target.value))}
                className="bg-zinc-950/50 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold text-center cursor-pointer w-[55px] lg:w-[46px] lg:px-1"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>

            <button
                onClick={() => {
                    if (isInSlip) {
                        handleRemove();
                    } else {
                        handleAdd();
                    }
                }}
                className={`p-1.5 rounded-lg transition flex items-center justify-center ${justAdded
                    ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : isInSlip
                        ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                        : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                title={justAdded ? 'Added' : (isInSlip ? 'Remove from Slip' : 'Add to Slip')}
            >
                <SlipIcon isInSlip={isInSlip} justAdded={justAdded} />
            </button>
        </div>
    );
};

export default BetBuilderCell;

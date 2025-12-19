import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Check, X } from 'lucide-react';

const BetBuilderCell = ({ game, home, away, teamLogos, stat, prediction, onAdd, onRemove, bets, existingBet }) => {
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

    // Initial value setup or sync with existingBet
    useEffect(() => {
        if (existingBet) {
            setValue(existingBet.value);
            setTeam(existingBet.team || 'total');
            setOption(existingBet.option);
        } else if (value === null || !options.includes(value)) {
            if (stat === 'main') {
                setValue('1');
            } else {
                // Pick the option closest to prediction
                let target = prediction ? (team === 'home' ? prediction.expHome : team === 'away' ? prediction.expAway : prediction.total) : 2.5;
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
    }, [stat, team, prediction, existingBet]);

    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
            <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                <div className="relative">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={`w-[60px] h-[30px] rounded-lg border text-xs font-black flex items-center justify-center transition-all ${isOpen ? 'ring-2 ring-white/10' : ''} ${currentStyle}`}
                    >
                        {value || '-'}
                    </button>

                    {/* Custom Popover */}
                    <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[160px] bg-zinc-950 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl p-2 z-50 grid grid-cols-3 gap-1.5 transition-all duration-200 origin-top ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}>
                        {/* Main Options */}
                        <button
                            onClick={() => { setValue('1'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all"
                        >
                            1
                        </button>
                        <button
                            onClick={() => { setValue('X'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-white/5 border border-white/10 text-white font-black text-xs hover:bg-white/10 hover:border-white/30 transition-all"
                        >
                            X
                        </button>
                        <button
                            onClick={() => { setValue('2'); setIsOpen(false); }}
                            className="h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-xs hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                        >
                            2
                        </button>

                        {/* Double Chance Options */}
                        {['1X', '12', 'X2', 'GG', 'NG'].map(opt => (
                            <button
                                key={opt}
                                onClick={() => { setValue(opt); setIsOpen(false); }}
                                className={`h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[10px] hover:text-white hover:border-zinc-600 transition-all ${value === opt ? 'bg-zinc-800 border-zinc-500 text-white' : ''}`}
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
                    className={`h-[30px] px-3 rounded-lg transition-all flex items-center justify-center font-bold text-[10px] uppercase tracking-wide gap-1.5 ${isInSlip
                        ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                        : justAdded
                            ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105'
                            : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700 hover:text-white hover:border-white/10'
                        }`}
                    title={isInSlip ? 'Remove from Slip' : (justAdded ? 'Added' : 'Add to Slip')}
                >
                    {isInSlip ? (
                        <>
                            <X className="w-3.5 h-3.5" />
                            <span>Remove</span>
                        </>
                    ) : justAdded ? (
                        <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added</span>
                        </>
                    ) : (
                        <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                        </>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {/* Team Selector */}
            <div className="flex bg-zinc-950/50 border border-white/10 rounded-lg p-0.5 w-[110px] items-stretch">
                {['total', 'home', 'away'].map((t) => (
                    <button
                        key={t}
                        onClick={() => setTeam(t)}
                        className={`flex-1 overflow-hidden py-1 px-1 rounded transition-all flex items-center justify-center ${team === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
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
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${option === 'O' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    O
                </button>
                <button
                    onClick={() => setOption('U')}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${option === 'U' ? 'bg-red-500/20 text-red-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    U
                </button>
            </div>

            <select
                value={value || ''}
                onChange={(e) => setValue(parseFloat(e.target.value))}
                className="bg-zinc-950/50 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold text-center cursor-pointer w-[55px]"
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
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${isInSlip
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                    : justAdded
                        ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                title={isInSlip ? 'Remove from Slip' : (justAdded ? 'Added' : 'Add to Slip')}
            >
                {isInSlip ? <X className="w-3.5 h-3.5" /> : justAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
};

export default BetBuilderCell;

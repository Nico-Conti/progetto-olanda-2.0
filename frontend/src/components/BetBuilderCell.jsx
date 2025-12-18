import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';

const BetBuilderCell = ({ game, home, away, teamLogos, stat, prediction, onAdd, existingBet }) => {
    const [team, setTeam] = useState(existingBet ? (existingBet.team || 'total') : 'total');
    const [option, setOption] = useState(existingBet ? existingBet.option : 'O');
    const [value, setValue] = useState(existingBet ? existingBet.value : null);
    const [isAdded, setIsAdded] = useState(false);

    // Reset "Added" feedback after a delay
    const handleAdd = () => {
        onAdd(game, option, value, stat, team);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 1500);
    };

    const getDynamicOptions = (stat, team, prediction) => {
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

    // Initial value setup or sync with existing bet
    React.useEffect(() => {
        if (existingBet) {
            setValue(existingBet.value);
            setTeam(existingBet.team || 'total');
            setOption(existingBet.option);
        } else if (value === null || !options.includes(value)) {
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
    }, [stat, team, prediction, existingBet]);

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
                onClick={handleAdd}
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${isAdded
                    ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                title={isAdded ? 'Added' : 'Add to Slip'}
            >
                {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
};

export default BetBuilderCell;

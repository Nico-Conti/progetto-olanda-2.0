import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';

const BetBuilderCell = ({ game, stat, onAdd, existingBet }) => {
    const [option, setOption] = useState(existingBet ? existingBet.option : 'O');
    const [value, setValue] = useState(existingBet ? existingBet.value : 9.5);
    const [isAdded, setIsAdded] = useState(false);

    // Reset "Added" feedback after a delay
    const handleAdd = () => {
        onAdd(game, option, value, stat);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 1500);
    };

    const getOptionsForStat = (stat) => {
        switch (stat) {
            case 'goals':
                return [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
            case 'corners':
                return [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5];
            case 'shots':
                return [18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5, 30.5];
            case 'shots_on_target':
                return [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5];
            case 'fouls':
                return [18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5];
            case 'yellow_cards':
                return [2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
            case 'red_cards':
                return [0.5];
            default:
                return [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
        }
    };

    const options = getOptionsForStat(stat);

    // Ensure value is within options when stat changes
    React.useEffect(() => {
        if (!options.includes(value)) {
            setValue(options[Math.floor(options.length / 2)] || options[0]);
        }
    }, [stat, options, value]);

    return (
        <div className="flex items-center gap-2">
            <div className="flex bg-zinc-900 border border-white/10 rounded-lg p-0.5">
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
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value))}
                className="bg-zinc-900 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-bold w-[60px] text-center"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>

            <button
                onClick={handleAdd}
                className={`p-1.5 rounded-lg transition-all ${isAdded
                    ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                    }`}
            >
                {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
};

export default BetBuilderCell;

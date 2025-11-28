import React from 'react';
import { Flame, TrendingUp, Snowflake, Minus } from 'lucide-react';

const TrendBadge = ({ diff }) => {
    if (diff > 1.5) return (
        <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.2)]">
            <Flame className="w-3.5 h-3.5 fill-current" />
            <span>Very Hot</span>
        </div>
    );
    if (diff > 0.5) return (
        <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-orange-500/20 shadow-[0_0_10px_rgba(251,146,60,0.2)]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Hot</span>
        </div>
    );
    if (diff < -0.5) return (
        <div className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-500/20">
            <Snowflake className="w-3.5 h-3.5" />
            <span>Cold</span>
        </div>
    );
    return (
        <div className="flex items-center gap-1.5 text-zinc-500 bg-zinc-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-500/20">
            <Minus className="w-3.5 h-3.5" />
            <span>Stable</span>
        </div>
    );
};

export default TrendBadge;

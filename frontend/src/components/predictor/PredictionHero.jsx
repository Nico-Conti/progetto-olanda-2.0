import React from 'react';
import { Flame, Info } from 'lucide-react';
import { TEAM_LOGOS } from '../../data/teamLogos';

const PredictionHero = ({ prediction, home, away }) => {
    if (!prediction) return null;

    return (
        <div className="glass-panel rounded-xl p-8 flex flex-col justify-center relative overflow-hidden group border border-white/10 bg-zinc-900/40">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>

            <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
                <h2 className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs mb-6">Predicted Total Corners</h2>

                <div className="flex items-center justify-center gap-8 mb-8 w-full">
                    <div className="text-right flex-1 flex flex-col items-end">
                        <img src={TEAM_LOGOS[home]} alt={home} className="w-16 h-16 object-contain mb-2" />
                        <div className="text-2xl font-bold text-white truncate">{home}</div>
                        <div className="text-emerald-400 font-mono text-base font-bold mt-1">Home Exp: {prediction.expHome.toFixed(2)}</div>
                    </div>

                    <div className={`text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl ${prediction.total > 11.5 ? 'text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-orange-500' : 'text-white'}`}>
                        {prediction.total.toFixed(1)}
                    </div>

                    <div className="text-left flex-1 flex flex-col items-start">
                        <img src={TEAM_LOGOS[away]} alt={away} className="w-16 h-16 object-contain mb-2" />
                        <div className="text-2xl font-bold text-white truncate">{away}</div>
                        <div className="text-blue-400 font-mono text-base font-bold mt-1">Away Exp: {prediction.expAway.toFixed(2)}</div>
                    </div>
                </div>

                {prediction.total > 11.5 ? (
                    <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-2 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                        <Flame className="w-4 h-4 fill-current" />
                        <span className="font-bold text-sm uppercase tracking-wide">High Over Trend</span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-2 bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-full border border-white/5">
                        <Info className="w-4 h-4" />
                        <span className="font-medium text-sm">Standard Projection</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PredictionHero;

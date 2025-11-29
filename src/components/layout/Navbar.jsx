import React from 'react';
import { Activity, TrendingUp, Calculator, Calendar as CalendarIcon } from 'lucide-react';

const Navbar = ({ activeTab, setActiveTab }) => {
    return (
        <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 mb-8 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-emerald-400 to-cyan-500 p-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                        <Activity className="w-5 h-5 text-zinc-950" />
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-white">
                        Progetto<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Olanda 2.0</span>
                    </h1>
                </div>

                <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-white/5">
                    <button
                        onClick={() => setActiveTab('trends')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'trends'
                            ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                            }`}
                    >
                        <TrendingUp className="w-4 h-4" />
                        <span className="hidden md:inline">Trends</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('predictor')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'predictor'
                            ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                            }`}
                    >
                        <Calculator className="w-4 h-4" />
                        <span className="hidden md:inline">Predictor</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('calendar')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'calendar'
                            ? 'bg-zinc-800 text-white shadow-sm border border-white/5'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                            }`}
                    >
                        <CalendarIcon className="w-4 h-4" />
                        <span className="hidden md:inline">Calendar</span>
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;

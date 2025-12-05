import React from 'react';
import { Calculator, ChevronDown, Plus, Minus } from 'lucide-react';
import GlassPanel from '../ui/GlassPanel';
import Select from '../ui/Select';


const STAT_OPTIONS = [
    { value: 'corners', label: 'Corners' },
    { value: 'goals', label: 'Goals' },
    { value: 'shots', label: 'Shots' },
    { value: 'shots_on_target', label: 'Shots on Target' },
    { value: 'fouls', label: 'Fouls' },
    { value: 'yellow_cards', label: 'Yellow Cards' },
    { value: 'red_cards', label: 'Red Cards' },
    { value: 'possession', label: 'Possession' },
];

const ConfigurationPanel = ({
    selectedLeague,
    setSelectedLeague,
    availableLeagues,
    analysisMode,
    setAnalysisMode,
    selectedStatistic,
    setSelectedStatistic,
    operator,
    setOperator,
    threshold,
    setThreshold,
    adjustThreshold,
    currentConfig
}) => {

    const leagueOptions = availableLeagues.map(l => ({ value: l, label: l }));
    const thresholdOptions = currentConfig.options.map(opt => ({ value: opt, label: opt.toString() }));

    return (
        <GlassPanel className="p-6 rounded-2xl sticky top-24">
            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-purple-400" />
                Configuration
            </h2>

            <div className="space-y-6">
                {/* Section 1: Analysis Scope */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Analysis Scope</h3>

                    {/* League Selection */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">League</label>
                        <Select
                            value={selectedLeague}
                            onChange={setSelectedLeague}
                            options={leagueOptions}
                        />
                    </div>

                    {/* Mode Selection */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setAnalysisMode('total')}
                                className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${analysisMode === 'total'
                                    ? 'bg-blue-500 text-white shadow-lg'
                                    : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                Match Total
                            </button>
                            <button
                                onClick={() => setAnalysisMode('individual')}
                                className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${analysisMode === 'individual'
                                    ? 'bg-purple-500 text-white shadow-lg'
                                    : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                Team Stats
                            </button>
                        </div>
                    </div>
                </div>

                {/* Section 2: Winning Criteria */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Winning Criteria</h3>

                    {/* Statistic Selection */}


                    <div className="grid grid-cols-1 gap-4">
                        {/* Operator Selection */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Operator</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setOperator('over')}
                                    className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${operator === 'over'
                                        ? 'bg-emerald-500 text-white shadow-lg'
                                        : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    Over
                                </button>
                                <button
                                    onClick={() => setOperator('under')}
                                    className={`px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${operator === 'under'
                                        ? 'bg-red-500 text-white shadow-lg'
                                        : 'bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    Under
                                </button>
                            </div>
                        </div>

                        {/* Threshold Selection */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Threshold</label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => adjustThreshold(-currentConfig.step)}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all h-10 w-10 flex items-center justify-center"
                                >
                                    <Minus className="w-4 h-4" />
                                </button>

                                <div className="flex-grow">
                                    <Select
                                        value={threshold}
                                        onChange={setThreshold}
                                        options={thresholdOptions}
                                    />
                                </div>

                                <button
                                    onClick={() => adjustThreshold(currentConfig.step)}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all h-10 w-10 flex items-center justify-center"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </GlassPanel>
    );
};

export default ConfigurationPanel;

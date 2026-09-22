import React from 'react';
import { Plus, Minus, Sigma, User, TrendingUp, TrendingDown } from 'lucide-react';
import Select from '../ui/Select';
import SlidingTabs from '../ui/SlidingTabs';
import { t } from '../../i18n';

const Field = ({ label, children }) => (
    <div className="space-y-2 min-w-0">
        <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
        {children}
    </div>
);

/** The ranking's rules, laid out as one row inside the page header. */
const ConfigurationPanel = ({
    selectedLeague,
    setSelectedLeague,
    availableLeagues,
    analysisMode,
    setAnalysisMode,
    operator,
    setOperator,
    threshold,
    setThreshold,
    adjustThreshold,
    currentConfig
}) => {

    const leagueOptions = availableLeagues.map(l => ({ value: l, label: l === 'All' ? t('All') : l }));
    const thresholdOptions = currentConfig.options.map(opt => ({ value: opt, label: opt.toString() }));

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1.25fr_1fr_1fr] gap-5">
            <Field label={t('League')}>
                <Select value={selectedLeague} onChange={setSelectedLeague} options={leagueOptions} />
            </Field>

            <Field label={t('Mode')}>
                <SlidingTabs
                    items={[
                        { id: 'total', label: t('Match Total'), Icon: Sigma },
                        { id: 'individual', label: t('Team Stats'), Icon: User },
                    ]}
                    value={analysisMode}
                    onChange={setAnalysisMode}
                    className="w-full"
                    tabClassName="flex-1 justify-center whitespace-nowrap !px-2 font-semibold"
                />
            </Field>

            <Field label={t('Operator')}>
                <SlidingTabs
                    items={[
                        { id: 'over', label: t('Over'), Icon: TrendingUp },
                        { id: 'under', label: t('Under'), Icon: TrendingDown },
                    ]}
                    value={operator}
                    onChange={setOperator}
                    className="w-full"
                    tabClassName="flex-1 justify-center whitespace-nowrap !px-2 font-semibold"
                />
            </Field>

            <Field label={t('Threshold')}>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => adjustThreshold(-currentConfig.step)} aria-label={t('Decrease')} className="bp-step">
                        <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-grow min-w-0">
                        <Select value={threshold} onChange={setThreshold} options={thresholdOptions} />
                    </div>
                    <button type="button" onClick={() => adjustThreshold(currentConfig.step)} aria-label={t('Increase')} className="bp-step">
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </Field>
        </div>
    );
};

export default ConfigurationPanel;

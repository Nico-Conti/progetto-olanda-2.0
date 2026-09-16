import React from 'react';
import { PREDICTOR_MODEL, resolveStatKey, getStatLabel } from '../utils/statistics';
import { t } from '../i18n';

/**
 * Marks a statistic that is not predicted from its own history.
 *
 * Corners are forecast from shots and goals from box touches, because both
 * measured better out-of-sample than forecasting them from themselves. A number
 * derived that way should say so rather than let the reader assume it came from
 * past corners - see docs/prediction-model.md section 4 and utils/predictTotal.js.
 *
 * Renders nothing for every other statistic, which is predicted from itself.
 */
const DerivedBadge = ({ statistic, className = '' }) => {
    const entry = PREDICTOR_MODEL[resolveStatKey(statistic)];
    if (!entry) return null;

    const from = getStatLabel(entry.predictor);
    const target = getStatLabel(statistic);
    const title = t('{target} are predicted from {from}, not from past {targetLower}. Measured leave-one-league-season-out over nine folds, that was the better forecast in every fold. The prediction is then pulled {pull}% of the way toward the league average. This is a better prediction, not a proven betting edge: it was scored against a fixed line, and only 46% of matches would be priced there.', {
        target, from: from.toLowerCase(), targetLower: target.toLowerCase(),
        pull: Math.round((1 - entry.weight) * 100),
    });

    return (
        <span
            title={title}
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide bg-violet-500/15 text-violet-300 border-violet-500/25 ${className}`}
        >
            {t('via {from}', { from })}
        </span>
    );
};

export default DerivedBadge;

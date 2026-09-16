import React from 'react';
import { t } from '../i18n';

/**
 * A team's badge. Given `onOpen`, it is a button that opens the team's page;
 * the click stops there, so a row or card around it keeps its own action.
 * Without `onOpen` it is just the image.
 */
const TeamBadge = ({ team, logo, onOpen, className = 'w-6 h-6' }) => {
    if (!onOpen) return <img src={logo} alt="" className={`${className} object-contain shrink-0`} />;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(team); }}
            title={t('{team} - team page', { team })}
            aria-label={t('Open {team} page', { team })}
            className="team-badge shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
            <img src={logo} alt="" className={`${className} object-contain`} />
        </button>
    );
};

export default TeamBadge;

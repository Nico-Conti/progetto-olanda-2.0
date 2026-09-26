import React from 'react';
import { teamsOf } from '../utils/settle';
import { t } from '../i18n';

/**
 * Both crests of a fixture named "Home vs Away", for the places that list bets
 * rather than matches - the slip, the slip history, a recap. Decorative: the
 * fixture's name is always written beside it, so it is aria-hidden.
 *
 * Nothing at all when neither crest is known, rather than two gaps: a league
 * whose logos have not been imported should look deliberate, not broken.
 */
export const FixtureCrests = ({ game, teamLogos, className = 'w-6 h-6' }) => {
    const teams = teamsOf(game);
    const logos = [teams?.home, teams?.away].map(name => (name ? teamLogos?.[name] : null));
    if (!logos.some(Boolean)) return null;
    return (
        <div className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
            {logos.map((src, i) => (
                <img key={i} src={src || undefined} alt="" className={`${className} object-contain drop-shadow-lg`} />
            ))}
        </div>
    );
};

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

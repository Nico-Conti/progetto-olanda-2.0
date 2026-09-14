import React from 'react';
import { Trophy } from 'lucide-react';

/** A league's logo on a white chip, as in the landing picker - many are dark on transparent. */
export const LeagueLogo = ({ meta, className = 'w-9 h-9' }) => (
    <span className={`${className} shrink-0 rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-sm`}>
        {meta.logo
            ? <img src={meta.logo} alt="" className="w-[78%] h-[78%] object-contain" />
            : <Trophy className="w-1/2 h-1/2 text-zinc-500" aria-hidden="true" />}
    </span>
);

/** The nation's flag as a small rounded tile. */
export const FlagTile = ({ meta, className = 'w-4 h-3' }) => (meta.flag ? (
    <img src={meta.flag} alt={meta.country ?? ''} title={meta.country ?? ''} className={`${className} shrink-0 rounded-[3px] object-cover ring-1 ring-white/15`} />
) : null);

/** One line: logo chip, league name, flag - for rows that already carry a team. */
const LeagueTag = ({ meta }) => (
    <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px] font-bold text-zinc-400">
        <LeagueLogo meta={meta} className="w-4 h-4 rounded" />
        <span className="truncate">{meta.name}</span>
        <FlagTile meta={meta} className="w-3.5 h-2.5" />
    </span>
);

export default LeagueTag;

import React from 'react';
import { LeagueLogo, FlagTile } from './LeagueTag';

const kickoff = (date) => {
    const d = date ? new Date(date) : null;
    if (!d || isNaN(d)) return { day: 'TBD', time: null };
    return {
        day: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
        time: String(date).includes('T') ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null,
    };
};

const Side = ({ team, logo, label }) => (
    <div className="flex flex-col items-center gap-2 min-w-0">
        <img src={logo} alt="" className="w-12 h-12 object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-105" />
        <span className="w-full text-sm font-bold text-white text-center leading-tight line-clamp-2">{team}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
);

/**
 * One fixture card, shared by Hot Matches and Safest Bets. The header says
 * which league it is - logo, name, nation - over the nation's flag, washed in
 * behind the league.
 * `center` is the headline number between the teams; `children` go below.
 */
const MatchCard = ({ match, rank, meta, teamLogos, onClick, style, overlay, center, children }) => {
    const { day, time } = kickoff(match.date);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
            style={style}
            className="group relative flex flex-col rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-md shadow-xl overflow-hidden cursor-pointer transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 animate-waterfall"
        >
            {overlay}

            <div className="relative flex items-center gap-3 px-4 py-3 border-b border-white/5">
                {meta.flag && (
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-cover bg-center opacity-[0.18] transition-opacity duration-300 group-hover:opacity-30"
                        style={{
                            backgroundImage: `url("${meta.flag}")`,
                            maskImage: 'linear-gradient(to right, black, transparent 75%)',
                            WebkitMaskImage: 'linear-gradient(to right, black, transparent 75%)',
                        }}
                    />
                )}
                <LeagueLogo meta={meta} />
                <div className="relative min-w-0">
                    <div className="text-sm font-black text-white truncate">{meta.name}</div>
                    {meta.country && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            <FlagTile meta={meta} />
                            {meta.country}
                        </div>
                    )}
                </div>
                <div className="relative ml-auto flex items-center gap-3 shrink-0">
                    <div className="text-right leading-tight">
                        <div className="text-xs font-bold text-zinc-200">{day}</div>
                        {time && <div className="text-[11px] font-bold text-zinc-500 tabular-nums">{time}</div>}
                    </div>
                    <span className="min-w-8 px-1.5 py-1 rounded-lg bg-white/5 border border-white/10 text-center text-xs font-black text-zinc-300 tabular-nums">
                        #{rank}
                    </span>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-4 p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <Side team={match.home} logo={teamLogos[match.home]} label="Home" />
                    <div className="flex flex-col items-center text-center px-1">{center}</div>
                    <Side team={match.away} logo={teamLogos[match.away]} label="Away" />
                </div>
                {children}
            </div>
        </div>
    );
};

export default MatchCard;

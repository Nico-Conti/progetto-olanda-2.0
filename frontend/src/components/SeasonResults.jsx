import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import MatchStatsModal from './MatchStatsModal';
import TeamBadge from './TeamBadge';
import { t, dateLocale } from '../i18n';

/**
 * Every result of one season, newest matchday first.
 *
 * Expects `matchData` already narrowed to a single league and season - the
 * caller owns that filtering, the same way LeagueTable receives its slice.
 */
const SeasonResults = ({ matchData, teamLogos, season, onTeamClick }) => {
    // The row that has been opened into the stats popup, if any.
    const [openMatch, setOpenMatch] = useState(null);

    const rounds = useMemo(() => {
        const byRound = new Map();
        matchData.forEach(m => {
            const g = m.giornata ?? 0;
            if (!byRound.has(g)) byRound.set(g, []);
            byRound.get(g).push(m);
        });

        return [...byRound.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([giornata, matches]) => ({
                giornata,
                matches: [...matches].sort((a, b) => {
                    // Chronological within a matchday, falling back to name
                    if (a.date && b.date) return new Date(a.date) - new Date(b.date);
                    return String(a.squadre.home).localeCompare(String(b.squadre.home));
                }),
            }));
    }, [matchData]);

    if (matchData.length === 0) {
        return (
            <div className="glass-panel rounded-xl border border-white/10 p-10 text-center">
                <p className="text-zinc-300 text-sm font-bold">
                    {season ? t('No results yet in {season}', { season }) : t('No results yet this season')}
                </p>
                <p className="text-zinc-500 text-xs mt-2">
                    {t('Matches appear here as they are played.')}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <MatchStatsModal
                match={openMatch}
                teamLogos={teamLogos}
                onClose={() => setOpenMatch(null)}
            />

            {rounds.map(({ giornata, matches }) => (
                <div key={giornata} className="glass-panel rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-2 bg-zinc-900/60 border-b border-white/5 flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-emerald-500" />
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                            {t('Matchday {n}', { n: giornata })}
                        </span>
                        <span className="text-[10px] text-zinc-600 font-bold ml-auto">
                            {matches.length === 1 ? t('1 match') : t('{n} matches', { n: matches.length })}
                        </span>
                    </div>

                    <div className="divide-y divide-white/5">
                        {matches.map((m, i) => {
                            const hg = Number(m.stats?.goals?.home ?? 0);
                            const ag = Number(m.stats?.goals?.away ?? 0);
                            const when = m.date ? new Date(m.date) : null;
                            return (
                                <div
                                    key={i}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setOpenMatch(m)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setOpenMatch(m);
                                        }
                                    }}
                                    title={t('{home} vs {away} - full statistics', { home: m.squadre.home, away: m.squadre.away })}
                                    className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-white/5 focus:bg-white/5 focus:outline-none transition-colors"
                                >
                                    <span className="hidden sm:block w-14 text-[10px] font-bold text-zinc-600 uppercase tracking-wider flex-shrink-0">
                                        {when && !isNaN(when.getTime())
                                            ? when.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short' })
                                            : ''}
                                    </span>

                                    <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
                                        <span className={`truncate ${hg > ag ? 'text-white font-bold' : 'text-zinc-400'}`}>
                                            {m.squadre.home}
                                        </span>
                                        {teamLogos?.[m.squadre.home] && (
                                            <TeamBadge team={m.squadre.home} logo={teamLogos[m.squadre.home]} onOpen={onTeamClick} className="w-5 h-5" />
                                        )}
                                    </div>

                                    <div className="px-3 py-0.5 rounded bg-zinc-900 border border-white/10 font-black text-white tabular-nums flex-shrink-0">
                                        {hg} - {ag}
                                    </div>

                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                        {teamLogos?.[m.squadre.away] && (
                                            <TeamBadge team={m.squadre.away} logo={teamLogos[m.squadre.away]} onOpen={onTeamClick} className="w-5 h-5" />
                                        )}
                                        <span className={`truncate ${ag > hg ? 'text-white font-bold' : 'text-zinc-400'}`}>
                                            {m.squadre.away}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SeasonResults;

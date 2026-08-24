import React, { useEffect } from 'react';
import { X, Calendar, Sparkles } from 'lucide-react';
import { getStatLabel } from '../utils/statistics';

/**
 * Every scraped statistic for one finished match.
 *
 * Reads `match.stats`, which `useMatchData` already hydrates with all fifteen
 * columns - so this costs no request. Goals are deliberately absent from the
 * list: they are the scoreline in the header, not a row.
 *
 * The order is the one a match-stats panel conventionally uses (territory,
 * then chances, then discipline) rather than the registry's order, but the
 * labels come from `getStatLabel` so they stay in step with it - `blocked_shots`
 * is diretta's "Palle intercettate" and must keep reading "Interceptions".
 */
const STAT_ROWS = [
    'possession',
    'xg',
    'xgot',
    'shots',
    'shots_on_target',
    'big_chances',
    'box_touches',
    'corners',
    'crosses',
    'blocked_shots',
    'goalkeeper_saves',
    'fouls',
    'yellow_cards',
    'red_cards',
];

const formatValue = (key, value) => {
    const n = Number(value) || 0;
    if (key === 'possession') return `${Math.round(n)}%`;
    if (key === 'xg' || key === 'xgot') return n.toFixed(2);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const StatRow = ({ statKey, home, away }) => {
    const h = Number(home) || 0;
    const a = Number(away) || 0;
    const sum = h + a;

    // A 0-0 row is real information for red cards, so it renders as an empty
    // pair of bars rather than being hidden or split down the middle.
    const homePct = sum > 0 ? (100 * h) / sum : 0;
    const awayPct = sum > 0 ? (100 * a) / sum : 0;

    return (
        <div className="py-2.5">
            <div className="flex items-baseline gap-3 mb-1.5">
                <span className={`w-16 text-left font-mono font-black tabular-nums text-sm ${h > a ? 'text-white' : 'text-zinc-500'}`}>
                    {formatValue(statKey, h)}
                </span>
                <span className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {getStatLabel(statKey)}
                </span>
                <span className={`w-16 text-right font-mono font-black tabular-nums text-sm ${a > h ? 'text-white' : 'text-zinc-500'}`}>
                    {formatValue(statKey, a)}
                </span>
            </div>

            <div className="flex items-center gap-1">
                <div className="flex-1 flex justify-end bg-white/5 rounded-full overflow-hidden h-1.5">
                    <div className="h-full bg-emerald-500/80 rounded-full transition-all" style={{ width: `${homePct}%` }} />
                </div>
                <div className="flex-1 bg-white/5 rounded-full overflow-hidden h-1.5">
                    <div className="h-full bg-blue-500/80 rounded-full transition-all" style={{ width: `${awayPct}%` }} />
                </div>
            </div>
        </div>
    );
};

const MatchStatsModal = ({ match, teamLogos, onClose }) => {
    // Escape closes, the way a popup is expected to.
    useEffect(() => {
        if (!match) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [match, onClose]);

    if (!match) return null;

    const home = match.squadre?.home ?? 'Unknown';
    const away = match.squadre?.away ?? 'Unknown';
    const hg = Number(match.stats?.goals?.home ?? 0);
    const ag = Number(match.stats?.goals?.away ?? 0);
    const when = match.date ? new Date(match.date) : null;

    const rows = STAT_ROWS
        .map(key => ({ key, home: match.stats?.[key]?.home, away: match.stats?.[key]?.away }))
        .filter(r => r.home != null && r.away != null);

    // One stored match carries a scoreline and nothing else. Say so instead of
    // rendering fourteen empty bars as though they were measurements.
    const hasStats = rows.some(r => (Number(r.home) || 0) !== 0 || (Number(r.away) || 0) !== 0);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="glass-panel bg-zinc-950 w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Scoreline */}
                <div className="p-5 border-b border-white/10 bg-zinc-900/50 relative shrink-0">
                    <button
                        onClick={onClose}
                        title="Close"
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-4">
                        <Calendar className="w-3 h-3" />
                        {when && !isNaN(when.getTime())
                            ? when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'Date unknown'}
                        <span className="text-zinc-700">•</span>
                        MD {match.giornata}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                            {teamLogos?.[home] && (
                                <img src={teamLogos[home]} alt={home} className="w-12 h-12 object-contain" />
                            )}
                            <span className={`text-sm font-bold text-center leading-tight ${hg > ag ? 'text-white' : 'text-zinc-400'}`}>
                                {home}
                            </span>
                        </div>

                        <div className="flex flex-col items-center shrink-0 px-2">
                            <div className="text-4xl font-black text-white tabular-nums tracking-tighter">
                                {hg} <span className="text-zinc-700">-</span> {ag}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mt-1">Full time</span>
                        </div>

                        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                            {teamLogos?.[away] && (
                                <img src={teamLogos[away]} alt={away} className="w-12 h-12 object-contain" />
                            )}
                            <span className={`text-sm font-bold text-center leading-tight ${ag > hg ? 'text-white' : 'text-zinc-400'}`}>
                                {away}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3">
                    {hasStats ? (
                        <>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Home</span>
                                <span className="flex-1" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Away</span>
                                <span className="w-2 h-2 rounded-full bg-blue-500/80" />
                            </div>
                            <div className="divide-y divide-white/5">
                                {rows.map(r => (
                                    <StatRow key={r.key} statKey={r.key} home={r.home} away={r.away} />
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-zinc-500 text-sm py-10">
                            Only the score was imported for this match - no detailed statistics were scraped.
                        </p>
                    )}

                    {/* The Gemini prose, when /matches/analysis has any for this match. */}
                    {(match.tldr || match.detailed_summary) && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                Match analysis
                            </h4>
                            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
                                {match.detailed_summary || match.tldr}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchStatsModal;

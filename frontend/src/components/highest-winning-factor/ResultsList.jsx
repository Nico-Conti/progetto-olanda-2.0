import React from 'react';
import { Trophy, Minus, Plus, X, Check } from 'lucide-react';
import GlassPanel from '../ui/GlassPanel';
import Select from '../ui/Select';
import LeagueTag from '../LeagueTag';
import { flagWash, leagueMeta } from '../../utils/leaguePickerFx';
import { t, dateLocale } from '../../i18n';

const ResultsList = ({
    rankedTeams,
    displayLimit,
    setDisplayLimit,
    nGames,
    setNGames,
    maxGames,
    teamLogos,
    leagues,
    bets,
    addToBet,
    removeFromBet,
    analysisMode,
    selectedStatistic,
    operator,
    threshold,
    onTeamClick
}) => {
    const [expandedTeam, setExpandedTeam] = React.useState(null);

    // The bet a team's row adds: its next fixture, the side it plays, and the
    // over/under being ranked. `added` is any bet on that game and side (the
    // button's colour); `exact` is this very selection (its icon).
    const slipFor = (team) => {
        const next = team.nextMatch;
        const game = next ? `${next.home} vs ${next.away}` : team.team;
        const side = analysisMode === 'individual'
            ? (next ? (next.home === team.team ? 'home' : 'away') : 'individual')
            : 'total';
        const option = operator === 'over' ? 'O' : 'U';
        const onGame = (b) => b.game === game && b.stat === selectedStatistic && b.team === side;
        const added = Boolean(bets?.some(onGame));
        return {
            added,
            exact: Boolean(bets?.some(b => onGame(b) && b.option === option && b.value === threshold)),
            toggle: (e) => {
                e.stopPropagation();
                if (added) removeFromBet(game, selectedStatistic, side);
                else addToBet(game, option, threshold, selectedStatistic, side, next?.date ?? null);
            },
        };
    };

    const displayLimitOptions = [5, 10, 15, 20].map(n => ({ value: n, label: n.toString() }));

    // Ensure current nGames is always an option in the dropdown
    const nGamesOptions = React.useMemo(() => {
        const defaults = [3, 5, 10, 'all'];
        if (!defaults.includes(nGames)) {
            defaults.push(nGames);
            defaults.sort((a, b) => {
                if (a === 'all') return 1;
                if (b === 'all') return -1;
                return a - b;
            });
        }
        return defaults.map(n => ({
            value: n,
            label: n === 'all' ? t('Season') : n.toString()
        }));
    }, [nGames]);

    return (
        <GlassPanel className="rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        {t('Top')}
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setDisplayLimit(prev => Math.max(1, prev - 1))}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                        >
                            <Minus className="w-3 h-3" />
                        </button>

                        <div className="w-20">
                            <Select
                                value={displayLimit}
                                onChange={setDisplayLimit}
                                options={displayLimitOptions}
                                className="h-8 text-xs"
                            />
                        </div>

                        <button
                            onClick={() => setDisplayLimit(prev => Math.min(20, prev + 1))}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <h2 className="text-xl font-black text-white">
                        {t('Teams')}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-2">
                        {t('Last Games:')}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                setNGames(prev => {
                                    const val = prev === 'all' ? maxGames : prev;
                                    return Math.max(1, val - 1);
                                });
                            }}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                        >
                            <Minus className="w-3 h-3" />
                        </button>

                        <div className="w-24">
                            <Select
                                value={nGames}
                                onChange={setNGames}
                                options={nGamesOptions}
                                className="h-8 text-xs"
                            />
                        </div>

                        <button
                            onClick={() => {
                                setNGames(prev => {
                                    if (prev === 'all') return 'all';
                                    if (prev + 1 >= maxGames) return 'all';
                                    return prev + 1;
                                });
                            }}
                            className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile View (Cards) */}
            <div className="md:hidden space-y-3 p-4">
                {rankedTeams.slice(0, displayLimit).map((team, index) => {
                    const meta = leagueMeta(leagues, team.league);
                    const slip = slipFor(team);
                    return (
                    <div
                        key={team.team}
                        className="flex flex-col gap-2"
                    >
                        <div
                            className={`relative overflow-hidden bg-zinc-900/40 border rounded-xl p-4 flex flex-col gap-3 transition-colors cursor-pointer ${expandedTeam === team.team ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5'}`}
                            onClick={() => setExpandedTeam(expandedTeam === team.team ? null : team.team)}
                        >
                            {(meta.flag || meta.bands) && (
                                <span
                                    aria-hidden="true"
                                    className="absolute inset-x-0 top-0 h-16 opacity-[0.14] pointer-events-none"
                                    style={flagWash(meta, 'linear-gradient(to bottom right, black, transparent 70%)')}
                                />
                            )}
                            <div className="relative flex justify-between items-start gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-mono text-zinc-500 font-bold">#{index + 1}</span>
                                    <img
                                        src={teamLogos[team.team]}
                                        alt=""
                                        className="w-9 h-9 object-contain shrink-0"
                                    />
                                    <div className="min-w-0">
                                        <div className="font-bold text-white text-lg leading-tight truncate">{team.team}</div>
                                        <LeagueTag meta={meta} />
                                    </div>
                                </div>
                                <button
                                    onClick={slip.toggle}
                                    aria-label={slip.exact ? t('Remove {team} from the slip', { team: team.team }) : t('Add {team} to the slip', { team: team.team })}
                                    className={`shrink-0 p-2 rounded-lg transition ${slip.added
                                        ? 'bg-red-500/20 text-red-500 border border-red-500/50'
                                        : 'bg-white/5 text-zinc-400'
                                        }`}
                                >
                                    {slip.exact ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                </button>
                            </div>

                            <div className="relative grid grid-cols-2 gap-3">
                                <div className="bg-zinc-950/50 rounded-lg p-2 text-center border border-white/5">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">{t('Record')}</span>
                                    <span className="font-mono text-white font-bold">{team.winCount} / {team.totalGames}</span>
                                </div>
                                <div className="bg-zinc-950/50 rounded-lg p-2 text-center border border-white/5">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">{t('Win Rate')}</span>
                                    <span className={`font-black ${team.winRate >= 80 ? 'text-emerald-500' :
                                        team.winRate >= 60 ? 'text-emerald-400' :
                                            team.winRate >= 40 ? 'text-yellow-500' :
                                                'text-red-500'
                                        }`}>
                                        {team.winRate.toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Match History (Mobile) */}
                        {expandedTeam === team.team && (
                            <div className="bg-zinc-950/50 border border-white/5 rounded-xl p-3 space-y-2 animate-in slide-in-from-top-2">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">{t('Recent Match History')}</h4>
                                {team.matches.map((match, mIdx) => {
                                    const value = analysisMode === 'total' ? match.total : match.statFor;
                                    const success = operator === 'over' ? value > threshold : value < threshold;
                                    return (
                                        <div key={mIdx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-zinc-500">{match.date ? new Date(match.date).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) : t('MD {n}', { n: match.giornata })}</span>
                                                <span className="text-xs font-bold text-white">vs {match.opponent}</span>
                                            </div>
                                            <div className={`px-3 py-1 rounded-md font-mono font-bold text-sm ${success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-500/50 border border-red-500/10'}`}>
                                                {value.toFixed(1)}
                                            </div>
                                        </div>
                                    );
                                })}
                                <button
                                    onClick={() => onTeamClick && onTeamClick(team.team)}
                                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-tighter transition"
                                >
                                    {t('See next fixture details')}
                                </button>
                            </div>
                        )}
                    </div>
                    );
                })}
                {rankedTeams.length === 0 && (
                    <div className="text-center py-8 text-zinc-500">
                        {t('No data available.')}
                    </div>
                )}
            </div>

            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-zinc-950/50 text-xs uppercase text-zinc-500 font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-4 text-center w-16 whitespace-nowrap">{t('Rank')}</th>
                            <th className="px-6 py-4 whitespace-nowrap">{t('Team')}</th>
                            <th className="px-6 py-4 text-center whitespace-nowrap">{t('Record')}</th>
                            <th className="px-6 py-4 text-center whitespace-nowrap">{t('Win Rate')}</th>
                            <th className="px-6 py-4 text-center whitespace-nowrap">{t('Add to Slip')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {rankedTeams.slice(0, displayLimit).map((team, index) => {
                            const meta = leagueMeta(leagues, team.league);
                            const slip = slipFor(team);
                            return (
                            <React.Fragment key={team.team}>
                                <tr
                                    className={`hover:bg-white/[0.04] transition-colors group cursor-pointer ${expandedTeam === team.team ? 'bg-emerald-500/[0.03]' : ''}`}
                                    onClick={() => setExpandedTeam(expandedTeam === team.team ? null : team.team)}
                                >
                                    <td className="px-6 py-4 text-center font-mono text-zinc-500 font-bold">
                                        #{index + 1}
                                    </td>
                                    <td className="relative px-6 py-3">
                                        {/* The see-through flag, a card-sized strip as on
                                            the fixture cards. */}
                                        {(meta.flag || meta.bands) && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-y-0 left-0 w-80 max-w-full opacity-[0.14] group-hover:opacity-25 transition-opacity pointer-events-none"
                                                style={flagWash(meta, 'linear-gradient(to right, black, transparent 75%)')}
                                            />
                                        )}
                                        <div className="relative flex items-center gap-3">
                                            <img
                                                src={teamLogos[team.team]}
                                                alt=""
                                                className="w-9 h-9 object-contain shrink-0"
                                            />
                                            <div className="min-w-0">
                                                <div className="font-bold text-white text-lg leading-tight group-hover:text-purple-400 transition-colors">
                                                    {team.team}
                                                </div>
                                                <LeagueTag meta={meta} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="font-mono font-bold text-zinc-300 bg-zinc-900 px-3 py-1 rounded-md border border-white/5">
                                            {team.winCount} / {team.totalGames}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${team.winRate >= 80 ? 'bg-emerald-500' :
                                                        team.winRate >= 60 ? 'bg-emerald-400' :
                                                            team.winRate >= 40 ? 'bg-yellow-500' :
                                                                'bg-red-500'
                                                        }`}
                                                    style={{ width: `${team.winRate}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className={`font-black text-lg ${team.winRate >= 80 ? 'text-emerald-500' :
                                                    team.winRate >= 60 ? 'text-emerald-400' :
                                                        team.winRate >= 40 ? 'text-yellow-500' :
                                                            'text-red-500'
                                                    }`}>
                                                    {team.winRate.toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={slip.toggle}
                                            aria-label={slip.exact ? t('Remove {team} from the slip', { team: team.team }) : t('Add {team} to the slip', { team: team.team })}
                                            className={`p-2 rounded-lg transition ${slip.added
                                                ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'
                                                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            {slip.exact ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4 transition-transform" />}
                                        </button>
                                    </td>
                                </tr>
                                {expandedTeam === team.team && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-4 bg-zinc-950/30 border-y border-white/5">
                                            <div className="flex flex-col gap-3 py-2 animate-in slide-in-from-top-2">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">{t('Past {n} Games Match History', { n: team.totalGames })}</h4>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onTeamClick && onTeamClick(team.team); }}
                                                        className="text-[10px] font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-tighter border-b border-emerald-400/50 pb-0.5 transition"
                                                    >
                                                        {t('See next fixture details')}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                                    {team.matches.map((match, mIdx) => {
                                                        const value = analysisMode === 'total' ? match.total : match.statFor;
                                                        const success = operator === 'over' ? value > threshold : value < threshold;
                                                        return (
                                                            <div key={mIdx} className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                                                                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                                                                    <span className="text-[10px] font-bold text-zinc-500">{match.date ? new Date(match.date).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) : t('MD {n}', { n: match.giornata })}</span>
                                                                    <span className={`w-2 h-2 rounded-full ${success ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500/50'}`}></span>
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black text-zinc-600 uppercase">{t('vs Opponent')}</span>
                                                                    <span className="text-xs font-bold text-white truncate" title={match.opponent}>{match.opponent}</span>
                                                                </div>
                                                                <div className={`mt-1 text-center py-1.5 rounded-lg font-mono font-black text-lg ${success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-zinc-500'}`}>
                                                                    {value.toFixed(1)}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                            );
                        })}

                        {rankedTeams.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-zinc-500">
                                    {t('No data available for the selected criteria.')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </GlassPanel>
    );
};

export default ResultsList;

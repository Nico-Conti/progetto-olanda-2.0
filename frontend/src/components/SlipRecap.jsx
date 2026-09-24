import React from 'react';
import { X, ChartNoAxesColumn } from 'lucide-react';
import Modal from './ui/Modal';
import { betMarket, betPick } from '../utils/statistics';
import { recapSlip } from '../utils/recap';
import { teamsOf, actualFor, WON, LOST, VOID } from '../utils/settle';
import { t, tk, dateLocale } from '../i18n';

const HEADLINE = {
    [WON]: { hair: tk('Won by a hair'), clear: tk('Won'), wide: tk('Won comfortably') },
    [LOST]: { hair: tk('Almost won'), clear: tk('Lost'), wide: tk('Clearly lost') },
};
const TONE = { [WON]: 'text-emerald-400', [LOST]: 'text-red-400', [VOID]: 'text-zinc-400' };
const MARK = { [WON]: '✓', [LOST]: '✗', [VOID]: '—' };

const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const signed = (x) => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x))}`;

/**
 * "One more Roma goal and it was won", "3 fewer and it was lost". Written out
 * per case rather than assembled, so each reads naturally in Italian too.
 * Keyed by: who (a named team's goals / goals by either side / the leg's own
 * statistic, whose name is already on the row above), one or several, more or
 * fewer, and what it would have become.
 */
const FLIP = {
    'team1+won': tk('One more {team} goal and it was won.'), 'team1+lost': tk('One more {team} goal and it was lost.'),
    'team1-won': tk('One fewer {team} goal and it was won.'), 'team1-lost': tk('One fewer {team} goal and it was lost.'),
    'teamN+won': tk('{n} more {team} goals and it was won.'), 'teamN+lost': tk('{n} more {team} goals and it was lost.'),
    'teamN-won': tk('{n} fewer {team} goals and it was won.'), 'teamN-lost': tk('{n} fewer {team} goals and it was lost.'),
    'goal1+won': tk('One more goal and it was won.'), 'goal1+lost': tk('One more goal and it was lost.'),
    'goal1-won': tk('One fewer goal and it was won.'), 'goal1-lost': tk('One fewer goal and it was lost.'),
    'goalN+won': tk('{n} more goals and it was won.'), 'goalN+lost': tk('{n} more goals and it was lost.'),
    'goalN-won': tk('{n} fewer goals and it was won.'), 'goalN-lost': tk('{n} fewer goals and it was lost.'),
    'stat+won': tk('{n} more and it was won.'), 'stat+lost': tk('{n} more and it was lost.'),
    'stat-won': tk('{n} fewer and it was won.'), 'stat-lost': tk('{n} fewer and it was lost.'),
};

const flipSentence = (r, teams) => {
    const { steps: n, direction, side } = r.flip;
    const team = side && teams ? teams[side] : null;
    const who = team ? 'team' : r.numeric ? 'stat' : 'goal';
    const count = who === 'stat' ? '' : n === 1 ? '1' : 'N';
    // It flips to the OTHER verdict: a won leg nudged becomes lost.
    const becomes = r.status === WON ? 'lost' : 'won';
    return t(FLIP[`${who}${count}${direction > 0 ? '+' : '-'}${becomes}`], { n, team });
};

/** The line, the model's figure and what happened, on one axis. The side that
 *  wins the pick is tinted, so which side of the line it landed on reads at a
 *  glance. Decorative: the sentence under it carries the same numbers. */
const Scale = ({ r }) => {
    const points = [r.line, r.actual, r.model?.expected].filter(Number.isFinite);
    const max = Math.max(4, Math.ceil(Math.max(...points) * 1.2));
    const at = (v) => `${Math.min(100, Math.max(0, (100 * v) / max))}%`;
    return (
        <div aria-hidden="true" className="mt-2">
            <div className="relative h-5">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
                <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-500/30"
                    style={r.isOver ? { left: at(r.line), right: 0 } : { left: 0, width: at(r.line) }} />
                <div className="absolute inset-y-0 border-l border-dashed border-zinc-400" style={{ left: at(r.line) }} />
                {r.model && (
                    <div className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-zinc-900"
                        style={{ left: at(r.model.expected) }} />
                )}
                <div className={`absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.status === WON ? 'bg-emerald-400' : r.status === LOST ? 'bg-red-400' : 'bg-zinc-300'}`}
                    style={{ left: at(r.actual) }} />
            </div>
            <div className="flex flex-wrap gap-x-3 text-[10px] font-mono text-zinc-400">
                <span><span className="text-zinc-200">●</span> {t('actual')} {fmt(r.actual)}</span>
                <span>┊ {t('line')} {fmt(r.line)}</span>
                {r.model && <span><span className="text-sky-400">○</span> {t('model')} {fmt(r.model.expected)}</span>}
            </div>
        </div>
    );
};

const LegRecap = ({ leg, match, status, recap: r }) => {
    const teams = teamsOf(leg.game);
    return (
        <li className="py-3 text-xs">
            <p className="font-semibold text-white flex items-baseline gap-1.5 min-w-0">
                <span className={`shrink-0 font-mono ${TONE[status] ?? 'text-zinc-600'}`}>{MARK[status] ?? '·'}</span>
                <span className="truncate">{leg.game}</span>
                {!r.numeric && status != null && (
                    <span className="ml-auto shrink-0 font-mono text-zinc-300">{actualFor(leg, match)}</span>
                )}
            </p>
            <p className="text-zinc-400 truncate pl-[1.375rem]">
                <span className="uppercase text-[10px]">{betMarket(leg)}</span>{' '}
                <span className="text-emerald-400 font-mono font-bold">{betPick(leg)}</span>
                {leg.price && <span className="font-mono text-zinc-500"> @{leg.price.toFixed(2)}</span>}
            </p>
            <div className="pl-[1.375rem]">
                {status == null ? (
                    <p className="mt-1 text-zinc-500">{t('Not settled.')}</p>
                ) : (
                    <>
                        {r.numeric && Number.isFinite(r.actual) && Number.isFinite(r.line) && <Scale r={r} />}
                        <p className="mt-1.5 text-zinc-200">
                            <span className={`font-bold ${TONE[status]}`}>
                                {status === VOID ? t('Void: it landed exactly on the line.') : `${t(HEADLINE[status][r.band])}:`}
                            </span>
                            {r.flip && <> {flipSentence(r, teams)}</>}
                        </p>
                        {r.model && (
                            <p className="mt-1 text-zinc-400">
                                {Number.isFinite(r.model.error)
                                    ? t('The model expected {expected}; it ended {actual} ({diff}).',
                                        { expected: fmt(r.model.expected), actual: fmt(r.actual), diff: signed(r.model.error) })
                                    : t('The model expected {expected}.', { expected: fmt(r.model.expected) })}
                                {r.model.pWin != null && <> {t('It gave your pick {p}%.', { p: Math.round(100 * r.model.pWin) })}</>}
                                {r.model.withModel === true && <> {t('The result went the way the model leaned.')}</>}
                                {r.model.withModel === false && <> {t("The result went against the model's lean.")}</>}
                            </p>
                        )}
                    </>
                )}
            </div>
        </li>
    );
};

/**
 * A settled slip, leg by leg: how close each came to going the other way, and
 * what the model had said where the slip recorded it. See utils/recap.js.
 */
const SlipRecap = ({ slip, settled, onClose }) => {
    const recap = settled ? recapSlip(settled) : null;
    const summary = !recap ? null
        : recap.status === VOID ? t('Every leg void: stake returned.')
            : recap.status === LOST
                ? (recap.decisive
                    ? t('Lost on a single leg: {game}.', { game: recap.decisive.leg.game })
                    : t('Lost on {n} of {total} legs.', { n: recap.lostCount, total: recap.legs.length }))
                : recap.closest
                    ? t('Won. Closest call: {game}.', { game: recap.closest.leg.game })
                    : t('Won.');

    return (
        <Modal open={!!slip} onClose={onClose} label={t('Slip recap')} className="w-[min(92vw,28rem)]">
            {slip && recap && (
                <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-left">
                    <div className="p-4 border-b border-white/10 bg-zinc-950/50">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
                                <ChartNoAxesColumn className="w-5 h-5 text-emerald-400 shrink-0" />
                                <span className="truncate">{t('Slip recap')}</span>
                            </h3>
                            <button onClick={onClose} aria-label={t('Close')} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs font-mono text-zinc-400">
                            {new Date(slip.created_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                            {slip.stake ? ` · €${Number(slip.stake).toFixed(2)}` : ''}
                            {slip.odds ? ` @ ${Number(slip.odds).toFixed(2)}` : ''}
                        </p>
                        <p className={`mt-2 text-sm font-semibold ${TONE[recap.status]}`}>{summary}</p>
                    </div>
                    <ul className="px-4 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                        {recap.legs.map((l, i) => <LegRecap key={i} {...l} />)}
                    </ul>
                    {recap.missingModel && (
                        <p className="px-4 py-3 border-t border-white/5 text-[10px] text-zinc-400">
                            {t('This slip was saved before model predictions were recorded, so only the margins are shown.')}
                        </p>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default SlipRecap;

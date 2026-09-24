import React from 'react';
import { X, FileText } from 'lucide-react';
import Modal from './ui/Modal';
import { FixtureCrests } from './TeamBadge';
import { betMarket, betPick } from '../utils/statistics';
import { recapSlip } from '../utils/recap';
import { teamsOf, actualFor, WON, LOST, VOID } from '../utils/settle';
import { staggerDelay } from '../utils/stagger';
import { t, tk, dateLocale } from '../i18n';

const HEADLINE = {
    [WON]: { hair: tk('Won by a hair'), clear: tk('Won'), wide: tk('Won comfortably') },
    [LOST]: { hair: tk('Almost won'), clear: tk('Lost'), wide: tk('Clearly lost') },
};
const TONE = { [WON]: 'text-emerald-400', [LOST]: 'text-red-400', [VOID]: 'text-zinc-400' };
const MARK = { [WON]: '✓', [LOST]: '✗', [VOID]: '—' };

/**
 * The window wears the verdict. Same four vars every feature panel is themed
 * by (`index.css`, "--fx-a"), so the orbs behind it, the icon tile's glow and
 * the flow across the title all turn red on a lost slip without a second set
 * of styles - you know how it went before reading a word.
 */
const THEME = {
    [WON]: { '--fx-a': '#10b981', '--fx-b': '#22d3ee', '--fx-light': '#6ee7b7', '--fx-light-b': '#67e8f9' },
    [LOST]: { '--fx-a': '#f43f5e', '--fx-b': '#fb923c', '--fx-light': '#fda4af', '--fx-light-b': '#fed7aa' },
    [VOID]: { '--fx-a': '#71717a', '--fx-b': '#a1a1aa', '--fx-light': '#d4d4d8', '--fx-light-b': '#e4e4e7' },
};
/** The leg's own card, tinted by how it went. */
const LEG_SKIN = {
    [WON]: 'border-emerald-500/25 bg-emerald-500/[0.04]',
    [LOST]: 'border-red-500/25 bg-red-500/[0.04]',
    [VOID]: 'border-white/10 bg-zinc-900/60',
};
const CHIP = {
    [WON]: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    [LOST]: 'border-red-500/40 bg-red-500/10 text-red-300',
    [VOID]: 'border-white/15 bg-white/5 text-zinc-400',
};
const OUTCOME = { [WON]: tk('won'), [LOST]: tk('lost'), [VOID]: tk('void') };

const EYEBROW = 'text-[10px] font-bold uppercase tracking-wider text-zinc-500';
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
    const won = r.status === WON;
    return (
        <div aria-hidden="true" className="mt-2.5">
            <div className="relative h-5">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-800/80" />
                {/* Always emerald, whatever the verdict: this band is the zone
                    the PICK wins in, not how the leg went. Tinting it red on a
                    lost leg said "the red stretch is what beat you", when the
                    red stretch is the half that would have paid. Only the
                    actual marker below carries the outcome. */}
                <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 opacity-40"
                    style={r.isOver ? { left: at(r.line), right: 0 } : { left: 0, width: at(r.line) }} />
                <div className="absolute inset-y-0 border-l border-dashed border-zinc-500" style={{ left: at(r.line) }} />
                {r.model && (
                    <div className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-zinc-950"
                        style={{ left: at(r.model.expected) }} />
                )}
                <div className={`absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-zinc-950 ${won ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]' : r.status === LOST ? 'bg-red-400 shadow-[0_0_12px_rgba(244,63,94,0.7)]' : 'bg-zinc-300'}`}
                    style={{ left: at(r.actual) }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-mono text-zinc-500">
                <span><span className="text-zinc-200">●</span> {t('actual')} {fmt(r.actual)}</span>
                <span>┊ {t('line')} {fmt(r.line)}</span>
                {r.model && <span><span className="text-sky-400">○</span> {t('model')} {fmt(r.model.expected)}</span>}
            </div>
        </div>
    );
};

const LegRecap = ({ leg, match, status, recap: r, teamLogos, index }) => {
    const teams = teamsOf(leg.game);
    return (
        <li
            style={{ animationDelay: staggerDelay(index) }}
            className={`rounded-xl border p-3 shadow-lg backdrop-blur-md animate-waterfall ${LEG_SKIN[status] ?? 'border-white/10 bg-zinc-900/60'}`}
        >
            <div className="flex items-center gap-2.5">
                <FixtureCrests game={leg.game} teamLogos={teamLogos} />
                <p className="min-w-0 flex-1 truncate text-sm font-black text-white">{leg.game}</p>
                <span className={`shrink-0 font-mono text-base ${TONE[status] ?? 'text-zinc-600'}`}>{MARK[status] ?? '·'}</span>
            </div>
            {/* The pick never truncates: at this width "Corners Under 10.5"
                outgrows the row, and clipping it drops the line - the one
                number the bet actually is. */}
            <p className="mt-1 text-xs leading-snug">
                <span className={EYEBROW}>{betMarket(leg)}</span>{' '}
                <span className="font-mono font-bold text-emerald-400">{betPick(leg)}</span>
                {leg.price && <span className="font-mono text-zinc-500"> @{leg.price.toFixed(2)}</span>}
                {!r.numeric && status != null && (
                    <span className="font-mono text-zinc-300"> · {actualFor(leg, match)}</span>
                )}
            </p>
            {status == null ? (
                <p className="mt-1.5 text-xs text-zinc-500">{t('Not settled.')}</p>
            ) : (
                <>
                    {r.numeric && Number.isFinite(r.actual) && Number.isFinite(r.line) && <Scale r={r} />}
                    <p className="mt-1.5 text-xs text-zinc-200">
                        <span className={`font-bold ${TONE[status]}`}>
                            {status === VOID ? t('Void: it landed exactly on the line.') : `${t(HEADLINE[status][r.band])}:`}
                        </span>
                        {r.flip && <> {flipSentence(r, teams)}</>}
                    </p>
                    {r.model && (
                        <p className="mt-1 text-xs text-zinc-400">
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
        </li>
    );
};

/**
 * A settled slip, leg by leg: how close each came to going the other way, and
 * what the model had said where the slip recorded it. See utils/recap.js.
 */
const SlipRecap = ({ slip, settled, teamLogos, onClose }) => {
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
        <Modal open={!!slip} onClose={onClose} label={t('Slip recap')} className="w-[min(92vw,30rem)]">
            {slip && recap && (
                <div style={THEME[recap.status] ?? THEME[VOID]}
                    className="relative glass-panel bg-zinc-950/80 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-left">
                    <div className="bp-orbs slip-orbs" aria-hidden="true">
                        <span className="bp-orb bp-orb-a" />
                        <span className="bp-orb bp-orb-b" />
                    </div>

                    <div className="relative px-5 py-4 border-b border-white/10 shrink-0">
                        <button onClick={onClose} aria-label={t('Close')}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-4 pr-8">
                            <div className="bp-icon"><FileText className="w-7 h-7" style={{ color: 'var(--fx-light)' }} /></div>
                            <div className="min-w-0">
                                <h3 className="text-2xl font-black tracking-tight leading-none truncate">
                                    <span className="bp-gold-text">{t('Slip recap')}</span>
                                </h3>
                                <p className="mt-1.5 font-mono text-[11px] font-bold text-zinc-400 tabular-nums">
                                    {new Date(slip.created_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                                    {slip.stake ? ` · €${Number(slip.stake).toFixed(2)}` : ''}
                                    {slip.odds ? ` @ ${Number(slip.odds).toFixed(2)}` : ''}
                                </p>
                            </div>
                        </div>
                        {/* The verdict, then the one sentence that explains it. */}
                        <div className="mt-3 flex items-start gap-2.5">
                            <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${CHIP[recap.status] ?? CHIP[VOID]}`}>
                                {t(OUTCOME[recap.status] ?? OUTCOME[VOID])}
                            </span>
                            <p className={`text-sm font-bold ${TONE[recap.status]}`}>{summary}</p>
                        </div>
                    </div>

                    <ul className="relative p-4 space-y-2 overflow-y-auto custom-scrollbar">
                        {recap.legs.map((l, i) => <LegRecap key={i} {...l} index={i} teamLogos={teamLogos} />)}
                    </ul>

                    {recap.missingModel && (
                        <p className="relative px-5 py-3 border-t border-white/10 bg-zinc-950/40 text-[10px] text-zinc-500 shrink-0">
                            {t('This slip was saved before model predictions were recorded, so only the margins are shown.')}
                        </p>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default SlipRecap;

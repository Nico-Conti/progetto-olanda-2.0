import React from 'react';
import { ChevronRight, HelpCircle, Eye, TrendingDown, Flag, ArrowRight } from 'lucide-react';
import { t, tk } from '../i18n';

// The worked example, computed rather than typed so the numbers cannot drift
// from the formula printed beside them.
const EX = { open: 2.10, closeOver: 1.85, closeUnder: 2.05 };
const fair = (1 / EX.closeOver) / (1 / EX.closeOver + 1 / EX.closeUnder);
const clv = EX.open * fair - 1;

const STEPS = [
    { Icon: Eye, title: tk('We see the opening price'), text: tk('The first price we capture for a line, up to three days before kickoff. This is the bet you could have made.') },
    { Icon: TrendingDown, title: tk('The market moves'), text: tk('Money and news push prices around. A price that shortens means the market now thinks that outcome is more likely.') },
    { Icon: Flag, title: tk('It closes'), text: tk('The last price before kickoff is the market at its sharpest: everything known is priced in.') },
];

const Step = ({ n, step }) => {
    const { Icon, title, text } = step;
    return (
    <div className="relative flex-1 rounded-xl border border-white/10 bg-zinc-950/40 p-4">
        <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-black flex items-center justify-center">{n}</span>
            <Icon className="w-4 h-4 text-cyan-400" />
        </div>
        <h4 className="text-sm font-black text-white">{t(title)}</h4>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t(text)}</p>
    </div>
    );
};

/** The price path of the worked example: opening dot, drift, closing dot at kickoff. */
const PriceChart = () => (
    <svg viewBox="0 0 320 130" className="w-full max-w-sm mx-auto block h-auto" role="img"
        aria-label={t('A price falling from {open} at opening to {close} at kickoff', { open: EX.open.toFixed(2), close: EX.closeOver.toFixed(2) })}>
        <defs>
            <linearGradient id="guide-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgb(52 211 153 / 0.25)" />
                <stop offset="1" stopColor="rgb(52 211 153 / 0)" />
            </linearGradient>
        </defs>
        {/* Price axis: higher price at the top. */}
        <line x1="30" y1="20" x2="30" y2="105" stroke="rgb(255 255 255 / 0.1)" />
        <line x1="30" y1="105" x2="300" y2="105" stroke="rgb(255 255 255 / 0.1)" />
        <polygon points="40,30 80,38 120,33 160,52 200,60 240,72 270,80 270,105 40,105" fill="url(#guide-fill)" />
        <polyline points="40,30 80,38 120,33 160,52 200,60 240,72 270,80" fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" />
        {/* Kickoff */}
        <line x1="270" y1="14" x2="270" y2="105" stroke="rgb(255 255 255 / 0.35)" strokeDasharray="3 3" />
        <text x="270" y="120" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontWeight="700">{t('Kickoff')}</text>
        <text x="40" y="120" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontWeight="700">{t('Opening')}</text>
        {/* Endpoints */}
        <circle cx="40" cy="30" r="4.5" fill="#22d3ee" />
        <text x="48" y="22" fill="#67e8f9" fontSize="11" fontWeight="800">{EX.open.toFixed(2)}</text>
        <circle cx="270" cy="80" r="4.5" fill="#34d399" />
        <text x="262" y="72" textAnchor="end" fill="#6ee7b7" fontSize="11" fontWeight="800">{EX.closeOver.toFixed(2)}</text>
        {/* The gap we got */}
        <path d="M 290 30 L 294 30 L 294 80 L 290 80" fill="none" stroke="#34d399" strokeWidth="1.5" />
        <line x1="270" y1="30" x2="290" y2="30" stroke="rgb(34 211 238 / 0.4)" strokeDasharray="2 2" />
        <text x="300" y="58" fill="#34d399" fontSize="10" fontWeight="800">CLV</text>
    </svg>
);

const Tile = ({ label, text }) => (
    <div className="rounded-lg border border-white/5 bg-zinc-950/40 px-3 py-2">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-300">{t(label)}</span>
        <span className="block mt-0.5 text-[11px] text-zinc-500 leading-snug">{t(text)}</span>
    </div>
);

/**
 * What Market Moves measures, as a collapsed infographic. A native <details>,
 * like the slip history in AccountModal: keyboard and screen-reader behaviour
 * come free, and it stays shut until someone asks.
 */
const MarketMovesGuide = () => (
    <details className="group guide glass-panel rounded-xl border border-white/10 overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-white/5 transition-colors">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">{t('How does this page work?')}</span>
            <ChevronRight className="ml-auto w-4 h-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-90" />
        </summary>

        <div className="px-4 pb-5 pt-1 space-y-5 border-t border-white/5">
            {/* 1. The price's life */}
            <div className="flex flex-col md:flex-row items-stretch gap-2 pt-4">
                {STEPS.map((s, i) => (
                    <React.Fragment key={s.title}>
                        <Step n={i + 1} step={s} />
                        {i < STEPS.length - 1 && (
                            <ArrowRight aria-hidden="true" className="w-4 h-4 text-zinc-600 self-center shrink-0 rotate-90 md:rotate-0" />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* 2. The number */}
            <div className="grid md:grid-cols-2 gap-4 items-center">
                <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-3">
                    <PriceChart />
                </div>
                <div className="space-y-3">
                    <h4 className="text-sm font-black text-white">{t('Closing line value (CLV)')}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        {t('Did the price you took beat the close? The close is the best estimate there is, so beating it again and again is the earliest honest sign of a real edge - long before profit stops being luck.')}
                    </p>
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 font-mono text-[11px] text-cyan-200">
                        CLV = {t('opening price')} × {t('fair closing probability')} − 1
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                        {t('Example: Over at {open}. It closes at {over}, Under at {under}. Removing the bookmaker margin, the fair Over chance is {fair}%, so CLV = {open} × {fairDec} − 1 = {clv}.', {
                            open: EX.open.toFixed(2), over: EX.closeOver.toFixed(2), under: EX.closeUnder.toFixed(2),
                            fair: (fair * 100).toFixed(1), fairDec: fair.toFixed(3),
                            clv: `+${(clv * 100).toFixed(1)}%`,
                        })}
                    </p>
                </div>
            </div>

            {/* 3. The two tabs */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">{t('Movers')}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        {t('Upcoming matches whose price moved most so far. The big number is how many points the market\'s probability rose.')}
                    </p>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                        <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{t('With model')}</span>
                        <span className="text-zinc-500 self-center">{t('we already rated that side higher than the opening price did')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                        <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">{t('Against')}</span>
                        <span className="text-zinc-500 self-center">{t('the market moved where our model did not')}</span>
                    </div>
                </div>
                <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">{t('Report card')}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        {t('Played matches from the last two weeks. For each, the bet our model would have picked at the opening price.')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <Tile label={tk("Picks")} text={tk("How many bets the model would have made.")} />
                        <Tile label={tk("Price shortened")} text={tk("The price dropped after we took it.")} />
                        <Tile label={tk("Beat the fair close")} text={tk("It dropped by more than the bookmaker's margin.")} />
                        <Tile label={tk("Average CLV")} text={tk("Above zero over many picks means a real edge.")} />
                    </div>
                </div>
            </div>
        </div>
    </details>
);

export default MarketMovesGuide;

/**
 * What the model said about each leg, recorded when a slip is saved as played,
 * so its recap can show that number beside what happened.
 *
 * Recorded rather than recomputed later on purpose: the model changes, and a
 * recap has to show what the user saw when betting, not what today's model
 * would have said. Computed HERE, at save, rather than by whichever view added
 * the bet - four views add bets and CLAUDE.md's rule is that every view builds
 * the model the same way, so the one recipe below is the Predictor's: pooled
 * history, the shared settings, the leg's own kickoff as `asOf`, count engine.
 *
 * A leg the model does not predict - 1X2, GG/NG, multigol, the combos, and the
 * markets we do not settle - is returned untouched.
 */
import { buildPredictionModel, predictFromModel, ENGINES } from './predictTotal.js';
import { resolveStatKey, isSlipOnly } from './statistics.js';
import { UNGRADEABLE, teamsOf } from './settle.js';

const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;

export const snapshotLegs = (legs, modelMatchData, { nGames, useGeneralStats, forceMean }) => {
    // One model per statistic, built only for the statistics this slip holds.
    const models = new Map();
    const modelFor = (statKey) => {
        if (!models.has(statKey)) {
            models.set(statKey, buildPredictionModel(modelMatchData, statKey, { trackResiduals: true }));
        }
        return models.get(statKey);
    };

    return legs.map((leg) => {
        if (leg.stat === 'main' || isSlipOnly(leg.stat) || UNGRADEABLE.has(leg.stat)) return leg;
        const teams = teamsOf(leg.game);
        if (!teams) return leg;

        const pred = predictFromModel(modelFor(resolveStatKey(leg.stat)), teams.home, teams.away, {
            nGames, useGeneralStats, aggregatorOverride: forceMean ? 'mean' : null,
            asOf: leg.date ?? new Date(), engine: ENGINES.COUNT,
        });
        const expected = leg.team === 'home' ? pred?.expHome
            : leg.team === 'away' ? pred?.expAway : pred?.total;
        if (!Number.isFinite(expected)) return leg;

        // The distribution is of the MATCH total, so only a match-total leg gets
        // a probability; and only when the model is confident, which is the same
        // bar the app sets before it shows a probability anywhere else.
        let pWin = null;
        const line = Number(leg.value);
        if (leg.team === 'total' && pred.confident && pred.probOver && Number.isFinite(line)) {
            const pOver = pred.probOver(line);
            if (pOver != null) pWin = String(leg.option).toUpperCase().startsWith('O') ? pOver : 1 - pOver;
        }
        return { ...leg, model: { expected: round(expected, 2), pWin: pWin == null ? null : round(pWin, 3) } };
    });
};

import { useCallback } from 'react';
import { usePersistedPrefs } from './usePersistedPrefs';

// Bumped from `olanda_model_settings` when useGeneralStats' default flipped.
// usePersistedPrefs writes on mount, so every existing visitor already had
// `useGeneralStats: false` in localStorage - and it merges stored over defaults,
// so a new default would have reached nobody who had ever opened the app. The
// cost is discarding genuine customisations along with the ones nobody chose;
// the alternative was shipping a measured default that never applied.
const STORAGE_KEY = 'olanda_model_settings_v2';

/**
 * The three knobs that change what the model predicts, shared by every screen
 * that predicts.
 *
 * They used to live three times over: Hot Matches and Safest Bets each kept
 * their own persisted copy, and the Predictor kept a transient `useState` that
 * reset to the defaults on every mount. Nothing kept them in step, so the same
 * fixture could carry a different expected value on two screens with no visible
 * reason - Roma v Fiorentina priced total fouls at 25.5 with EV -7.7% on one and
 * -4.0% on the other, purely because one screen had `useGeneralStats` on. That
 * is the same failure the pooled-history fix closed (see CLAUDE.md), arriving
 * through the settings instead of through the training data.
 *
 * `useGeneralStats` is the one that always bites: it drops the home/away split,
 * which roughly doubles the effective sample and moves the total. `nGames` and
 * `forceMean` only matter for statistics with no fitted half-life - everything
 * measured goes down the decay path, which ignores both, so the Predictor hides
 * those two controls whenever they cannot apply.
 *
 * It defaults to TRUE as of 2026-09-09, measured rather than chosen (it shipped
 * at false because nobody had checked). Walk-forward over 5,896 matches, fitted
 * on the chronological first half and scored on the second - the general setting
 * wins on log loss and MAE for all five measured statistics:
 *
 *   stat            MAE      call    log loss
 *   corners      -0.0337   +1.1pp    -0.0088
 *   goals        -0.0026   +0.8pp    -0.0018
 *   fouls        -0.0545   -0.8pp    -0.0067
 *   shots        -0.0578   +1.2pp    -0.0085
 *   yellow_cards -0.0226   +1.2pp    -0.0112
 *
 * Fouls is the one cost: its CALL accuracy falls 0.8pp while its log loss and
 * MAE improve. Log loss decides because what the app shows is a probability and
 * an EV read off it, but that is a trade, not a free win - see generalStats.mjs.
 *
 * The comparison also understates the gain: residuals are always recorded with
 * the split setting, so the log-loss column pairs a general-stats mean with a
 * split-fitted dispersion. Refitting residuals under the shipped setting is the
 * obvious follow-up and has NOT been done.
 *
 * Hot Matches' per-league optimizer still overrides all three, deliberately and
 * visibly; that is a stated override, not a silent drift.
 */
export const DEFAULT_MODEL_SETTINGS = {
    nGames: 5,
    useGeneralStats: true,
    forceMean: false,
};

export const useModelSettings = () => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, DEFAULT_MODEL_SETTINGS);

    const settings = {
        nGames: prefs.nGames ?? DEFAULT_MODEL_SETTINGS.nGames,
        useGeneralStats: Boolean(prefs.useGeneralStats),
        forceMean: Boolean(prefs.forceMean),
    };

    const setNGames = useCallback((v) => setPrefs({ nGames: v }), [setPrefs]);
    const setUseGeneralStats = useCallback((v) => setPrefs({ useGeneralStats: v }), [setPrefs]);
    const setForceMean = useCallback((v) => setPrefs({ forceMean: v }), [setPrefs]);

    return { modelSettings: settings, setNGames, setUseGeneralStats, setForceMean };
};

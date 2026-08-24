import { useCallback } from 'react';
import { usePersistedPrefs } from './usePersistedPrefs';

const STORAGE_KEY = 'olanda_model_settings';

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
 * measured goes down the decay path, which ignores both.
 *
 * Hot Matches' per-league optimizer still overrides all three, deliberately and
 * visibly; that is a stated override, not a silent drift.
 */
export const DEFAULT_MODEL_SETTINGS = {
    nGames: 5,
    useGeneralStats: false,
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

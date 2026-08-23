import { useCallback } from 'react';
import { usePersistedPrefs } from './usePersistedPrefs';
import { ENGINES, DEFAULT_ENGINE } from '../utils/predictTotal';

const STORAGE_KEY = 'olanda_prediction_engine';

/**
 * Which prediction engine the app is running, remembered between visits.
 *
 * Defaults to `classic` deliberately. That is the model every measurement in
 * docs/prediction-model.md describes, and it stays the baseline anything new is
 * compared against - a new engine should be something you opt into, not
 * something that silently replaces the one the numbers refer to.
 */
export const usePredictionEngine = () => {
    const [prefs, setPrefs] = usePersistedPrefs(STORAGE_KEY, { engine: DEFAULT_ENGINE });
    // Guard against a stale or hand-edited localStorage value naming an engine
    // that no longer exists.
    const engine = Object.values(ENGINES).includes(prefs.engine) ? prefs.engine : DEFAULT_ENGINE;

    const setEngine = useCallback((next) => setPrefs({ engine: next }), [setPrefs]);
    const toggleEngine = useCallback(
        () => setPrefs(prev => ({
            engine: prev.engine === ENGINES.COUNT ? ENGINES.CLASSIC : ENGINES.COUNT,
        })),
        [setPrefs]
    );

    return { engine, setEngine, toggleEngine, isCount: engine === ENGINES.COUNT };
};

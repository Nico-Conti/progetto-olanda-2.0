/**
 * Season helpers.
 *
 * A season label is either "2025/2026" (leagues that run Aug->May) or "2026"
 * (Brazil, which plays inside one calendar year). Both sort correctly as
 * strings, newest last, so ordering is just a reversed sort.
 */

/** Newest first. */
export const sortSeasons = (seasons) => [...seasons].sort((a, b) => String(b).localeCompare(String(a)));

/** Every distinct season present in a set of rows, newest first. */
export const collectSeasons = (...rowSets) => {
    const seen = new Set();
    rowSets.forEach(rows => (rows || []).forEach(r => r?.season && seen.add(r.season)));
    return sortSeasons([...seen]);
};

/** Seasons present for one league, newest first. */
export const seasonsForLeague = (rows, league) =>
    sortSeasons([...new Set((rows || []).filter(r => r?.league === league && r?.season).map(r => r.season))]);

/**
 * The season a league is currently playing: the newest one that appears in
 * either its results or its fixtures.
 */
export const latestSeasonForLeague = (matches, fixtures, league) =>
    seasonsForLeague([...(matches || []), ...(fixtures || [])], league)[0] ?? null;

/**
 * The seasons a *model* should see: the one being played, plus the one before.
 *
 * Backward-looking views (Trends, Standings, team details) must stay on a single
 * season - blending two makes one table out of two years. Prediction is the
 * opposite case: recency decay weights last season's matches lightly rather than
 * discarding them, which is what stops the model going blank every August. On
 * 2026-08-22 five of nine leagues had no predictions at all because this filter
 * cut history to a season nobody had played yet.
 *
 * Two seasons is enough: at the measured half-lives (90-365 days) anything older
 * carries almost no weight, and holding it would only cost memory.
 */
export const modelSeasonsForLeague = (matches, fixtures, league) => {
    const latest = latestSeasonForLeague(matches, fixtures, league);
    // Seasons with actual results, newest first. When the new season has none
    // yet, this is last season - exactly the case that needs carrying.
    const withResults = seasonsForLeague(matches, league);
    const previous = withResults.find(s => s !== latest);
    return new Set([latest, previous].filter(Boolean));
};

/** Display form: "2025/2026" -> "25/26"; "2026" stays "2026". */
export const shortSeason = (season) => {
    const s = String(season ?? '');
    const m = s.match(/^(\d{4})\/(\d{4})$/);
    return m ? `${m[1].slice(2)}/${m[2].slice(2)}` : s;
};

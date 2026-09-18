/**
 * A bet names its fixture as "Home vs Away" (App.jsx `addToBet`), so anything
 * asking "is this fixture in the slip?" has to build the same string. One place
 * to build it, rather than the template literal spreading further than the four
 * call sites it already had.
 *
 * Note this is not an identity for a FIXTURE - the same ordered pair meets twice
 * in a two-legged tie, which is why a saved bet also carries its kickoff. It is
 * enough to highlight a row in a list of upcoming matches, where each pair
 * appears once.
 */
export const gameKey = (home, away) => `${home} vs ${away}`;

/** Does the slip hold any bet on this fixture, on any statistic or side? */
export const hasBet = (bets, home, away) => {
    const key = gameKey(home, away);
    return !!bets?.some(b => b.game === key);
};

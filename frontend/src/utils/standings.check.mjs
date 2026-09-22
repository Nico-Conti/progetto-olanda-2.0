// node src/utils/standings.check.mjs
import assert from 'node:assert/strict';
import { lastChampions } from './standings.js';

const m = (league, season, home, away, hg, ag) => ({ league, season, squadre: { home, away }, stats: { goals: { home: hg, away: ag } } });
const matches = [
    // 2024/2025: A wins the league on points.
    m('L', '2024/2025', 'A', 'B', 2, 0), m('L', '2024/2025', 'B', 'C', 1, 1), m('L', '2024/2025', 'C', 'A', 0, 1),
    // 2025/2026, finished: C beats both. It is the last finished season, so C is champion.
    m('L', '2025/2026', 'C', 'A', 3, 0), m('L', '2025/2026', 'C', 'B', 2, 1), m('L', '2025/2026', 'A', 'B', 1, 0),
    // 2026/2027 has begun: B tops it, but it is not finished.
    m('L', '2026/2027', 'B', 'C', 4, 0),
    // One season only: nothing finished yet.
    m('New', '2026', 'X', 'Y', 1, 0),
    // Decided by playoffs, not by the table: left out.
    m('Jupiler League', '2025/2026', 'P', 'Q', 1, 0), m('Jupiler League', '2026/2027', 'P', 'Q', 1, 0),
];
assert.deepEqual(lastChampions(matches), { L: { team: 'C', season: '2025/2026' } });
// Between seasons: 2025/2026 is the newest played, but the next season's fixtures are out - so it counts as finished.
const summer = matches.filter(x => x.season !== '2026/2027');
assert.deepEqual(lastChampions(summer).L, { team: 'A', season: '2024/2025' });
assert.deepEqual(lastChampions(summer, [{ league: 'L', season: '2026/2027' }]).L, { team: 'C', season: '2025/2026' });
console.log('standings ok');

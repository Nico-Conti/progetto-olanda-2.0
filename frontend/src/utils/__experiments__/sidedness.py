"""Ladder sidedness, and the flat-bet validity check done properly.

`priceComparison.mjs`'s `(all)` row assumes flat-betting every captured side is
betting a balanced book. That holds only where the bookmaker posts both sides of
every rung. It does not hold for shots and shots_on_target, which are posted as a
one-sided OVER ladder with a single two-sided main line - so "every side" there is
an ~80%-overs portfolio, and in a market that clears ~62% over it returns a profit
with no mispricing whatsoever. That artefact was once read as proof that our count
is not the book's settled quantity.

Run:  python3 frontend/src/utils/__experiments__/sidedness.py
Reads odds_closing.json (regenerate with dumpClosing.py) and data.json (dumpSeason.py).
"""

import collections
import json
import os
import random
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
BOOTSTRAP = 4000

# market -> the stats.<key> we settle it against
MARKETS = {
    "total_goals": "goals",
    "total_corners": "corners",
    "total_fouls": "fouls",
    "total_shots": "shots",
    "total_shots_on_target": "shots_on_target",
}


def load():
    with open(os.path.join(HERE, "odds_closing.json")) as fh:
        odds = json.load(fh)
    with open(os.path.join(HERE, "data.json")) as fh:
        matches = json.load(fh)
    index = {}
    for m in matches:
        if m.get("date"):  # three rows carry none
            index[(m["league"], m["squadre"]["home"], m["squadre"]["away"], m["date"][:10])] = m
    return odds, index


def fixture_of(row):
    return (row["league"], row["home"], row["away"], row["date"][:10])


def total(match, stat):
    pair = (match.get("stats") or {}).get(stat)
    if not pair or pair.get("home") is None or pair.get("away") is None:
        return None
    return pair["home"] + pair["away"]


def settled(rows, index, stat):
    """(row, won) for every quote we can grade."""
    for row in rows:
        match = index.get(fixture_of(row))
        if not match:
            continue
        actual = total(match, stat)
        if actual is None:
            continue
        over = actual > row["line"]
        yield row, (over if row["selection"] == "over" else not over), actual


def flat_roi(graded):
    n = 0
    returned = 0.0
    for row, won, _ in graded:
        n += 1
        if won:
            returned += row["price"]
    return (returned - n) / n * 100 if n else 0.0, n


def main():
    odds, index = load()
    random.seed(7)

    print(f"{'market':24s} {'over':>6s} {'under':>6s} {'2-sided rungs':>15s} {'overround':>10s}")
    for market in MARKETS:
        rows = [r for r in odds if r["market"] == market]
        sides = collections.defaultdict(dict)
        for r in rows:
            sides[fixture_of(r) + (r["line"],)][r["selection"]] = r["price"]
        both = [v for v in sides.values() if "over" in v and "under" in v]
        counts = collections.Counter(r["selection"] for r in rows)
        margin = statistics.median(1 / v["over"] + 1 / v["under"] for v in both) if both else float("nan")
        print(f"{market:24s} {counts['over']:6d} {counts['under']:6d} "
              f"{len(both):7d}/{len(sides):<7d} {margin:10.4f}")

    print()
    print(f"{'market':24s} {'flat ALL':>10s} {'flat 2-SIDED':>13s} "
          f"{'fx':>5s} {'main OVER':>10s} {'95% CI':>18s}")
    for market, stat in MARKETS.items():
        rows = [r for r in odds if r["market"] == market]
        sides = collections.defaultdict(set)
        for r in rows:
            sides[fixture_of(r) + (r["line"],)].add(r["selection"])
        two = [r for r in rows if {"over", "under"} <= sides[fixture_of(r) + (r["line"],)]]

        all_roi, _ = flat_roi(list(settled(rows, index, stat)))
        two_roi, _ = flat_roi(list(settled(two, index, stat)))

        # the over side of the two-sided main line, bootstrapped BY FIXTURE:
        # rungs inside one fixture are correlated, so the quote is not the unit.
        by_fixture = collections.defaultdict(list)
        for row, won, _ in settled([r for r in two if r["selection"] == "over"], index, stat):
            by_fixture[fixture_of(row)].append(row["price"] if won else 0.0)
        fixtures = list(by_fixture.values())

        def over_roi(sample):
            n = sum(len(f) for f in sample)
            return (sum(sum(f) for f in sample) - n) / n * 100 if n else 0.0

        point = over_roi(fixtures)
        draws = sorted(over_roi([random.choice(fixtures) for _ in fixtures]) for _ in range(BOOTSTRAP))
        lo, hi = draws[int(BOOTSTRAP * 0.025)], draws[int(BOOTSTRAP * 0.975)]
        print(f"{market:24s} {all_roi:+9.1f}% {two_roi:+12.1f}% {len(fixtures):5d} "
              f"{point:+9.1f}% {f'[{lo:+.1f}%, {hi:+.1f}%]':>18s}")

    # The check this script exists to protect: a market whose ladder is fully
    # two-sided must lose roughly the overround when you back every side.
    for market, stat in MARKETS.items():
        rows = [r for r in odds if r["market"] == market]
        counts = collections.Counter(r["selection"] for r in rows)
        if min(counts.values()) / max(counts.values()) > 0.95:
            r, n = flat_roi(list(settled(rows, index, stat)))
            assert n > 50 and -20 < r < 0, f"{market}: two-sided ladder returned {r:+.1f}% on {n}"


if __name__ == "__main__":
    main()

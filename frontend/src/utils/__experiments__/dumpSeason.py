"""Dump completed matches for the model experiments.

    backend/venv/bin/python frontend/src/utils/__experiments__/dumpSeason.py 2025/2026
    backend/venv/bin/python frontend/src/utils/__experiments__/dumpSeason.py all

Writes data.json next to this file, in the same shape useMatchData.js builds, so
the Node experiments can feed it straight to the app's real model code.
"""
import collections
import json
import os
import sys

import requests
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

SEASON = sys.argv[1] if len(sys.argv) > 1 else "2025/2026"

# Second yellows as a share of all reds, FITTED on the 2,816 dumped rows that
# carry an exact `second_bookings` count: 202 of 565 reds. CLAUDE.md's 0.3333
# came from counting 98 match timelines by hand, so this confirms it on 5x the
# sample rather than replacing it. Stable in the number of reds (0.354 at one
# red, 0.393 at two) and used only for the ~637 rows that have a red and no
# column; re-fit it with __experiments__ cardBuckets if the backfill lands.
SECOND_BOOKING_RATE = 0.3575

# Every per-team statistic on the table. This used to list five; the model
# experiments could therefore not see xG and the six other columns that have
# been scraped and stored all along.
#
# `blocked_shots` holds diretta's "Palle intercettate" (interceptions) - the
# syncer writes it to that column on purpose, see supabase_syncer.py:92.
STATS = [
    "goals", "corners", "shots", "shots_on_target", "fouls",
    "yellow_cards", "red_cards", "possession",
    "xg", "xgot", "big_chances", "box_touches", "crosses",
    "goalkeeper_saves", "blocked_shots",
]

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
if not url or not key:
    sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")

headers = {"apikey": key, "Authorization": f"Bearer {key}"}
columns = ["home_team", "away_team", "league", "season", "giornata", "match_date"]
columns += [f"{side}_{s}" for s in STATS for side in ("home", "away")]
# Needed to derive card_points, which the app computes in useMatchData and which
# the experiments have therefore never seen.
columns += ["home_second_bookings", "away_second_bookings"]
select = ",".join(columns)

season_filter = "" if SEASON == "all" else f"&season=eq.{SEASON.replace('/', '%2F')}"

rows, offset = [], 0
while True:
    resp = requests.get(
        # `order=id` is load-bearing, not tidiness: limit/offset over an
        # unordered result set is undefined, and this dump was measured on
        # 2026-09-09 returning 5,053 rows for 5,000 distinct matches - 53
        # duplicated, 53 never seen. Every dump before that date carries it.
        f"{url}/rest/v1/matches?select={select}{season_filter}"
        f"&order=id&limit=1000&offset={offset}",
        headers=headers, timeout=90,
    )
    resp.raise_for_status()
    page = resp.json()
    # Stop on an empty response, never on a short one. PostgREST caps a page at
    # 1000 rows and may return fewer than asked for without being done, so
    # `len(page) < 1000` silently truncates the dump - the exact trap CLAUDE.md
    # documents, and the reason the scraper once only saw its first 1000 matches.
    if not page:
        break
    rows += page
    offset += len(page)


def shape(m):
    stats = {}
    for s in STATS:
        home, away = m[f"home_{s}"], m[f"away_{s}"]
        # Omit the key entirely when either side is missing. Migration 003 allows
        # scores-only rows, so NULLs are real; a {"home": null} object is truthy
        # in JS and would sail past the harness's `m.stats[key]` guard straight
        # into NaN arithmetic.
        if home is None or away is None:
            continue
        stats[s] = {"home": home, "away": away}

    # card_points is what the BOOKMAKER settles: a yellow is 1, a red is 2, and a
    # second yellow that becomes a red is 3 - the first yellow plus the red, the
    # second yellow not counted again. diretta files that dismissal as TWO
    # yellows and one red, so `yellows + 2*reds` scores it 4 and has to have the
    # second bookings taken back off.
    #
    # Three cases, and the middle one is why this is not gated on that column:
    #
    #   second_bookings known  -> exact, subtract it
    #   zero reds              -> exact ANYWAY: nothing to correct
    #   reds, no column        -> overstated by an unknown count, expectation
    #                             SECOND_BOOKING_RATE * reds
    #
    # Gating the whole statistic on the column cost 3,441 perfectly exact rows -
    # 84% of matches have no red card at all - and that shortfall was not random:
    # the column only exists for matches scraped after migration 005, so the
    # surviving rows were whichever leagues happened to be re-scraped recently.
    # Measured 2026-09-12, it left LaLiga 2 and Super Lig as 850 of 2,816 rows
    # while Premier League had 20 and Bundesliga 19, and those two are the
    # highest-card leagues in the set. A pooled model then read that mix as the
    # level of football and overstated cards everywhere prices actually exist.
    # 2,816 exact rows -> 6,257, and 6,894 trainable.
    #
    # `exact` rides along so a consumer can tell a settled outcome from an
    # estimate. Use estimates to FIT a mean and never as a label at a line: 4
    # yellows and a red estimates 5.64, which straddles 5.5 when the truth is
    # either 5 or 6.
    y, r = stats.get("yellow_cards"), stats.get("red_cards")
    hsb, asb = m.get("home_second_bookings"), m.get("away_second_bookings")
    if y and r:
        if hsb is not None and asb is not None:
            home = y["home"] + 2 * r["home"] - hsb
            away = y["away"] + 2 * r["away"] - asb
            exact = True
        else:
            home = y["home"] + 2 * r["home"] - SECOND_BOOKING_RATE * r["home"]
            away = y["away"] + 2 * r["away"] - SECOND_BOOKING_RATE * r["away"]
            exact = r["home"] == 0 and r["away"] == 0
        stats["card_points"] = {"home": home, "away": away, "exact": exact}
    return {
        "squadre": {"home": m["home_team"], "away": m["away_team"]},
        "stats": stats,
        "giornata": m["giornata"] or 0,
        "league": m["league"],
        "season": m["season"],
        "date": m["match_date"],
    }


shaped = [shape(m) for m in rows if m["home_team"] and m["away_team"]]
with open(os.path.join(HERE, "data.json"), "w") as f:
    json.dump(shaped, f)

print(f"{len(shaped)} matches from {SEASON}")
for (season, lg), n in sorted(collections.Counter(
        (r["season"], r["league"]) for r in shaped).items()):
    print(f"  {str(season):12}{lg:18}{n:5}")

coverage = collections.Counter(s for r in shaped for s in r["stats"])
print("\nstat coverage:")
for s in STATS:
    print(f"  {s:20}{coverage[s]:5} / {len(shaped)}")

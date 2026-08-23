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
select = ",".join(columns)

season_filter = "" if SEASON == "all" else f"&season=eq.{SEASON.replace('/', '%2F')}"

rows, offset = [], 0
while True:
    resp = requests.get(
        f"{url}/rest/v1/matches?select={select}{season_filter}"
        f"&limit=1000&offset={offset}",
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

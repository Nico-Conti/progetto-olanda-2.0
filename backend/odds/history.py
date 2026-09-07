"""Dump many seasons of match history and closing odds from football-data.co.uk.

    python -m backend.odds.history --from 2015/2016 --to 2025/2026 \
        --matches frontend/src/utils/__experiments__/data_fd.json \
        --odds    frontend/src/utils/__experiments__/odds_fd.json

Our own database holds roughly one season - a few thousand matches - which is
thin for fitting anything with more than a handful of parameters.
football-data.co.uk publishes free CSVs carrying goals, shots, shots on target,
fouls, corners and cards for thirteen of our fifteen leagues going back well
over a decade, alongside closing prices. That is several times the sample, at
the cost of a download. The two absentees are Eerste Divisie and Brazil - see
DIVISIONS in footballdata.py.

Stat depth is not uniform across divisions, and thinness is silent by design:
shape_matches omits a stat key it cannot read rather than writing a zero, so a
division carrying goals alone still contributes rows that are simply invisible
to a corners model. The run prints the share of matches carrying corners for
exactly this reason - read it.

What it does NOT carry is the diretta-only columns: xG, xGOT, big chances, box
touches, crosses, GK saves, interceptions. So this dataset can test anything
about corners, shots, fouls and cards - including corners-from-shots - but not
goals-from-box-touches.

Team names here are football-data's own. No alias mapping is applied and none is
needed: every analysis over this file stays inside it, and models are fitted per
league-season anyway. Joining it to our `matches` table WOULD need aliases.py,
which is why that is kept separate.
"""

import argparse
import csv
import datetime
import io
import json
import sys
from collections import defaultdict

import requests

from backend.odds.footballdata import (
    BASE_URL, DIVISIONS, SESSION, extract_rows, preflight, season_code,
)

# football-data column pairs -> the stat keys the experiments use, matching the
# shape dumpSeason.py writes so the same Node scripts can read either file.
STAT_COLUMNS = {
    "goals": ("FTHG", "FTAG"),
    "shots": ("HS", "AS"),
    "shots_on_target": ("HST", "AST"),
    "fouls": ("HF", "AF"),
    "corners": ("HC", "AC"),
    "yellow_cards": ("HY", "AY"),
    "red_cards": ("HR", "AR"),
}


def seasons_between(first, last):
    """['2015/2016', ..., '2025/2026']."""
    start, end = int(first.split("/")[0]), int(last.split("/")[0])
    if end < start:
        sys.exit("--from must not be after --to")
    return [f"{y}/{y + 1}" for y in range(start, end + 1)]


def parse_date(row):
    """football-data writes dd/mm/yy or dd/mm/yyyy, with Time in a second column."""
    raw = (row.get("Date") or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            day = datetime.datetime.strptime(raw, fmt)
            break
        except ValueError:
            continue
    else:
        return None
    time = (row.get("Time") or "").strip()
    if time:
        try:
            hh, mm = time.split(":")[:2]
            day = day.replace(hour=int(hh), minute=int(mm))
        except ValueError:
            pass
    return day.isoformat()


def shape_matches(rows, league, season):
    """Rows in the experiments' match shape, oldest first.

    `giornata` is derived, not read: football-data has no matchday column. A
    team's nth match is its nth matchday, so the round is the higher of the two
    sides' counts - which is what the round-based reports need.
    """
    played = []
    for r in rows:
        stats, complete = {}, True
        for key, (hc, ac) in STAT_COLUMNS.items():
            h, a = (r.get(hc) or "").strip(), (r.get(ac) or "").strip()
            if h == "" or a == "":
                # Omit the key rather than substituting zero: a missing stat and
                # a genuine 0-0 must stay distinguishable downstream.
                if key == "goals":
                    complete = False
                continue
            try:
                stats[key] = {"home": int(float(h)), "away": int(float(a))}
            except ValueError:
                continue
        date = parse_date(r)
        if not complete or not date or not r.get("HomeTeam") or not r.get("AwayTeam"):
            continue
        played.append({
            "squadre": {"home": r["HomeTeam"], "away": r["AwayTeam"]},
            "stats": stats, "league": league, "season": season, "date": date,
        })

    played.sort(key=lambda m: m["date"])
    counts = defaultdict(int)
    for m in played:
        home, away = m["squadre"]["home"], m["squadre"]["away"]
        counts[home] += 1
        counts[away] += 1
        m["giornata"] = max(counts[home], counts[away])
    return played


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="first", default="2015/2016")
    parser.add_argument("--to", dest="last", default="2025/2026")
    parser.add_argument("--matches", help="write the match history here as JSON")
    parser.add_argument("--odds", help="write the closing odds here as JSON")
    args = parser.parse_args()

    seasons = seasons_between(args.first, args.last)
    preflight()
    matches, odds = [], []

    print(f"{'season':11}" + "".join(c.rjust(10) for c in DIVISIONS), flush=True)
    for season in seasons:
        cells = []
        for code, league in DIVISIONS.items():
            try:
                resp = SESSION.get(f"{BASE_URL}/{season_code(season)}/{code}.csv", timeout=60)
            except requests.RequestException:
                cells.append("err")
                continue
            if resp.status_code != 200:
                cells.append("-")
                continue

            rows = [r for r in csv.DictReader(
                io.StringIO(resp.content.decode("utf-8-sig", errors="replace")))
                if r.get("HomeTeam")]

            shaped = shape_matches(rows, league, season)
            matches += shaped

            priced = 0
            for r in rows:
                got = extract_rows(r, league, season, r.get("HomeTeam"), r.get("AwayTeam"))
                if got:
                    priced += 1
                odds += got
            cells.append(f"{len(shaped)}/{priced}")
        print(f"{season:11}" + "".join(c.rjust(10) for c in cells), flush=True)

    print("\nlegend: matches with stats / matches with closing odds")
    corners = sum(1 for m in matches if "corners" in m["stats"])
    print(f"\n{len(matches)} matches, {corners} with corners "
          f"({100 * corners / max(len(matches), 1):.0f}%), {len(odds)} odds rows")

    if args.matches:
        with open(args.matches, "w") as fh:
            json.dump(matches, fh)
        print(f"wrote {args.matches}")
    if args.odds:
        with open(args.odds, "w") as fh:
            json.dump([{
                "league": r[0], "season": r[1], "home": r[2], "away": r[3],
                "date": r[4], "market": r[5], "line": r[6],
                "selection": r[7], "price": r[8], "bookmaker": r[9],
            } for r in odds], fh)
        print(f"wrote {args.odds}")


if __name__ == "__main__":
    main()

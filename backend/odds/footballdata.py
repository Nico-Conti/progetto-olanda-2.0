"""Backfill closing odds from football-data.co.uk.

    python -m backend.odds.footballdata --season 2025/2026 --dry-run
    python -m backend.odds.footballdata --season 2025/2026 --write

The niche markets this project cares about - corners and cards - are not priced
here, and cannot be backfilled from anywhere. This exists so the pricing and
evaluation machinery can be built and debugged *now*, against thousands of real
closing prices on goals, instead of waiting months for corner prices to
accumulate. Whatever is learned here transfers directly the moment there are
corner prices to point it at.

Prices are taken from the CLOSING columns (the `C` infix: `B365CH`, `AvgC>2.5`).
Closing prices are the sharpest the market gets and the benchmark closing-line
value is measured against; opening prices would flatter any model compared
against them.

Preference order is Betfair Exchange, then Pinnacle, then the market average.
Exchange prices carry no bookmaker margin, so they are the market's own estimate
of the probability with nothing to strip out.

Team names are resolved against what is already in `matches` for the same
league-season - see aliases.py, which derives the mapping rather than hardcoding
it. A season we do not already hold cannot be resolved and is skipped loudly.
"""

import argparse
import csv
import io
import os
import sys
from collections import defaultdict

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from backend.odds.aliases import build_alias_map

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

BASE_URL = "https://www.football-data.co.uk/mmz4281"

# The site throttles: it answers 503 with a `Retry-After` site-wide, for every
# division at once, and a plain `requests.get` turns that into a division that
# looks simply absent. Retry honours `Retry-After` by default, so a throttled
# window costs time rather than a silently short dataset.
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "Mozilla/5.0"
SESSION.mount("https://", HTTPAdapter(max_retries=Retry(
    total=3, backoff_factor=5, status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
)))


def preflight(code="E0", season="2024/2025"):
    """Exit loudly if the site is not answering. Call before any bulk fetch.

    Retry honours `Retry-After`, and a down football-data hands out ~216s on
    every request - which turned a 156-file dump into 3.5 hours of silent
    sleeping on 2026-09-07 before it was killed, having printed nothing. One
    un-retried probe costs a second and turns that into a clear failure.
    """
    url = f"{BASE_URL}/{season_code(season)}/{code}.csv"
    try:
        resp = requests.get(url, headers=SESSION.headers, timeout=30)
    except requests.RequestException as exc:
        sys.exit(f"football-data.co.uk unreachable: {exc}")
    if resp.status_code != 200:
        sys.exit(f"football-data.co.uk returned {resp.status_code} for {url} "
                 f"(Retry-After: {resp.headers.get('Retry-After', '-')}). "
                 f"The site is down or blocking this connection - nothing to do but wait.")

# football-data division code -> our `matches.league` display name.
#
# Thirteen of our fifteen leagues are here. Eerste Divisie has no division at
# football-data at all, and Brazil lives in a differently shaped extra file
# (BRA.csv: goals and odds, no shots/corners/fouls); both are simply absent
# rather than silently mismatched.
DIVISIONS = {
    "E0": "Premier League",
    "E1": "Championship",
    "I1": "Serie A",
    "I2": "Serie B",
    "SP1": "La Liga",
    "SP2": "LaLiga 2",
    "D1": "Bundesliga",
    "D2": "2. Bundesliga",
    "F1": "Ligue 1",
    "F2": "Ligue 2",
    "N1": "Eredivisie",
    "P1": "Liga Portugal",
    "T1": "Super Lig",
}

# Bookmaker column prefixes, best first. BFE is the Betfair Exchange, whose
# prices have no overround; P/PS is Pinnacle, the sharpest conventional book.
BOOKS_1X2 = [
    ("betfair_exchange", "BFEC{}"),
    ("pinnacle", "PSC{}"),
    ("average", "AvgC{}"),
    ("bet365", "B365C{}"),
]
BOOKS_OU = [
    ("betfair_exchange", "BFEC{}2.5"),
    ("pinnacle", "PC{}2.5"),
    ("average", "AvgC{}2.5"),
    ("bet365", "B365C{}2.5"),
]


def season_code(season):
    """'2025/2026' -> '2526', which is how football-data names its files."""
    try:
        start, end = season.split("/")
        return f"{start[-2:]}{end[-2:]}"
    except ValueError:
        raise SystemExit(f"Season must look like 2025/2026, got {season!r}")


def fetch_division(code, season):
    url = f"{BASE_URL}/{season_code(season)}/{code}.csv"
    resp = SESSION.get(url, timeout=60)
    if resp.status_code != 200:
        return None
    text = resp.content.decode("utf-8-sig", errors="replace")
    return [r for r in csv.DictReader(io.StringIO(text)) if r.get("HomeTeam")]


def _price(row, column):
    raw = (row.get(column) or "").strip()
    try:
        value = float(raw)
    except ValueError:
        return None
    # A decimal price below 1.01 is not a price; football-data leaves stray
    # zeros where a book did not quote a market.
    return value if value >= 1.01 else None


def pick_book(row, books, selections):
    """First book quoting *every* selection, as (name, {selection: price}).

    Partial quotes are rejected on purpose. An over price without its under is
    unusable: the overround cannot be removed from one side alone, so the
    implied probability would be inflated by the margin.
    """
    for name, template in books:
        prices = {sel: _price(row, template.format(token)) for sel, token in selections.items()}
        if all(p is not None for p in prices.values()):
            return name, prices
    return None, None


def extract_rows(row, league, season, home, away):
    """Every odds_snapshots row this match yields. `captured_at` is the kickoff:
    a closing price is by definition the last one before the match started, and
    football-data does not record when it was taken."""
    when = row.get("Date") or ""
    out = []

    book, prices = pick_book(row, BOOKS_1X2, {"home": "H", "draw": "D", "away": "A"})
    if book:
        for selection, price in prices.items():
            out.append((league, season, home, away, when, "1x2", None, selection, price, book))

    book, prices = pick_book(row, BOOKS_OU, {"over": ">", "under": "<"})
    if book:
        for selection, price in prices.items():
            out.append((league, season, home, away, when, "total_goals", 2.5, selection, price, book))

    return out


def load_our_matches(season):
    """Our matches for `season`, grouped by league - the alias map's other half."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    rows, offset = [], 0
    select = "league,home_team,away_team,home_goals,away_goals"
    while True:
        resp = requests.get(
            f"{url}/rest/v1/matches?select={select}"
            f"&season=eq.{season.replace('/', '%2F')}&limit=1000&offset={offset}",
            headers=headers, timeout=90,
        )
        resp.raise_for_status()
        page = resp.json()
        # Stop on an empty page, never a short one - PostgREST caps a page at
        # 1000 and may return fewer without being done.
        if not page:
            break
        rows += page
        offset += len(page)

    by_league = defaultdict(list)
    for m in rows:
        by_league[m["league"]].append({
            "home": m["home_team"], "away": m["away_team"],
            "home_goals": m["home_goals"], "away_goals": m["away_goals"],
        })
    return by_league


def write_rows(rows):
    url, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"]
    headers = {
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    payload = [{
        "league": r[0], "season": r[1], "home_team": r[2], "away_team": r[3],
        "match_date": r[4] or None, "market": r[5], "line": r[6],
        "selection": r[7], "price": r[8], "bookmaker": r[9],
        "source": "footballdata", "is_closing": True,
        "captured_at": r[4] or None,
    } for r in rows]

    written = 0
    for i in range(0, len(payload), 500):
        chunk = payload[i:i + 500]
        resp = requests.post(f"{url}/rest/v1/odds_snapshots", headers=headers,
                             json=chunk, timeout=120)
        if resp.status_code >= 400:
            sys.exit(f"Write failed ({resp.status_code}): {resp.text[:400]}")
        written += len(chunk)
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default="2025/2026", help="e.g. 2025/2026")
    parser.add_argument("--league", help="one of our league display names")
    parser.add_argument("--write", action="store_true",
                        help="write to odds_snapshots (needs migration 004)")
    parser.add_argument("--json", metavar="PATH",
                        help="also write the rows as JSON, for the Node experiments. "
                             "Lets the model be scored against real prices without "
                             "waiting for migration 004 to be applied.")
    args = parser.parse_args()

    preflight()
    ours = load_our_matches(args.season)
    if not ours:
        sys.exit(f"No matches stored for season {args.season}; nothing to resolve names against.")

    all_rows, problems = [], []
    print(f"{'league':18}{'matches':>9}{'resolved':>10}{'1x2':>7}{'o/u 2.5':>9}   books")
    for code, league in DIVISIONS.items():
        if args.league and league != args.league:
            continue
        if league not in ours:
            print(f"{league:18}{'-':>9}   not in our data for this season")
            continue

        theirs_raw = fetch_division(code, args.season)
        if not theirs_raw:
            print(f"{league:18}{'-':>9}   no file at football-data")
            continue

        theirs = [{"home": r["HomeTeam"], "away": r["AwayTeam"],
                   "home_goals": r.get("FTHG"), "away_goals": r.get("FTAG")}
                  for r in theirs_raw if r.get("FTHG") not in (None, "")]

        alias, unresolved = build_alias_map(ours[league], theirs)
        if unresolved:
            problems.append((league, unresolved))

        rows, books = [], set()
        for r in theirs_raw:
            home, away = alias.get(r["HomeTeam"]), alias.get(r["AwayTeam"])
            if not home or not away:
                continue
            got = extract_rows(r, league, args.season, home, away)
            rows += got
            books.update(g[9] for g in got)

        n_1x2 = len({(r[2], r[3]) for r in rows if r[5] == "1x2"})
        n_ou = len({(r[2], r[3]) for r in rows if r[5] == "total_goals"})
        all_rows += rows
        print(f"{league:18}{len(theirs_raw):>9}{f'{len(alias)}/{len(alias) + len(unresolved)}':>10}"
              f"{n_1x2:>7}{n_ou:>9}   {', '.join(sorted(books)) or '-'}")

    print(f"\n{len(all_rows)} odds rows across {len({(r[0], r[2], r[3]) for r in all_rows})} matches")

    if problems:
        print("\nUnresolved team names - these matches are skipped:")
        for league, names in problems:
            print(f"  {league}: {', '.join(names)}")
        print("Resolution needs both sides to hold the same completed fixtures.")

    if args.json:
        import json
        with open(args.json, "w") as fh:
            json.dump([{
                "league": r[0], "season": r[1], "home": r[2], "away": r[3],
                "date": r[4], "market": r[5], "line": r[6],
                "selection": r[7], "price": r[8], "bookmaker": r[9],
            } for r in all_rows], fh)
        print(f"\nWrote {len(all_rows)} rows to {args.json}")

    if args.write:
        print(f"\nWriting {len(all_rows)} rows...")
        print(f"Wrote {write_rows(all_rows)} rows to odds_snapshots.")
    elif not args.json:
        print("\nDry run - nothing written. Re-run with --write once migration 004 is applied.")


if __name__ == "__main__":
    main()

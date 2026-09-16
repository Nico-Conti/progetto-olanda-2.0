"""Dump the CLOSING price of every priced line, for the model experiments.

    backend/venv/bin/python frontend/src/utils/__experiments__/dumpClosing.py

Writes odds_closing.json next to this file - the other half of what
priceComparison.mjs and marketBlend.mjs read, data.json being the first.

This existed only as an ad-hoc script until 2026-09-16, which meant the dataset
behind docs section 20 could not be regenerated: the one copy was a file on one
machine. It matters more now that `--prune-history` collapses the price path,
because after a prune the raw snapshots are gone and this file is the record.

A closing price is the LAST capture strictly before kickoff. Only matches that
have already kicked off have one, so upcoming fixtures are skipped - their
newest price is simply the current price, not a close.
"""
import json
import os
import sys
from collections import defaultdict

import requests
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_KEY")
if not URL or not KEY:
    sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")

COLUMNS = ("league,home_team,away_team,match_date,market,line,selection,price,captured_at")
BATCH = 1000


def fetch_all():
    """Every snapshot, paged.

    Ends on an EMPTY page and orders by `id`. Both halves matter and both have
    bitten this project: PostgREST silently caps a page at 1000 rows, so
    `len(page) < BATCH` is not a terminator; and `limit`/`offset` over an
    unordered result is undefined in Postgres, which once returned 5,053 rows
    for 5,000 distinct matches - 53 duplicated and 53 never seen.
    """
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    rows, offset = [], 0
    while True:
        resp = requests.get(
            f"{URL}/rest/v1/odds_snapshots?select={COLUMNS}&order=id"
            f"&limit={BATCH}&offset={offset}", headers=headers, timeout=120)
        resp.raise_for_status()
        page = resp.json()
        if not page:
            return rows
        rows += page
        offset += len(page)
        print(f"  fetched {len(rows):,}", end="\r", flush=True)


def main():
    rows = fetch_all()
    print(f"  fetched {len(rows):,} snapshots")

    latest = {}
    skipped_upcoming = 0
    for r in rows:
        kickoff, captured = r.get("match_date"), r.get("captured_at")
        if not kickoff or not captured:
            continue
        # Strictly before kickoff: a capture taken during a match in progress is
        # a live price, not a close, and `get_odds` deliberately keeps serving
        # one for six hours after kickoff.
        if captured >= kickoff:
            skipped_upcoming += 1
            continue
        key = (r["league"], r["home_team"], r["away_team"], kickoff,
               r["market"], r["line"], r["selection"])
        if key not in latest or captured > latest[key]["captured_at"]:
            latest[key] = r

    out = [{"league": r["league"], "home": r["home_team"], "away": r["away_team"],
            "date": r["match_date"], "market": r["market"], "line": r["line"],
            "selection": r["selection"], "price": r["price"],
            "captured_at": r["captured_at"]} for r in latest.values()]
    out.sort(key=lambda r: (r["date"], r["league"], r["home"], r["market"],
                            r["line"] if r["line"] is not None else -1, r["selection"]))

    path = os.path.join(HERE, "odds_closing.json")
    json.dump(out, open(path, "w"))
    per_market = defaultdict(int)
    for r in out:
        per_market[r["market"]] += 1
    print(f"  {skipped_upcoming:,} snapshots at or after kickoff (not a close)")
    print(f"\nwrote {len(out):,} closing prices to {path}")
    for m, n in sorted(per_market.items(), key=lambda kv: -kv[1]):
        print(f"  {m:<26}{n:>7,}")


if __name__ == "__main__":
    main()

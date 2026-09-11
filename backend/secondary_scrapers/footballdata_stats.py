"""Fill missing match statistics from football-data.co.uk.

    python -m backend.secondary_scrapers.footballdata_stats --season 2025/2026
    python -m backend.secondary_scrapers.footballdata_stats --season 2025/2026 --league "Jupiler League" --write

A new league's previous season costs hours through `backend.scraper.main`, which
visits every match page. This is the fast path: `season_importer` reads the whole
season off one results list (scores, dates, giornata, our team names), and this
then lays football-data's stat columns on top of those rows. Minutes, not hours.

Verified before it was written, against 3,126 team-matches across six leagues
where we hold both sources for 2025/2026: football-data and diretta agree
exactly on 98.4-100% of values, mean |difference| <= 0.02 on every column. They
are counting the same quantities. (That is not true of the *bookmaker*, which
settles shots on something narrower - see the odds notes.)

What this cannot buy: `box_touches`, `xg`, `xgot`, possession, big chances,
crosses, saves and second bookings are not in the CSVs. Goals are predicted FROM
box touches, so a row filled in here is skipped by the goals model and feeds the
corners, fouls, shots and cards ones. That is the whole trade.

Only NULL columns are written, so this never overwrites a scraped value and is
idempotent - re-running it changes nothing. Unresolved team names are reported
loudly and their matches skipped: about 38 matches per name, and a guessed join
is worse than a gap.
"""

import argparse
import datetime
import os
import sys
from collections import defaultdict

import requests
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.odds.aliases import build_alias_map
from backend.odds.footballdata import DIVISIONS, fetch_division, preflight
from backend.services.supabase_syncer import fetch_all_records

load_dotenv()

# our column stem -> football-data's (home, away) column pair.
STAT_COLUMNS = {
    "goals": ("FTHG", "FTAG"),
    "corners": ("HC", "AC"),
    "shots": ("HS", "AS"),
    "shots_on_target": ("HST", "AST"),
    "fouls": ("HF", "AF"),
    "yellow_cards": ("HY", "AY"),
    "red_cards": ("HR", "AR"),
}

SELECT = ",".join(
    ["id", "league", "home_team", "away_team", "match_date"]
    + [f"{side}_{stat}" for stat in STAT_COLUMNS for side in ("home", "away")]
)


def _their_date(their):
    raw = (their.get("Date") or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


def _our_date(row):
    raw = row.get("match_date")
    if not raw:
        return None
    try:
        return datetime.datetime.fromisoformat(raw).date()
    except ValueError:
        return None


def _closest(candidates, their_day, tolerance=1):
    """The candidate played on `their_day`, within a day. None if none is.

    A day of slack, not zero, because `match_date` is a UTC instant and taking
    its `.date()` is NOT the match's local date: a results row carrying no
    kick-off time parses to midnight Europe/Rome, which stores as 22:00Z on the
    PREVIOUS day. Half of Belgium's rows are like that, and exact date equality
    rejected all 51 of them. The candidates for a repeated fixture are months
    apart - a two-legged tie or a regular-season meeting replayed in the
    play-offs - so a day of tolerance cannot pick the wrong one.
    """
    if their_day is None:
        return None
    dated = [(abs((_our_date(c) - their_day).days), c) for c in candidates if _our_date(c)]
    if not dated:
        return None
    gap, best = min(dated, key=lambda p: p[0])
    return best if gap <= tolerance else None


def load_our_matches(season, headers, base_url):
    """Our rows for `season`, grouped by league, carrying id and current stats."""
    rows = fetch_all_records(base_url, "matches", headers, select=SELECT,
                             filters=f"&season=eq.{season.replace('/', '%2F')}")
    by_league = defaultdict(list)
    for m in rows:
        # build_alias_map reads home/away/home_goals/away_goals; the rest rides along.
        m["home"], m["away"] = m["home_team"], m["away_team"]
        by_league[m["league"]].append(m)
    return by_league


def missing_values(row, their):
    """Columns that are NULL for us and present for them, as a patch payload."""
    patch = {}
    for stat, (home_col, away_col) in STAT_COLUMNS.items():
        for side, col in (("home", home_col), ("away", away_col)):
            if row.get(f"{side}_{stat}") is not None:
                continue
            raw = (their.get(col) or "").strip()
            if not raw:
                continue
            try:
                patch[f"{side}_{stat}"] = int(float(raw))
            except ValueError:
                continue
    return patch


def backfill_league(league, code, season, ours, write, headers, base_url):
    """Returns (patched, unresolved, filled_by_column)."""
    theirs_raw = fetch_division(code, season)
    if not theirs_raw:
        print(f"{league:18}{'-':>9}   no file at football-data")
        return 0, [], {}

    theirs = [{"home": r["HomeTeam"], "away": r["AwayTeam"],
               "home_goals": r.get("FTHG"), "away_goals": r.get("FTAG")}
              for r in theirs_raw if r.get("FTHG") not in (None, "")]
    alias, unresolved = build_alias_map(ours, theirs)

    # (home, away) is NOT a key: a two-legged play-off puts the same ordered pair
    # on the pitch twice, and Belgium 2025/2026 has 320 rows over 240 distinct
    # pairs. Keying on the pair alone silently dropped 80 of them and could hand
    # a match the OTHER leg's statistics. Disambiguate on the date, and skip
    # rather than guess when it cannot be pinned down.
    by_fixture = defaultdict(list)
    for m in ours:
        by_fixture[(m["home"], m["away"])].append(m)

    patched, ambiguous, filled = 0, 0, defaultdict(int)
    for r in theirs_raw:
        candidates = by_fixture.get((alias.get(r["HomeTeam"]), alias.get(r["AwayTeam"])), [])
        if len(candidates) == 1:
            row = candidates[0]
        else:
            row = _closest(candidates, _their_date(r))
            if candidates and not row:
                ambiguous += 1
        if not row:
            continue
        patch = missing_values(row, r)
        if not patch:
            continue
        patched += 1
        for column in patch:
            filled[column] += 1
        if write:
            resp = requests.patch(f"{base_url}/rest/v1/matches?id=eq.{row['id']}",
                                  json=patch, headers=headers, timeout=60)
            if resp.status_code >= 400:
                sys.exit(f"Write failed on match {row['id']} ({resp.status_code}): {resp.text[:300]}")

    resolved = f"{len(alias)}/{len(alias) + len(unresolved)}"
    note = f"   {sum(filled.values())} values"
    if ambiguous:
        note += f"   ({ambiguous} skipped: repeated fixture, no date match)"
    print(f"{league:18}{len(theirs_raw):>9}{resolved:>10}{patched:>9}{note}")
    return patched, unresolved, filled


def self_check():
    """The four rules `missing_values` exists to keep. Run with --self-check."""
    theirs = {"FTHG": "2", "FTAG": "1", "HC": "7", "AC": "4", "HR": "0", "AR": "0", "HY": ""}
    row = {"home_corners": 9, "away_corners": None, "home_goals": None, "away_goals": None,
           "home_red_cards": None, "away_red_cards": None, "home_yellow_cards": None}
    patch = missing_values(row, theirs)

    # A value we already hold is never overwritten - ours came from the match page.
    assert "home_corners" not in patch, patch
    # A NULL we can fill is filled.
    assert patch["away_corners"] == 4, patch
    assert (patch["home_goals"], patch["away_goals"]) == (2, 1), patch
    # A blank cell is a missing value, NOT a zero. This is the whole reason the
    # scraper stopped storing fabricated zeros; a CSV gap must take the same path.
    assert "home_yellow_cards" not in patch, patch
    # But a real zero is data and must survive: reds are 0-0 in most matches.
    assert patch["home_red_cards"] == 0 and patch["away_red_cards"] == 0, patch

    # `_closest` picks between the legs of a repeated fixture. The July row is
    # stored as midnight Rome, i.e. 22:00Z on the 25th, for a match football-data
    # dates the 26th - so a day of slack is required, and months of separation
    # are what makes it safe.
    july = {"match_date": "2025-07-25T22:00:00+00:00"}
    may = {"match_date": "2026-05-21T18:30:00+00:00"}
    legs = [may, july]
    assert _closest(legs, datetime.date(2025, 7, 26)) is july
    assert _closest(legs, datetime.date(2026, 5, 21)) is may
    # Nothing within a day of either leg resolves to nothing, never to a guess.
    assert _closest(legs, datetime.date(2025, 9, 14)) is None
    assert _closest(legs, None) is None

    print("self-check ok")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default="2025/2026", help="e.g. 2025/2026")
    parser.add_argument("--league", help="one of our league display names")
    parser.add_argument("--write", action="store_true",
                        help="patch the rows; without it nothing is written")
    parser.add_argument("--self-check", action="store_true",
                        help="assert missing_values' rules, touch nothing")
    args = parser.parse_args()

    if args.self_check:
        return self_check()

    base_url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not base_url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json", "Prefer": "return=minimal"}

    preflight()
    ours = load_our_matches(args.season, headers, base_url)
    if not ours:
        sys.exit(f"No matches stored for season {args.season}. Run season_importer "
                 f"--insert-missing first: this fills stats in, it does not create rows.")

    total, problems, filled = 0, [], defaultdict(int)
    print(f"\n{'league':18}{'theirs':>9}{'names':>10}{'matches':>9}   filled")
    for code, league in DIVISIONS.items():
        if args.league and league != args.league:
            continue
        if league not in ours:
            print(f"{league:18}{'-':>9}   not in our data for this season")
            continue
        patched, unresolved, got = backfill_league(
            league, code, args.season, ours[league], args.write, headers, base_url)
        total += patched
        if unresolved:
            problems.append((league, unresolved))
        for column, n in got.items():
            filled[column] += n

    verb = "patched" if args.write else "would patch"
    print(f"\n{verb} {total} matches, {sum(filled.values())} values")
    for column in sorted(filled):
        print(f"   {column:26}{filled[column]:>6}")

    if problems:
        print("\nUnresolved team names - their matches are skipped (~38 each):")
        for league, names in problems:
            print(f"  {league}: {', '.join(names)}")

    if not args.write and total:
        print("\nNothing was written. Re-run with --write.")


if __name__ == "__main__":
    main()

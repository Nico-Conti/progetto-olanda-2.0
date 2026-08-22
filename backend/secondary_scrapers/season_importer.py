"""Import a finished season's results (scores only) into the `matches` table.

The season results page already carries everything needed for results and a
league table - date, teams, score, matchday and the match link - so a whole
season imports from a single page instead of visiting ~380 match pages. That
makes it fast enough to re-run freely, at the cost of the detailed stats
(corners/shots/xG) that only live on the individual match pages.

Rows are matched on `url`, which is unique across seasons and is the same key
`sync_matches_to_supabase()` prefers. So re-running this over a season that was
already scraped in full does not duplicate anything - it just fills in the
`season` and `match_date` those rows are missing, and adds any match the
nightly scraper skipped.

Usage:
    python -m backend.secondary_scrapers.season_importer seriea --season 2025/2026
    python -m backend.secondary_scrapers.season_importer --all --season-offset 1
    python -m backend.secondary_scrapers.season_importer seriea --season 2025/2026 --dry-run
"""

import argparse
import datetime
import os
import re
import sys

import pytz
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.append(project_root)

from backend.scraper.config import (
    LEAGUE_SLUGS,
    current_season,
    previous_season,
    resolve_league_name,
    season_results_url,
    season_year_for_month,
)
from backend.scraper.driver import make_driver, fully_scroll
from backend.scraper.url_collector import check_more_matches, parse_row_date
from backend.services.supabase_syncer import fetch_all_records

load_dotenv()

ROME = pytz.timezone("Europe/Rome")

# Columns this importer owns. It must never write anything else, or it would
# blank out the stats and Gemini analysis on rows scraped in full.
OWNED_COLUMNS = ("home_goals", "away_goals", "match_date", "season", "giornata")


def _text(node):
    return node.get_text(strip=True) if node else None


def _int(node):
    raw = _text(node)
    if raw is None:
        return None
    raw = raw.strip()
    return int(raw) if raw.lstrip("-").isdigit() else None


def scrape_season_results(driver, slug, season):
    """Every played match of a season, read off the results list page."""
    url = season_results_url(slug, season)
    print(f"  -> {url}")
    driver.get(url)

    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
        ).click()
        print("     cookie banner accepted")
    except Exception:
        pass

    fully_scroll(driver, pause=1.0, max_loops=5)
    check_more_matches(driver)

    soup = BeautifulSoup(driver.page_source, "html.parser")
    rows = soup.select(
        'div[id="live-table"] div.event__round, div[id="live-table"] div.event__match, '
        'div[id="tournamentPage"] div.event__round, div[id="tournamentPage"] div.event__match'
    )

    league_name = resolve_league_name(slug)
    matches = []
    giornata = None
    skipped = 0

    for row in rows:
        classes = row.get("class", [])

        if "event__round" in classes:
            digits = re.sub(r"\D", "", row.get_text(strip=True))
            giornata = int(digits) if digits else None
            continue

        if "event__match" not in classes:
            continue

        home = _text(row.select_one(".event__homeParticipant"))
        away = _text(row.select_one(".event__awayParticipant"))
        home_goals = _int(row.select_one(".event__score--home"))
        away_goals = _int(row.select_one(".event__score--away"))

        # No score means the match has not been played - not a results row.
        if not home or not away or home_goals is None or away_goals is None:
            skipped += 1
            continue

        link = row.select_one("a.eventRowLink")
        href = link.get("href") if link else None
        if href and href.startswith("/"):
            href = f"https://www.diretta.it{href}"

        when = parse_row_date(_text(row.select_one(".event__stageTime")), season)

        matches.append({
            "url": href,
            "home_team": home,
            "away_team": away,
            "home_goals": home_goals,
            "away_goals": away_goals,
            "giornata": giornata,
            "match_date": when.isoformat() if when else None,
            "season": str(season),
            "league": league_name,
        })

    print(f"     parsed {len(matches)} played matches" + (f" ({skipped} rows without a score)" if skipped else ""))
    return matches


def sync_season(matches, dry_run=False, insert_missing=False):
    """Update rows matched by URL; optionally insert the ones that are missing.

    Inserting is off by default. This importer only knows scores, but `matches`
    declares the stat columns NOT NULL, so an insert would have to invent values
    (0 corners, 0 shots) that are indistinguishable from real ones and would
    quietly corrupt every average computed from them. Relax those constraints
    first - see backend/migrations/003_allow_scores_only_rows.sql - then pass
    --insert-missing.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("❌ Missing SUPABASE_URL / SUPABASE_KEY")
        return 0, 0, 0

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    try:
        existing = fetch_all_records(url, "matches", headers, select="id,url")
        by_url = {r["url"]: r["id"] for r in existing if r.get("url")}
    except Exception as e:
        if not dry_run:
            raise
        # A dry run is still useful without the DB - it just cannot say which
        # rows would be updated versus inserted.
        print(f"     ⚠️  could not reach Supabase ({e}); reporting scrape only")
        by_url = {}

    updated = inserted = skipped = failed = 0

    for m in matches:
        payload = {k: m[k] for k in OWNED_COLUMNS if m.get(k) is not None}
        match_id = by_url.get(m["url"]) if m.get("url") else None

        if dry_run:
            action = "UPDATE" if match_id else ("INSERT" if insert_missing else "SKIP  ")
            print(f"     [{action}] g{m['giornata']:>2} {m['home_team']} {m['home_goals']}-{m['away_goals']} {m['away_team']}  {m['match_date']}")
            if match_id:
                updated += 1
            elif insert_missing:
                inserted += 1
            else:
                skipped += 1
            continue

        try:
            if match_id:
                r = requests.patch(f"{url}/rest/v1/matches?id=eq.{match_id}", json=payload, headers=headers)
                r.raise_for_status()
                updated += 1
            elif insert_missing:
                payload.update({
                    "home_team": m["home_team"],
                    "away_team": m["away_team"],
                    "league": m["league"],
                })
                if m.get("url"):
                    payload["url"] = m["url"]
                r = requests.post(f"{url}/rest/v1/matches", json=payload, headers=headers)
                r.raise_for_status()
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"     ❌ {m['home_team']} vs {m['away_team']}: {e}")
            failed += 1

    return updated, inserted, skipped, failed


def main():
    parser = argparse.ArgumentParser(description="Import a finished season's results (scores only).")
    parser.add_argument("league", nargs="?", choices=LEAGUE_SLUGS, help="League slug")
    parser.add_argument("--all", action="store_true", help="Every league")
    parser.add_argument("--season", help="Season label, e.g. 2025/2026 (Brazil: 2025)")
    parser.add_argument("--season-offset", type=int, default=1,
                        help="Seasons back from the current one when --season is omitted (default 1)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be written, change nothing")
    parser.add_argument("--insert-missing", action="store_true",
                        help="Also insert matches absent from the DB. Requires the stat columns "
                             "to be nullable (see migrations/003); without it they are skipped.")
    args = parser.parse_args()

    if not args.league and not args.all:
        parser.error("give a league slug or --all")

    slugs = LEAGUE_SLUGS if args.all else [args.league]

    driver = make_driver()
    totals = [0, 0, 0, 0]
    try:
        for slug in slugs:
            season = args.season
            if not season:
                season = current_season(slug)
                for _ in range(args.season_offset):
                    season = previous_season(slug, season)

            print(f"\n--- {resolve_league_name(slug)} {season} ---")
            try:
                matches = scrape_season_results(driver, slug, season)
            except Exception as e:
                print(f"  ❌ scrape failed: {e}")
                continue

            if not matches:
                print("     nothing to sync")
                continue

            u, i, sk, f = sync_season(matches, dry_run=args.dry_run, insert_missing=args.insert_missing)
            totals = [totals[0] + u, totals[1] + i, totals[2] + sk, totals[3] + f]
            verb = "would update" if args.dry_run else "updated"
            print(f"     {verb}: {u}, inserted: {i}, skipped (not in DB): {sk}"
                  + (f", failed: {f}" if f else ""))
    finally:
        driver.quit()

    print(f"\n{'DRY RUN - ' if args.dry_run else ''}total updated {totals[0]}, "
          f"inserted {totals[1]}, skipped {totals[2]}, failed {totals[3]}")
    if totals[2] and not args.insert_missing:
        print(f"  {totals[2]} scraped matches are not in the DB. To add them, relax the NOT NULL "
              f"stat columns (migrations/003) and re-run with --insert-missing.")


if __name__ == "__main__":
    main()

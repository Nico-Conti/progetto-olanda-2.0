import argparse
import hashlib
import os
import sys
import time

import requests

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.append(project_root)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv
from backend.scraper.driver import make_driver
from backend.scraper.config import LEAGUES, LEAGUE_SLUGS, season_standings_url

# Some team pages serve a blank 100x100 PNG instead of a crest. It returns HTTP
# 200, so it looks fine to any URL check, but renders as nothing - which is how
# Juventus, Wolfsburg, Wolves and Cesena ended up logo-less. The standings row
# carries a real (smaller) crest for those teams, so we fall back to it.
PLACEHOLDER_MD5 = "8096b1e961bd29872500da8a366c7333"
PLACEHOLDER_MAX_BYTES = 500


def is_placeholder_logo(url):
    """True when a logo URL resolves to the blank crest (or nothing usable)."""
    if not url:
        return True
    try:
        resp = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code >= 400:
            return True
        body = resp.content
        return hashlib.md5(body).hexdigest() == PLACEHOLDER_MD5 or len(body) < PLACEHOLDER_MAX_BYTES
    except Exception as e:
        print(f"    -> could not verify logo ({e}); treating as usable")
        return False

# Load environment variables
load_dotenv()

def setup_supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
        return None

    try:
        supabase: Client = create_client(url, key)
        return supabase
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")
        return None

def scrape_squads(league_name, url):
    print(f"--- Scraping Squads (Teams) for {league_name} ---")
    driver = make_driver()
    supabase = setup_supabase_client()
    
    if not supabase:
        driver.quit()
        return

    try:
        driver.get(url)
        print("  -> Page loaded, waiting for table...")
        
        # Wait for the standings table to get team links
        # Wait for at least 10 rows to ensure table is populated
        WebDriverWait(driver, 45).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, ".ui-table__row")) >= 10
        )
        
        # Accept cookies
        try:
            accept_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
            )
            accept_btn.click()
            time.sleep(1)
        except:
            pass

        selenium_rows = driver.find_elements(By.CSS_SELECTOR, ".ui-table__row")
        print(f"  -> Found {len(selenium_rows)} standings rows.")

        # Dump the page only when asked - this used to drop a ~770KB
        # debug_squads.html in the repo root on every single run.
        if os.environ.get("SQUADS_DEBUG_HTML"):
            with open("debug_squads.html", "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            print("  -> Saved page source to debug_squads.html")

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Find team links
        # .tableCellParticipant__name > a
        team_links = []
        rows = soup.select(".ui-table__row")
        for row in rows:
            link_elem = row.select_one(".tableCellParticipant__name")
            if link_elem:
                team_name = link_elem.get_text(strip=True)
                href = link_elem.get("href")
                if href:
                    full_url = f"https://www.diretta.it{href}"
                    row_logo = row.select_one("img")
                    team_links.append({
                        "name": team_name,
                        "url": full_url,
                        "row_logo": row_logo.get("src") if row_logo else None,
                    })
        
        print(f"  -> Found {len(team_links)} teams.")
        
        for team in team_links:
            print(f"  -> Processing {team['name']}...")
            try:
                driver.get(team['url'])
                time.sleep(2) # Wait for load
                
                # Wait for logo
                # Selector for logo: .heading__logo
                try:
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, ".heading__logo"))
                    )
                except:
                    print("    -> Logo not found, skipping wait.")
                
                team_soup = BeautifulSoup(driver.page_source, 'html.parser')
                logo_elem = team_soup.select_one(".heading__logo")
                logo_url = logo_elem.get("src") if logo_elem else None

                # Prefer the team page's crest, but only if it is a real one.
                if is_placeholder_logo(logo_url):
                    if team.get("row_logo") and not is_placeholder_logo(team["row_logo"]):
                        print(f"    -> team page crest is blank, using the standings one")
                        logo_url = team["row_logo"]
                    else:
                        print(f"    -> ⚠️ no usable crest for {team['name']}, leaving as is")
                        logo_url = None

                if logo_url:
                    # Update Supabase
                    data = {
                        "name": team['name'],
                        "logo_url": logo_url,

                    }
                    
                    # Upsert
                    # Check if exists
                    existing = supabase.table("squads").select("id").eq("name", team['name']).execute()
                    if existing.data:
                        item_id = existing.data[0]['id']
                        supabase.table("squads").update(data).eq("id", item_id).execute()
                        # print(f"    -> Updated {team['name']}")
                    else:
                        supabase.table("squads").insert(data).execute()
                        print(f"    -> Inserted {team['name']}")
                else:
                    print(f"    -> No logo found for {team['name']}")
                    
            except Exception as e:
                print(f"    -> Error processing {team['name']}: {e}")
                
    except Exception as e:
        print(f"Error scraping squads: {e}")
    finally:
        driver.quit()

def main():
    parser = argparse.ArgumentParser(description="Scrape squads for a specific league.")
    parser.add_argument("league", nargs="?", help="League to scrape (serieb, eredivisie, laliga)")
    parser.add_argument("--season", help="Scrape a finished season's standings instead of the "
                                         "current one, e.g. 2025/2026. Useful for teams that have "
                                         "since been relegated and so no longer appear.")
    args = parser.parse_args()

    leagues = [
        {"name": cfg["name"], "key": slug, "url": cfg["base_url"] + "classifiche/"}
        for slug, cfg in LEAGUES.items()
    ]

    target_leagues = leagues
    if args.league:
        wanted = args.league.lower()
        target_leagues = [l for l in leagues if l["key"] == wanted or l["name"].lower() == wanted]
        if not target_leagues:
            print(f"League '{args.league}' not found. Available: {LEAGUE_SLUGS}")
            return
    
    for league in target_leagues:
        url = season_standings_url(league["key"], args.season) if args.season else league["url"]
        scrape_squads(league["name"], url)

if __name__ == "__main__":
    main()

import os
import sys
import time

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

        # Debug: Check Selenium count
        selenium_rows = driver.find_elements(By.CSS_SELECTOR, ".ui-table__row")
        print(f"  -> DEBUG: Selenium found {len(selenium_rows)} rows.")
        
        with open("debug_squads.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("  -> DEBUG: Saved page source to debug_squads.html")

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
                    team_links.append({"name": team_name, "url": full_url})
        
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

import argparse

def main():
    parser = argparse.ArgumentParser(description="Scrape squads for a specific league.")
    parser.add_argument("league", nargs="?", help="League to scrape (serieb, eredivisie, laliga)")
    args = parser.parse_args()

    leagues = [
        {"name": "Serie B", "key": "serieb", "url": "https://www.diretta.it/calcio/italia/serie-b/classifiche/"},
        {"name": "Eredivisie", "key": "eredivisie", "url": "https://www.diretta.it/calcio/olanda/eredivisie/classifiche/"},
        {"name": "La Liga", "key": "laliga", "url": "https://www.diretta.it/calcio/spagna/laliga/classifiche/"}
    ]
    
    target_leagues = leagues
    if args.league:
        target_leagues = [l for l in leagues if l["key"] == args.league.lower() or l["name"].lower() == args.league.lower()]
        if not target_leagues:
            print(f"League '{args.league}' not found. Available: {[l['key'] for l in leagues]}")
            return
    
    for league in target_leagues:
        scrape_squads(league["name"], league["url"])

if __name__ == "__main__":
    main()

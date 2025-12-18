import os
import sys
import time
import datetime

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.append(project_root)

from backend.scraper.driver import make_driver
import time
import datetime

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv

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



def parse_date(date_str, time_str):
    # Diretta format example: "29.11. 20:00" or "01.12. 12:15"
    # We need to add the current year or next year
    try:
        current_year = datetime.datetime.now().year
        day, month = map(int, date_str.strip('.').split('.'))
        hour, minute = map(int, time_str.split(':'))
        
        # Handle year rollover (e.g. scraping in Dec for Jan matches)
        now = datetime.datetime.now()
        year = current_year
        if month < now.month and (now.month - month) > 6:
             year += 1
        
        return datetime.datetime(year, month, day, hour, minute)
    except Exception as e:
        print(f"Error parsing date {date_str} {time_str}: {e}")
        return None

def scrape_league(driver, supabase, league_name, url):
    print(f"Connecting to {url}...")
    driver.get(url)
    print("  -> Page loaded, waiting for content...")
    time.sleep(5) # Extra wait for initial load
    
    try:
        # Wait for the main table to load
        print("  -> Waiting for match table...")
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".sportName, .event__match, #live-table"))
        )
        print("  -> Match table found.")
        
        # Accept cookies if present
        try:
            accept_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
            )
            accept_btn.click()
            time.sleep(2)
        except:
            print("  -> Cookie banner not found or already accepted.")

        # Expand "Show more matches" - Loop to click all of them
        max_retries = 3
        retries = 0
        while True:
            try:
                # Scroll to bottom to ensure button is viewable/trigger lazy load
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1)
                
                # Try multiple selectors based on user feedback and common patterns
                more_btns = []
                
                # 1. Try by text (most reliable if class names change)
                if not more_btns:
                    more_btns = driver.find_elements(By.XPATH, "//span[contains(text(), 'Mostra più incontri')]/ancestor::a")
                
                # 2. Try by data-testid
                if not more_btns:
                    more_btns = driver.find_elements(By.CSS_SELECTOR, 'a[data-testid="wcl-buttonLink"]')
                
                # 3. Old selector fallback
                if not more_btns:
                    more_btns = driver.find_elements(By.CLASS_NAME, "event__more")

                if more_btns:
                    more_btn = more_btns[0]
                    if more_btn.is_displayed():
                        driver.execute_script("arguments[0].click();", more_btn)
                        print("  -> Clicked 'Show more matches'")
                        time.sleep(3) # Wait for content to load
                        retries = 0 # Reset retries
                    else:
                        print("  -> 'Show more' button found but not displayed.")
                        break
                else:
                    retries += 1
                    if retries > max_retries:
                        print("  -> No 'Show more' button found after retries. Assuming all loaded.")
                        break
                    print(f"  -> 'Show more' button not found, retrying ({retries}/{max_retries})...")
                    time.sleep(2)
            except Exception as e:
                print(f"  -> Error in 'Show more' loop: {e}")
                break

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        fixtures = []
        current_round = 0
        
        # Select all rows in the sportName container
        rows = soup.select(".sportName > div")
        
        for row in rows:
            classes = row.get("class", [])
            
            # 1. Check for Round Header
            if "event__round" in classes:
                round_text = row.get_text(strip=True)
                try:
                    current_round = int(''.join(filter(str.isdigit, round_text)))
                except:
                    current_round = 0
                print(f"Found Round: {current_round}")
                
            # 2. Check for Match Row (must contain eventRowLink)
            elif row.select_one("a.eventRowLink"):
                try:
                    # Extract text with separator to handle text nodes
                    # Expected format: "29.11. 20:00|Home Team|-|Away Team|..."
                    text_content = row.get_text(separator='|', strip=True)
                    parts = text_content.split('|')
                    
                    # Filter out empty strings and common non-data strings
                    parts = [p for p in parts if p and p != '-' and p != 'FRO']
                    
                    # Heuristic: 
                    # Part 0: Date/Time (e.g. "29.11. 20:00")
                    # Part 1: Home Team
                    # Part 2: Away Team
                    # (Sometimes there are extra parts like scores if live, but this is calendar)
                    
                    if len(parts) >= 2:
                        home_team = None
                        away_team = None
                        match_date = None
                        status = "SCHEDULED"
                        
                        # Case 1: Date + Teams (len >= 3)
                        if len(parts) >= 3:
                            # Check if the first part is time (Old format)
                            if "." in parts[0] and ":" in parts[0]:
                                raw_time = parts[0]
                                home_team = parts[1]
                                away_team = parts[2]
                            # Check if the last part is time (New format observed in logs)
                            elif "." in parts[-1] and ":" in parts[-1]:
                                home_team = parts[0]
                                away_team = parts[1]
                                raw_time = parts[-1]
                            else:
                                # Maybe TBD with extra info? Treat as TBD if we can find teams
                                # Assume first two are teams if they look like strings
                                home_team = parts[0]
                                away_team = parts[1]
                                status = "POSTPONED" # Assume postponed/TBD if no time found
                        
                        # Case 2: Only Teams (len == 2) -> TBD/Postponed
                        elif len(parts) == 2:
                            home_team = parts[0]
                            away_team = parts[1]
                            status = "POSTPONED"

                        # Validate time format to be sure if we found one
                        if 'raw_time' in locals() and "." in raw_time and ":" in raw_time:
                            if " " in raw_time:
                                try:
                                    date_part, time_part = raw_time.split(" ")
                                    match_date_obj = parse_date(date_part, time_part)
                                    if match_date_obj:
                                        match_date = match_date_obj.isoformat()
                                except:
                                    match_date = None
                            else:
                                match_date = None
                                
                        if home_team and away_team:
                            # If we have teams but no date, it's likely postponed/TBD
                            # We still want to update it in DB to reflect the status change
                            fixtures.append({
                                "home_team": home_team,
                                "away_team": away_team,
                                "match_date": match_date, # Can be None
                                "giornata": current_round,
                                "status": status,
                                "league": league_name
                            })
                            print(f"  -> Scraped: {home_team} vs {away_team} ({status}, Date: {match_date})")
                    else:
                        # print(f"DEBUG: Not enough parts in row: {parts}")
                        pass
                            
                except Exception as e:
                    print(f"Error parsing row: {e}")
            
            else:
                # Debug: Log skipped rows to see if we are missing something (like Round 14)
                # print(f"DEBUG: Skipped row with classes: {classes}")
                pass

        print(f"Total fixtures scraped for {league_name}: {len(fixtures)}")
        
        # Insert/Update into Supabase (Manual Logic to avoid missing constraint issue)
        if fixtures:
            try:
                print("  -> Fetching existing fixtures from DB for comparison...")
                # Fetch ID as well to allow update by ID
                # We fetch ALL fixtures to ensure we catch duplicates even if league is NULL
                # This might be heavy but necessary if league is not populated
                existing_db_fixtures = supabase.table("fixtures").select("id, home_team, away_team, match_date, league").execute()
                
                # Map "home_away" -> {id, match_date, league}
                existing_map = {f"{f['home_team']}_{f['away_team']}": f for f in existing_db_fixtures.data}
                
                to_insert = []
                updates_count = 0
                
                for f in fixtures:
                    key = f"{f['home_team']}_{f['away_team']}"
                    existing_record = existing_map.get(key)
                    
                    if not existing_record:
                        # New match -> Insert
                        to_insert.append(f)
                    else:
                        # Existing match -> Check if update needed
                        existing_date = existing_record.get('match_date')
                        match_id = existing_record.get('id')
                        existing_league = existing_record.get('league')
                        
                        # Check if date changed OR league needs update (was NULL)
                        date_changed = f['match_date'] != existing_date
                        league_needs_update = existing_league != league_name
                        
                        if date_changed or league_needs_update:
                            if date_changed:
                                print(f"    -> Date changed for {f['home_team']} vs {f['away_team']}: {existing_date} -> {f['match_date']}")
                            if league_needs_update:
                                # print(f"    -> Updating league for {f['home_team']} vs {f['away_team']}")
                                pass
                                
                            # Update this single record by ID
                            try:
                                supabase.table("fixtures").update(f).eq("id", match_id).execute()
                                updates_count += 1
                            except Exception as update_e:
                                print(f"    -> Error updating match {match_id}: {update_e}")
                
                # Batch Insert
                if to_insert:
                    print(f"  -> Inserting {len(to_insert)} new matches...")
                    try:
                        data, count = supabase.table("fixtures").insert(to_insert).execute()
                        print(f"  -> Successfully inserted {len(to_insert)} matches.")
                    except Exception as insert_e:
                        print(f"  -> Error inserting matches: {insert_e}")
                
                print(f"  -> Updated {updates_count} existing matches.")
                print(f"  -> No changes for {len(fixtures) - len(to_insert) - updates_count} matches.")

            except Exception as e:
                print(f"Error interacting with Supabase: {e}")
                try:
                    print("  -> Page Source Snippet:")
                    print(driver.page_source[:1000])
                except:
                    pass
            
    except Exception as e:
        print(f"An error occurred scraping {league_name}: {e}")
        try:
            print("  -> Page Source Snippet:")
            print(driver.page_source[:1000])
        except:
            pass
    finally:
        # Don't quit driver here, let the main loop handle it or pass it in
        pass

def get_next_fixtures(supabase):
    print("\n--- Next Fixtures Detection ---")
    try:
        now = datetime.datetime.now().isoformat()
        # Fetch fixtures after now, ordered by date
        response = supabase.table("fixtures").select("*").gt("match_date", now).order("match_date", desc=False).limit(5).execute()
        next_games = response.data
        
        if next_games:
            print(f"Found {len(next_games)} upcoming matches:")
            for game in next_games:
                print(f"  [{game.get('league', 'Unknown')}] {game['match_date']}: {game['home_team']} vs {game['away_team']}")
        else:
            print("No upcoming fixtures found in DB.")
            
    except Exception as e:
        print(f"Error fetching next fixtures: {e}")

import argparse

def scrape_fixtures():
    parser = argparse.ArgumentParser(description="Scrape fixtures for a specific league.")
    parser.add_argument("league", nargs="?", help="League to scrape (serieb, eredivisie, laliga)")
    args = parser.parse_args()

    supabase = setup_supabase_client()
    if not supabase:
        return

    leagues = [
        {"name": "La Liga", "key": "laliga", "url": "https://www.diretta.it/calcio/spagna/laliga/calendario/"},
        {"name": "Eredivisie", "key": "eredivisie", "url": "https://www.diretta.it/calcio/olanda/eredivisie/calendario/"},
        {"name": "Serie B", "key": "serieb", "url": "https://www.diretta.it/calcio/italia/serie-b/calendario/"},
        {"name": "Serie A", "key": "seriea", "url": "https://www.diretta.it/calcio/italia/serie-a/calendario/"},
        {"name": "Bundesliga", "key": "bundesliga", "url": "https://www.diretta.it/calcio/germania/bundesliga/calendario/"},
        {"name": "Ligue 1", "key": "ligue1", "url": "https://www.diretta.it/calcio/francia/ligue-1/calendario/"},
        {"name": "Premier League", "key": "premier", "url": "https://www.diretta.it/calcio/inghilterra/premier-league/calendario/"}
    ]
    
    target_leagues = leagues
    if args.league:
        target_leagues = [l for l in leagues if l["key"] == args.league.lower() or l["name"].lower() == args.league.lower()]
        if not target_leagues:
            print(f"League '{args.league}' not found. Available: {[l['key'] for l in leagues]}")
            return

    for league in target_leagues:
        print(f"\n--- Scraping {league['name']} ---")
        driver = make_driver()
        if not driver:
            print("Failed to initialize driver. Skipping.")
            continue
            
        try:
            scrape_league(driver, supabase, league['name'], league['url'])
        except Exception as e:
            print(f"Critical error scraping {league['name']}: {e}")
        finally:
            if driver:
                driver.quit()
                
    # Check next fixtures
    get_next_fixtures(supabase)

if __name__ == "__main__":
    scrape_fixtures()

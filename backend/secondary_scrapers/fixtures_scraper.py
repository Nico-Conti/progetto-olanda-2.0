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
        elif month > now.month and (month - now.month) > 6:
             year -= 1
        
        return datetime.datetime(year, month, day, hour, minute)
    except Exception as e:
        print(f"Error parsing date {date_str} {time_str}: {e}")
        return None

def scrape_league(driver, supabase, league_name, url, scrape_type="fixtures"):
    print(f"Connecting to {url} ({scrape_type})...")
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
                        match_date = None
                        status = "SCHEDULED"
                        if scrape_type == "results":
                             status = "PLAYED" # Default for results page
                        
                        # Case 1: Date + Teams (len >= 3)
                        if len(parts) >= 3:
                            # Check if the first part is time (Old format)
                            if "." in parts[0] and ":" in parts[0]:
                                raw_time = parts[0]
                                home_team = parts[1]
                                # Check if part 2/3 are scores (Results page often has: Date | Home | 2 | 1 | Away)
                                # or Date | Home | 2 | - | 1 | Away
                                # If we are in results, we expect scores between Home and Away.
                                # But we just need Home and Away names.
                                
                                # Heuristic for Results:
                                # Parts: ['29.11. 15:00', 'HomeTeam', '2', '1', 'AwayTeam', ...]
                                # If parts[2] is digit -> It's a score.
                                if len(parts) >= 5 and parts[2].isdigit() and parts[3].isdigit():
                                     home_team = parts[1]
                                     away_team = parts[4]
                                elif len(parts) >= 5 and parts[2].isdigit() and parts[3] == "-" and parts[4].isdigit():
                                     # 2 - 1 format? Rare in split('|') unless separators are weird.
                                     home_team = parts[1]
                                     away_team = parts[5] 
                                else:
                                     # Standard Fixture or simple result
                                     # Assume Part 2 is Away Team IF not digit
                                     if not parts[2][0].isdigit():
                                         away_team = parts[2]
                                     else:
                                         # Likely a result row we didn't catch perfectly, 
                                         # or Home | Score | ... | Away
                                         # Let's verify specific "risultati" struct
                                         # Usually: Date, Home, ScoreH, ScoreA, Away
                                         if scrape_type == "results":
                                              # Try looking for the next non-digit, non-dash string
                                              for p_idx in range(2, len(parts)):
                                                   if not parts[p_idx].isdigit() and parts[p_idx] not in ["-", "Rig."]:
                                                        away_team = parts[p_idx]
                                                        break
                                         else:
                                              away_team = parts[2] # Fallback
                                
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
                # We need to fetch ALL fixtures. Since Supabase/PostgREST might cap limits, we use pagination.
                
                all_existing = []
                offset = 0
                fetch_batch = 1000
                print("  -> Fetching all existing fixtures (Pagination enabled)...")
                
                while True:
                    # Using range() in supabase-py if possible, or raw execution logic
                    # supabase-py .range(start, end) is 0-indexed inclusive? checking docs standard
                    # usually .range(0, 999) -> 1000 items
                    
                    batch_res = supabase.table("fixtures").select("id, home_team, away_team, match_date, league, giornata").range(offset, offset + fetch_batch - 1).execute()
                    batch_data = batch_res.data
                    
                    if not batch_data:
                        break
                        
                    all_existing.extend(batch_data)
                    # print(f"    -> Fetched {len(batch_data)} rows (Total: {len(all_existing)})")
                    
                    if len(batch_data) < fetch_batch:
                        break
                        
                    offset += fetch_batch

                # Helper for normalization
                def normalize_team(name):
                    return name.lower().strip().replace(" ", "_")

                # Map "home_away_giornata" -> {id, match_date, league}
                existing_map = {}
                for f in all_existing:
                    h = normalize_team(f['home_team'])
                    a = normalize_team(f['away_team'])
                    # Giornata might be None or int
                    g = str(f.get('giornata', 0)) 
                    key = f"{h}_{a}_{g}"
                    existing_map[key] = f
                
                print(f"  -> Loaded {len(all_existing)} existing fixtures for comparison.")
                
                to_insert = []
                updates_count = 0
                
                to_insert = []
                updates_count = 0
                
                for f in fixtures:
                    # Normalize current fixture for lookup
                    h_curr = normalize_team(f['home_team'])
                    a_curr = normalize_team(f['away_team'])
                    g_curr = str(f.get('giornata', 0))
                    
                    key = f"{h_curr}_{a_curr}_{g_curr}"
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
                        # Handle None comparison safely
                        date_changed = False
                        if f['match_date'] and existing_date:
                            date_changed = f['match_date'] != existing_date
                        elif f['match_date'] and not existing_date:
                            date_changed = True
                        # If both are None, no change. If new is None, usually we don't overwrite with None unless it's postponed, 
                        # but 'status' handles that. matching on date string is usually safe.

                        league_needs_update = existing_league != league_name
                        
                        if date_changed or league_needs_update:
                            update_payload = {}
                            if date_changed:
                                print(f"    -> Date changed for {f['home_team']} vs {f['away_team']}: {existing_date} -> {f['match_date']}")
                                update_payload['match_date'] = f['match_date']
                                update_payload['status'] = f['status'] # Update status too if date changed (e.g. Postponed -> Date)
                                
                            if league_needs_update:
                                # print(f"    -> Updating league for {f['home_team']} vs {f['away_team']}")
                                update_payload['league'] = league_name
                                
                            # Update this single record by ID
                            if update_payload:
                                try:
                                    supabase.table("fixtures").update(update_payload).eq("id", match_id).execute()
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
        {"name": "La Liga", "key": "laliga", "base_url": "https://www.diretta.it/calcio/spagna/laliga/"},
        {"name": "Eredivisie", "key": "eredivisie", "base_url": "https://www.diretta.it/calcio/olanda/eredivisie/"},
        {"name": "Serie B", "key": "serieb", "base_url": "https://www.diretta.it/calcio/italia/serie-b/"},
        {"name": "Serie A", "key": "seriea", "base_url": "https://www.diretta.it/calcio/italia/serie-a/"},
        {"name": "Bundesliga", "key": "bundesliga", "base_url": "https://www.diretta.it/calcio/germania/bundesliga/"},
        {"name": "Ligue 1", "key": "ligue1", "base_url": "https://www.diretta.it/calcio/francia/ligue-1/"},
        {"name": "Premier League", "key": "premier", "base_url": "https://www.diretta.it/calcio/inghilterra/premier-league/"},
        {"name": "Eerste Divisie", "key": "eerstedivisie", "base_url": "https://www.diretta.it/calcio/olanda/eerste-divisie/"}
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

        # 1. Scrape Results (History)
        try:
             results_url = league['base_url'] + "risultati/"
             scrape_league(driver, supabase, league['name'], results_url, scrape_type="results")
        except Exception as e:
             print(f"Error scraping RESULTS for {league['name']}: {e}")

        # 2. Scrape Fixtures (Future)
        try:
             fixtures_url = league['base_url'] + "calendario/"
             scrape_league(driver, supabase, league['name'], fixtures_url, scrape_type="fixtures")
        except Exception as e:
             print(f"Error scraping FIXTURES for {league['name']}: {e}")

        driver.quit()
                
    # Check next fixtures
    get_next_fixtures(supabase)

if __name__ == "__main__":
    scrape_fixtures()

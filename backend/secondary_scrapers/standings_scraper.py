import os
import sys
import time
import datetime

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

def scrape_standings(league_name, url):
    print(f"--- Scraping Standings for {league_name} ---")
    driver = make_driver()
    supabase = setup_supabase_client()
    
    if not supabase:
        driver.quit()
        return

    try:
        driver.get(url)
        print("  -> Page loaded, waiting for table...")
        
        # Wait for the standings table
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".ui-table__row"))
        )
        
        # Accept cookies if present
        try:
            accept_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
            )
            accept_btn.click()
            time.sleep(1)
        except:
            pass

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        rows = soup.select(".ui-table__row")
        print(f"  -> Found {len(rows)} rows.")
        
        standings_data = []
        
        for row in rows:
            try:
                rank_elem = row.select_one(".tableCellRank")
                team_elem = row.select_one(".tableCellParticipant__name")
                points_elem = row.select_one(".tableCellParticipant__value") # Usually points are here or in a specific cell
                
                # Diretta table columns: Rank, Team, Played, Won, Drawn, Lost, Goals, Points, Form
                # We need to be careful with selectors.
                # Let's try to get all cells
                cells = row.select(".tableCell")
                
                # Expected cells: Rank, Team, Played, Won, Drawn, Lost, Goals (For:Against), Points, Form
                # But Diretta classes are specific.
                
                rank = row.select_one(".tableCellRank").get_text(strip=True).replace(".", "")
                team_name = row.select_one(".tableCellParticipant__name").get_text(strip=True)
                
                # Points is usually in a cell with specific class or just by index
                # Let's iterate cells to find data
                # Typically: Rank, Team, MP, W, D, L, G, PTS, Form
                
                # We can try to extract numbers from cells
                # The structure is usually:
                # div.tableCellRank
                # div.tableCellParticipant
                # div.tableCell (MP)
                # div.tableCell (W)
                # div.tableCell (D)
                # div.tableCell (L)
                # div.tableCell (G)
                # div.tableCell (PTS)
                # div.tableCell (Form)
                
                # Select all value cells (Played, Won, Drawn, Lost, Goals, Diff, Points)
                # The class is usually 'table__cell table__cell--value'
                value_cells = [c.get_text(strip=True) for c in row.select(".table__cell--value")]
                
                # Expected columns based on HTML:
                # 0: Played (e.g. 14)
                # 1: Won (e.g. 2)
                # 2: Drawn (e.g. 4)
                # 3: Lost (e.g. 8)
                # 4: Goals (e.g. 12:20)
                # 5: Goal Diff (e.g. -8)
                # 6: Points (e.g. 10)
                
                if len(value_cells) >= 7:
                    played = int(value_cells[0])
                    won = int(value_cells[1])
                    drawn = int(value_cells[2])
                    lost = int(value_cells[3])
                    goals = value_cells[4] # "12:20"
                    # value_cells[5] is diff, we can calculate or use it
                    points = int(value_cells[6])
                    
                    goals_for, goals_against = map(int, goals.split(":"))
                    
                    standings_data.append({
                        "league": league_name,
                        "team": team_name,
                        "rank": int(rank.strip('.')),
                        "points": points,
                        "played": played,
                        "won": won,
                        "drawn": drawn,
                        "lost": lost,
                        "goals_for": goals_for,
                        "goals_against": goals_against,
                        "goal_diff": goals_for - goals_against
                    })
                else:
                    print(f"DEBUG: Skipping {team_name}, not enough value cells: {value_cells}")
            except Exception as e:
                print(f"    -> Error parsing row: {e}")

        print(f"  -> Extracted {len(standings_data)} teams.")
        
        # Sync to Supabase
        if standings_data:
            print("  -> Syncing to Supabase 'standings' table...")
            # We should probably upsert based on (league, team)
            # But Supabase upsert needs a unique constraint.
            # Assuming (league, team) is unique.
            
            for item in standings_data:
                try:
                    # Try to upsert
                    # We might need to fetch existing to get ID if no unique constraint on (league, team)
                    # But let's try upsert with on_conflict if possible, or just insert
                    
                    # Check if exists
                    existing = supabase.table("standings").select("id").eq("league", league_name).eq("team", item["team"]).execute()
                    
                    if existing.data:
                        # Update
                        item_id = existing.data[0]['id']
                        supabase.table("standings").update(item).eq("id", item_id).execute()
                        # print(f"    -> Updated {item['team']}")
                    else:
                        # Insert
                        supabase.table("standings").insert(item).execute()
                        print(f"    -> Inserted {item['team']}")
                        
                except Exception as e:
                    print(f"    -> Error syncing {item['team']}: {e}")
            
            print("  -> Sync complete.")

    except Exception as e:
        print(f"Error scraping standings: {e}")
    finally:
        driver.quit()

import argparse

def main():
    parser = argparse.ArgumentParser(description="Scrape standings for a specific league.")
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
        scrape_standings(league["name"], league["url"])

if __name__ == "__main__":
    main()

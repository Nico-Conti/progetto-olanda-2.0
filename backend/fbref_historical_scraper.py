import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import pandas as pd
import time
import random
import os
import csv

# --- CONFIGURATION ---
LEAGUES = {
    "Eredivisie": 23,
    # "Premier League": 9,
    # "La Liga": 12,
    # "Serie A": 11,
    # "Bundesliga": 20,
}

SEASONS = ["2023-2024"] # Start small

BASE_URL = "https://fbref.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "historical_dataset.csv")

def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3") 
    # options.add_argument("--headless") # Keep visible for debugging if needed
    
    driver = uc.Chrome(options=options)
    return driver

def get_season_url(league_name, league_id, season):
    return f"{BASE_URL}/en/comps/{league_id}/{season}/schedule/{season}-{league_name.replace(' ', '-')}-Scores-and-Fixtures"

def get_match_links(driver, season_url):
    """Scrapes a season schedule page to find all Match Report URLs."""
    print(f"  Scanning schedule: {season_url}")
    try:
        driver.get(season_url)
        time.sleep(random.uniform(3, 5))
        
        # Parse with BS4 for speed after loading
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        links = []
        for a in soup.find_all('a', string="Match Report"):
            href = a.get('href')
            if href:
                links.append(BASE_URL + href)
        
        print(f"  Found {len(links)} matches.")
        return links
        
    except Exception as e:
        print(f"  ❌ Error scanning schedule: {e}")
        return []

def scrape_match_stats(driver, match_url):
    """Scrapes advanced stats from a single match page."""
    try:
        time.sleep(random.uniform(2, 4)) 
        driver.get(match_url)
        
        # Wait for scorebox
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "scorebox"))
        )
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # 1. Metadata
        h1 = soup.find('h1')
        if h1:
            title_text = h1.get_text(strip=True)
            if " vs. " in title_text:
                parts = title_text.split(" Match Report")[0].split(" vs. ")
                home_team_name = parts[0].strip()
                away_team_name = parts[1].strip()
            else:
                scorebox = soup.find('div', class_='scorebox')
                teams = scorebox.find_all('div', itemprop='performer')
                home_team_name = teams[0].get_text(strip=True)
                away_team_name = teams[1].get_text(strip=True)
        else:
             return None

        scorebox = soup.find('div', class_='scorebox')
        if scorebox:
            scores = scorebox.find_all('div', class_='score')
            home_goals = scores[0].get_text(strip=True)
            away_goals = scores[1].get_text(strip=True)
        else:
            home_goals = 0
            away_goals = 0
        
        stats = {
            "home_team": home_team_name,
            "away_team": away_team_name,
            "home_goals": home_goals,
            "away_goals": away_goals,
            "url": match_url
        }
        
        # 2. Extract Stats
        tables = soup.find_all('table')
        stat_counts = {"shooting": 0, "passing": 0, "possession": 0}
        
        # DEBUG: Print all table IDs
        print("DEBUG: Found Tables:", [t.get('id') for t in tables])
        
        for table in tables:
            table_id = table.get('id', '')
            current_type = None
            
            if "shooting" in table_id or "shots" in table_id: current_type = "shooting"
            elif "passing_types" in table_id: current_type = "passing"
            elif "possession" in table_id: current_type = "possession"
            elif "summary" in table_id: current_type = "summary"
            
            if not current_type:
                continue
                
            # Increment count
            team_prefix = "home" if stat_counts.get(current_type, 0) % 2 == 0 else "away"
            if current_type in stat_counts:
                stat_counts[current_type] += 1
            
            try:
                df = pd.read_html(str(table))[0]
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = ['_'.join(col).strip() for col in df.columns.values]
                
                total = df.iloc[-1]
                
                if current_type == "shooting":
                    for col in df.columns:
                        if "Standard_Sh" in col or col == "Sh": stats[f"{team_prefix}_shots"] = total.get(col, 0)
                        if "Expected_xG" in col or col == "xG": stats[f"{team_prefix}_xg"] = total.get(col, 0)
                        if "Expected_npxG" in col: stats[f"{team_prefix}_npxg"] = total.get(col, 0)
                        
                elif current_type == "summary":
                     # Summary table often has xG too
                     for col in df.columns:
                        if "Expected_xG" in col or col == "xG": 
                            # Only overwrite if not already found (shooting is usually more detailed)
                            if f"{team_prefix}_xg" not in stats:
                                stats[f"{team_prefix}_xg"] = total.get(col, 0)
                        
                elif current_type == "passing":
                    for col in df.columns:
                        if "Crs" in col: stats[f"{team_prefix}_crosses"] = total.get(col, 0)
                        
                elif current_type == "possession":
                    for col in df.columns:
                        if "Att Pen" in col: stats[f"{team_prefix}_box_touches"] = total.get(col, 0)

            except:
                continue
                
        return stats

    except Exception as e:
        print(f"  ❌ Error scraping match {match_url}: {e}")
        return None

def main():
    print("--- 🌍 Fbref Historical Scraper (Selenium) ---")
    
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    driver = make_driver()
    all_matches = []
    
    try:
        for league, league_id in LEAGUES.items():
            for season in SEASONS:
                print(f"\nProcessing {league} ({season})...")
                
                # Restart driver for each season to prevent crashes
                if driver:
                    driver.quit()
                driver = make_driver()
                
                season_url = get_season_url(league, league_id, season)
                match_links = get_match_links(driver, season_url)
                
                # Limit for testing
                match_links = match_links[:3] 
                
                for link in match_links:
                    print(f"  Scraping: {link}")
                    match_data = scrape_match_stats(driver, link)
                    if match_data:
                        all_matches.append(match_data)
                        print(f"    ✅ Scraped: {match_data['home_team']} vs {match_data['away_team']}")
                    
                    if len(all_matches) % 5 == 0:
                        df = pd.DataFrame(all_matches)
                        df.to_csv(OUTPUT_FILE, index=False)
                        print(f"    💾 Saved {len(all_matches)} matches.")

    finally:
        if driver:
            driver.quit()
        
    if all_matches:
        df = pd.DataFrame(all_matches)
        df.to_csv(OUTPUT_FILE, index=False)
        print(f"\n✅ Done! Saved {len(all_matches)} matches to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

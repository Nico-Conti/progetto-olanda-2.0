import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv
import datetime

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

import undetected_chromedriver as uc

def setup_driver():
    options = uc.ChromeOptions()
    # options.add_argument("--headless=new") # Commented out for debugging if needed, but usually we want headless
    options.add_argument("--headless=new") 
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    
    driver = uc.Chrome(options=options, version_main=141) # version_main might need adjustment based on user's chrome
    return driver

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

def scrape_fixtures():
    driver = setup_driver()
    url = "https://www.diretta.it/calcio/olanda/eredivisie/calendario/"
    
    print(f"Connecting to {url}...")
    driver.get(url)
    
    try:
        # Wait for the main table to load
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".sportName"))
        )
        
        # Accept cookies if present
        try:
            accept_btn = driver.find_element(By.ID, "onetrust-accept-btn-handler")
            accept_btn.click()
            time.sleep(1)
        except:
            pass

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
                            # print(f"Skipping row, could not identify time format. Parts: {parts}")
                            continue

                        # Validate time format to be sure
                        if "." in raw_time and ":" in raw_time:
                            if " " in raw_time:
                                date_part, time_part = raw_time.split(" ")
                                match_date = parse_date(date_part, time_part)
                            else:
                                match_date = None
                                
                            if match_date:
                                fixtures.append({
                                    "home_team": home_team,
                                    "away_team": away_team,
                                    "match_date": match_date.isoformat(),
                                    "giornata": current_round,
                                    "status": "SCHEDULED"
                                })
                                print(f"  -> Scraped: {home_team} vs {away_team} ({match_date})")
                        else:
                            # Fallback or log if format is unexpected
                            # print(f"Skipping row, unexpected time format: {raw_time}. Parts: {parts}")
                            pass
                    else:
                        # print(f"DEBUG: Not enough parts in row: {parts}")
                        pass
                            
                except Exception as e:
                    print(f"Error parsing row: {e}")
            
            else:
                # Debug: Log skipped rows to see if we are missing something (like Round 14)
                # print(f"DEBUG: Skipped row with classes: {classes}")
                pass

        print(f"Total fixtures scraped: {len(fixtures)}")
        
        # Insert into Supabase
        if fixtures:
            data, count = supabase.table("fixtures").upsert(fixtures, on_conflict="home_team, away_team, match_date").execute()
            print("Successfully inserted/updated fixtures in Supabase.")
            
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    scrape_fixtures()

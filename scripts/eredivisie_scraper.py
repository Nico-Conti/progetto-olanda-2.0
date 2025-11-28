import os
import sys

# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import time
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
import undetected_chromedriver as uc
import random
from supabase_queries import check_if_match_exists, setup_supabase_client, insert_match


import undetected_chromedriver as uc
from selenium.webdriver.chrome.options import Options

def make_driver():
    """Configures and initializes an undetectable Chrome driver for H&M."""
    
    options = uc.ChromeOptions()
    
    # --- CRUCIAL: TEMPORARILY REMOVE HEADLESS FOR DEBUGGING ---
    # When debugging blocks, it is essential to see the browser:
    # options.add_argument("--headless=new") # COMMENT OUT THIS LINE
    options.add_argument("--window-size=1920,1080")
    
    # --- PERFORMANCE/STABILITY (Keep these) ---
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3") 

    driver = uc.Chrome(options=options, version_main=141)
    
    # Add a network timeout (separate from script timeout)
    driver.set_page_load_timeout(60) # Set a high limit for the page to load
    
    return driver


def fully_scroll(driver, pause=0, max_loops=8):
    """Scrolls down the page until no new content is loaded."""

    loops = 0
    while loops < max_loops:

        driver.execute_script("window.scrollBy(0, 850);")
        time.sleep(pause)

        loops += 1
        print(f"Loops done: {loops}/{max_loops}")



def fetch_match_urls(driver, url):
    """Drives the Selenium browser to fetch and scroll the page."""

    print(f"Scraping {url}")
    driver.get(url)

    # fully_scroll(driver, pause=0.8, max_loops=7)
    soup_html = driver.page_source
        
    time.sleep(2)  # Allow time for the page to stabilize
    soup = BeautifulSoup(soup_html, "html.parser")
    results = []

    try:
        cookies = WebDriverWait(driver, 1).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
        )
        cookies.click()
        print("  -> Cookie banner accepted/closed.")
    except:
        print("  -> No cookie banner found or already accepted.")


    for div in soup.select('div[id="live-table"] .event__match'):
        # print(div)
        # Selects the specific link tag
        link_tag = div.select_one('a[class="eventRowLink"]')
        product_link = link_tag.get('href') if link_tag else None


        results.append({
            "url": product_link
        })


    return results
        


def scrape_match_details(driver, product_url):
    print(f"  -> Fetching details for match: {product_url}")
    match_detials = {}
    
    try:
        driver.get(product_url)

        try:
            WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CLASS_NAME, "duelParticipant"))
                    )
            print("  -> Main page content loaded.")

            statistics = WebDriverWait(driver, 0.5).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='Statistiche']"))
            )
            statistics.click()
            print("  -> Statistics tab opened.")

        except Exception as e:
            print(f"  -> No popup appeared")
            pass

        time.sleep(1.5)  # Allow time for the page to stabilize

        html_soup = BeautifulSoup(driver.page_source, "html.parser")

            

    except Exception as e:
        print(f"  -> ❌ ERROR during navigation/wait: {e}")
        return None
    
    try:
        home_team = html_soup.select_one('div.duelParticipant__home .participant__participantName').text.strip()
        away_team = html_soup.select_one('div.duelParticipant__away .participant__participantName').text.strip()
        
        # Extract Giornata (Round) - Try immediately after load
        giornata = 0
        
        # Strategy 1: Check meta tag "og:description" (Very reliable)
        try:
            meta_desc = html_soup.select_one('meta[property="og:description"]')
            if meta_desc and meta_desc.get('content'):
                content = meta_desc['content']
                # Content format example: "OLANDA: Eredivisie - Giornata 13"
                match = re.search(r'Giornata\s+(\d+)', content, re.IGNORECASE)
                if match:
                    giornata = int(match.group(1))
        except Exception as e:
            print(f"  -> Debug: Meta tag extraction failed: {e}")

        # Strategy 2: Look in the tournament header (if Strategy 1 failed)
        if giornata == 0:
            header_selectors = ['.tournamentHeader__country', '.tournamentHeader__headline', '.tournamentHeader']
            header_text = ""
            
            for selector in header_selectors:
                elem = html_soup.select_one(selector)
                if elem:
                    header_text = elem.text.strip()
                    break
            
            # Strategy 3: Look in the page title/breadcrumbs if header fails
            if not header_text:
                 try:
                     header_text = driver.title
                 except:
                     pass

            if header_text:
                # Patterns to look for: "GIORNATA X", "ROUND X", "X. RUNDE"
                patterns = [
                    r'GIORNATA\s+(\d+)',
                    r'ROUND\s+(\d+)',
                    r'(\d+)\.\s+RUNDE'
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, header_text, re.IGNORECASE)
                    if match:
                        giornata = int(match.group(1))
                        break
        
        if giornata == 0:
             print(f"  -> ⚠️ Could not extract Giornata. Meta/Header/Title checked.")
        
    except Exception as e:
        print(f"  -> ❌ ERROR extracting basic info: {e}")
        return None

    teams_data = {
        "home": home_team,
        "away": away_team
    }

    corners_data = {"home": "0", "away": "0"}
    goals_data = {"home": "0", "away": "0"}
    shots_data = {"home": "0", "away": "0"}
    shots_ot_data = {"home": "0", "away": "0"}
    possession_data = {"home": "0", "away": "0"}
    yellow_cards_data = {"home": "0", "away": "0"}
    red_cards_data = {"home": "0", "away": "0"}
    fouls_data = {"home": "0", "away": "0"}

    # Extract Goals from the header score
    try:
        score_element = html_soup.select_one('.detailScore__wrapper')
        if score_element:
            spans = score_element.find_all('span')
            if len(spans) >= 3: # home - away
                goals_data["home"] = spans[0].text.strip()
                goals_data["away"] = spans[2].text.strip()
    except Exception as e:
        print(f"  -> ⚠️ Error extracting goals: {e}")

    for div in html_soup.select('div.wcl-row_2oCpS > div.wcl-category_Ydwqh '):
        category_element = div.select_one('div.wcl-category_6sT1J')
        if not category_element: continue
        
        cat_text = category_element.text.strip()
        values = div.select('div[data-testid="wcl-statistics-value"]')
        
        if len(values) >= 2:
            h_val = values[0].text.strip()
            a_val = values[1].text.strip()
            
            if "Calci d'angolo" in cat_text:
                corners_data = {"home": h_val, "away": a_val}
            elif "Tiri totali" in cat_text or "Tiri" == cat_text: # Check exact wording on Diretta
                shots_data = {"home": h_val, "away": a_val}
            elif "Tiri in porta" in cat_text:
                shots_ot_data = {"home": h_val, "away": a_val}
            elif "Possesso palla" in cat_text:
                # Remove % sign
                possession_data = {"home": h_val.replace('%', ''), "away": a_val.replace('%', '')}
            elif "Cartellini gialli" in cat_text:
                yellow_cards_data = {"home": h_val, "away": a_val}
            elif "Cartellini rossi" in cat_text:
                red_cards_data = {"home": h_val, "away": a_val}
            elif "Falli" in cat_text:
                fouls_data = {"home": h_val, "away": a_val}

    match_detials = {
        "squadre": teams_data,
        "calci_d_angolo": corners_data,
        "goals": goals_data,
        "shots": shots_data,
        "shots_ot": shots_ot_data,
        "possession": possession_data,
        "yellow_cards": yellow_cards_data,
        "red_cards": red_cards_data,
        "fouls": fouls_data,
        "giornata": giornata
    }

    return match_detials


def main():
    """Orchestrates the scraping process."""
    
    # Setup Supabase
    supabase = setup_supabase_client()
    if not supabase:
        print("Failed to initialize Supabase client. Exiting.")
        return

    driver = make_driver()

    # --- STEP 1: Scrape Base page for match URLs and basic info ---
    print("--- STEP 1: Scraping Matches url from base page ---")


    all_games = []
    
    page_url = "https://www.diretta.it/calcio/olanda/eredivisie/risultati/"

    # Pass the category info to the scraper
    data = fetch_match_urls(driver, page_url)
    
    if not data:
        print(f"  -> No data matches found on {page_url}.")
    
    else:
        all_games.extend(data)

    print(f"\nTotal items collected for detailed scraping: {len(all_games)}")

    if not all_games:
        print("Skipping STEP 2: No product URLs collected due to block/error.")
        return 
    

    #DEBUG FIRST SCRAPE FOR URLS
    # print(all_games)

    # --- STEP 2: Scrape Match Details ---
    print("\n--- STEP 2: Scraping Details from Matches ---")

    for i, item in enumerate(all_games):
        # if i > 0:
        #     break
        # Added print to show progress
        print(f"\nProcessing Match {i+1}/{len(all_games)})")

        # Call the PDP scraping function
        details = scrape_match_details(driver, item['url'])
        
        if details is None:
            print("  -> Item skipped intentionally ('Pairs' item) or error.")
            continue  # Skip this item entirely
        
        # Insert into Supabase
        home_team = details['squadre']['home']
        away_team = details['squadre']['away']
        giornata = details['giornata']
        
        # Check if exists
        if check_if_match_exists(supabase, home_team, away_team, giornata):
            print(f"  -> Match {home_team} vs {away_team} (Giornata {giornata}) already exists. Skipping.")
            continue
            
        # Prepare data for insertion
        match_data = {
            "home_team": home_team,
            "away_team": away_team,
            "home_corners": int(details['calci_d_angolo']['home']),
            "away_corners": int(details['calci_d_angolo']['away']),
            "home_goals": int(details['goals']['home']),
            "away_goals": int(details['goals']['away']),
            "home_shots": int(details['shots']['home']),
            "away_shots": int(details['shots']['away']),
            "home_shots_on_target": int(details['shots_ot']['home']),
            "away_shots_on_target": int(details['shots_ot']['away']),
            "home_possession": int(details['possession']['home']),
            "away_possession": int(details['possession']['away']),
            "home_yellow_cards": int(details['yellow_cards']['home']),
            "away_yellow_cards": int(details['yellow_cards']['away']),
            "home_red_cards": int(details['red_cards']['home']),
            "away_red_cards": int(details['red_cards']['away']),
            "home_fouls": int(details['fouls']['home']),
            "away_fouls": int(details['fouls']['away']),
            "giornata": giornata
        }
        
        result = insert_match(supabase, match_data)
        if result:
            print(f"  -> ✅ Match inserted successfully.")
        else:
            print(f"  -> ❌ Failed to insert match.")
        
    print(f"\nCompleted!")
            
    driver.quit()



if __name__ == "__main__":
    main()
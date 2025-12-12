import os
import sys
import json
import time
import argparse
from bs4 import BeautifulSoup
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Add parent directory to path to allow imports from services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.gemini_analyzer import analyze_match_comments
from backend.services.supabase_syncer import sync_matches_to_supabase, fetch_existing_urls

# --- CONFIGURATION ---
LEAGUE_URLS = {
    "eredivisie": "https://www.diretta.it/calcio/olanda/eredivisie/risultati/",
    "laliga": "https://www.diretta.it/calcio/spagna/laliga/risultati/"
}

def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3") 
    # options.add_argument("--headless") # Uncomment for headless mode

    driver = uc.Chrome(options=options) # Auto-detect version
    return driver

def fully_scroll(driver, pause=0, max_loops=8):
    loops = 0
    while loops < max_loops:
        driver.execute_script("window.scrollBy(0, 850);")
        time.sleep(pause)
        loops += 1

# --- MODULE 1: URL COLLECTION ---
def check_more_matches(driver):
    """
    Clicks 'Show more matches' button repeatedly until it's no longer found.
    """
    print("  -> Checking for 'Show more matches' button...")
    
    # Selectors to try
    selectors = [
        (By.CSS_SELECTOR, "a.event__more"),
        (By.CSS_SELECTOR, "[data-testid='wcl-buttonLink']"),
        (By.XPATH, "//a[contains(text(), 'Mostra più incontri')]"),
        (By.XPATH, "//a[contains(text(), 'Show more matches')]")
    ]

    while True:
        # Scroll to bottom to ensure button is in DOM/View
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1)
        
        found = False
        for by, val in selectors:
            try:
                element = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((by, val))
                )
                # If found, click it
                driver.execute_script("arguments[0].scrollIntoView(true);", element)
                time.sleep(0.5)
                driver.execute_script("arguments[0].click();", element)
                print(f"    -> Clicked 'Show more matches' (found by {val}). Waiting for load...")
                time.sleep(3)
                found = True
                break # Break selector loop, restart main loop to check again
            except:
                continue
        
        if not found:
            # If we tried all selectors and found nothing, we are done
            break
            
    print("  -> All matches loaded (or button not found).")

def fetch_match_urls(driver, url, last_round_only=False):
    print(f"Scraping {url}")
    driver.get(url)

    try:
        cookies = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
        )
        cookies.click()
        print("  -> Cookie banner accepted/closed.")
    except:
        pass

    # Limit scrolling if we only want the last round
    scroll_loops = 2 if last_round_only else 7
    fully_scroll(driver, pause=0.8, max_loops=scroll_loops)
    
    if not last_round_only:
        check_more_matches(driver)

    time.sleep(4)

    soup_html = driver.page_source
    soup = BeautifulSoup(soup_html, "html.parser")
    results = []

    # Select BOTH rounds and matches in order
    all_rows = soup.select('div[id="live-table"] div.event__round, div[id="live-table"] div.event__match')
    current_round = "Unknown"
    first_round_found = None

    for row in all_rows:
        classes = row.get('class', [])

        if 'event__round' in classes:
            current_round = row.text.strip()
            
            if last_round_only:
                if first_round_found is None:
                    first_round_found = current_round
                    print(f"  -> Last round identified: {first_round_found}")
                elif current_round != first_round_found:
                    print(f"  -> Reached previous round ({current_round}). Stopping.")
                    break
            continue

        if 'event__match' in classes:
            link_tag = row.select_one('a[class="eventRowLink"]')
            product_link = link_tag.get('href') if link_tag else None

            if product_link:
                # Construct full URL if it's relative
                if product_link.startswith('/'):
                    product_link = f"https://www.diretta.it{product_link}"
                
                results.append({
                    "giornata": current_round,
                    "url": product_link
                })

    return results

# --- MODULE 2: MATCH DETAILS HELPERS ---

def scrape_basic_info(soup):
    """Extracts Team names and Score from the header."""
    try:
        home_team = soup.select_one('div.duelParticipant__home .participant__participantName')
        away_team = soup.select_one('div.duelParticipant__away .participant__participantName')
        
        # Score extraction
        score_home = "0"
        score_away = "0"
        
        score_wrapper = soup.select_one('div.detailScore__wrapper')
        if score_wrapper:
            spans = score_wrapper.select('span')
            if len(spans) >= 3: # home - away
                score_home = spans[0].text.strip()
                score_away = spans[2].text.strip()
        
        return {
            "home": home_team.text.strip() if home_team else "N/A",
            "away": away_team.text.strip() if away_team else "N/A",
            "score_home": score_home,
            "score_away": score_away
        }
    except Exception as e:
        print(f"    Error scraping teams/score: {e}")
        return {}

def clean_stat_value(value):
    """
    Cleans stat strings like '19% (4/21)' -> 21 (attempts) or '3.42' -> 3.42.
    Returns a string representation of the number or '0'.
    """
    if not value:
        return "0"
    
    value = value.strip()
    
    # Handle "(4/21)" or "19% (4/21)" -> take the second number in parenthesis (total) 
    # OR take the first if we want successful. 
    # Let's take the TOTAL attempts for pressure (21).
    if "(" in value and "/" in value:
        try:
            # Extract "4/21"
            parts = value.split("(")
            fraction = parts[-1].replace(")", "") # "4/21"
            if "/" in fraction:
                return fraction.split("/")[1] # Return denominator (total)
        except:
            pass
            
    # Handle "55%" -> 55
    if "%" in value:
        return value.replace("%", "")
        
    return value

def scrape_stats(driver):
    """
    Clicks Statistics tab and extracts various match stats using robust text-based selectors.
    """
    stats_data = {
        "corners": {"home": "0", "away": "0"},
        "fouls": {"home": "0", "away": "0"},
        "yellow_cards": {"home": "0", "away": "0"},
        "red_cards": {"home": "0", "away": "0"},
        "shots": {"home": "0", "away": "0"},
        "shots_on_target": {"home": "0", "away": "0"},
        "possession": {"home": "0%", "away": "0%"},
        # New Advanced Stats
        "xg": {"home": "0.0", "away": "0.0"},
        "xgot": {"home": "0.0", "away": "0.0"},
        "big_chances": {"home": "0", "away": "0"},
        "box_touches": {"home": "0", "away": "0"},
        "crosses": {"home": "0", "away": "0"},
        "goalkeeper_saves": {"home": "0", "away": "0"},
        "blocked_shots": {"home": "0", "away": "0"}
    }
    
    try:
        # 1. Click 'Statistiche' using JS for robustness
        # print("    -> Clicking 'Statistiche' via JS...")
        try:
            driver.execute_script("""
                var xpath = "//button[text()='Statistiche'] | //a[contains(@href, '#match-summary/match-statistics')]";
                var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (matchingElement) {
                    matchingElement.scrollIntoView();
                    matchingElement.click();
                } else {
                    throw "Stats button not found";
                }
            """)
            time.sleep(3)
        except Exception as e:
            # print(f"    -> JS Click failed: {e}")
            return stats_data

        # 2. Wait for 'Tiri totali' or similar text to appear
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Tiri totali') or contains(text(), 'Possesso palla')]"))
            )
        except:
            # print("    -> Timed out waiting for stats text.")
            pass
        
        time.sleep(2)
        
        # 3. Parse content with BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # 4. Text-based extraction
        # Map of "Text Label" -> "internal_key"
        label_map = {
            "Calci d'angolo": "corners",
            "Falli": "fouls",
            "Ammonizioni": "yellow_cards",
            "Cartellini gialli": "yellow_cards",
            "Espulsioni": "red_cards",
            "Cartellini rossi": "red_cards",
            "Tiri totali": "shots",
            "Tiri in porta": "shots_on_target",
            "Possesso palla": "possession",
            # New Stats Mappings
            "Goal previsti (xG)": "xg",
            "xG sui Tiri in porta (xGOT)": "xgot",
            "Grandi occasioni": "big_chances",
            "Palloni toccati nell'area avversaria": "box_touches",
            "Cross": "crosses",
            "Parate": "goalkeeper_saves",
            "Tiri fermati": "blocked_shots"
        }

        # Find all elements that match our labels
        for label_text, key in label_map.items():
            elements = soup.find_all(string=lambda text: text and label_text.lower() == text.strip().lower())
            
            for el in elements:
                parent = el.parent
                for _ in range(4): # Traverse up a few levels
                    if not parent: break
                    
                    text_content = list(parent.stripped_strings)
                    
                    # Check for [Value] [Label] [Value] pattern
                    # We need to be careful with exact matches
                    
                    try:
                        # Find index of label
                        # Note: text_content items might not be exact matches if stripped differently, but usually are.
                        # We look for the item that *is* our label.
                        idx = -1
                        for i, t in enumerate(text_content):
                            if t.lower() == label_text.lower():
                                idx = i
                                break
                        
                        if idx > 0 and idx < len(text_content) - 1:
                             # Found it!
                             val_home = text_content[idx-1]
                             val_away = text_content[idx+1]
                             
                             stats_data[key]["home"] = clean_stat_value(val_home)
                             stats_data[key]["away"] = clean_stat_value(val_away)
                             break
                    except ValueError:
                        pass
                        
                    parent = parent.parent
                
    except Exception as e:
        # print(f"    -> ⚠️ Failed to scrape stats: {e}")
        pass
        
    return stats_data

def scrape_comments(driver):
    """Clicks Commento tab and extracts time, icon type, and text."""
    comments_data = []
    # print("    -> Fetching comments...")

    try:
        # 1. Click 'Commento' tab
        try:
            comm_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='Commento'] | //a[contains(@href, '#match-summary/live-commentary')]"))
            )
            driver.execute_script("arguments[0].scrollIntoView(true);", comm_btn)
            time.sleep(1)
            driver.execute_script("arguments[0].click();", comm_btn)
        except Exception as e:
            # print(f"    -> ⚠️ Failed to click comment tab: {e}")
            return []
        
        # 2. Wait for the commentary container to load
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid^="wcl-commentary"]'))
            )
        except Exception as e:
             # print(f"    -> ⚠️ Commentary container not found: {e}")
             return []
        
        time.sleep(1)
        
        # 3. Parse content
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        headline_nodes = soup.select('div[data-testid="wcl-commentary-headline-text"]')
        
        for headline in headline_nodes:
            row = headline.find_parent('div')
            if not row:
                continue
                
            # --- A. Extract Time ---
            time_node = headline.select_one('strong')
            match_time = time_node.text.strip() if time_node else "N/A"

            # --- B. Extract Icon / Event Type ---
            icon_node = headline.select_one('svg[data-testid^="wcl-icon-incidents-"]')
            
            event_type = "general" # Default if no icon found
            if icon_node:
                raw_id = icon_node.get('data-testid', '')
                event_type = raw_id.replace('wcl-icon-incidents-', '').replace('-', ' ')
            
            # --- C. Extract Text ---
            text_node = row.select_one('[data-testid^="wcl-commentaryTitle-"]')
            comment_text = text_node.text.strip() if text_node else ""

            # Only add if we have text
            if comment_text:
                comments_data.append({
                    "time": match_time,
                    "type": event_type,
                    "text": comment_text
                })

    except Exception as e:
        print(f"    -> ⚠️ Could not scrape comments: {e}")
    
    return comments_data

# --- MODULE 3: ORCHESTRATOR ---

def scrape_match_details(driver, product_url):
    print(f"  -> Processing: {product_url}")
    
    final_data = {}
    
    try:
        driver.get(product_url)

        # 1. Wait for Main Page Load
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "duelParticipant"))
        )

        # --- Handle Cookie Banner if present ---
        try:
            cookies = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
            )
            cookies.click()
            time.sleep(1) 
        except:
            pass
        # ---------------------------------------
        
        # 2. Get Basic Info (Teams)
        initial_soup = BeautifulSoup(driver.page_source, "html.parser")
        final_data['squadre'] = scrape_basic_info(initial_soup)

        # 3. Get Stats (Corners, Fouls, etc.)
        stats = scrape_stats(driver)
        final_data['stats'] = stats
        
        # Flatten key stats for backward compatibility and direct access
        final_data['calci_d_angolo'] = stats['corners']
        final_data['xg'] = stats['xg']
        final_data['xgot'] = stats['xgot']
        final_data['big_chances'] = stats['big_chances']
        final_data['box_touches'] = stats['box_touches']
        final_data['crosses'] = stats['crosses']
        final_data['goalkeeper_saves'] = stats['goalkeeper_saves']
        final_data['blocked_shots'] = stats['blocked_shots']

        # 4. Get Comments 
        final_data['commenti'] = scrape_comments(driver)

    except Exception as e:
        print(f"  -> ❌ Critical Error on page: {e}")
        return None 

    return final_data

# --- MAIN EXECUTION ---

def main():
    parser = argparse.ArgumentParser(description="Scrape match data for Eredivisie or La Liga.")
    parser.add_argument("league", nargs="?", default="eredivisie", choices=["eredivisie", "laliga"], help="League to scrape")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of matches to scrape")
    parser.add_argument("--skip-analysis", action="store_true", help="Skip Gemini analysis")
    parser.add_argument("--skip-sync", action="store_true", help="Skip syncing to Supabase")
    parser.add_argument("--last-round", action="store_true", help="Scrape only the most recent round")

    args = parser.parse_args()
    
    league_name = args.league
    target_url = LEAGUE_URLS[league_name]
    
    print(f"--- Starting Scraper for {league_name.upper()} ---")
    
    driver = make_driver()
    
    try:
        print("--- STEP 0: Checking Existing Matches ---")
        existing_urls = set()
        if not args.skip_sync:
            existing_urls = fetch_existing_urls()
        
        print("\n--- STEP 1: Fetching Match List ---")
        all_games_meta = fetch_match_urls(driver, target_url, last_round_only=args.last_round)
        print(f"\nFound {len(all_games_meta)} matches.")
        
        print("\n--- STEP 2: Scraping Details ---")
        all_games_full_data = []

        for i, game in enumerate(all_games_meta): 
            if args.limit and len(all_games_full_data) >= args.limit:
                break
            
            match_url = game['url']
            if match_url in existing_urls:
                print(f"  -> Skipping (Already in DB): {match_url}")
                continue

            print(f"\nMatch {i+1}/{len(all_games_meta)}")
            
            details = scrape_match_details(driver, match_url)
            
            if details:
                details['giornata'] = game['giornata']
                details['url'] = game['url']
                
                # --- GEMINI ANALYSIS ---
                if not args.skip_analysis:
                    print("    -> Requesting Gemini analysis...")
                    corners = details.get('calci_d_angolo', {})
                    analysis = analyze_match_comments(details.get('commenti', []), corners_data=corners)
                    # Remove raw comments to save space/bandwidth if not needed, or keep them?
                    # The original script deleted them. I'll follow that pattern.
                    del details['commenti'] 
                    details['gemini_analysis'] = analysis
                    print("    -> Analysis complete.")
                # -----------------------

                all_games_full_data.append(details)

        # Save to JSON
        output_file = f"{league_name}_matches.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(all_games_full_data, f, indent=4, ensure_ascii=False)
        
        print(f"\n✅ Saved {len(all_games_full_data)} matches to {output_file}")
        
    finally:
        driver.quit()

    # --- SYNC TO SUPABASE ---
    if not args.skip_sync and all_games_full_data:
        print("\n--- STEP 3: Syncing to Supabase ---")
        sync_matches_to_supabase(output_file)

if __name__ == "__main__":
    main()

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import time
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
# --- ADD THESE 4 LINES ---
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
import undetected_chromedriver as uc
import random


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

    cookies = WebDriverWait(driver, 1).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
    )
    cookies.click()
    print("  -> Cookie banner accepted/closed.")


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
    match_detials = []
    
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
        return {} 
    
    home_team = html_soup.select_one('div.duelParticipant__home .participant__participantName').text.strip()
    # print(home_team)
    away_team = html_soup.select_one('div.duelParticipant__away .participant__participantName').text.strip()
    # print(away_team)

    teams_data = {}

    teams_data = {
        "home": home_team,
        "away": away_team
    }

    corners_data = {}


    for div in html_soup.select('div.wcl-row_2oCpS > div.wcl-category_Ydwqh '):

        # print(div)

        category_element = div.select_one('div.wcl-category_6sT1J')



        # Safety check: ensure element exists before getting text
        if category_element and "Calci d'angolo" in category_element.text:
            
            # 3. We found the right row! Now extract the values.
            # usually 1st value is Home, 2nd is Away
            values = div.select('div[data-testid="wcl-statistics-value"]')
            
            if len(values) >= 2:
                home_score = values[0].text.strip()
                away_score = values[1].text.strip()
                
                corners_data = {
                    "home": home_score,
                    "away": away_score
                }
                break # Stop looping once found

    match_detials = {
        "squadre": teams_data,
        "calci_d_angolo": corners_data
    }




    # --- CRITICAL FIX 3: RETURN THE DICTIONARY ---
    return match_detials

def products_already_in_database(filepath):
    """Loads previously scraped product URLs from a JSON file."""

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    scraped_urls = {item['url'] for item in data if 'url' in item}
    # print(scraped_urls)
    print(f"Loaded {len(scraped_urls)} previously scraped product URLs.")
    return scraped_urls


def main():
    """Orchestrates the scraping process."""
    driver = make_driver()

    # --- STEP 1: Scrape Base page for match URLs and basic info ---
    print("--- STEP 1: Scraping Matches url from base page ---")


    all_games = []
    all_games_info = []

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
            print("  -> Item skipped intentionally ('Pairs' item). NOT added to final list.")
            continue  # Skip this item entirely
        # Merge the new details into the existing item dictionary
        else:

            all_games_info.append(details) # ONLY successful items are kept here
        
    #########################################################################àà##########à
    
    # with open(f"eredivisie.json", "w", encoding="utf-8") as f:
    #     json.dump(all_games_info, f, indent=4, ensure_ascii=False)
    # print(f"\n✅ Data successfully saved to eredivisie.json")

    #NOTE WE NEED TO CHANGE THIS NOW SO THAT IT ONLY APPEND TO JSON NOT OVERWRITE IT
    
    #pippo e filo sono propri 2 scoppiati

        
    print(f"\nCompleted! Total {len(all_games_info)} products processed.")
            
    driver.quit()



if __name__ == "__main__":
    main()
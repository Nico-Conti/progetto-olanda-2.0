import time
from bs4 import BeautifulSoup
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions

def make_driver():
    options = ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--headless=new") # Try headless
    driver = webdriver.Chrome(options=options)
    return driver

def scrape_match_debug(url):
    driver = make_driver()
    try:
        print(f"Navigating to {url}")
        driver.get(url)
        
        # Wait for main content
        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CLASS_NAME, "duelParticipant"))
            )
            print("Main page loaded.")
        except Exception as e:
            print(f"Timeout waiting for main page: {e}")
            driver.save_screenshot("debug_error.png")
            return

        # Click Statistics tab
        try:
            statistics = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='Statistiche']"))
            )
            statistics.click()
            print("Statistics tab clicked.")
            time.sleep(5) # Wait for stats to load
        except Exception as e:
            print(f"Could not click Statistics tab: {e}")
            driver.save_screenshot("debug_error_stats.png")
            return

        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        print("\n--- Categories Found ---")
        # Use the selector from the original scraper
        rows = soup.select('div.wcl-row_2oCpS > div.wcl-category_Ydwqh ')
        if not rows:
            print("No rows found with selector 'div.wcl-row_2oCpS > div.wcl-category_Ydwqh '")
            # Try a broader selector to see what's there
            print("Trying broad search for categories...")
            all_cats = soup.select('div[class*="category"]')
            for cat in all_cats:
                print(f"Generic Category Class: {cat.get('class')}, Text: {cat.text.strip()}")
        
        for div in rows:
            category_element = div.select_one('div.wcl-category_6sT1J')
            if category_element:
                cat_text = category_element.text.strip()
                print(f"Category: '{cat_text}'")
                values = div.select('div[data-testid="wcl-statistics-value"]')
                if len(values) >= 2:
                    print(f"  Values: {values[0].text.strip()} - {values[1].text.strip()}")
            else:
                print("Found row but no category element.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    scrape_match_debug("https://www.diretta.it/partita/Mgn6Tf2a/#/informazioni-partita")

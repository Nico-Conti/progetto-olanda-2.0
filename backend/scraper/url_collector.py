import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from .driver import fully_scroll

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
    fully_scroll(driver, pause=1.5, max_loops=scroll_loops)
    
    if not last_round_only:
        check_more_matches(driver)

    time.sleep(4)

    soup_html = driver.page_source
    from bs4 import BeautifulSoup
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

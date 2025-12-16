import time
import undetected_chromedriver as uc

def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3") 
    options.page_load_strategy = 'eager' # Don't wait for all resources (ads, etc.)
    # options.add_argument("--headless") # Uncomment for headless mode

    driver = uc.Chrome(options=options) # Auto-detect version
    return driver

def fully_scroll(driver, pause=0, max_loops=8):
    loops = 0
    while loops < max_loops:
        driver.execute_script("window.scrollBy(0, 850);")
        time.sleep(pause)
        loops += 1

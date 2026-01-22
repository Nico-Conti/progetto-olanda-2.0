import time
import subprocess
import re
import undetected_chromedriver as uc

def get_chrome_major_version():
    try:
        output = subprocess.check_output(['google-chrome', '--version'], stderr=subprocess.STDOUT).decode('utf-8')
        version = re.search(r'(\d+)\.', output).group(1)
        return int(version)
    except Exception as e:
        print(f"Warning: Could not detect Chrome version via 'google-chrome --version': {e}")
        # Try 'chrome' as fallback
        try:
            output = subprocess.check_output(['chrome', '--version'], stderr=subprocess.STDOUT).decode('utf-8')
            version = re.search(r'(\d+)\.', output).group(1)
            return int(version)
        except Exception as e2:
            print(f"Warning: Could not detect Chrome version via 'chrome --version': {e2}")
            return None

def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3") 
    options.page_load_strategy = 'eager' # Don't wait for all resources
    
    # Headless mode for hosting
    # Use --headless=new for better evasiveness    # options.add_argument("--headless=new") 
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-dev-shm-usage")

    chrome_version = get_chrome_major_version()
    if chrome_version:
        print(f"  -> Detected Chrome version {chrome_version}. Passing to undetected-chromedriver.")
        driver = uc.Chrome(options=options, version_main=chrome_version)
    else:
        print("  -> Could not detect Chrome version. Using default.")
        driver = uc.Chrome(options=options)
    
    return driver

def fully_scroll(driver, pause=0, max_loops=8):
    loops = 0
    while loops < max_loops:
        try:
            driver.execute_script("window.scrollBy(0, 850);")
            time.sleep(pause)
            loops += 1
        except Exception as e:
            print(f"  [WARNING] Scroll failed at loop {loops}/{max_loops}: {e}. Stopping scroll.")
            break

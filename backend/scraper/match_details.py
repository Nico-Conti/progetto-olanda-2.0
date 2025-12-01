import time
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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

def scrape_stats(driver):
    """Clicks Statistics tab and extracts various match stats."""
    stats_data = {
        "corners": {"home": "0", "away": "0"},
        "fouls": {"home": "0", "away": "0"},
        "yellow_cards": {"home": "0", "away": "0"},
        "red_cards": {"home": "0", "away": "0"},
        "shots": {"home": "0", "away": "0"},
        "shots_on_target": {"home": "0", "away": "0"},
        "possession": {"home": "0%", "away": "0%"},
        "xg": {"home": "0.00", "away": "0.00"},
        "xgot": {"home": "0.00", "away": "0.00"},
        "big_chances": {"home": "0", "away": "0"},
        "box_touches": {"home": "0", "away": "0"},
        "crosses": {"home": "0", "away": "0"},
        "goalkeeper_saves": {"home": "0", "away": "0"},
        "interceptions": {"home": "0", "away": "0"}
    }
    
    try:
        # 1. Click the 'Statistiche' button
        stats_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.XPATH, "//button[text()='Statistiche'] | //a[contains(@href, '#match-summary/match-statistics')]"))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", stats_btn)
        time.sleep(1)
        driver.execute_script("arguments[0].click();", stats_btn)

        # 2. Wait for a specific stats element to load to ensure DOM update
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CLASS_NAME, "wcl-row_2oCpS"))
        )
        
        # 3. Parse content
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # 4. Iterate through rows and map categories
        # Mapping Italian label -> internal key
        stat_map = {
            "Calci d'angolo": "corners",
            "Falli": "fouls",
            "Ammonizioni": "yellow_cards",
            "Cartellini gialli": "yellow_cards",
            "Espulsioni": "red_cards",
            "Cartellini rossi": "red_cards",
            "Tiri totali": "shots",
            "Tiri in porta": "shots_on_target",
            "Possesso palla": "possession",
            "Goal previsti (xG)": "xg",
            "xG sui Tiri in porta (xGOT)": "xgot",
            "Grandi occasioni": "big_chances",
            "Palloni toccati nell'area avversaria": "box_touches",
            "Cross": "crosses",
            "Parate": "goalkeeper_saves",
            "Palle intercettate": "interceptions"
        }

        for div in soup.select('div.wcl-row_2oCpS > div.wcl-category_Ydwqh'):
            category_element = div.select_one('div.wcl-category_6sT1J')
            if not category_element:
                continue

            category_text = category_element.text.strip()
            
            # Check if this category is one we want
            key = None
            if category_text in stat_map:
                key = stat_map[category_text]
            
            if key:
                values = div.select('div[data-testid="wcl-statistics-value"]')
                if len(values) >= 2:
                    stats_data[key] = {
                        "home": values[0].text.strip(),
                        "away": values[1].text.strip()
                    }
                
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

def scrape_match_details(driver, product_url, skip_comments=False):
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
        final_data['stats'] = scrape_stats(driver)
        # Flatten for backward compatibility if needed, or keep structured.
        # For now, let's keep 'calci_d_angolo' as a top level key if other parts depend on it,
        # or just use the new structure. The user asked for extraction, so I'll provide the new structure.
        # I will alias 'calci_d_angolo' to stats['corners'] for safety with existing analysis logic.
        final_data['calci_d_angolo'] = final_data['stats']['corners']

        # 4. Get Comments 
        if not skip_comments:
            final_data['commenti'] = scrape_comments(driver)
        else:
            final_data['commenti'] = []

    except Exception as e:
        print(f"  -> ❌ Critical Error on page: {e}")
        return None 

    return final_data

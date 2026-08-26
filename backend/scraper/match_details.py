import re
import time
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# A dismissal for a second yellow, as the timeline labels it, and the tag diretta
# puts on a card shown to someone who is not on the pitch.
SECOND_BOOKING_RE = re.compile(r"cartellino\s+giallo\s*/\s*cartellino\s+rosso", re.I)
OFF_PITCH_RE = re.compile(r"non\s+dal\s+campo", re.I)

# Status text on a match page that means "this result is final".
FINISHED_STATUS_MARKERS = (
    "FINALE",       # Finale, Dopo rig., Dopo tempi suppl.
    "TERMINATO",
    "A TAVOLINO",   # walkover / result awarded administratively
)


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

def scrape_second_bookings(soup):
    """Count dismissals for a SECOND YELLOW, per side, from the match timeline.

    This is what makes total cards correct rather than merely close. diretta's
    statistics panel files such a dismissal as one yellow AND one red, so
    `yellows + 2*reds` scores it 4 - but the bookmaker scores it 3 (the first
    yellow 1, plus the red 2; the second yellow is not counted again). Every one
    of them therefore inflates the naive total by exactly one, and subtracting
    this count makes it exact:

        card_points = yellows + 2*reds - second_bookings

    Measured 2026-08-26 over 98 sampled red-card matches: 39 of 117 red cards
    (33.3%) are second bookings, worth ~0.06 points per match on a base of 4.32.

    Detection is by the incident TEXT. The second-booking icon carries no
    card-specific class - only the generic `wcl-icon_*`, the same one goals and
    substitutions use - so a `[class*="Card-ico"]` selector silently matches
    nothing and reports zero. That is not hypothetical: it is exactly the mistake
    that produced a confident, wrong conclusion before this was measured.

    Rows tagged "Non Dal Campo" - coaches, staff, the bench, players already
    substituted - are skipped. The statistics panel leaves those out too (so our
    yellow and red columns are already on the bookmaker's on-pitch-only basis),
    and subtracting something that was never added would break that agreement.
    """
    counts = {"home": 0, "away": 0}
    for row in soup.select("div.smv__incident"):
        text = " ".join(row.get_text(" ", strip=True).split())
        if not SECOND_BOOKING_RE.search(text) or OFF_PITCH_RE.search(text):
            continue
        parent_classes = (row.parent.get("class") if row.parent else None) or []
        if "smv__homeParticipant" in parent_classes:
            counts["home"] += 1
        elif "smv__awayParticipant" in parent_classes:
            counts["away"] += 1
    return {"home": str(counts["home"]), "away": str(counts["away"])}


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
        # 1. Click the 'Statistiche' button with Retry
        clicked = False
        attempts = 0
        while not clicked and attempts < 3:
            try:
                stats_btn = WebDriverWait(driver, 15).until( # Increased to 15s
                    EC.element_to_be_clickable((By.XPATH, "//button[text()='Statistiche'] | //a[contains(@href, '#match-summary/match-statistics')]"))
                )
                driver.execute_script("arguments[0].scrollIntoView(true);", stats_btn)
                time.sleep(1) # Specific wait to ensure stability after scroll
                driver.execute_script("arguments[0].click();", stats_btn)
                clicked = True
            except Exception as e:
                print(f"    -> Retry {attempts+1} clicking stats: {e}")
                attempts += 1
                time.sleep(2)
        
        if not clicked:
             print("    -> ⚠️ Could not click 'Statistiche' button after retries.")
             return stats_data # Return empty/zeros if we can't click


        # 2. Wait for a specific stats element to load to ensure DOM update
        WebDriverWait(driver, 15).until( # Increased to 15s
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
        print(f"    -> ⚠️ Failed to scrape stats: {e}")
        # pass # Do not silence unexpected errors completely during debug

        
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
            # time.sleep(0.5) 
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
        
        # time.sleep(1) # Removed sleep, wait above is enough
        
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
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CLASS_NAME, "duelParticipant"))
        )

        # --- Handle Cookie Banner if present ---
        try:
            cookies = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[id="onetrust-accept-btn-handler"]'))
            )
            cookies.click()
            # time.sleep(1) # Removed 
        except:
            pass
        # ---------------------------------------
        
        # 2. Get Basic Info (Teams)
        initial_soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # --- SAFEGUARD: CHECK STATUS ---
        # Prevent scraping "Scheduled" or "Postponed" games as 0-0 results.
        # The listed markers all mean the result is final and counts in the
        # table - including "A TAVOLINO", a walkover awarded off the pitch,
        # which is still a real result and was leaving a hole in the season.
        status_elem = initial_soup.select_one('div.detailScore__status')
        if status_elem:
            status_text = status_elem.text.strip().upper()
            # Allow "FINALE", "DOPO RIG.", "DOPO TEMPI SUPPL." etc.
            if not any(m in status_text for m in FINISHED_STATUS_MARKERS):
                print(f"  -> ⚠️ Skipping match: Status is '{status_text}' (Not Finished)")
                return None
        else:
            # If we can't find status, it's suspicious. Defaults are unsafe.
             print("  -> ⚠️ Skipping match: No status found (Safe guard)")
             return None
        # -------------------------------

        final_data['squadre'] = scrape_basic_info(initial_soup)

        # Second bookings come from the TIMELINE, which is the default tab - so
        # they must be read here, before scrape_stats() clicks over to the
        # statistics panel and replaces the content.
        #
        # Wait for the timeline first. Every match has substitutions, so a page
        # with no participant rows at all has not finished rendering rather than
        # having nothing to show; ~10% of pages were in that state on a first
        # attempt when this was sampled. Recording 0 for those would look like
        # "no second bookings" and bias the correction downward, so say so.
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.smv__participantRow"))
            )
            # Re-parsed: initial_soup was taken before this wait, so it can
            # predate the timeline rendering.
            timeline_soup = BeautifulSoup(driver.page_source, "html.parser")
            second_bookings = scrape_second_bookings(timeline_soup)
        except Exception:
            print("  -> ⚠️ Timeline did not render; second_bookings unknown, storing none")
            second_bookings = None

        # 3. Get Stats (Corners, Fouls, etc.)
        final_data['stats'] = scrape_stats(driver)
        # Omitted entirely when unknown: the syncer skips absent keys, so the
        # column keeps whatever it had instead of being overwritten with a
        # wrong zero.
        if second_bookings is not None:
            final_data['stats']['second_bookings'] = second_bookings
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

import os
import json
import requests
from dotenv import load_dotenv

from backend.scraper.config import LEAGUE_NAMES, resolve_league_name

def normalize_key(home, away, giornata, season=None):
    """
    Creates a normalized key for matching: "home_away_giornata[_season]"
    Example: "nijmegen_sparta_rotterdam_14_2025/2026"

    The season is part of the key because the same fixture recurs every year:
    without it, next season's matchday-1 Inter vs Monza collides with last
    season's. This is the fallback path - matching on `url` is tried first and
    is already unique across seasons - but it is exactly the path that runs for
    rows with no URL.
    """
    h = home.lower().replace(" ", "_").strip()
    a = away.lower().replace(" ", "_").strip()
    
    # Handle "Giornata 14" -> "14"
    g_str = str(giornata).lower().replace("giornata", "").strip()
    
    key = f"{h}_{a}_{g_str}"
    return f"{key}_{season}" if season else key

def parse_giornata(giornata_str):
    """Parses 'Giornata 14' to 14 (int)."""
    try:
        return int(str(giornata_str).lower().replace("giornata", "").strip())
    except ValueError:
        return None

def parse_percentage(value):
    """Parses '50%' to 50 (int) or returns None."""
    if not value:
        return None
    try:
        return int(value.replace("%", "").strip())
    except ValueError:
        return None

def parse_crosses_count(value):
    """
    Parses '25%(4/16)' to 4 (int).
    Returns None if parsing fails.
    """
    if not value:
        return None
    try:
        # Look for the part inside parens: (4/16)
        if "(" in value and "/" in value:
            # "25%(4/16)" -> split "(" -> ["25%", "4/16)"] -> [1] -> "4/16)"
            # split "/" -> ["4", "16)"] -> [0] -> "4"
            parts = value.split("(")
            if len(parts) > 1:
                fraction = parts[1] # "4/16)"
                numerator = fraction.split("/")[0] # "4"
                return int(numerator)
    except ValueError:
        pass
    return None

def build_stats_payload(local_match):
    """Extracts and formats all stats for the payload."""
    payload = {}
    
    # 1. Scores
    squadre = local_match.get("squadre", {})
    if "score_home" in squadre: payload["home_goals"] = int(squadre["score_home"])
    if "score_away" in squadre: payload["away_goals"] = int(squadre["score_away"])

    # 2. Detailed Stats
    stats = local_match.get("stats", {})
    
    # Mapping: JSON key -> DB column, Type converter
    # Assuming DB columns follow the pattern: home_{stat}, away_{stat}
    stat_keys = [
        ("corners", "corners", int),
        ("fouls", "fouls", int),
        ("yellow_cards", "yellow_cards", int),
        ("red_cards", "red_cards", int),
        # Dismissals for a second yellow. diretta counts one of those as a
        # yellow AND a red, so total card points are
        # `yellows + 2*reds - second_bookings`; without this the total is
        # overstated by one per occurrence. Absent when the timeline did not
        # render, and absent keys are skipped rather than written as 0.
        ("second_bookings", "second_bookings", int),
        ("shots", "shots", int),
        ("shots_on_target", "shots_on_target", int),
        ("xg", "xg", float),
        ("xgot", "xgot", float),
        ("big_chances", "big_chances", int),
        ("box_touches", "box_touches", int),
        ("crosses", "crosses", parse_crosses_count),
        ("goalkeeper_saves", "goalkeeper_saves", int),
        ("interceptions", "blocked_shots", int) # User confirmed DB columns are blocked_shots
    ]

    for json_key, db_suffix, converter in stat_keys:
        item = stats.get(json_key)
        if item:
            if "home" in item: 
                try:
                    val = item["home"]
                    if converter == str:
                         payload[f"home_{db_suffix}"] = val
                    else:
                         payload[f"home_{db_suffix}"] = converter(val)
                except ValueError:
                    pass
            if "away" in item: 
                try:
                    val = item["away"]
                    if converter == str:
                         payload[f"away_{db_suffix}"] = val
                    else:
                         payload[f"away_{db_suffix}"] = converter(val)
                except ValueError:
                    pass

    # Possession (needs parsing)
    possession = stats.get("possession")
    if possession:
        if "home" in possession: payload["home_possession"] = parse_percentage(possession["home"])
        if "away" in possession: payload["away_possession"] = parse_percentage(possession["away"])

    # 3. Gemini Analysis
    # 3. Gemini Analysis
    gemini_analysis = local_match.get("gemini_analysis")
    if gemini_analysis and isinstance(gemini_analysis, dict):
        # Old fields (backward compatibility)
        detailed = gemini_analysis.get("detailed_summary")
        tldr = gemini_analysis.get("tldr") or gemini_analysis.get("tlr")
        if detailed: payload["detailed comment corner"] = detailed
        if tldr: payload["tl dr corner"] = tldr

        # New fields (Detailed Analysis)
        # Mapping: JSON key -> DB column
        mapping = {
            "match_summary": "summary_match",
            "detailed_corners_analysis": "detail_corner",
            "detailed_goals_analysis": "detail_goal",
            "detailed_shots_analysis": "detail_shots",
            "detailed_fouls_analysis": "detail_fouls",
            "detailed_cards_analysis": "detail_cards"
        }

        for json_k, db_k in mapping.items():
            val = gemini_analysis.get(json_k)
            if val:
                payload[db_k] = val
        
    # 4. URL
    if local_match.get("url"):
        payload["url"] = local_match.get("url")

    # 5. Kick-off time, read off the results list row by url_collector.
    if local_match.get("match_date"):
        payload["match_date"] = local_match.get("match_date")

    return payload

# PostgREST caps a single response (db-max-rows, 1000 on Supabase by default),
# so a page can come back smaller than asked for even when more rows exist.
PAGE_SIZE = 1000
MAX_ROWS = 200000  # safety stop, so a paging bug cannot loop forever


def fetch_all_records(base_url, table, headers, select="*", batch_size=PAGE_SIZE, filters=""):
    """
    Fetches ALL records from a Supabase table using pagination (offset/limit).
    Can optionaly accept a query string 'filters' (e.g. "&league=eq.Serie A")
    """
    all_data = []
    offset = 0
    print(f"⏳ Fetching all records from '{table}' (Batch size: {batch_size}, Filters: '{filters}')...")
    
    while True:
        try:
            # Construct URL with limit and offset
            req_url = f"{base_url}/rest/v1/{table}?select={select}&limit={batch_size}&offset={offset}{filters}"
            resp = requests.get(req_url, headers=headers)
            resp.raise_for_status()
            
            data = resp.json()
            # An empty page is the only reliable end signal. Comparing the page
            # size against batch_size is not: the server silently truncates to
            # its own cap, which used to end this loop after the first 1000 rows.
            if not data:
                break
            
            all_data.extend(data)
            if offset and offset % 20000 == 0:
                print(f"   ... loaded {len(all_data)} records so far")

            offset += len(data)

            if len(all_data) >= MAX_ROWS:
                print(f"⚠️  Stopping at {len(all_data)} records (MAX_ROWS)")
                break
            
        except Exception as e:
            print(f"❌ Error fetching batch at offset {offset}: {e}")
            # If a batch fails, we probably should stop or retry. For now, stopping to avoid endless loops.
            break

    return all_data

def sync_matches_to_supabase(json_path="matches_data.json", data_list=None, season=None):
    """
    Reads a local JSON file OR uses a provided list and syncs match data to Supabase.

    `season` tags every row written in this run (e.g. "2025/2026"). Individual
    matches may carry their own "season" key, which wins.
    """
    load_dotenv()
    
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_KEY in .env")
        return

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1. Load Data (from List or JSON)
    local_matches = []
    
    if data_list is not None:
        local_matches = data_list
        print(f"✅ Using in-memory data ({len(local_matches)} matches)")
    else:
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                local_matches = json.load(f)
            print(f"✅ Loaded {len(local_matches)} matches from {json_path}")
        except FileNotFoundError:
            print(f"❌ Error: File {json_path} not found.")
            return

    # 2. Fetch All Matches from Supabase
    try:
        db_matches = fetch_all_records(url, "matches", headers, select="*")
        print(f"✅ Fetched {len(db_matches)} matches from DB (Total)")
    except Exception as e:
        print(f"❌ Error fetching from Supabase: {e}")
        return

    # 3. Build Lookup Dictionary
    db_lookup = {}
    url_lookup = {}
    for match in db_matches:
        h = match.get("home_team", "")
        a = match.get("away_team", "")
        g = match.get("giornata", "")
        u = match.get("url", "")
        
        if h and a and g:
            k = normalize_key(h, a, g, match.get("season"))
            db_lookup[k] = match["id"]
        
        if u:
            url_lookup[u] = match["id"]

    # 4. Sync Data
    updated_count = 0
    skipped_count = 0
    
    print("\n--- Starting Sync ---")

    for local_match in local_matches:
        h = local_match["squadre"]["home"]
        a = local_match["squadre"]["away"]
        g = local_match["giornata"]
        
        match_url = local_match.get("url")
        gemini_analysis = local_match.get("gemini_analysis")

        match_season = local_match.get("season") or season
        key = normalize_key(h, a, g, match_season)

        # Prepare base payload
        payload = build_stats_payload(local_match)
        if match_season:
            payload["season"] = match_season

        match_id = None
        
        # Try finding by URL first (most reliable)
        if match_url and match_url in url_lookup:
            match_id = url_lookup[match_url]
        # Fallback to key
        elif key in db_lookup:
            match_id = db_lookup[key]

        if match_id:
            # --- UPDATE ---
            if payload:
                try:
                    patch_url = f"{url}/rest/v1/matches?id=eq.{match_id}"
                    resp = requests.patch(patch_url, json=payload, headers=headers)
                    resp.raise_for_status()
                    print(f"✅ Updated: {h} vs {a} (Giornata {g})")
                    updated_count += 1
                except Exception as e:
                    print(f"❌ Failed to update {h} vs {a}: {e}")
            else:
                print(f"⚠️  No data to update for {h} vs {a}")
        else:
            # --- INSERT ---
            print(f"🆕 Match not found in DB: {h} vs {a}. Inserting...")
            
            # Add required fields for insertion
            payload["home_team"] = h
            payload["away_team"] = a
            
            # Parse Giornata to int
            g_int = parse_giornata(g)
            if g_int is not None:
                payload["giornata"] = g_int
            else:
                print(f"⚠️  Could not parse giornata '{g}', skipping insert.")
                skipped_count += 1
                continue
            
            # Infer league from payload, falling back to the source filename.
            league = resolve_league_name(local_match.get("league"))

            if not league:
                haystack = json_path.lower()
                for slug, name in LEAGUE_NAMES.items():
                    if slug in haystack:
                        league = name
                        break

            payload["league"] = league or "Eredivisie"
            
            try:
                post_url = f"{url}/rest/v1/matches"
                resp = requests.post(post_url, json=payload, headers=headers)
                resp.raise_for_status()
                print(f"✅ Inserted: {h} vs {a} (Giornata {g_int})")
                updated_count += 1 # Count as updated/processed
            except Exception as e:
                print(f"❌ Failed to insert {h} vs {a}: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    print(f"   Response: {e.response.text}")
                print(f"   Payload: {json.dumps(payload, indent=2)}")
                skipped_count += 1

    print(f"Updated: {updated_count}")
    print(f"Skipped: {skipped_count}")

def fetch_existing_urls(league_slug=None):
    """
    Fetches all match URLs currently in Supabase.
    If league_slug is provided (e.g. 'seriea'), it filters by that league.
    Returns a set of URLs.
    """
    load_dotenv()
    
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_KEY in .env")
        return set()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # Map slug to DB League Name
    filters = ""
    if league_slug:
        db_league = resolve_league_name(league_slug)
        if db_league:
            # URL encode the space if needed, but requests usually handles it.
            # Supabase postgrest format: &col=eq.val
            filters = f"&league=eq.{db_league}"
            print(f"🔍 Filtering by League: {db_league}")

    print("⏳ Fetching existing URLs from Supabase...")
    try:
        # Use pagination via helper
        data = fetch_all_records(url, "matches", headers, select="url", filters=filters)
        
        # Extract URLs, filtering out None/Empty
        existing_urls = {item['url'] for item in data if item.get('url')}
        print(f"✅ Found {len(existing_urls)} existing URLs in DB.")
        return existing_urls
    except Exception as e:
        print(f"❌ Error fetching URLs from Supabase: {e}")
        return set()

if __name__ == "__main__":
    sync_matches_to_supabase()

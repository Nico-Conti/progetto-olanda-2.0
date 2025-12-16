import os
import json
import requests
from dotenv import load_dotenv

def normalize_key(home, away, giornata):
    """
    Creates a normalized key for matching: "home_away_giornata"
    Example: "nijmegen_sparta_rotterdam_14"
    """
    h = home.lower().replace(" ", "_").strip()
    a = away.lower().replace(" ", "_").strip()
    
    # Handle "Giornata 14" -> "14"
    g_str = str(giornata).lower().replace("giornata", "").strip()
    
    return f"{h}_{a}_{g_str}"

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

    return payload

def sync_matches_to_supabase(json_path="matches_data.json"):
    """
    Reads a local JSON file and syncs match data to Supabase.
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

    # 1. Load Local JSON Data
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            local_matches = json.load(f)
        print(f"✅ Loaded {len(local_matches)} matches from {json_path}")
    except FileNotFoundError:
        print(f"❌ Error: File {json_path} not found.")
        return

    # 2. Fetch All Matches from Supabase
    print("⏳ Fetching matches from Supabase...")
    try:
        # Fetch all records (limit 1000 should be enough for now, or paginate if needed)
        resp = requests.get(f"{url}/rest/v1/matches?select=*&limit=5000", headers=headers)
        resp.raise_for_status()
        db_matches = resp.json()
        print(f"✅ Fetched {len(db_matches)} matches from DB")
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
            k = normalize_key(h, a, g)
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

        key = normalize_key(h, a, g)

        # Prepare base payload
        payload = build_stats_payload(local_match)

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
            
            # Infer league from filename if possible, or default
            # json_path is like "laliga_matches.json"
            league = "eredivisie" # Default
            if "laliga" in json_path.lower():
                league = "La Liga"
            elif "serieb" in json_path.lower():
                league = "Serie B"
            elif "eredivisie" in json_path.lower():
                league = "Eredivisie"
            
            payload["league"] = league
            
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

def fetch_existing_urls():
    """
    Fetches all match URLs currently in Supabase.
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

    print("⏳ Fetching existing URLs from Supabase...")
    try:
        # Fetch only the 'url' column to be efficient
        resp = requests.get(f"{url}/rest/v1/matches?select=url&limit=2000", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        
        # Extract URLs, filtering out None/Empty
        existing_urls = {item['url'] for item in data if item.get('url')}
        print(f"✅ Found {len(existing_urls)} existing URLs in DB.")
        return existing_urls
    except Exception as e:
        print(f"❌ Error fetching URLs from Supabase: {e}")
        return set()

if __name__ == "__main__":
    sync_matches_to_supabase()

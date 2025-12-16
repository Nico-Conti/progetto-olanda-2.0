import os
import sys
import json
import argparse


current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
if project_root not in sys.path:
    sys.path.append(project_root)

# Also add backend to path if needed, or just rely on project root
backend_dir = os.path.dirname(os.path.dirname(current_dir))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from backend.services.gemini_analyzer import analyze_match_comments
from backend.services.supabase_syncer import sync_matches_to_supabase, fetch_existing_urls

from .config import LEAGUE_URLS
from .driver import make_driver
from .url_collector import fetch_match_urls
from .match_details import scrape_match_details

def main():
    parser = argparse.ArgumentParser(description="Scrape match data for Eredivisie, La Liga, or Serie B.")
    parser.add_argument("league", nargs="?", default="eredivisie", choices=["eredivisie", "laliga", "serieb", "seriea", "bundesliga"], help="League to scrape")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of matches to scrape")
    parser.add_argument("--skip-analysis", action="store_true", help="Skip Gemini analysis")
    parser.add_argument("--skip-sync", action="store_true", help="Skip syncing to Supabase")
    parser.add_argument("--last-round", action="store_true", help="Scrape only the most recent round")
    parser.add_argument("--force-rescrape", action="store_true", help="Force rescraping of matches even if they exist in DB")

    args = parser.parse_args()
    
    league_name = args.league
    target_url = LEAGUE_URLS[league_name]
    
    # Serie B specific logic
    is_serieb = league_name == "serieb"
    skip_comments = is_serieb
    
    print(f"--- Starting Scraper for {league_name.upper()} ---")
    if is_serieb:
        print("    -> Serie B detected: Skipping comment scraping.")

    driver = make_driver()
    
    try:
        print("--- STEP 0: Checking Existing Matches ---")
        existing_urls = set()
        if not args.skip_sync and not args.force_rescrape:
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
            
            details = scrape_match_details(driver, match_url, skip_comments=skip_comments)
            
            if details:
                details['giornata'] = game['giornata']
                details['url'] = game['url']
                details['league'] = league_name # Add league field for clarity
                
                # --- GEMINI ANALYSIS ---
                # Skip analysis for Serie B if comments are missing, or if explicitly skipped
                if not args.skip_analysis and not is_serieb:
                    print("    -> Requesting Gemini analysis...")
                    corners = details.get('calci_d_angolo', {})
                    teams = details.get('squadre', {})
                    analysis = analyze_match_comments(details.get('commenti', []), corners_data=corners, teams=teams)
                    del details['commenti'] 
                    details['gemini_analysis'] = analysis
                    print("    -> Analysis complete.")
                elif is_serieb:
                     print("    -> Skipping Gemini analysis (Serie B / No comments).")
                     if 'commenti' in details:
                         del details['commenti'] # Ensure we don't save empty list if not needed, or keep it?
                         # Original script deleted it.
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

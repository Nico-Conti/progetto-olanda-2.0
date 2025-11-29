import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fix_dates():
    print("Fetching fixtures...")
    # Fetch all fixtures. You might want to filter by status if needed.
    response = supabase.table("fixtures").select("*").execute()
    fixtures = response.data
    
    if not fixtures:
        print("No fixtures found.")
        return

    current_date = datetime.now()
    updates_count = 0

    print(f"Checking {len(fixtures)} fixtures against current date: {current_date}")

    for f in fixtures:
        match_date_str = f['match_date']
        # Parse the date string. Assuming ISO format from Supabase (e.g., "2023-11-28T19:00:00")
        # Adjust format if necessary based on your DB
        try:
            match_date = datetime.fromisoformat(match_date_str)
        except ValueError:
            # Fallback for other formats if needed
            try:
                match_date = datetime.strptime(match_date_str, "%Y-%m-%d %H:%M:%S")
            except:
                print(f"Skipping invalid date format: {match_date_str}")
                continue

        # Check if date is in the past
        # Ensure both are offset-naive or both are offset-aware
        if match_date.tzinfo is not None:
            match_date = match_date.replace(tzinfo=None)
            
        if match_date < current_date:
            # Create new date with year 2026
            try:
                new_date = match_date.replace(year=2026)
                
                print(f"Updating {f['home_team']} vs {f['away_team']}: {match_date} -> {new_date}")
                
                # Update in DB
                supabase.table("fixtures").update({"match_date": new_date.isoformat()}).eq("id", f['id']).execute()
                updates_count += 1
            except ValueError as e:
                print(f"Error updating date for {f['home_team']} vs {f['away_team']}: {e}")

    print(f"Finished. Updated {updates_count} fixtures.")

if __name__ == "__main__":
    fix_dates()

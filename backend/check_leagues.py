import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

def setup_supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not found.")
        return None
    return create_client(url, key)

def check_leagues():
    supabase = setup_supabase_client()
    if not supabase:
        return

    try:
        # Try 'League' table (case sensitive?)
        print("Checking 'League' table...")
        response = supabase.table("League").select("*").execute()
        print(f"Found {len(response.data)} leagues:")
        for league in response.data:
            print(league)
    except Exception as e:
        print(f"Error querying 'League': {e}")

    try:
        # Try 'leagues' table
        print("\nChecking 'leagues' table...")
        response = supabase.table("leagues").select("*").execute()
        print(f"Found {len(response.data)} leagues:")
        for league in response.data:
            print(league)
    except Exception as e:
        print(f"Error querying 'leagues': {e}")

if __name__ == "__main__":
    check_leagues()

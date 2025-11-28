import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
# Assuming .env is in the root directory, which is one level up from scripts/
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

def setup_supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
        return None

    try:
        supabase: Client = create_client(url, key)
        return supabase
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")
        return None

def check_if_match_exists(supabase, home_team, away_team, giornata):
    try:
        response = supabase.table("matches").select("*").eq("home_team", home_team).eq("away_team", away_team).eq("giornata", giornata).execute()
        # If data list is not empty, the match exists
        return len(response.data) > 0
    except Exception as e:
        print(f"Error checking if match exists: {e}")
        return False

def insert_match(supabase, match_data):
    try:
        data, count = supabase.table("matches").insert(match_data).execute()
        return data
    except Exception as e:
        print(f"Error inserting match: {e}")
        return None

import csv
import os
from supabase_queries import setup_supabase_client

def fix_corners():
    supabase = setup_supabase_client()
    if not supabase:
        print("Error connecting to Supabase")
        return

    csv_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'eredivisie_matches.csv')
    
    if not os.path.exists(csv_file):
        print(f"CSV file not found: {csv_file}")
        return

    print("Starting fix process...")
    updated_count = 0

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            home_team = row['home_team']
            away_team = row['away_team']
            giornata = int(row['giornata'])
            csv_home_corners = int(row['home_corners'])
            csv_away_corners = int(row['away_corners'])

            # Check if match exists in DB
            try:
                response = supabase.table("matches").select("*").eq("home_team", home_team).eq("away_team", away_team).eq("giornata", giornata).execute()
                matches = response.data
                
                if matches:
                    db_match = matches[0]
                    db_home_corners = db_match.get('home_corners', 0)
                    db_away_corners = db_match.get('away_corners', 0)

                    # If DB has 0 corners but CSV has valid data, update it
                    if (db_home_corners == 0 and db_away_corners == 0) and (csv_home_corners > 0 or csv_away_corners > 0):
                        print(f"Updating {home_team} vs {away_team} (Giornata {giornata}): DB(0-0) -> CSV({csv_home_corners}-{csv_away_corners})")
                        
                        update_data = {
                            "home_corners": csv_home_corners,
                            "away_corners": csv_away_corners
                        }
                        
                        supabase.table("matches").update(update_data).eq("id", db_match['id']).execute()
                        updated_count += 1
            except Exception as e:
                print(f"Error processing {home_team} vs {away_team}: {e}")

    print(f"Fix complete. Updated {updated_count} matches.")

if __name__ == "__main__":
    fix_corners()

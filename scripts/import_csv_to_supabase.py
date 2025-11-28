import csv
import os
from supabase_queries import setup_supabase_client, insert_match

def import_csv():
    supabase = setup_supabase_client()
    if not supabase:
        return

    csv_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'eredivisie_matches.csv')
    
    if not os.path.exists(csv_file):
        print(f"CSV file not found: {csv_file}")
        return

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        count = 0
        errors = 0
        
        for row in reader:
            try:
                match_data = {
                    "home_team": row['home_team'],
                    "away_team": row['away_team'],
                    "home_corners": int(row['home_corners']),
                    "away_corners": int(row['away_corners']),
                    "giornata": int(row['giornata'])
                }
                
                # Try to insert (will fail if duplicate due to unique constraint, which is fine)
                result = insert_match(supabase, match_data)
                if result:
                    count += 1
                else:
                    # Could be duplicate or other error
                    pass
            except Exception as e:
                print(f"Error processing row {row}: {e}")
                errors += 1
                
        print(f"Import finished. Inserted: {count}, Errors/Duplicates: {errors}")

if __name__ == "__main__":
    import_csv()

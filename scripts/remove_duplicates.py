import os
from supabase_queries import setup_supabase_client

def remove_duplicates():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore connessione Supabase")
        return

    print("Controllo duplicati...")
    
    # Fetch all matches
    response = supabase.table("matches").select("*").execute()
    matches = response.data
    
    seen = set()
    duplicates = []
    
    for match in matches:
        # Create a unique key for the match
        # Using ID of teams if available, or names
        # The migration script updated home_team_id and away_team_id, but we might still have the text columns?
        # Let's rely on what's in the record.
        
        # Note: The migration script updated home_team_id and away_team_id.
        # But let's check based on the logical uniqueness: home_team (name), away_team (name), giornata.
        # Even if IDs are used, the names should still be there or retrievable.
        # Actually, the migration script didn't remove the name columns.
        
        key = (match['home_team'], match['away_team'], match['giornata'])
        
        if key in seen:
            duplicates.append(match['id'])
        else:
            seen.add(key)
            
    print(f"Trovati {len(duplicates)} duplicati.")
    
    if duplicates:
        print("Rimozione duplicati in corso...")
        for dup_id in duplicates:
            supabase.table("matches").delete().eq("id", dup_id).execute()
        print("Duplicati rimossi.")
    else:
        print("Nessun duplicato trovato.")

if __name__ == "__main__":
    remove_duplicates()

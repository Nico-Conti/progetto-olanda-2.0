from supabase_queries import setup_supabase_client

def check_giornata_zero():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore connessione Supabase")
        return

    print("Controllo partite con giornata 0...")
    
    response = supabase.table("matches").select("*").eq("giornata", 0).execute()
    matches = response.data
    
    if not matches:
        print("Nessuna partita con giornata 0 trovata.")
        return

    print(f"Trovate {len(matches)} partite con giornata 0.")
    print("Esempi:")
    for m in matches[:5]:
        print(f"  - {m['home_team']} vs {m['away_team']} (ID: {m['id']})")

if __name__ == "__main__":
    check_giornata_zero()

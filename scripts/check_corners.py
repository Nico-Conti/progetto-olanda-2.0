from supabase_queries import setup_supabase_client

def check_zero_corners():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore connessione Supabase")
        return

    print("Controllo partite con 0 angoli casa...")
    
    # Check for home_corners = 0
    response = supabase.table("matches").select("*").eq("home_corners", 0).execute()
    matches = response.data
    
    if not matches:
        print("Nessuna partita con 0 angoli casa trovata.")
    else:
        print(f"Trovate {len(matches)} partite con 0 angoli casa.")
        print("Esempi:")
        for m in matches[:5]:
            print(f"  - {m['home_team']} vs {m['away_team']} (Date: {m.get('date')}, Status: {m.get('status')})")
            print(f"    Corners: {m.get('home_corners')} - {m.get('away_corners')}")
            print(f"    Shots: {m.get('home_shots')} - {m.get('away_shots')}")

if __name__ == "__main__":
    check_zero_corners()

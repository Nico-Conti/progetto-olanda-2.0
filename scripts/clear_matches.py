from supabase_queries import setup_supabase_client

def clear_matches():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore connessione Supabase")
        return

    print("ATTENZIONE: Sto per cancellare TUTTE le partite dal database...")
    confirm = input("Sei sicuro? Scrivi 'SI' per procedere: ")
    
    if confirm != "SI":
        print("Operazione annullata.")
        return

    print("Cancellazione in corso...")
    
    # Delete all rows (neq id 0 is a trick to select all if delete requires a filter, 
    # but usually delete() without filter might be blocked or require specific policy.
    # Using a filter that is always true is safer for some clients.)
    try:
        # Use a filter on an integer column that is definitely not a UUID
        # Giornata is always >= 0, so neq -1 covers all rows.
        response = supabase.table("matches").delete().neq("giornata", -1).execute()
        print("Tabella matches svuotata con successo.")
    except Exception as e:
        print(f"Errore durante la cancellazione: {e}")

if __name__ == "__main__":
    clear_matches()

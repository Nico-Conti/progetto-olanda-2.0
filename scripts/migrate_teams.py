import os
import asyncio
from supabase_queries import setup_supabase_client

def migrate_teams():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore: Impossibile connettersi a Supabase.")
        return

    print("Inizio migrazione...")

    # 1. Recupera tutte le partite per estrarre i nomi delle squadre
    print("Recupero partite esistenti...")
    response = supabase.table("matches").select("home_team, away_team").execute()
    matches = response.data

    if not matches:
        print("Nessuna partita trovata.")
        return

    # Estrai nomi unici
    unique_teams = set()
    for match in matches:
        unique_teams.add(match['home_team'])
        unique_teams.add(match['away_team'])

    print(f"Trovate {len(unique_teams)} squadre uniche.")

    # 2. Inserisci le squadre nella tabella squads (se non esistono)
    print("Inserimento squadre nella tabella squads...")
    team_name_to_id = {}
    
    for team_name in unique_teams:
        # Controlla se esiste già (per evitare duplicati se lo script viene riavviato)
        existing = supabase.table("squads").select("id").eq("name", team_name).execute()
        
        if existing.data:
            team_id = existing.data[0]['id']
            print(f"Squadra esistente: {team_name} -> {team_id}")
        else:
            # Inserisci nuova squadra
            new_team = supabase.table("squads").insert({"name": team_name}).execute()
            if new_team.data:
                team_id = new_team.data[0]['id']
                print(f"Inserita squadra: {team_name} -> {team_id}")
            else:
                print(f"Errore inserimento squadra: {team_name}")
                continue
        
        team_name_to_id[team_name] = team_id

    # 3. Aggiorna la tabella matches con gli UUID
    print("Aggiornamento tabella matches con Foreign Keys...")
    
    # Per efficienza, recuperiamo tutte le partite con ID
    all_matches_resp = supabase.table("matches").select("id, home_team, away_team").execute()
    all_matches = all_matches_resp.data

    updated_count = 0
    for match in all_matches:
        match_id = match['id']
        h_name = match['home_team']
        a_name = match['away_team']
        
        h_id = team_name_to_id.get(h_name)
        a_id = team_name_to_id.get(a_name)

        if h_id and a_id:
            # Aggiorna la riga
            supabase.table("matches").update({
                "home_team_id": h_id,
                "away_team_id": a_id
            }).eq("id", match_id).execute()
            updated_count += 1
            if updated_count % 10 == 0:
                print(f"Aggiornate {updated_count} partite...")
        else:
            print(f"Attenzione: ID mancante per partita {match_id} ({h_name} vs {a_name})")

    print(f"Migrazione completata! Aggiornate {updated_count} partite.")

if __name__ == "__main__":
    migrate_teams()

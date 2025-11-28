import requests
import time
from supabase_queries import setup_supabase_client

# TheSportsDB Free API Key
API_KEY = "3" # '3' is the test key for TheSportsDB, usually works for basic lookups
BASE_URL = "https://www.thesportsdb.com/api/v1/json/3/searchteams.php"

def fetch_and_update_teams():
    supabase = setup_supabase_client()
    if not supabase:
        print("Errore connessione Supabase")
        return

    print("Recupero squadre dal DB...")
    response = supabase.table("squads").select("*").execute()
    teams = response.data

    if not teams:
        print("Nessuna squadra trovata nel DB.")
        return

    print(f"Inizio aggiornamento per {len(teams)} squadre...")

    for team in teams:
        team_name = team['name']
        team_id = team['id']
        
        # Mapping manuale per nomi che potrebbero differire
        search_name = team_name
        if team_name == "G.A. Eagles": search_name = "Go Ahead Eagles"
        if team_name == "Breda": search_name = "NAC Breda"
        if team_name == "Nijmegen": search_name = "N.E.C." # Proviamo con i puntini o "NEC Nijmegen"
        if team_name == "Sittard": search_name = "Fortuna Sittard"
        if team_name == "Alkmaar": search_name = "AZ Alkmaar"
        if team_name == "Zwolle": search_name = "PEC Zwolle"
        if team_name == "Groningen": search_name = "Groningen" # Proviamo senza FC
        if team_name == "Twente": search_name = "Twente" # Proviamo senza FC
        if team_name == "Utrecht": search_name = "Utrecht" # Proviamo senza FC
        if team_name == "PSV": search_name = "PSV Eindhoven"
        if team_name == "Heracles": search_name = "Heracles Almelo"
        if team_name == "Telstar": search_name = "SC Telstar"
        
        print(f"Cercando {search_name} (Originale: {team_name})...")
        
        try:
            res = requests.get(BASE_URL, params={"t": search_name})
            data = res.json()
            
            if data and data.get('teams'):
                # Prendi il primo risultato
                found_team = data['teams'][0]
                
                update_data = {
                    "logo_url": found_team.get('strTeamBadge'),
                    "stadium_image_url": found_team.get('strStadiumThumb'),
                    "description": found_team.get('strDescriptionEN'),
                    "formed_year": int(found_team.get('intFormedYear')) if found_team.get('intFormedYear') and found_team.get('intFormedYear').isdigit() else None,
                    "website": found_team.get('strWebsite')
                }
                
                # Aggiorna su Supabase
                supabase.table("squads").update(update_data).eq("id", team_id).execute()
                print(f"  -> Aggiornato: {team_name}")
            else:
                print(f"  -> Nessun risultato trovato per {search_name}")
                
        except Exception as e:
            print(f"  -> Errore durante l'aggiornamento di {team_name}: {e}")
            
        # Rispetta il rate limit (anche se la key '3' è permissiva)
        time.sleep(1)

    print("Aggiornamento completato.")

if __name__ == "__main__":
    fetch_and_update_teams()

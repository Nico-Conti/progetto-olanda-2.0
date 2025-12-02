import os
import google.generativeai as genai
import time
from dotenv import load_dotenv
import json

def configure_gemini():
    """Configures the Gemini API with the key from environment variables."""
    load_dotenv() # Load variables from .env
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("⚠️ Warning: GEMINI_API_KEY environment variable not set. Analysis will be skipped.")
        return False
    
    genai.configure(api_key=api_key)
    return True

def analyze_match_comments(comments_list, corners_data=None, teams=None):
    """
    Sends match comments to Gemini for analysis.
    
    Args:
        comments_list (list): List of dictionaries with 'time', 'type', 'text'.
        corners_data (dict, optional): {'home': 'X', 'away': 'Y'}
        teams (dict, optional): {'home': 'Team A', 'away': 'Team B'}
        
    Returns:
        dict: The analysis result from Gemini (JSON), or an error dict.
    """
    if not configure_gemini():
        return {"error": "Analysis skipped: No API Key."}

    if not comments_list:
        return {"error": "No comments available for analysis."}

    # Format comments into a single string for the prompt
    formatted_comments = "Match Commentary:\n"
    goals_list = []
    
    for c in comments_list:
        text = c.get('text', '')
        event_type = c.get('type', '').lower()
        time_str = c.get('time', 'N/A')
        
        formatted_comments += f"[{time_str}] {c.get('type', '')}: {text}\n"
        
        # Identify Goals
        if 'goal' in event_type or 'soccer' in event_type or 'ball' in event_type or 'goal' in text.lower():
            goals_list.append(f"- {time_str}: {text}")

    # Add Official Stats to Prompt
    stats_section = ""
    if corners_data:
        home_team_name = teams.get('home', 'Casa') if teams else 'Casa'
        away_team_name = teams.get('away', 'Ospite') if teams else 'Ospite'
        
        stats_section = (
            f"\nDATI UFFICIALI:\n"
            f"Squadra di Casa: {home_team_name} (Angoli: {corners_data.get('home', 'N/A')})\n"
            f"Squadra Ospite: {away_team_name} (Angoli: {corners_data.get('away', 'N/A')})\n"
            f"IMPORTANTE: Associa CORRETTAMENTE i commenti alle squadre. {home_team_name} è in casa, {away_team_name} è fuori casa.\n"
        )

    # Add Goals Section
    goals_section = ""
    if goals_list:
        goals_section = "\nGOL SEGNATI (Usa questi per capire l'evoluzione del punteggio):\n" + "\n".join(goals_list) + "\n"

    system_prompt = (
        "Sei un analista di calcio che aiuta un utente a fare pronostici sulle scommesse. Analizza la cronaca della partita. "
        "Restituisci un oggetto JSON con esattamente due chiavi:\n"
        "1. 'detailed_summary': Un'analisi dettagliata (fino a 500 parole) che copre ENTRAMBE le squadre. Spiega l'andamento della partita e l'ORIGINE dei calci d'angolo: "
        "analizza i momenti in cui avvengono piu angoli o meno dato il contesto o risultato (pressione costante, svantaggio, contropiede, momento statico della partita). "
        "Distingui chiaramente tra le due squadre (es. 'Squadra A ha spinto molto nel secondo tempo... mentre Squadra B solo in contropiede'). "
        "Spiega se i numeri sono influenzati dal punteggio (es. tanti angoli perché perdevano 0-1 o 0-2). Cita il RISULTATO PARZIALE quando descrivi i cluster di angoli se deducibile. "
        "IMPORTANTE: Usa i DATI UFFICIALI forniti per il conteggio totale, non provare a contarli dalla cronaca.\n"
        "Scrivi in ITALIANO.\n"
        "2. 'tldr': Un riassunto conciso (max 80 parole) che spiega brevemente il FLUSSO della partita (chi ha dominato, risultato se deducibile) "
        "e la natura degli angoli per ENTRAMBE le squadre (es. 'Casa ha dominato vincendo, tanti angoli da assedio; Ospiti solo in contropiede'). "
        "QUESTO CAMPO È OBBLIGATORIO. Se non sei sicuro, riassumi brevemente l'analisi dettagliata. Scrivi in ITALIANO.\n"
    )

    full_prompt = f"{system_prompt}\n{stats_section}\n{goals_section}\n{formatted_comments}"

    max_retries = 5
    base_delay = 30 # Start with 30 seconds

    generation_config = genai.types.GenerationConfig(
        response_mime_type="application/json"
    )

    for attempt in range(max_retries):
        try:
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content(full_prompt, generation_config=generation_config)
            
            # Parse JSON string to dict
            result = json.loads(response.text)
            
            # Fallback for missing tldr
            if "detailed_summary" in result and ("tldr" not in result or not result["tldr"]):
                detailed = result["detailed_summary"]
                # Create a simple fallback summary from the first few sentences
                sentences = detailed.split('.')
                fallback_tldr = ". ".join(sentences[:2]) + "."
                if len(fallback_tldr) > 200:
                    fallback_tldr = fallback_tldr[:197] + "..."
                result["tldr"] = fallback_tldr
                
            return result
            
        except Exception as e:
            if "429" in str(e) or "Quota exceeded" in str(e):
                if attempt < max_retries - 1:
                    sleep_time = base_delay * (2 ** attempt) # Exponential backoff: 30, 60, 120, 240...
                    print(f"    -> Rate limit hit. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                    continue
            return {"error": f"Error during Gemini analysis: {str(e)}"}
    return {"error": "Error: Max retries exceeded."}

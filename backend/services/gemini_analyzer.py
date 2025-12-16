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

def analyze_match_comments(comments_list, stats_data=None, teams=None):
    """
    Sends match comments to Gemini for analysis.
    
    Args:
        comments_list (list): List of dictionaries with 'time', 'type', 'text'.
        stats_data (dict, optional): Full dictionary of stats (corners, fouls, shots, xg, etc.)
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
    if stats_data:
        home_team_name = teams.get('home', 'Casa') if teams else 'Casa'
        away_team_name = teams.get('away', 'Ospite') if teams else 'Ospite'
        
        stats_section = (
            f"\nDATI UFFICIALI:\n"
            f"Squadra di Casa: {home_team_name}\n"
            f"Squadra Ospite: {away_team_name}\n"
            f"--------------------------------------------------\n"
        )
        
        # Iterate over all available stats provided by stats_data
        # Expecting stats_data to be like: {'corners': {'home': '5', 'away': '2'}, 'xg': ...}
        for key, vals in stats_data.items():
            if isinstance(vals, dict) and 'home' in vals and 'away' in vals:
                label = key.replace('_', ' ').capitalize()
                stats_section += f"{label}: Casa {vals['home']} - Ospiti {vals['away']}\n"
                
        stats_section += f"--------------------------------------------------\n"
        stats_section += f"IMPORTANTE: {home_team_name} è la squadra di casa, {away_team_name} è la squadra ospite.\n"

    # Add Goals Section
    goals_section = ""
    if goals_list:
        goals_section = "\nGOL SEGNATI (Usa questi per capire l'evoluzione del punteggio):\n" + "\n".join(goals_list) + "\n"

    system_prompt = (
        "Sei un analista di calcio professionista esperto in data analytics. Il tuo obiettivo è fornire un'analisi TATTICA e CAUSALE per scommettitori esperti.\n"
        "Non limitarti a descrivere i numeri, devi spiegare il PERCHÉ (Reasoning) dietro di essi collegando eventi, statistiche e cronaca.\n\n"
        "Output richiesto (JSON):\n"
        "1. 'match_summary' (Stringa): Narrazione critica del match. Chi ha dominato territorialmente? Chi ha sfruttato meglio le occasioni? Menziona l'inerzia della partita.\n"
        "2. 'detailed_corners_analysis' (Stringa): Analisi CAUSALE sui corner. Esempio: 'Il numero alto di corner della squadra X è dovuto alla spinta costante sulle fasce o a tiri deviati...'. Collega al possesso palla se rilevante.\n"
        "3. 'detailed_goals_analysis' (Stringa): Analisi della qualità dei gol e xG. I gol sono stati frutto di azioni manovrate, errori difensivi o calci piazzati? Il risultato è giusto rispetto agli xG prodotti?\n"
        "4. 'detailed_shots_analysis' (Stringa): Analisi volume vs pericolosità. Una squadra ha tirato tanto ma da fuori (basso xG) o ha creato occasioni nitide? Efficienza al tiro.\n"
        "5. 'detailed_fouls_analysis' (Stringa): Analisi dell'aggressività e del ritmo. I falli sono stati tattici per fermare ripartenze? C'è stata frustrazione? Collega i falli ai cartellini.\n"
        "6. 'detailed_cards_analysis' (Stringa): Analisi disciplinare. I cartellini hanno cambiato l'inerzia? (es. un rosso ha costretto la squadra a difendersi). C'è nervosismo?\n\n"
        "REGOLE FONDAMENTALI:\n"
        "- NON fare elenchi puntati sterili.\n"
        "- USA connettivi logici: 'di conseguenza', 'causato da', 'questo ha portato a', 'nonostante'.\n"
        "- CITA SEMPRE i dati a supporto delle tue tesi.\n"
        "- Scrivi in ITALIANO professionale."
    )

    full_prompt = f"{system_prompt}\n{stats_section}\n{goals_section}\n{formatted_comments}"

    max_retries = 5
    base_delay = 30 # Start with 30 seconds

    generation_config = genai.types.GenerationConfig(
        response_mime_type="application/json"
    )

    for attempt in range(max_retries):
        try:
            model = genai.GenerativeModel('gemini-2.0-flash-exp')
            response = model.generate_content(full_prompt, generation_config=generation_config)
            
            # Parse JSON string to dict
            result = json.loads(response.text)
            
            # Fallback for missing tldr
            # Fallback for missing keys (robustness) - ensure all keys exist
            expected_keys = [
                "match_summary", "detailed_corners_analysis", "detailed_goals_analysis", 
                "detailed_shots_analysis", "detailed_fouls_analysis", "detailed_cards_analysis"
            ]
            for k in expected_keys:
                if k not in result:
                    result[k] = "Dati non disponibili per questa analisi."
                
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

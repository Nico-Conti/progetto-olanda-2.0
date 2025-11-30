import os
import google.generativeai as genai
import time
from dotenv import load_dotenv

def configure_gemini():
    """Configures the Gemini API with the key from environment variables."""
    load_dotenv() # Load variables from .env
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("⚠️ Warning: GEMINI_API_KEY environment variable not set. Analysis will be skipped.")
        return False
    
    genai.configure(api_key=api_key)
    return True

def analyze_match_comments(comments_list, corners_data=None):
    """
    Sends match comments to Gemini for analysis.
    
    Args:
        comments_list (list): List of dictionaries with 'time', 'type', 'text'.
        corners_data (dict, optional): {'home': 'X', 'away': 'Y'}
        
    Returns:
        str: The analysis text from Gemini, or an error message.
    """
    if not configure_gemini():
        return "Analysis skipped: No API Key."

    if not comments_list:
        return "No comments available for analysis."

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
        stats_section = (
            f"\nDATI UFFICIALI CALCI D'ANGOLO (Usa questi come verità assoluta):\n"
            f"Squadra di Casa: {corners_data.get('home', 'N/A')}\n"
            f"Squadra Ospite: {corners_data.get('away', 'N/A')}\n"
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
        "e la natura degli angoli per ENTRAMBE le squadre (es. 'Casa ha dominato vincendo, tanti angoli da assedio; Ospiti solo in contropiede'). Scrivi in ITALIANO.\n"
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
            import json
            return json.loads(response.text)
            
        except Exception as e:
            if "429" in str(e) or "Quota exceeded" in str(e):
                if attempt < max_retries - 1:
                    sleep_time = base_delay * (2 ** attempt) # Exponential backoff: 30, 60, 120, 240...
                    print(f"    -> Rate limit hit. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                    continue
            return {"error": f"Error during Gemini analysis: {str(e)}"}
    return {"error": "Error: Max retries exceeded."}

if __name__ == "__main__":
    # Test block
    test_comments = [
        {"time": "10'", "type": "corner", "text": "Corner for Ajax."},
        {"time": "12'", "type": "goal", "text": "Goal! Ajax scores."},
        {"time": "55'", "type": "corner", "text": "Corner for PSV."},
        {"time": "56'", "type": "corner", "text": "Another corner for PSV (Cluster)."},
        {"time": "90'", "type": "whistle", "text": "Full time."}
    ]
    print(analyze_match_comments(test_comments))

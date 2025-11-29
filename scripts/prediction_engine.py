import os
import math
import numpy as np
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_avg(lst):
    return sum(lst) / len(lst) if lst else 0

def get_weighted_avg(lst):
    if not lst:
        return 0
    season_avg = get_avg(lst)
    # Last 5 matches
    recent_slice = lst[-5:]
    recent_avg = get_avg(recent_slice)
    
    # 60% recent, 40% season
    return (season_avg * 0.4) + (recent_avg * 0.6)

def monte_carlo_simulation(lambda_home, lambda_away, iterations=10000):
    home_goals = np.random.poisson(lambda_home, iterations)
    away_goals = np.random.poisson(lambda_away, iterations)
    total_goals = home_goals + away_goals
    
    # Calculate probabilities from simulation
    prob_over_9_5 = np.mean(total_goals > 9.5)
    prob_over_10_5 = np.mean(total_goals > 10.5)
    
    return prob_over_9_5, prob_over_10_5

def build_team_stats(matches):
    stats = {}
    
    for m in matches:
        home = m['home_team']
        away = m['away_team']
        
        h_corners = m['home_corners']
        a_corners = m['away_corners']
        
        if home not in stats:
            stats[home] = {
                'home_corners_for': [], 'home_corners_ag': [],
                'away_corners_for': [], 'away_corners_ag': []
            }
        if away not in stats:
            stats[away] = {
                'home_corners_for': [], 'home_corners_ag': [],
                'away_corners_for': [], 'away_corners_ag': []
            }
            
        # Update Home Team Stats
        stats[home]['home_corners_for'].append(h_corners)
        stats[home]['home_corners_ag'].append(a_corners)
        
        # Update Away Team Stats
        stats[away]['away_corners_for'].append(a_corners)
        stats[away]['away_corners_ag'].append(h_corners)
        
    return stats

def calculate_prediction(home_team, away_team, team_stats):
    if home_team not in team_stats or away_team not in team_stats:
        print(f"  -> Missing stats for {home_team} or {away_team}")
        return None

    h_stats = team_stats[home_team]
    a_stats = team_stats[away_team]

    # Calculate Lambda for Home and Away
    # Home Expected = (Home Avg For + Away Avg Against) / 2
    h_for = get_weighted_avg(h_stats['home_corners_for'])
    a_ag = get_weighted_avg(a_stats['away_corners_ag'])
    lambda_home = (h_for + a_ag) / 2

    # Away Expected = (Away Avg For + Home Avg Against) / 2
    a_for = get_weighted_avg(a_stats['away_corners_for'])
    h_ag = get_weighted_avg(h_stats['home_corners_ag'])
    lambda_away = (a_for + h_ag) / 2

    lambda_total = lambda_home + lambda_away

    # Monte Carlo Simulation
    prob_over_9_5, prob_over_10_5 = monte_carlo_simulation(lambda_home, lambda_away)

    return {
        "prediction_home_corners": round(lambda_home, 2),
        "prediction_away_corners": round(lambda_away, 2),
        "prediction_total_corners": round(lambda_total, 2),
        "prediction_prob_over_9_5": round(prob_over_9_5, 2),
        "prediction_prob_over_10_5": round(prob_over_10_5, 2) # New field, ensure DB has it or ignore
    }

def check_hot_match(prediction):
    if prediction['prediction_prob_over_9_5'] >= 0.70:
        return True, f"High Probability Over 9.5 Corners ({int(prediction['prediction_prob_over_9_5']*100)}%)"
    if prediction['prediction_total_corners'] >= 11.0:
        return True, f"High Expected Total Corners ({prediction['prediction_total_corners']})"
    return False, None

def run_engine():
    print("Fetching historical matches...")
    response = supabase.table("matches").select("*").execute()
    matches = response.data
    
    if not matches:
        print("No historical matches found.")
        return

    print(f"Building stats model from {len(matches)} matches...")
    team_stats = build_team_stats(matches)
    
    print("Fetching upcoming fixtures...")
    # Fetch fixtures that don't have predictions yet OR all scheduled ones to update
    response = supabase.table("fixtures").select("*").eq("status", "SCHEDULED").execute()
    fixtures = response.data
    
    if not fixtures:
        print("No scheduled fixtures found.")
        return

    print(f"Processing {len(fixtures)} fixtures...")
    
    updates = []
    
    for f in fixtures:
        pred = calculate_prediction(f['home_team'], f['away_team'], team_stats)
        if pred:
            is_hot, reason = check_hot_match(pred)
            
            # Prepare update payload
            update_payload = {
                "prediction_home_corners": pred['prediction_home_corners'],
                "prediction_away_corners": pred['prediction_away_corners'],
                "prediction_total_corners": pred['prediction_total_corners'],
                "prediction_prob_over_9_5": pred['prediction_prob_over_9_5'],
                "is_hot_match": is_hot,
                "hot_match_reason": reason
            }
            
            print(f"  Prediction for {f['home_team']} vs {f['away_team']}: Total {pred['prediction_total_corners']} (Hot: {is_hot})")
            
            # Update the fixture in DB
            supabase.table("fixtures").update(update_payload).eq("id", f['id']).execute()
            
    print("Prediction engine finished.")

if __name__ == "__main__":
    run_engine()

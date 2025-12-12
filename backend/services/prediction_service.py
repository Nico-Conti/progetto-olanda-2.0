import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Dict, Any, Optional

load_dotenv()

class PredictionService:
    def __init__(self):
        url: str = os.environ.get("SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
        self.supabase: Client = create_client(url, key)

    # Regression Coefficients (Trained on Eredivisie Data)
    # Formula: Corners = Intercept + (BoxTouches * 0.0624) + (Shots * 0.1389) + ...
    COEFFICIENTS = {
        "intercept": -0.4679,
        "box_touches": 0.0624,
        "shots": 0.1389,
        "crosses": 0.0158,
        "possession": 0.0344
    }

    def calculate_expected_corners_regression(self, stats: Dict[str, float]) -> float:
        """
        Calculates expected corners using the trained regression formula.
        """
        c = self.COEFFICIENTS
        
        # Extract stats (default to 0)
        box_touches = stats.get('box_touches', 0)
        shots = stats.get('shots', 0)
        crosses = stats.get('crosses', 0)
        possession = stats.get('possession', 50)
        
        # Formula
        expected = c['intercept'] + \
                   (box_touches * c['box_touches']) + \
                   (shots * c['shots']) + \
                   (crosses * c['crosses']) + \
                   (possession * c['possession'])
                   
        return max(0, expected) # Ensure non-negative

    def get_historical_matches(self, team_id: str) -> pd.DataFrame:
        """
        Fetches historical matches for a team where they played either home or away.
        """
        try:
            # Fetch matches where team is home
            response_home = self.supabase.table("matches").select("*").eq("home_team_id", team_id).execute()
            # Fetch matches where team is away
            response_away = self.supabase.table("matches").select("*").eq("away_team_id", team_id).execute()
            
            matches = response_home.data + response_away.data
            
            if not matches:
                return pd.DataFrame()
                
            df = pd.DataFrame(matches)
            
            # Ensure numeric columns are actually numeric
            numeric_cols = [
                'home_corners', 'away_corners', 
                'home_shots', 'away_shots', 
                'home_shots_on_target', 'away_shots_on_target', 
                'home_possession', 'away_possession',
                'home_box_touches', 'away_box_touches',
                'home_crosses', 'away_crosses'
            ]
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
            return df
        except Exception as e:
            print(f"Error fetching matches for team {team_id}: {e}")
            return pd.DataFrame()

    # Coefficients for Goal Prediction (Linear Regression)
    # Formula: Goals = Intercept + (c1 * xGOT) + (c2 * xG) + (c3 * BigChances)
    GOAL_COEFFICIENTS = {
        'intercept': 0.3134,
        'total_xgot': 0.8990,
        'total_xg': -0.2878,
        'total_big_chances': 0.1414
    }

    def predict_match_corners(self, home_team_id: str, away_team_id: str, model: str = "hybrid") -> Dict[str, Any]:
        """
        Predicts corners using the specified model:
        - 'hybrid': 60% Regression (Recent Form) + 40% Historical Average
        - 'regression': 100% Regression (Recent Form)
        - 'historical': 100% Historical Average
        """
        # 1. Fetch Data
        home_matches_df = self.get_historical_matches(home_team_id)
        away_matches_df = self.get_historical_matches(away_team_id)
        
        if home_matches_df.empty or away_matches_df.empty:
            return {"error": "Insufficient data for one or both teams"}

        # 2. Filter for Home/Away specific stats
        home_at_home = home_matches_df[home_matches_df['home_team_id'] == home_team_id]
        away_at_away = away_matches_df[away_matches_df['away_team_id'] == away_team_id]
        
        if home_at_home.empty: home_at_home = home_matches_df
        if away_at_away.empty: away_at_away = away_matches_df

        # 3. Base Prediction (Historical Average)
        avg_home_corners_for = home_at_home['home_corners'].mean()
        avg_home_corners_ag = home_at_home['away_corners'].mean()
        
        avg_away_corners_for = away_at_away['away_corners'].mean()
        avg_away_corners_ag = away_at_away['home_corners'].mean()

        exp_home_corners_base = (avg_home_corners_for + avg_away_corners_ag) / 2
        exp_away_corners_base = (avg_away_corners_for + avg_home_corners_ag) / 2

        # 4. Advanced Prediction (Regression on Recent Form)
        # Get last 5 games for each team to estimate current "Performance Stats"
        recent_home = home_matches_df.sort_values('created_at', ascending=False).head(5)
        recent_away = away_matches_df.sort_values('created_at', ascending=False).head(5)
        
        def get_avg_stats(df, team_id):
            stats = {
                'box_touches': 0, 'shots': 0, 'crosses': 0, 'possession': 0,
                'xg': 0, 'xgot': 0, 'big_chances': 0
            }
            count = 0
            for _, row in df.iterrows():
                prefix = 'home_' if row['home_team_id'] == team_id else 'away_'
                stats['box_touches'] += row.get(f'{prefix}box_touches', 0)
                stats['shots'] += row.get(f'{prefix}shots', 0)
                stats['crosses'] += row.get(f'{prefix}crosses', 0)
                stats['possession'] += row.get(f'{prefix}possession', 50)
                stats['xg'] += row.get(f'{prefix}xg', 0)
                stats['xgot'] += row.get(f'{prefix}xgot', 0)
                stats['big_chances'] += row.get(f'{prefix}big_chances', 0)
                count += 1
            
            if count > 0:
                return {k: v/count for k, v in stats.items()}
            return stats

        home_recent_stats = get_avg_stats(recent_home, home_team_id)
        away_recent_stats = get_avg_stats(recent_away, away_team_id)
        
        # Predict corners based on these recent stats
        exp_home_corners_reg = self.calculate_expected_corners_regression(home_recent_stats)
        exp_away_corners_reg = self.calculate_expected_corners_regression(away_recent_stats)
        
        # 5. Model Weighting
        if model == "regression":
            w_reg, w_hist = 1.0, 0.0
        elif model == "historical":
            w_reg, w_hist = 0.0, 1.0
        else: # hybrid (default)
            w_reg, w_hist = 0.6, 0.4
            
        final_home = (exp_home_corners_reg * w_reg) + (exp_home_corners_base * w_hist)
        final_away = (exp_away_corners_reg * w_reg) + (exp_away_corners_base * w_hist)
        
        return {
            "home_team": {
                "base_corners": round(exp_home_corners_base, 2),
                "regression_corners": round(exp_home_corners_reg, 2),
                "final_expected_corners": round(final_home, 2),
                "recent_form_stats": home_recent_stats
            },
            "away_team": {
                "base_corners": round(exp_away_corners_base, 2),
                "regression_corners": round(exp_away_corners_reg, 2),
                "final_expected_corners": round(final_away, 2),
                "recent_form_stats": away_recent_stats
            },
            "total_expected_corners": round(final_home + final_away, 2),
            "method": f"{model.capitalize()} Model"
        }

    def predict_match_goals(self, home_team_id: str, away_team_id: str) -> Dict[str, Any]:
        """
        Predicts total goals using Linear Regression on xGOT, xG, and Big Chances.
        Also calculates 1X2 probabilities using Poisson distribution based on xG.
        """
        # 1. Fetch Data (Reuse existing method)
        home_matches_df = self.get_historical_matches(home_team_id)
        away_matches_df = self.get_historical_matches(away_team_id)
        
        if home_matches_df.empty or away_matches_df.empty:
            return {"error": "Insufficient data"}

        # 2. Calculate Recent Form Stats (Last 5 Games)
        recent_home = home_matches_df.sort_values('created_at', ascending=False).head(5)
        recent_away = away_matches_df.sort_values('created_at', ascending=False).head(5)
        
        def get_avg_goals_stats(df, team_id):
            stats = {'xg': 0, 'xgot': 0, 'big_chances': 0, 'goals_scored': 0, 'goals_conceded': 0}
            count = 0
            for _, row in df.iterrows():
                is_home = row['home_team_id'] == team_id
                prefix = 'home_' if is_home else 'away_'
                opp_prefix = 'away_' if is_home else 'home_'
                
                stats['xg'] += row.get(f'{prefix}xg', 0)
                stats['xgot'] += row.get(f'{prefix}xgot', 0)
                stats['big_chances'] += row.get(f'{prefix}big_chances', 0)
                stats['goals_scored'] += row.get(f'{prefix}goals', 0) # Assuming column is home_goals/away_goals
                stats['goals_conceded'] += row.get(f'{opp_prefix}goals', 0)
                count += 1
            
            if count > 0:
                return {k: v/count for k, v in stats.items()}
            return stats

        home_stats = get_avg_goals_stats(recent_home, home_team_id)
        away_stats = get_avg_goals_stats(recent_away, away_team_id)
        
        # 3. Predict Total Goals (Regression)
        # Formula inputs are SUM of both teams' stats
        total_xgot = home_stats['xgot'] + away_stats['xgot']
        total_xg = home_stats['xg'] + away_stats['xg']
        total_big_chances = home_stats['big_chances'] + away_stats['big_chances']
        
        predicted_goals = (
            self.GOAL_COEFFICIENTS['intercept'] +
            (self.GOAL_COEFFICIENTS['total_xgot'] * total_xgot) +
            (self.GOAL_COEFFICIENTS['total_xg'] * total_xg) +
            (self.GOAL_COEFFICIENTS['total_big_chances'] * total_big_chances)
        )
        
        # 4. Poisson Match Winner (1X2)
        # Estimate expected goals for each team based on xG form
        # Simple approach: Home Exp Goals = Home Avg xG, Away Exp Goals = Away Avg xG
        # Refined: Adjust for opponent defense? For now, stick to xG form.
        lambda_home = home_stats['xg']
        lambda_away = away_stats['xg']
        
        # Poisson Probability Mass Function
        import math
        def poisson(k, lam):
            return (lam**k * math.exp(-lam)) / math.factorial(k)
        
        prob_home_win = 0
        prob_draw = 0
        prob_away_win = 0
        
        # Simulate scores up to 10-10
        for h in range(10):
            for a in range(10):
                p = poisson(h, lambda_home) * poisson(a, lambda_away)
                if h > a:
                    prob_home_win += p
                elif h == a:
                    prob_draw += p
                else:
                    prob_away_win += p
                    
        return {
            "predicted_total_goals": round(predicted_goals, 2),
            "over_2_5_prob": 0, # Placeholder, could calculate using Poisson too
            "probabilities": {
                "home_win": round(prob_home_win * 100, 1),
                "draw": round(prob_draw * 100, 1),
                "away_win": round(prob_away_win * 100, 1)
            },
            "stats_used": {
                "home_xg": round(home_stats['xg'], 2),
                "away_xg": round(away_stats['xg'], 2),
                "total_xgot": round(total_xgot, 2)
            }
        }

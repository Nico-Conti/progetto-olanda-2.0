# 📘 Progetto Olanda 2.0 - Technical Documentation

## 1. Project Overview
**Progetto Olanda 2.0** is an advanced football prediction system tailored for the **Eredivisie** (Dutch League). It leverages detailed match statistics, including advanced metrics like **xG (Expected Goals)**, **Box Touches**, and **Big Chances**, to predict match outcomes (Corners, Goals, Winner).

The system consists of:
- **Frontend**: A modern, responsive React dashboard for viewing stats and predictions.
- **Backend**: A Python FastAPI service that handles data processing and runs prediction models.
- **Scraper**: An automated bot that collects detailed match data from *Diretta.it*.
- **Database**: A Supabase (PostgreSQL) instance for persistent storage.

---

## 2. Architecture

### 🖥️ Frontend
- **Framework**: React (Vite)
- **Styling**: TailwindCSS (Custom "Glassmorphism" Design)
- **State Management**: React Hooks (`useState`, `useEffect`)
- **Key Components**:
    - `Predictor.jsx`: Main dashboard for match analysis.
    - `InfoPage.jsx`: Educational page explaining the models.
    - `LeagueTrends.jsx`: Visualizes league-wide stats.

### ⚙️ Backend
- **Framework**: FastAPI
- **Language**: Python 3.10+
- **Key Services**:
    - `PredictionService`: Contains the core logic for all prediction models.
    - `SupabaseSyncer`: Handles data synchronization with the database.

### 🕷️ Data Collection (Scraper)
- **Tools**: Selenium, `undetected-chromedriver`
- **Source**: *Diretta.it* (Flashscore)
- **Process**:
    1.  Navigates to match pages.
    2.  Extracts basic stats (Corners, Shots, Possession).
    3.  Extracts **Advanced Stats** (xG, xGOT, Box Touches, etc.) from the "Statistiche" tab.
    4.  Cleans and normalizes data before sending it to Supabase.

---

## 3. Database Schema (`matches` table)

The core table is `matches`. Here are the key columns used for predictions:

| Column Name | Type | Description |
| :--- | :--- | :--- |
| `home_team` / `away_team` | Text | Team names. |
| `home_corners` / `away_corners` | Int | Actual corners awarded. |
| `home_box_touches` | Int | **[Advanced]** Touches inside opponent's box. High correlation with corners. |
| `home_xg` / `away_xg` | Float | **[Advanced]** Expected Goals. Quality of chances created. |
| `home_xgot` | Float | **[Advanced]** Expected Goals on Target. Quality of shots on goal. |
| `home_big_chances` | Int | **[Advanced]** Clear scoring opportunities. |
| `home_crosses` | Int | Total crosses attempted. |
| `home_shots` | Int | Total shots (on + off target). |

---

## 4. Prediction Models 🧠

The system uses three distinct modeling approaches.

### A. Corner Prediction Models 📐

#### 1. Regression Model (Recent Form)
Uses a **Linear Regression** trained on ~500 Eredivisie matches. It predicts corners based on a team's offensive pressure.
- **Formula**: `Corners = -0.47 + (0.06 * BoxTouches) + (0.14 * Shots) + (0.02 * Crosses) + (0.03 * Possession)`
- **Why it works**: It captures *how* a team is playing right now, not just their past results.

#### 2. Historical Average
Simple average of corners earned/conceded over the entire season.
- **Formula**: `(Home Avg For + Away Avg Against) / 2`
- **Why it works**: Provides a stable baseline, smoothing out outliers.

#### 3. Hybrid Model (Recommended) ⭐
Combines the two above for the best balance.
- **Weighting**: **60% Regression** (Form) + **40% Historical** (Stability).

### B. Goal Prediction Models ⚽

#### 1. "High Octane" Goal Regression
Predicts total match goals using advanced shooting metrics.
- **Formula**: `Goals = 0.31 + (0.90 * Total xGOT) - (0.29 * Total xG) + (0.14 * Total Big Chances)`
- **Key Insight**: **xGOT** (quality of the shot) is the strongest predictor (0.89 coefficient), much more than raw xG.

#### 2. Poisson Match Winner (1X2) 🎲
Calculates the percentage probability of Home Win, Draw, and Away Win.
- **Method**: Uses the **Poisson Distribution** formula.
- **Inputs**: Uses each team's recent **xG** (Expected Goals) as the "Lambda" (expected rate) for the Poisson function.
- **Output**: Simulates the match 100 times (mathematically) to determine probabilities.

---

## 5. API Reference

### `GET /predict/corners/{home_id}/{away_id}`
Returns corner predictions.
- **Query Param**: `model` (`hybrid`, `regression`, `historical`)
- **Response**:
```json
{
  "home_team": { "final_expected_corners": 6.5, ... },
  "away_team": { "final_expected_corners": 4.2, ... },
  "total_expected_corners": 10.7,
  "method": "Hybrid Model"
}
```

### `GET /predict/goals/{home_id}/{away_id}`
Returns goal and winner predictions.
- **Response**:
```json
{
  "predicted_total_goals": 3.1,
  "probabilities": {
    "home_win": 45.2,
    "draw": 24.1,
    "away_win": 30.7
  },
  "stats_used": { "total_xgot": 3.5, ... }
}
```

---

## 6. How to Run

### Backend
```bash
cd backend
source venv/bin/activate  # or appropriate venv command
pip install -r requirements.txt
python main.py
```
*Server runs on `http://localhost:8002`*

### Frontend
```bash
cd frontend
npm install
npm run dev
```
*App runs on `http://localhost:5173`*

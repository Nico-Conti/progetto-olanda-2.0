from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv

# Import services
# Note: We need to ensure the services directory is in the python path or imported correctly.
# Since main.py is in backend/, and services is in backend/services/, this relative import works.
from backend.services.gemini_analyzer import analyze_match_comments
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic can go here if needed
    yield
    # Shutdown logic if needed

app = FastAPI(title="Progetto Olanda 2.0 Backend", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MatchData(BaseModel):
    comments: List[Dict[str, Any]]
    stats_data: Optional[Dict[str, Any]] = None
    teams: Optional[Dict[str, str]] = None

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Progetto Olanda Backend is running"}

# Columns the frontend actually reads from `matches` (see useMatchData.js).
# Selecting these instead of "*" keeps the four unused Gemini prose columns
# (detail_goal, detail_shots, detail_fouls, detail_cards) off the wire; they are
# long and nothing renders them.
MATCH_COLUMNS = ",".join([
    "home_team", "away_team", "giornata", "league", "season", "match_date",
    "home_goals", "away_goals",
    "home_corners", "away_corners",
    "home_fouls", "away_fouls",
    "home_yellow_cards", "away_yellow_cards",
    "home_red_cards", "away_red_cards",
    # Needed to compute card points correctly: diretta files a dismissal for a
    # second yellow as one yellow AND one red, so the bookmaker's total is
    # `yellows + 2*reds - second_bookings`. NULL on anything scraped before
    # migration 005; the frontend treats NULL as 0, which leaves those matches
    # at the old, marginally high value rather than discarding them.
    "home_second_bookings", "away_second_bookings",
    "home_shots", "away_shots",
    "home_shots_on_target", "away_shots_on_target",
    "home_possession", "away_possession",
    # Scraped since the beginning and stored on every row, but left off the wire
    # until now, so the model has never seen them. xG in particular predicts
    # future goals better than past goals do.
    #
    # Note `blocked_shots`: the scraper reads diretta's "Palle intercettate"
    # (interceptions) and the syncer deliberately writes it to the
    # blocked_shots column (supabase_syncer.py:92). The column name is the
    # source of truth here; the label it came from is not.
    "home_xg", "away_xg",
    "home_xgot", "away_xgot",
    "home_big_chances", "away_big_chances",
    "home_box_touches", "away_box_touches",
    "home_crosses", "away_crosses",
    "home_goalkeeper_saves", "away_goalkeeper_saves",
    "home_blocked_shots", "away_blocked_shots",
])

# The Gemini prose the UI shows on a match detail. Deliberately NOT part of
# MATCH_COLUMNS: it is 27% of the /matches payload gzipped, only 452 of ~3100
# rows carry any, and nothing renders it until a match is opened. /matches
# therefore stays on the critical path and the prose follows on /matches/analysis
# once the app has painted. Current column names - "tl dr corner" /
# "detailed comment corner" are the pre-rename ones and do not exist.
MATCH_ANALYSIS_COLUMNS = ",".join([
    # The join key has to match what the frontend builds from a match row.
    "home_team", "away_team", "league", "season", "match_date",
    "summary_match", "detail_corner",
])


def fetch_all_data(table_name, order_col=None, desc=False, columns="*", gte=None):
    """Every row, paged. `gte` is an optional (column, value) floor, pushed to
    PostgREST so the rows are never fetched rather than filtered here."""
    all_rows = []
    chunk_size = 1000
    current_offset = 0
    
    while True:
        query = supabase.table(table_name).select(columns)
        if gte:
            query = query.gte(gte[0], gte[1])
        if order_col:
            query = query.order(order_col, desc=desc)
        
        # Using limit doesn't offset, range is cleaner here: range includes end index
        result = query.range(current_offset, current_offset + chunk_size - 1).execute()
        
        rows = result.data
        if not rows:
            break
            
        all_rows.extend(rows)

        # Page until the server returns nothing. A short page is NOT proof of
        # the end: PostgREST silently truncates to its own max-rows, so
        # breaking on len(rows) < chunk_size stops early and loses data. See
        # the same trap in the scraper's fetch_all_records.
        current_offset += len(rows)
        
        # Safety break to avoid infinite loops if something is weird
        if current_offset > 50000:
            break
            
    return all_rows

@app.get("/teams")
def get_teams():
    try:
        data = fetch_all_data("squads")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/matches")
def get_matches():
    try:
        return fetch_all_data("matches", columns=MATCH_COLUMNS)
    except Exception as narrow_error:
        # If the schema does not match the column list above (a renamed or
        # missing column makes PostgREST reject the whole query), fall back to
        # the full row rather than failing the request.
        print(f"⚠️  Narrow /matches select failed ({narrow_error}); falling back to select(*)")
        try:
            return fetch_all_data("matches")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/matches/analysis")
def get_match_analysis():
    """
    The Gemini prose for the matches that have any, keyed so the frontend can
    join it onto rows it already holds. Split off /matches so the first paint
    does not wait on text nothing has rendered yet.
    """
    try:
        rows = fetch_all_data("matches", columns=MATCH_ANALYSIS_COLUMNS)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Most rows have no analysis at all. Filtering here rather than in
    # PostgREST keeps the query trivial, and the wire saving is the point.
    return [r for r in rows if r.get("summary_match") or r.get("detail_corner")]


# Everything the UI reads off a fixture. The table also carries prediction_*
# and is_hot_match columns from an earlier server-side experiment; the frontend
# models all of that itself and reads none of them, and they were 77% of this
# payload.
FIXTURE_COLUMNS = ",".join([
    "home_team", "away_team", "match_date", "giornata",
    "status", "league", "season",
])


@app.get("/fixtures")
def get_fixtures():
    try:
        data = fetch_all_data("fixtures", "match_date", desc=False,
                              columns=FIXTURE_COLUMNS)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Only the latest snapshot per selection reaches the app. The table keeps the
# whole price path for closing-line value, but a screen showing "the price" wants
# one number, and shipping every historical capture would be mostly duplicates.
ODDS_COLUMNS = ",".join([
    "league", "season", "home_team", "away_team", "match_date",
    "market", "line", "selection", "price", "bookmaker", "captured_at",
])


# A fixture that kicked off recently is still on screen, and dropping its price
# mid-match would read as a regression. Six hours covers a match plus stoppage.
ODDS_LOOKBACK_HOURS = 6


@app.get("/odds")
def get_odds():
    """Current bookmaker prices for fixtures that have not finished.

    The table keeps every capture for closing-line value - 102,138 rows on
    2026-09-08 and growing by ~350 every three hours - but the app only ever
    looks up a fixture it is about to show. Serving the whole history cost
    2.4 MB and ~50 round trips on every page load, for roughly 3,000 useful
    rows, and `fetch_all_data` silently stops at 50,000 anyway.
    """
    cutoff = (datetime.now(timezone.utc)
              - timedelta(hours=ODDS_LOOKBACK_HOURS)).isoformat()
    try:
        rows = fetch_all_data("odds_snapshots", "captured_at", desc=True,
                              columns=ODDS_COLUMNS, gte=("match_date", cutoff))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Ordered newest first, so the first row seen for a key is the current one.
    latest = {}
    for row in rows:
        key = (row.get("league"), row.get("home_team"), row.get("away_team"),
               row.get("market"), row.get("line"), row.get("selection"))
        latest.setdefault(key, row)
    return list(latest.values())


@app.get("/leagues")
def get_leagues():
    try:
        response = supabase.table("League").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/keep-alive")
def keep_alive():
    """
    Lightweight endpoint to wake up the server.
    """
    return {"status": "alive", "timestamp": datetime.now().isoformat()}

@app.post("/analyze")
def analyze_match(data: MatchData):
    """
    Analyzes match comments using Gemini.
    """
    try:
        result = analyze_match_comments(data.comments, data.stats_data, data.teams)
        if "error" in result:
             raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))

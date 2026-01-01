from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
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
from backend.scheduler import start_scheduler, run_scraper_job
from backend.status import get_status

# Lifespan context manager for startup tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the scheduler on app startup
    print("⏰ Starting Scheduler...")
    start_scheduler()
    yield
    # Shutdown logic if needed (scheduler shuts down with process)

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

def fetch_all_data(table_name, order_col=None, desc=False):
    all_rows = []
    chunk_size = 1000
    current_offset = 0
    
    while True:
        query = supabase.table(table_name).select("*")
        if order_col:
            query = query.order(order_col, desc=desc)
        
        # Using limit doesn't offset, range is cleaner here: range includes end index
        result = query.range(current_offset, current_offset + chunk_size - 1).execute()
        
        rows = result.data
        if not rows:
            break
            
        all_rows.extend(rows)
        
        if len(rows) < chunk_size:
            break
            
        current_offset += chunk_size
        
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
        data = fetch_all_data("matches")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/fixtures")
def get_fixtures():
    try:
        data = fetch_all_data("fixtures", "match_date", desc=False)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

@app.get("/scraper-status")
def scraper_status():
    """Returns the current status of the scraper job."""
    return get_status()

@app.post("/manual-scrape")
def manual_scrape(background_tasks: BackgroundTasks, league: Optional[str] = None):
    """
    Manually triggers the scraper job in the background.
    Useful for catching up on missing or rescheduled matches.
    """
    background_tasks.add_task(run_scraper_job, league)
    return {"status": "ok", "message": f"Scraper job started in background for {league if league else 'all leagues'}."}

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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv

# Import services
# Note: We need to ensure the services directory is in the python path or imported correctly.
# Since main.py is in backend/, and services is in backend/services/, this relative import works.
from backend.services.gemini_service import analyze_match_comments
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

app = FastAPI(title="Progetto Olanda 2.0 Backend")

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
    corners_data: Optional[Dict[str, str]] = None

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Progetto Olanda Backend is running"}

@app.get("/teams")
def get_teams():
    try:
        response = supabase.table("squads").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/matches")
def get_matches():
    try:
        response = supabase.table("matches").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/fixtures")
def get_fixtures():
    try:
        response = supabase.table("fixtures").select("*").order("match_date", desc=False).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/leagues")
def get_leagues():
    try:
        response = supabase.table("League").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
def analyze_match(data: MatchData):
    """
    Analyzes match comments using Gemini.
    """
    try:
        result = analyze_match_comments(data.comments, data.corners_data)
        if "error" in result:
             raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

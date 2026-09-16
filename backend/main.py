from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import threading
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv

# Import services
# Note: We need to ensure the services directory is in the python path or imported correctly.
# Since main.py is in backend/, and services is in backend/services/, this relative import works.
from backend.services.gemini_analyzer import analyze_match_comments
from backend.odds.domusbet import MARKETS as DOMUSBET_MARKETS
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

# One client PER THREAD, not one shared by all of them.
#
# FastAPI runs `def` endpoints in a threadpool, and the frontend fetches
# matches/fixtures/teams/leagues with Promise.all, so several of these run at the
# same instant on different threads. A single shared client means a single shared
# HTTP/2 connection, and HTTP/2 keeps a per-connection HPACK table for header
# compression: two threads writing headers onto it at once desynchronise that
# table and the server answers GOAWAY.
#
# The symptom is nasty because it is invisible serially. Measured 2026-09-09: six
# consecutive curls to /fixtures all returned 200, while firing the same five
# endpoints in parallel produced
#     ConnectionTerminated error_code:ErrorCodes.COMPRESSION_ERROR, last_stream_id:9
# on whichever ones lost the race - all reporting the SAME stream id, because one
# connection died and took every request on it with it. In the browser that
# rejects the Promise.all, so `matchData` stays empty and the app renders its
# "nothing to show" state, which reads as a bug in whatever screen you happen to
# be on rather than as a failed fetch.
#
# A thread-local client gives each threadpool thread its own connection and no
# shared compression state, and keeps the parallel fetch that the payload work
# was built around. Threads are reused, so this constructs a handful of clients,
# not one per request.
_clients = threading.local()


def get_supabase() -> Client:
    client = getattr(_clients, "client", None)
    if client is None:
        client = create_client(url, key)
        _clients.client = client
    return client

from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic can go here if needed
    yield
    # Shutdown logic if needed

app = FastAPI(title="Progetto Olanda 2.0 Backend", lifespan=lifespan)

# Compress before CORS so every response goes out gzipped.
#
# Render's proxy compresses on the way out, so production was already getting
# this and plain uvicorn was not: measured 2026-09-10, /matches was 393,005
# bytes deployed and 5,102,065 bytes on localhost - 13x - with /fixtures
# (963 KB) and /matches/analysis (807 KB) raw on top. That is the whole reason
# the first load feels slower on a dev machine than in production, and it read
# like a backend that had got slower.
#
# minimum_size skips the small payloads (/leagues, /keep-alive) where framing
# would cost more than it saves.
app.add_middleware(GZipMiddleware, minimum_size=1000)

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


def fetch_all_data(table_name, order_col=None, desc=False, columns="*", gte=None, in_=None):
    """Every row, paged. `gte` is an optional (column, value) floor and `in_` an
    optional (column, values) whitelist, both pushed to PostgREST so the rows are
    never fetched rather than filtered here."""
    all_rows = []
    chunk_size = 1000
    current_offset = 0
    
    while True:
        query = get_supabase().table(table_name).select(columns)
        if gte:
            query = query.gte(gte[0], gte[1])
        if in_:
            query = query.in_(in_[0], list(in_[1]))
        if order_col:
            query = query.order(order_col, desc=desc)
        # ALWAYS end on a unique column. Offset paging over an unordered - or
        # merely tie-heavy - result set is undefined: Postgres may return a row
        # on two pages and another on none. Measured on `matches` 2025/2026:
        # 5,053 rows fetched, 5,000 distinct, 53 duplicated and 53 never seen,
        # which reached the app as missing matches on every load.
        query = query.order("id")

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
    # domusbet's own identifier for the selection, so the bet slip can be handed
    # back to them as a link. NULL on everything captured before migration 007.
    "selection_ref",
])


# A fixture that kicked off recently is still on screen, and dropping its price
# mid-match would read as a regression. Six hours covers a match plus stoppage.
ODDS_LOOKBACK_HOURS = 6


# The markets a prediction exists for. Everything else in `odds_snapshots` is
# captured only so a slip can be built from it, and is served on request rather
# than to everyone - see get_odds.
MODELLED_MARKETS = sorted({name for name, _stat in DOMUSBET_MARKETS.values()})


@app.get("/odds")
def get_odds(market: str | None = None):
    """Current bookmaker prices for fixtures that have not finished.

    The table keeps every capture for closing-line value - 102,138 rows on
    2026-09-08 and growing by ~350 every three hours - but the app only ever
    looks up a fixture it is about to show. Serving the whole history cost
    2.4 MB and ~50 round trips on every page load, for roughly 3,000 useful
    rows, and `fetch_all_data` silently stops at 50,000 anyway.
    """
    cutoff = (datetime.now(timezone.utc)
              - timedelta(hours=ODDS_LOOKBACK_HOURS)).isoformat()
    # Default to the modelled markets only. The slip-only ones (multigol, GG/NG,
    # combos) are 75% of the table for upcoming fixtures - 28,995 rows of 38,675
    # measured on 2026-09-11 - and nobody sees them until they pick one from the
    # selector. Serving them to everyone would undo e22929c, which took this
    # endpoint from 2.4 MB and ~51 round trips down to 99 KB.
    wanted = [market] if market else MODELLED_MARKETS
    try:
        rows = fetch_all_data("odds_snapshots", "captured_at", desc=True,
                              columns=ODDS_COLUMNS, gte=("match_date", cutoff),
                              in_=("market", wanted))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Ordered newest first, so the first row seen for a key is the current one.
    latest = {}
    for row in rows:
        key = (row.get("league"), row.get("home_team"), row.get("away_team"),
               row.get("market"), row.get("line"), row.get("selection"))
        latest.setdefault(key, row)
    return list(latest.values())


@app.get("/odds/moves")
def get_odds_moves(market: str, days: int = 14):
    """First and closing price per priced line, for one market.

    The input to closing-line value: backend/odds/domusbet.py prune_history
    keeps exactly these two endpoints of every played price path. A fixture not
    yet played still has its whole path, and its "close" is simply the newest
    price so far - `final` says which one a row is.
    """
    if market not in MODELLED_MARKETS:
        raise HTTPException(status_code=400, detail=f"unknown market {market!r}")
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=min(max(days, 1), 60))).isoformat()
    try:
        rows = fetch_all_data("odds_snapshots", "captured_at",
                              columns="league,home_team,away_team,match_date,market,"
                                      "line,selection,price,captured_at,is_closing",
                              gte=("match_date", cutoff), in_=("market", [market]))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Ascending by capture, so the first row per key is the opening price.
    moves = {}
    for r in rows:
        key = (r["league"], r["home_team"], r["away_team"], r["match_date"],
               r["line"], r["selection"])
        m = moves.get(key)
        if m is None:
            m = moves[key] = {k: r[k] for k in ("league", "home_team", "away_team",
                                                  "match_date", "market", "line", "selection")}
            m["open"] = m["close"] = r["price"]
            m["opened_at"] = m["closed_at"] = r["captured_at"]
            m["_marked"] = False
        # The flagged close wins outright. Before prune_history has flagged a
        # played fixture, fall back to the last capture before kickoff: a later
        # one is a live price, not a close (see prune_history).
        if m["_marked"]:
            continue
        if r.get("is_closing") or r["captured_at"] < r["match_date"]:
            m["close"], m["closed_at"] = r["price"], r["captured_at"]
            m["_marked"] = bool(r.get("is_closing"))

    for m in moves.values():
        del m["_marked"]
        m["final"] = m["match_date"] < now.isoformat()
    return list(moves.values())


@app.get("/leagues")
def get_leagues():
    try:
        response = get_supabase().table("League").select("*").execute()
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

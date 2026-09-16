"""Capture betting prices from domusbet.it.

    python -m backend.odds.domusbet --tournaments        # discover league ids
    python -m backend.odds.domusbet --coverage           # which markets exist right now
    python -m backend.odds.domusbet --capture --json out.json
    python -m backend.odds.domusbet --capture --write    # needs migration 004

Why this source rather than the exchange: Betfair's Italian exchange - the only
one an Italian resident may legally use - carries no corner or card markets at
all (22 market types enumerated, all goals-derived). Italian bookmakers do carry
them, and Italian books share ADM-standardised event and market codes, so a
fixture here joins to the same fixture at another book with no fuzzy matching.

Access: the odds live on a JSON backend that serves plain HTTP requests. Only
the www edge is behind bot protection, so no browser is needed here. Keep the
request rate modest - one call per fixture is enough, see below.

TIMING MATTERS. Foul and card markets are not posted until match day: checked
across ten Serie A fixtures, every match kicking off that day carried team fouls
and some carried total fouls, while every match the following day carried none.
A nightly sweep would therefore capture zero foul prices. Capture has to run on
match day, a few hours out - which is also when prices are sharpest, so it suits
closing-line value anyway.
"""

import argparse
import datetime
import json
import os
import sys
import time
from collections import Counter

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from backend.odds.aliases import match_fixtures

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

BASE = "https://www.domusbet.it/XSportDatastore"
COMMON = {"systemCode": "DOMUSBET", "lingua": "IT", "hash": ""}
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.domusbet.it/xsportapp/xsport_desktop/",
}
FOOTBALL_SPORT_ID = 1

# Named market groups covering every statistic we model. Fetching these four is
# ~106 KB per fixture; asking for the whole event (idAggregata=-1) is 1.7-2.2 MB
# for the same handful of rows, because a fixture carries ~3,400 markets and we
# use six of them. At eight capture runs a day that is the difference between
# ~1 MB and ~17 MB of someone else's bandwidth per fixture per day.
#
# Goals also appear under "Principali", which is deliberately not fetched: it
# would duplicate every goals line for no new information.
#
# 206 (Cartellini) was missing until 2026-08-26, which is the entire reason the
# capture had never produced a single card price - not, as previously assumed,
# because the book does not post them. It does: 890 `U/O CARTELLINI (T.R.)` at
# lines 2.5-6.5, plus TOTALE / 1X2 / NUMERO CARTELLINI. A market that is mapped
# in MARKETS but sits in a group nobody fetches is invisible and silent, so
# check both when a market "does not exist".
#
# Finding it cost two Cloudflare lockouts. Do not scan for these: see the odds
# section of CLAUDE.md. Note 206 is adjacent to 205 - populated groups cluster,
# and only 23 of 300 ids return anything at all.
MARKET_GROUPS = {
    205: "Corner",
    206: "Cartellini",            # card points - only posted near kickoff
    252: "Statistiche Partita",   # fouls, shots, shots on target
    82: "Gol",
}

# Markets captured ONLY so a slip can be built and handed to domusbet. Nothing
# here is modelled, nothing carries an EV, and none of it belongs in STAT_SIGNAL.
#
# The group ids came from the app's own bootstrap - `xs_macrogruppi` in
# localStorage, read by driving the site once - NOT by scanning ids, which has
# been tried twice and ends in an escalating Cloudflare lockout. Football is
# sport 1 and has 28 prematch groups; these three are the ones that carry
# anything a person actually plays.
SLIP_GROUPS = {
    1: "Principali",     # 1X2, Doppia Chance, GG/NG
    230: "MultiGol",
    277: "Combo",
}

# code -> (market name, how to read the line)
#
#   "range" - a multigol band. `h` is BIT-PACKED, info2 << 16 | info1, which is
#             why the totals path sees "nonsense like 655.71": 131073 is 1-2 and
#             196610 is 2-3. Read `ia`, never `h / 100`. Two outcomes, ce=1 the
#             band happening and ce=2 it not.
#   "line"  - a combo against a goals line, `info1` times 100 as usual.
#   "plain" - no line at all.
#
# Outcome NAMES are the open piece: `eqs[].dsl` is null and the labels are not in
# the bootstrap either, so a combo's `ce` is stored as the book's own code. That
# is enough to build a slip - `selection_ref` carries it to domusbet - but not
# enough to render "1X + Over 2.5" in our own UI without a hand-written table.
# Multigol and GG/NG ARE named, because their outcomes are unambiguous.
SLIP_MARKETS = {
    18:    ("gg_ng", "plain"),
    9946:  ("multigol", "range"),
    13650: ("multigol_1h", "range"),
    13651: ("multigol_2h", "range"),
    13652: ("multigol_home", "range"),
    13653: ("multigol_away", "range"),
    425:   ("combo_1x2_ggng", "plain"),
    688:   ("combo_1x_ggng", "plain"),
    689:   ("combo_12_ggng", "plain"),
    690:   ("combo_x2_ggng", "plain"),
    15965: ("combo_1x2_ou", "line"),
    22297: ("combo_1x_ou", "line"),
    22298: ("combo_x2_ou", "line"),
    22299: ("combo_12_ou", "line"),
    12562: ("combo_ou_ggng", "line"),
}

# Outcome names, for markets whose shape names them without needing the book.
# Everything else is looked up in `outcome_names()` below.
SLIP_SELECTIONS = {
    "range": {1: "yes", 2: "no"},
}


# The book's own outcome names, read rather than guessed at.
#
# `eqs[].dsl` is null on every per-event response and the labels are not in the
# app's JS bundle either, which is why a combo's outcome used to be stored as the
# raw code ("1", "2") and why combos were kept out of the UI entirely - "selection
# 1" is not something anyone can bet on knowingly.
#
# They are in the app's OWN bootstrap. `getStaticData` with empty signatures
# returns the full aggregate catalogue, and each aggregate carries the markets it
# displays: `ags["1"].pr[].scs[]` is a market, `.eas[]` its outcomes as
# `{ce, ds}`. Football is sport 1. The same market appears under several
# aggregates with different subsets of its outcomes - `combo_ou_ggng` names two
# under one and four under another - so the map is a UNION over all of them, not
# the first hit.
#
# Lower-cased to match the vocabulary already stored ("over", "under", "gg"), so
# gg_ng keeps writing exactly what it wrote before and `odds_snapshot_uniq` does
# not see a new identity for a row that has not changed.
_OUTCOME_NAMES = None


def outcome_names():
    """(market code, esito code) -> the book's own name for that outcome."""
    global _OUTCOME_NAMES
    if _OUTCOME_NAMES is not None:
        return _OUTCOME_NAMES

    _OUTCOME_NAMES = {}
    try:
        # Empty signatures mean "I have nothing cached", so it answers in full.
        # systemCode / lingua / hash already ride along in COMMON.
        data = get("getStaticData", signatureAggregate="", signatureMacrogruppi="",
                   signatureConfiguration="", signatureLabels="",
                   betTemplatesSignature="", localStorageVersion="", isMobile="false")
        sport = json.loads((data or {}).get("aggr") or "{}").get("ags", {})
        for aggregate in (sport.get(str(FOOTBALL_SPORT_ID)) or {}).get("pr") or []:
            for market in aggregate.get("scs") or []:
                for esito in market.get("eas") or []:
                    name = " ".join(str(esito.get("ds") or "").split()).lower()
                    if name:
                        _OUTCOME_NAMES.setdefault((market.get("cs"), esito.get("ce")), name)
    except (requests.RequestException, ValueError) as exc:
        # Not fatal: an unnamed outcome falls back to the book's code, which is
        # exactly the behaviour that shipped before this existed. Losing a whole
        # capture window over a cosmetic lookup would be the worse trade.
        print(f"  note: outcome names unavailable ({exc}); selections keep their codes",
              file=sys.stderr)
    return _OUTCOME_NAMES

ALL_MARKETS = -1                  # only used by --coverage, which wants everything
REQUEST_PAUSE = 1.0

# Market codes are ADM-standardised, so these are the same numbers at other
# Italian books - verified against Snai, where 975 and 15481 mean the same
# things. Only the markets the model can actually use are listed; a fixture
# carries thousands, and storing all of them would be noise.
MARKETS = {
    975: ("total_corners", "corners"),
    13880: ("total_fouls", "fouls"),
    # 890 is `U/O INFO1 CARTELLINI (T.R.)`, posted at 2.5-6.5. The previous
    # code here, 31347, is not a market this book offers - which is why the
    # capture had never produced a single card price, and why that read as
    # "cards are only posted near kickoff" like fouls. They are not: cards were
    # on the board 13h before kickoff, among 3,790 markets on the fixture.
    #
    # It settles on POINTS, not on a count - yellow 1, red 2, a second yellow
    # that becomes a red 3 - so it is mapped to `card_points`, not to
    # `yellow_cards`. Pricing a yellow-only estimate against it is biased low.
    890: ("total_card_points", "card_points"),
    15481: ("total_shots_on_target", "shots_on_target"),
    15859: ("total_shots", "shots"),
    7989: ("total_goals", "goals"),
}
# esito code -> selection name, for two-way over/under markets.
SELECTIONS = {1: "under", 2: "over"}

# (country, tournament) exactly as domusbet names them in Italian, mapped to our
# `matches.league` values. Exact rather than substring: "serie a" alone matches a
# dozen countries' top divisions, and "liga" matches Bundesliga, LaLiga 2 and
# Liga Portugal all at once.
LEAGUE_TOURNAMENTS = {
    ("italia", "serie a"): "Serie A",
    ("italia", "serie b"): "Serie B",
    ("inghilterra", "premier league"): "Premier League",
    ("spagna", "laliga"): "La Liga",
    ("germania", "bundesliga"): "Bundesliga",
    ("francia", "ligue 1"): "Ligue 1",
    ("olanda", "eredivisie"): "Eredivisie",
    ("olanda", "eerste divisie"): "Eerste Divisie",
    ("brasile", "brasileiro serie a"): "Serie A Betano",
    ("portogallo", "liga portugal"): "Liga Portugal",
    ("inghilterra", "championship"): "Championship",
    ("germania", "2. bundesliga"): "2. Bundesliga",
    ("spagna", "laliga 2"): "LaLiga 2",
    ("francia", "ligue 2"): "Ligue 2",
    ("turchia", "super lig"): "Super Lig",
    # domusbet calls it "Pro League", diretta calls it "Jupiler League"; the
    # key is how THIS book spells it (categoryId=33, tournamentId=38).
    ("belgio", "pro league"): "Jupiler League",
    # Read from the live tournament list, not guessed: Scozia categoryId=22
    # tournamentId=54, Norvegia categoryId=5 tournamentId=5.
    ("scozia", "premiership"): "Premiership",
    ("norvegia", "eliteserien"): "Eliteserien",
}
# Belt and braces: these qualifiers never appear in the senior men's league name,
# so anything carrying one is a different competition even on an exact match.
EXCLUDE = ("femminil", "u21", "u19", "u23", "primavera", "youth", "riserve", "amichevol")


# One session, with connection-error retries, shared by every HTTP call here.
#
# On 2026-08-24 the 21:00 capture fetched 189 prices and then died on a single
# getaddrinfo() for the Supabase host: WSL2 proxies DNS through the Windows host,
# and that proxy drops resolution whenever the host's network changes - 21 such
# failures in the kernel log across four days. One un-retried lookup cost a whole
# window, and windows cannot be backfilled.
#
# `connect` retries are the ones that matter: urllib3 raises NameResolutionError
# while connecting, which counts against them. Four attempts with a factor-3
# backoff span ~40s (measured), which covers a blip and not an outage - an outage
# is meant to fail the run rather than hold the window open.
#
# POST is in allowed_methods deliberately. The only POST here is the write, and
# it carries `Prefer: resolution=merge-duplicates` against `odds_snapshot_uniq`,
# so replaying it cannot duplicate a row.
def _session():
    retry = Retry(total=4, connect=4, read=2, status=2, backoff_factor=3,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset({"GET", "POST"}),
                  raise_on_status=False)
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


SESSION = _session()


def get(path, **params):
    resp = SESSION.get(f"{BASE}/{path}", headers=HEADERS,
                       params={**COMMON, **params}, timeout=90)
    resp.raise_for_status()
    if not resp.content[:1] in (b"{", b"["):
        return None
    return resp.json()


def tournaments():
    """(league, category_id, tournament_id, name) for every football tournament."""
    menu = get("getMenuPrematch")
    if not menu:
        sys.exit("getMenuPrematch returned no JSON")
    football = next((s for s in menu.get("sps", []) if s.get("id") == FOOTBALL_SPORT_ID), None)
    if not football:
        sys.exit("No football section in the menu")

    out = []
    for category in football.get("cts", []):
        for tour in category.get("tns", []):
            name = (tour.get("dsl") or {}).get("IT", "")
            cat_name = (category.get("dsl") or {}).get("IT", "")
            combined = f"{cat_name} {name}".lower()
            league = None
            if not any(x in combined for x in EXCLUDE):
                league = LEAGUE_TOURNAMENTS.get((cat_name.strip().lower(), name.strip().lower()))
            out.append((league, category.get("id"), tour.get("id"), f"{cat_name} / {name}"))
    return out


def our_leagues():
    """One (league, category, tournament) per configured league."""
    found = {}
    for league, cat, tour, name in tournaments():
        if league and league not in found:
            found[league] = (cat, tour, name)
    missing = set(LEAGUE_TOURNAMENTS.values()) - set(found)
    if missing:
        # Loudly, because a silently missing league looks identical to a league
        # with no fixtures this week.
        print(f"  note: no tournament matched for {', '.join(sorted(missing))}", file=sys.stderr)
    return found


def events(category_id, tournament_id):
    data = get("getTorneoCentrale", sportId=FOOTBALL_SPORT_ID,
               categoryId=category_id, tournamentId=tournament_id, idAggregata=2944)
    return (data or {}).get("avs") or []


def event_markets(pal, avv, groups=None):
    """The markets we model for one fixture, merged across named groups.

    Deduplicated on (market, line, selection): a group boundary should never
    change a price, but if two groups ever disagree we keep the first rather
    than storing the same quote twice.
    """
    merged, seen = [], set()
    for group in (groups or MARKET_GROUPS):
        payload = get("getEventoPerMacrogruppo", pal=pal, avv=avv,
                      idMacrogruppo=group, isLive="false")
        for market in (payload or {}).get("scs") or []:
            for esito in market.get("eqs") or []:
                key = (market.get("cs"), market.get("h"), esito.get("ce"))
                if key in seen:
                    continue
                seen.add(key)
                merged.append({**market, "eqs": [esito]})
        time.sleep(REQUEST_PAUSE)
    return {"scs": merged}


def event_markets_all(pal, avv):
    """Every market for a fixture. Used by --coverage, which is a discovery tool."""
    return get("getEvento", pal=pal, avv=avv, idAggregata=ALL_MARKETS, isLive="false")


def parse_kickoff(ts):
    """'20260822 18:30:00' -> an ISO timestamp, or None.

    Stored as a real timestamp rather than the raw string so these rows can be
    joined to `matches` on date, and so the price path into kickoff is sortable.
    """
    try:
        return datetime.datetime.strptime(ts, "%Y%m%d %H:%M:%S").isoformat()
    except (ValueError, TypeError):
        return None


def season_for(kickoff_iso, league):
    """The season label this fixture belongs to, matching `matches.season`.

    Reuses the scraper's own rule rather than restating it: split leagues run
    Aug-May and are labelled "2025/2026", Brazil plays inside one calendar year
    and is labelled "2026". Getting this wrong would silently detach every price
    from the matches it prices.
    """
    if not kickoff_iso:
        return None
    date = datetime.date.fromisoformat(kickoff_iso[:10])
    if league == "Serie A Betano":          # calendar-year season
        return str(date.year)
    # July is the cut-over, exactly as backend/scraper/config.current_season does.
    start = date.year if date.month >= 7 else date.year - 1
    return f"{start}/{start + 1}"


def event_teams(event):
    """Home and away as domusbet names them, for the alias match at ingest.

    These used to come out of the `seo` field as a URL slug ("lecce-vs-monza").
    That field DISAPPEARED from getTorneoCentrale around 2026-09-09 and the
    KeyError was swallowed by a bare `except`, so every fixture resolved to
    ("", "") and every price was dropped as unmatched. Capture wrote 0 rows for
    two days while `odds_check.sh` reported `ok` on every run - the last stored
    price was 2026-09-09 13:03. Those windows are gone; prices cannot be
    backfilled.

    `dsl.IT` carries the same thing as "Lecce - Monza". Display names rather than
    slugs, which the alias match does not care about: `normalise()` strips spaces
    and hyphens alike, so "Queens Park Rangers" and "queens-park-rangers" both
    reach `queensparkrangers` and the EXONYMS table still applies.

    Returning ("", "") on a shape we do not recognise is deliberate - those rows
    drop as unmatched, which is the documented behaviour for a price that cannot
    be joined. But it must be LOUD at the call site rather than silent, which is
    what cost two days here.
    """
    dsl = event.get("dsl") or {}
    name = dsl.get("IT") or dsl.get("ORIGINAL_FROM_DB") or ""
    home, sep, away = name.partition(" - ")
    if sep:
        return home.strip(), away.strip()
    # If the book ever puts `seo` back, take it rather than dropping the fixture.
    try:
        slug = json.loads(event["seo"])["DEFAULT"]["IT"].split("/")[-1]
        h, _, a = slug.partition("-vs-")
        return h, a
    except Exception:
        return "", ""


def unpack_range(market):
    """The multigol band as (low, high), read from `ia` rather than from `h`.

    `h` packs the two ends into one integer - info2 << 16 | info1 - so 131073 is
    the 1-2 band and 196610 is 2-3. Dividing that by 100 is exactly the "nonsense
    like 655.71" the totals path already guards against; these markets have to
    read `ia` instead.
    """
    ia = market.get("ia") or {}
    lo, hi = ia.get("info1"), ia.get("info2")
    if lo is None or hi is None or hi < lo:
        return None
    return lo, hi


def slip_rows(event, market, league, season, home, away, kickoff):
    """Rows for a market we capture only so a slip can be built from it.

    Deliberately separate from `parse`'s totals path. These carry no statistic,
    never reach a model, and must never be mistaken for something with an EV -
    `stat` is None precisely so a caller that assumes one fails loudly.
    """
    entry = SLIP_MARKETS.get(market.get("cs"))
    if not entry:
        return []
    name, shape = entry

    band = None
    if shape == "range":
        band = unpack_range(market)
        if not band:
            return []
        # NOT into `line`: that column is numeric, and "1-2" fails the insert -
        # which PostgREST rejects atomically, so one band takes the whole batch
        # with it (32,923 prices lost to `invalid input syntax for type numeric`
        # on the first attempt). A band is not a line anyway; it is part of which
        # outcome this is, so it belongs with the selection.
        line = None
    elif shape == "line":
        info1 = (market.get("ia") or {}).get("info1")
        if not info1:
            return []
        line = info1 / 100
        if not (0 < line < 100):
            return []
    else:
        line = None

    names = SLIP_SELECTIONS.get(name) or SLIP_SELECTIONS.get(shape) or {}
    book_names = outcome_names()
    rows = []
    for esito in market.get("eqs") or []:
        price = (esito.get("q") or 0) / 100
        # A price of 1.01 or less is a suspended or placeholder selection, not a
        # quote. Note `<=`, not `<`: combo markets are padded with EXACTLY 1.01,
        # so the strict test kept every one of them - 8,040 of 26,264 stored
        # combo rows, 31%, were padding that this comment claimed was filtered.
        # Scoped to the slip path on purpose: multigol and gg_ng have no 1.01
        # rows at all, while the modelled markets have 467 that are genuine
        # quotes on extreme lines, and those are in the priced history.
        if price <= 1.01:
            continue
        ce = esito.get("ce")
        selection = names.get(ce) or book_names.get((market.get("cs"), ce)) or str(ce)
        if band:
            # Only the band HAPPENING is worth storing. ce=2 is "not 1-2", which
            # nobody plays and which the book prices at a flat 1.01 placeholder
            # anyway. ce=1 is the yes side - unambiguous from monotonicity, since
            # a wider band is strictly likelier and the price falls accordingly
            # (1-2 at 1.89, 1-3 at 1.34, 1-4 at 1.13, 1-5 at 1.06).
            if ce != 1:
                continue
            # "yes" is implied once the no side is gone, so the band alone names it.
            selection = f"{band[0]}-{band[1]}"
        rows.append({
            "league": league, "season": season, "home": home, "away": away,
            "kickoff": kickoff, "market": name, "stat": None, "line": line,
            "selection": selection, "price": price,
            "source": "domusbet", "pal": event.get("p"), "avv": event.get("a"),
            "selection_ref": selection_ref(event, market, esito),
        })
    return rows


def selection_ref(event, market, esito):
    """This selection as domusbet's own betslip link spells it.

    Their web app loads a slip straight from a URL - `/betslip?selectionsData=`
    with legs joined by `|` - and one leg is

        <pal>_<avv>_<marketCode>_<handicap>_<esito>_<isLive>

    `handicap` is `market["h"]`, the line already times 100, which is exactly what
    the URL wants - so it is taken raw rather than from the divided `line`.
    Verified 2026-09-11: a three-leg URL built this way produced the right treble
    with all three fixtures in the slip. Note `|` is the only separator that
    works; `;`, `,` and `-` silently load the first leg alone.

    Stored assembled rather than as five columns - nothing needs the parts.
    """
    return "_".join(str(x) for x in (
        event.get("p"), event.get("a"), market.get("cs"), market.get("h"),
        esito.get("ce"), "true" if event.get("lv") else "false",
    ))


def parse(event, payload, league):
    """Odds rows for the markets we model. Ignores everything else."""
    if not payload:
        return []
    home, away = event_teams(event)

    kickoff = parse_kickoff(event.get("ts", ""))
    season = season_for(kickoff, league)
    rows = []
    for market in payload.get("scs") or []:
        if market.get("cs") in SLIP_MARKETS:
            rows += slip_rows(event, market, league, season, home, away, kickoff)
            continue
        entry = MARKETS.get(market.get("cs"))
        if not entry:
            continue
        market_name, stat = entry
        # `h` is the line times 100. Team-level markets encode the side in the
        # high bits, giving nonsense like 655.71 - those are dropped rather than
        # guessed at, since we only model match totals.
        line = market.get("h", 0) / 100
        if not (0 < line < 100):
            continue
        for esito in market.get("eqs") or []:
            price = (esito.get("q") or 0) / 100
            selection = SELECTIONS.get(esito.get("ce"))
            # A zero price is a suspended selection, not a real quote.
            if not selection or price < 1.01:
                continue
            rows.append({
                "league": league, "season": season, "home": home, "away": away,
                "kickoff": kickoff, "market": market_name, "stat": stat, "line": line,
                "selection": selection, "price": price,
                "source": "domusbet", "pal": event.get("p"), "avv": event.get("a"),
                "selection_ref": selection_ref(event, market, esito),
            })
    return rows


def within_window(event, hours):
    """True if the fixture kicks off inside the window and has not started.

    Prices only matter before kickoff, and they move most as it approaches.
    Capturing fixtures a fortnight out on every run would be mostly re-reading
    numbers that have not changed.
    """
    kickoff = parse_kickoff(event.get("ts", ""))
    if not kickoff:
        return False
    when = datetime.datetime.fromisoformat(kickoff)
    now = datetime.datetime.now()
    return now <= when <= now + datetime.timedelta(hours=hours)


def capture(limit_leagues=None, hours=72, slip_markets=False):
    """Prices for the modelled markets, plus optionally the slip-only ones.

    `slip_markets` is OFF for the three-hourly cron on purpose. Prices move and
    have to be re-read; the slip markets are wanted for their IDENTIFIERS, and a
    combo's (cs, h, ce) does not move at all. Re-fetching three more groups per
    fixture eight times a day would triple the capture for data that is stable -
    run it occasionally instead.
    """
    leagues = our_leagues()
    if limit_leagues:
        leagues = {k: v for k, v in leagues.items() if k in limit_leagues}
    all_rows, summary = [], []

    for league, (cat, tour, name) in sorted(leagues.items()):
        evs = [e for e in events(cat, tour) if within_window(e, hours)]
        rows_here, with_fouls = [], 0
        for ev in evs:
            groups = {**MARKET_GROUPS, **SLIP_GROUPS} if slip_markets else None
            payload = event_markets(ev["p"], ev["a"], groups)
            got = parse(ev, payload, league)
            rows_here += got
            if any(r["market"] == "total_fouls" for r in got):
                with_fouls += 1
        all_rows += rows_here
        summary.append((league, name, len(evs), len(rows_here), with_fouls))

    print(f"{'league':16}{'events':>7}{'prices':>8}{'w/fouls':>9}  tournament")
    for league, name, n_ev, n_rows, n_fouls in summary:
        print(f"{league:16}{n_ev:>7}{n_rows:>8}{n_fouls:>9}  {name[:44]}")
    print(f"\n{len(all_rows)} prices total")
    per_market = Counter(r["market"] for r in all_rows)
    for m, n in per_market.most_common():
        print(f"   {m:<24}{n:>6}")
    return all_rows


def our_fixtures():
    """Our own upcoming fixtures, for resolving the bookmaker's team names."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        return []
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows, offset = [], 0
    while True:
        resp = SESSION.get(
            f"{url}/rest/v1/fixtures?select=league,home_team,away_team,match_date"
            f"&limit=1000&offset={offset}", headers=headers, timeout=60)
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        rows += page
        offset += len(page)
    return rows


def resolve_team_names(rows, fixtures):
    """Rewrite the bookmaker's team names to the ones our database uses.

    Identity is resolved here, at ingest, rather than every time something reads
    the table. The bookmaker's slugs are inconsistent - "lipsia" but "mainz",
    "amburgo" but "borussia-dortmund" - against diretta's Italian names, so only
    about half match on the string alone. Matching the fixture SETS for a league
    and day instead resolves ~96%, because the alternatives disambiguate.

    A one-day tolerance is allowed: a late Brazilian kickoff lands on different
    calendar days in the two sources.

    Rows whose fixture cannot be resolved are dropped. An unjoinable price is
    worse than no price - it would sit in the table looking like data.
    """
    from collections import defaultdict
    by_league_day = defaultdict(set)
    for r in rows:
        if r.get("kickoff"):
            by_league_day[(r["league"], r["kickoff"][:10])].add((r["home"], r["away"]))

    mapping = {}
    for (league, day), pairs in by_league_day.items():
        candidates = set()
        for f in fixtures:
            if f["league"] != league or not f.get("match_date"):
                continue
            delta = abs(
                datetime.date.fromisoformat(f["match_date"][:10])
                - datetime.date.fromisoformat(day)
            ).days
            if delta <= 1:
                candidates.add((f["home_team"], f["away_team"]))
        for their, ours in match_fixtures(sorted(pairs), sorted(candidates)).items():
            mapping[(league, their[0], their[1])] = ours

    resolved, dropped = [], 0
    for r in rows:
        hit = mapping.get((r["league"], r["home"], r["away"]))
        if not hit:
            dropped += 1
            continue
        resolved.append({**r, "home": hit[0], "away": hit[1]})
    return resolved, dropped


def write_rows(rows):
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    payload = [{
        "league": r["league"], "season": r["season"],
        "home_team": r["home"], "away_team": r["away"],
        "match_date": r["kickoff"], "market": r["market"], "line": r["line"],
        "selection": r["selection"], "price": r["price"],
        "source": "domusbet", "bookmaker": "domusbet", "is_closing": False,
        # domusbet's own id for this selection, so the app can hand the slip back
        # to them as a link. Needs migration 007.
        "selection_ref": r.get("selection_ref"),
    } for r in rows]
    written = 0
    for i in range(0, len(payload), 500):
        chunk = payload[i:i + 500]
        resp = SESSION.post(f"{url}/rest/v1/odds_snapshots", headers=headers,
                            json=chunk, timeout=120)
        # `selection_ref` needs migration 007. Without it PostgREST rejects the
        # whole batch, and a capture window cannot be backfilled - so drop the
        # column and write the prices rather than lose them. Loudly: the betslip
        # hand-off stays unavailable until the migration is run.
        if resp.status_code >= 400 and "selection_ref" in resp.text:
            print("  ⚠️  odds_snapshots has no `selection_ref` column - run "
                  "migrations/007_add_selection_ref.sql. Writing prices without it.",
                  file=sys.stderr, flush=True)
            chunk = [{k: v for k, v in r.items() if k != "selection_ref"} for r in chunk]
            resp = SESSION.post(f"{url}/rest/v1/odds_snapshots", headers=headers,
                                json=chunk, timeout=120)
        if resp.status_code >= 400:
            sys.exit(f"Write failed ({resp.status_code}): {resp.text[:300]}")
        written += len(chunk)
    return written


# Slip-only prices are kept for UPCOMING fixtures only.
#
# The asymmetry with the modelled markets is the whole point, and getting it
# backwards would be expensive in opposite directions:
#
#   * the modelled prices (MARKETS) must NEVER be pruned. They only become
#     evidence once the match is played - priceComparison.mjs joins each one to
#     the outcome to score CLV and ROI - and a price that existed three hours
#     ago cannot be re-fetched. Deleting on kickoff would destroy the dataset at
#     the exact moment it turns useful.
#   * the slip-only ones (SLIP_MARKETS) are the mirror image. Nothing models
#     them: no STAT_SIGNAL entry, no fitted half-life, no EV, and both
#     priceComparison.mjs and marketBlend.mjs skip any market with no
#     MARKET_FOR_STAT entry. They exist so a slip can be built for a fixture
#     that has not kicked off, and `get_odds` already floors on
#     ODDS_LOOKBACK_HOURS, so after kickoff they have no reader at all - while
#     costing ~33,000 rows per sweep against the modelled markets' ~350.
#
# Without this the slip capture cannot be automated: at 33k rows a run it would
# outgrow the entire table in a day. With it the slip rows reach a steady state
# of roughly one capture window instead of accumulating forever.
SLIP_PRUNE_AFTER_HOURS = 6   # same grace as ODDS_LOOKBACK_HOURS in backend/main.py


def prune_slip(hours=SLIP_PRUNE_AFTER_HOURS):
    """Delete slip-only prices for fixtures that have already been played."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
    # Derived from SLIP_MARKETS rather than written out, so a market added there
    # is pruned automatically. A hand-kept second list is how the three league
    # lists in this project drifted apart.
    markets = sorted({name for name, _shape in SLIP_MARKETS.values()})
    cutoff = (datetime.datetime.now(datetime.timezone.utc)
              - datetime.timedelta(hours=hours)).isoformat()
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Prefer": "return=minimal,count=exact"}
    params = {"match_date": f"lt.{cutoff}", "market": f"in.({','.join(markets)})"}
    resp = SESSION.delete(f"{url}/rest/v1/odds_snapshots", headers=headers,
                          params=params, timeout=120)
    if resp.status_code >= 400:
        sys.exit(f"Prune failed ({resp.status_code}): {resp.text[:300]}")
    # PostgREST reports the affected count in Content-Range as `*/N`.
    count = (resp.headers.get("content-range") or "*/?").split("/")[-1]
    print(f"pruned {count} slip-only rows for fixtures played before {cutoff[:16]}",
          flush=True)
    print(f"   markets: {', '.join(markets)}")
    return count


# How long after kickoff before the price PATH is collapsed. Generous: the match
# must be settled and any closing extract already taken.
HISTORY_PRUNE_AFTER_HOURS = 48
# Marking runs on a SHORTER clock than deleting, and the gap is the point:
# 72,921 rows had kicked off more than 6h ago against 61,736 more than 48h ago
# (2026-09-16), so tying `is_closing` to the delete window would leave 11,185
# rows unmarked for a day. `is_closing = false` then means both "not a close" and
# "not looked at yet", and a query filtering on it silently loses the newest
# fixtures - the same shape as reading a missing value as a measured zero.
CLOSING_MARK_AFTER_HOURS = 6   # matches ODDS_LOOKBACK_HOURS in backend/main.py


def prune_history(hours=HISTORY_PRUNE_AFTER_HOURS, write=False, leagues=None):
    """Collapse the modelled price path to its two endpoints, per priced line.

    `odds_snapshots` is append-only and captures every three hours within 72h of
    kickoff, so a single (fixture, market, line, selection) accumulates ~8.8
    snapshots - 148,678 modelled rows over 16,940 distinct prices, measured
    2026-09-16. The middle of that path has no reader: `/odds` serves only
    unfinished fixtures and dedups to the newest, and every experiment reads the
    closing extract.

    So the middle goes and the ENDPOINTS stay - the first price we ever saw and
    the last before kickoff. Keeping both is the whole point: closing-line value
    is the price you could have taken measured against the close, and with only
    the close it cannot be computed at all. The extra cost is ~17,000 rows.

    This is irreversible - a price that existed three hours ago cannot be
    re-fetched - so it is a dry run unless `--write` is passed, and it never
    touches the slip-only markets (`--prune-slip` owns those) or a fixture that
    has not been played.
    """
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = (now - datetime.timedelta(hours=hours)).isoformat()
    mark_cutoff = (now - datetime.timedelta(hours=CLOSING_MARK_AFTER_HOURS)).isoformat()
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    slip = sorted({name for name, _shape in SLIP_MARKETS.values()})

    # Paged on `id`. Ending on a short page is wrong (PostgREST caps at 1000)
    # and paging an UNORDERED result is undefined in Postgres - that pair once
    # returned 5,053 rows for 5,000 distinct matches.
    rows, offset = [], 0
    while True:
        resp = SESSION.get(
            f"{url}/rest/v1/odds_snapshots", headers=headers, timeout=120,
            params={"select": "id,league,home_team,away_team,match_date,market,line,"
                              "selection,captured_at,is_closing",
                    "match_date": f"lt.{mark_cutoff}",
                    # Derived from SLIP_MARKETS, not a name pattern: `--prune-slip`
                    # owns those rows and deletes them outright, and a hand-kept
                    # second list is how the three league lists here drifted apart.
                    "market": f"not.in.({','.join(slip)})",
                    **({"league": f"in.({','.join(leagues)})"} if leagues else {}),
                    "order": "id", "limit": 1000, "offset": offset})
        if resp.status_code >= 400:
            sys.exit(f"Read failed ({resp.status_code}): {resp.text[:300]}")
        page = resp.json()
        if not page:
            break
        rows += page
        offset += len(page)

    paths, flags = {}, {}
    for r in rows:
        flags[r["id"]] = r.get("is_closing")
        k = (r["league"], r["home_team"], r["away_team"], r["match_date"],
             r["market"], r["line"], r["selection"])
        paths.setdefault(k, []).append((r["captured_at"], r["id"]))

    # The last snapshot BEFORE KICKOFF, not the last one full stop. `get_odds`
    # keeps serving a price for six hours after kickoff so a match in progress
    # does not blank, so a capture can land after the whistle - and that is a
    # live price, not a close. Taking max(captured_at) blindly retains it and
    # deletes the real closing price as a "middle": it happened, on 1,298 of
    # 39,916 closing prices (3.3%), which then read as the OPENING price. If no
    # snapshot precedes kickoff, keep the last one there is rather than nothing.
    doomed, to_mark = [], []
    for (_lg, _h, _a, kickoff, *_rest), snaps in paths.items():
        snaps.sort()
        before = [s for s in snaps if s[0] < kickoff]
        closing_id = (before or snaps)[-1][1]
        # `is_closing` has existed since migration 004, with its own index, and
        # nothing ever set it. Set it HERE, where the closing row is already
        # identified in order to decide what to keep: one computation, one
        # writer. A second pass computing the same thing is how the three league
        # lists in this project drifted apart.
        if not flags.get(closing_id):
            to_mark.append(closing_id)
        # Deleting is on the longer clock, so a fixture inside the mark window
        # but not the prune window keeps its whole path and still gets flagged.
        if kickoff >= cutoff:
            continue
        keep = {snaps[0][1], closing_id}
        doomed += [i for _when, i in snaps if i not in keep]

    print(f"{len(rows):,} modelled snapshots, fixtures kicked off before {mark_cutoff[:16]}")
    print(f"   {len(paths):,} distinct prices, {len(rows) / max(len(paths), 1):.1f} snapshots each")
    print(f"   marking {len(to_mark):,} rows is_closing")
    print(f"   deleting {len(doomed):,} middles, paths older than {cutoff[:16]} "
          f"({100 * len(doomed) / max(len(rows), 1):.0f}%)")
    if not write:
        print("\nNothing written. Re-run with --write.")
        return 0

    marked = 0
    for i in range(0, len(to_mark), 200):
        batch = to_mark[i:i + 200]
        resp = SESSION.patch(f"{url}/rest/v1/odds_snapshots",
                             headers={**headers, "Prefer": "return=minimal",
                                      "Content-Type": "application/json"},
                             params={"id": f"in.({','.join(map(str, batch))})"},
                             json={"is_closing": True}, timeout=120)
        if resp.status_code >= 400:
            sys.exit(f"Mark failed ({resp.status_code}): {resp.text[:300]}")
        marked += len(batch)
        if marked % 10000 < 200:
            print(f"   marked {marked:,}/{len(to_mark):,}", flush=True)
    if to_mark:
        print(f"marked {marked:,} closing prices")

    deleted = 0
    for i in range(0, len(doomed), 200):
        batch = doomed[i:i + 200]
        resp = SESSION.delete(f"{url}/rest/v1/odds_snapshots",
                              headers={**headers, "Prefer": "return=minimal"},
                              params={"id": f"in.({','.join(map(str, batch))})"},
                              timeout=120)
        if resp.status_code >= 400:
            sys.exit(f"Delete failed ({resp.status_code}): {resp.text[:300]}")
        deleted += len(batch)
        # Every 10k, not every batch: `\r` becomes one enormous line in the odds
        # log, which is a file and not a terminal.
        if deleted % 10000 < 200:
            print(f"   deleted {deleted:,}/{len(doomed):,}", flush=True)
    print(f"\ndeleted {deleted:,} intermediate snapshots")
    return deleted


def coverage():
    """Which of our markets are actually posted right now, by kickoff day."""
    leagues = our_leagues()
    print(f"{len(leagues)}/{len(LEAGUE_TOURNAMENTS)} leagues matched to a tournament\n")
    print(f"{'league':16}{'kickoff':<18}{'match':<30}" +
          "".join(f"{m[:9]:<11}" for m, _ in MARKETS.values()))
    for league, (cat, tour, _) in sorted(leagues.items()):
        for ev in events(cat, tour)[:4]:
            payload = event_markets_all(ev["p"], ev["a"])
            codes = Counter(m["cs"] for m in (payload or {}).get("scs") or [])
            try:
                slug = json.loads(ev["seo"])["DEFAULT"]["IT"].split("/")[-1][:28]
            except Exception:
                slug = "?"
            cells = "".join(("yes" if codes.get(c) else "-").ljust(11) for c in MARKETS)
            print(f"{league:16}{ev.get('ts',''):<18}{slug:<30}{cells}")
            time.sleep(REQUEST_PAUSE)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--tournaments", action="store_true", help="list football tournaments")
    group.add_argument("--coverage", action="store_true", help="which markets are posted now")
    group.add_argument("--capture", action="store_true", help="collect prices")
    group.add_argument("--prune-slip", action="store_true",
                       help="delete slip-only prices (multigol, GG/NG, combos) for "
                            "fixtures already played. Never touches the modelled "
                            "markets: those are the closing-line history and only "
                            "become useful after the match.")
    group.add_argument("--prune-history", action="store_true",
                       help="collapse the modelled price path for played fixtures to "
                            "its endpoints - the first price seen and the closing one. "
                            "The middle has no reader; the two ends are what closing-line "
                            "value needs. Dry run unless --write.")
    parser.add_argument("--slip-markets", action="store_true",
                        help="also collect the markets we do not model (1X2, GG/NG, "
                             "multigol, combos) so a slip can be built from them. Off "
                             "by default: these are wanted for their identifiers, which "
                             "do not move, so they do not need the price cadence.")
    parser.add_argument("--league", action="append", help="limit to these leagues")
    parser.add_argument("--no-resolve", action="store_true",
                        help="keep the bookmaker's team names instead of ours")
    parser.add_argument("--within", type=int, default=72, metavar="HOURS",
                        help="only fixtures kicking off within this many hours (default 72)")
    parser.add_argument("--json", metavar="PATH", help="write captured rows as JSON")
    parser.add_argument("--write", action="store_true", help="write to odds_snapshots")
    args = parser.parse_args()

    # One line per run, so a log that several runs have appended to can be split
    # back into runs. flush=True is load-bearing: stdout is block-buffered when
    # redirected to a file while the traceback goes to stderr unbuffered, so a
    # crashing run writes its traceback BEFORE its own buffered output. Without
    # this marker the 21:00 failure on 2026-08-24 looked like a failed run
    # followed by a successful one - it was a single run, printing out of order.
    print(f"=== run {datetime.datetime.now():%Y-%m-%d %H:%M:%S}"
          f" {' '.join(sys.argv[1:])} ===", flush=True)

    if args.tournaments:
        rows = tournaments()
        matched = [r for r in rows if r[0]]
        print(f"{len(rows)} football tournaments, {len(matched)} matched to our leagues\n")
        for league, cat, tour, name in matched:
            print(f"  {league:16} categoryId={cat:<7} tournamentId={tour:<7} {name}")
        return

    if args.coverage:
        coverage()
        return

    if args.prune_slip:
        prune_slip()
        return

    if args.prune_history:
        prune_history(write=args.write, leagues=args.league)
        return

    # The fixture list is fetched BEFORE the capture, not after it.
    #
    # It is only needed to map the bookmaker's slugs onto our team names, but it
    # used to be fetched once the prices were already in hand - so a failure here
    # discarded work that cannot be repeated. That is exactly what happened on
    # 2026-08-24 at 21:00: 189 prices collected, then one DNS failure, then
    # nothing written. This call is the cheap, repeatable one, so it goes first:
    # failing now costs a run that had not yet done anything.
    fixtures = None
    if not args.no_resolve:
        # Named explicitly rather than left to look like an empty fixture list -
        # "no credentials" and "no fixtures" need different fixes. (.env is found
        # via PROJECT_ROOT, anchored on __file__, so the working directory does
        # not matter here; only a genuinely absent or unreadable .env does.)
        if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_KEY"):
            sys.exit("Missing SUPABASE_URL / SUPABASE_KEY")
        try:
            fixtures = our_fixtures()
        except requests.RequestException as exc:
            sys.exit(f"ERROR: could not reach Supabase for the fixture list "
                     f"({type(exc).__name__}), even after retries. Nothing was "
                     f"captured; the next window is in 3h.")
        if not fixtures:
            # Unresolved slugs are worse than no rows at all: they can never join
            # to a fixture and sit in the table looking like data. Asking for them
            # on purpose is what --no-resolve is for.
            msg = ("ERROR: the fixture list is empty, so bookmaker slugs cannot be "
                   "resolved to our team names.")
            if args.write:
                sys.exit(msg + " Refusing to write unjoinable rows.")
            print(msg + " Continuing with the bookmaker's own names.")

    rows = capture(args.league, args.within, slip_markets=args.slip_markets)

    if fixtures:
        rows, dropped = resolve_team_names(rows, fixtures)
        print(f"\nresolved to our team names: {len(rows)} prices"
              + (f", {dropped} dropped as unmatched" if dropped else ""))

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh)
        print(f"\nwrote {args.json}")
    if args.write:
        print(f"\nwrote {write_rows(rows)} rows to odds_snapshots")
    elif not args.json:
        print("\nNothing written. Use --json PATH, or --write once migration 004 is applied.")


if __name__ == "__main__":
    main()

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


def parse(event, payload, league):
    """Odds rows for the markets we model. Ignores everything else."""
    if not payload:
        return []
    try:
        slug = json.loads(event["seo"])["DEFAULT"]["IT"].split("/")[-1]
        home, _, away = slug.partition("-vs-")
    except Exception:
        home = away = ""

    kickoff = parse_kickoff(event.get("ts", ""))
    season = season_for(kickoff, league)
    rows = []
    for market in payload.get("scs") or []:
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


def capture(limit_leagues=None, hours=72):
    leagues = our_leagues()
    if limit_leagues:
        leagues = {k: v for k, v in leagues.items() if k in limit_leagues}
    all_rows, summary = [], []

    for league, (cat, tour, name) in sorted(leagues.items()):
        evs = [e for e in events(cat, tour) if within_window(e, hours)]
        rows_here, with_fouls = [], 0
        for ev in evs:
            payload = event_markets(ev["p"], ev["a"])
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
    } for r in rows]
    written = 0
    for i in range(0, len(payload), 500):
        chunk = payload[i:i + 500]
        resp = SESSION.post(f"{url}/rest/v1/odds_snapshots", headers=headers,
                            json=chunk, timeout=120)
        if resp.status_code >= 400:
            sys.exit(f"Write failed ({resp.status_code}): {resp.text[:300]}")
        written += len(chunk)
    return written


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

    rows = capture(args.league, args.within)

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

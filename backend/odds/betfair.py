"""Betfair Exchange: login, application keys, and market coverage.

    python -m backend.odds.betfair --create-keys progetto-olanda
    python -m backend.odds.betfair --show-keys

Reads credentials from .env:

    BETFAIR_USERNAME=...
    BETFAIR_PASSWORD=...
    BETFAIR_DOMAIN=it        # or "com"
    BETFAIR_APP_KEY=...      # once created

Why this exists rather than the browser tool: Betfair's Accounts API visualiser
reads a betfair.com session cookie. Italian residents are served by a separate,
ADM-licensed exchange on betfair.it with its own segregated liquidity, and
betfair.com blocks Italian IPs entirely - so there is no .com cookie to read and
the visualiser returns NO_SESSION. Logging in directly against the .it identity
endpoint works, and the login code is needed for odds capture anyway.

Note the bootstrap: creating an application key requires a session, and a login
requires an X-Application header. Betfair accepts any non-empty value there for
the login itself, which is what BOOTSTRAP_APP_KEY is for. The key-creation call
is different - it wants the header OMITTED, not filled with a placeholder, and
rejects a bogus one with INVALID_APP_KEY. Everything else needs the real key.
"""

import argparse
import json
import os
import sys

import requests
from dotenv import load_dotenv

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

# Login is domain-specific: a .it account has no session on .com and vice versa.
LOGIN_URLS = {
    "com": "https://identitysso.betfair.com/api/login",
    "it": "https://identitysso.betfair.it/api/login",
}
# Everything after login goes to the shared endpoints. The session token decides
# which exchange's markets come back, so a .it token returns the Italian pool.
ACCOUNT_URL = "https://api.betfair.com/exchange/account/json-rpc/v1"
BETTING_URL = "https://api.betfair.com/exchange/betting/json-rpc/v1"

BOOTSTRAP_APP_KEY = "olanda-bootstrap"


def _credentials():
    username = os.environ.get("BETFAIR_USERNAME")
    password = os.environ.get("BETFAIR_PASSWORD")
    domain = (os.environ.get("BETFAIR_DOMAIN") or "com").strip().lower()
    if not username or not password:
        sys.exit(
            "Missing BETFAIR_USERNAME / BETFAIR_PASSWORD in .env\n"
            "  BETFAIR_USERNAME=...\n"
            "  BETFAIR_PASSWORD=...\n"
            "  BETFAIR_DOMAIN=it        # or com"
        )
    if domain not in LOGIN_URLS:
        sys.exit(f"BETFAIR_DOMAIN must be one of {sorted(LOGIN_URLS)}, got {domain!r}")
    return username, password, domain


def login(app_key=None):
    """A session token, or a readable explanation of why not."""
    username, password, domain = _credentials()
    resp = requests.post(
        LOGIN_URLS[domain],
        data={"username": username, "password": password},
        headers={
            "X-Application": app_key or os.environ.get("BETFAIR_APP_KEY") or BOOTSTRAP_APP_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()

    if body.get("status") != "SUCCESS":
        error = body.get("error") or body.get("status")
        hint = {
            "INVALID_USERNAME_OR_PASSWORD": "Check the credentials, and note that the "
                                            "username is the one you log in with, not your email.",
            "ACCOUNT_NOW_LOCKED": "Too many failed attempts; unlock it on the website.",
            "PENDING_AUTH": "The account needs verifying on the website first.",
            "CERT_AUTH_REQUIRED": "This account requires certificate login.",
            "INVALID_APP_KEY": "The app key in .env is not valid for this domain.",
        }.get(error, "")
        sys.exit(f"Login failed on betfair.{domain}: {error}\n{hint}".rstrip())

    return body["token"], domain


#: Passed as `app_key` to omit the X-Application header entirely.
OMIT = object()


def rpc(url, method, params, token, app_key=None):
    """One JSON-RPC call, with Betfair's error envelope unwrapped.

    `app_key=OMIT` sends no X-Application header. That is required for
    createDeveloperAppKeys, which is the one call you make before you have a key:
    a placeholder value there is rejected as INVALID_APP_KEY rather than ignored.
    """
    headers = {"X-Authentication": token, "Content-Type": "application/json"}
    if app_key is not OMIT:
        resolved = app_key or os.environ.get("BETFAIR_APP_KEY")
        if not resolved:
            sys.exit(
                f"{method} needs a real application key, and BETFAIR_APP_KEY is not set.\n"
                "Create one first:  python -m backend.odds.betfair --create-keys <unique-name>"
            )
        headers["X-Application"] = resolved

    resp = requests.post(
        url,
        json={"jsonrpc": "2.0", "method": method, "params": params, "id": 1},
        headers=headers,
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    if isinstance(body, dict) and "error" in body:
        detail = body["error"].get("data", {}).get("APINGException", {})
        sys.exit(f"{method} failed: {detail.get('errorCode') or body['error']}")
    return body["result"]


def _render(result):
    """Print the delayed and live keys, flagging which one to actually use.

    createDeveloperAppKeys returns a single application object while
    getDeveloperAppKeys returns a list of them, so normalise before iterating.
    """
    apps = result if isinstance(result, list) else [result]
    delayed = None

    for app in apps:
        print(f"\n  {app.get('appName', '(unnamed)')}")
        for version in app.get("appVersions", []):
            kind = "DELAYED" if version.get("delayData") else "LIVE"
            key = version.get("applicationKey")
            state = "active" if version.get("active") else "inactive"
            print(f"    {kind:8} {key}   ({state})")
            if version.get("delayData") and version.get("active"):
                delayed = key

    print("\nUse the DELAYED key. It runs against the live exchange with delayed")
    print("prices, which is irrelevant for capturing odds hours before kickoff.")
    print("Activating the LIVE key costs GBP 499 and we have no use for it.")
    if delayed:
        print(f"\nAdd to .env:\n  BETFAIR_APP_KEY={delayed}")
    else:
        print("\nNo active delayed key found above - paste the output here.")


# --- market discovery --------------------------------------------------------

SOCCER_EVENT_TYPE_ID = "1"

# Substrings to recognise a Betfair competition as one of ours. Betfair names
# competitions in English ("Italian Serie A"); our league column uses the
# diretta display name. Matching is by substring rather than a fixed table
# because the Italian exchange carries a different, smaller set than .com and
# the exact names have to be discovered rather than assumed.
LEAGUE_PATTERNS = {
    "Premier League": ("english premier league", "premier league"),
    "Serie A": ("italian serie a", "serie a"),
    "Serie B": ("italian serie b", "serie b"),
    "La Liga": ("spanish la liga", "la liga", "primera"),
    "Bundesliga": ("german bundesliga", "bundesliga"),
    "Ligue 1": ("french ligue 1", "ligue 1"),
    "Eredivisie": ("dutch eredivisie", "eredivisie"),
    "Eerste Divisie": ("dutch eerste divisie", "eerste divisie", "jupiler"),
    "Serie A Betano": ("brazilian serie a", "brasileiro"),
}


def _window(days):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return {"from": now.strftime(fmt), "to": (now + timedelta(days=days)).strftime(fmt)}


def list_competitions(token, query=None):
    filt = {"eventTypeIds": [SOCCER_EVENT_TYPE_ID]}
    if query:
        filt["textQuery"] = query
    return rpc(BETTING_URL, "SportsAPING/v1.0/listCompetitions", {"filter": filt}, token)


def competitions(token, query):
    """Every soccer competition this exchange exposes, newest market count first."""
    rows = list_competitions(token, query)
    print(f"\n{len(rows)} soccer competitions visible on this exchange"
          + (f" matching {query!r}" if query else "") + "\n")
    print(f"  {'id':>10}  {'markets':>7}  {'region':<6} name")
    for row in sorted(rows, key=lambda r: -r.get("marketCount", 0)):
        comp = row["competition"]
        print(f"  {comp['id']:>10}  {row.get('marketCount', 0):>7}  "
              f"{row.get('competitionRegion', ''):<6} {comp['name']}")


def coverage(token, days):
    """Which of our leagues are tradeable here, and do they carry corner markets?

    Prints every distinct market type found rather than probing for a guessed
    code. Betfair's naming for corner markets is not something to assume,
    especially on the segregated Italian exchange, which carries a different and
    much smaller set of markets than betfair.com.
    """
    all_comps = list_competitions(token)
    by_league = {}
    for league, patterns in LEAGUE_PATTERNS.items():
        for row in all_comps:
            name = row["competition"]["name"].lower()
            if any(p in name for p in patterns):
                by_league.setdefault(league, []).append(row)

    missing = [lg for lg in LEAGUE_PATTERNS if lg not in by_league]
    print(f"\nMatched {len(by_league)}/{len(LEAGUE_PATTERNS)} leagues to a competition.")
    if missing:
        print(f"No competition found for: {', '.join(missing)}")

    print(f"\n{'league':18}{'events':>7}{'markets':>9}  corner markets")
    corner_total = 0
    seen_types = {}

    for league, rows in sorted(by_league.items()):
        comp_ids = [r["competition"]["id"] for r in rows]
        events = rpc(BETTING_URL, "SportsAPING/v1.0/listEvents", {
            "filter": {"eventTypeIds": [SOCCER_EVENT_TYPE_ID],
                       "competitionIds": comp_ids,
                       "marketStartTime": _window(days)},
        }, token)
        if not events:
            print(f"{league:18}{0:>7}{'-':>9}  no upcoming events in the next {days} days")
            continue

        # A whole league's markets at once trips TOO_MUCH_DATA, so ask a few
        # events at a time. Football fixtures carry a lot of markets each.
        event_ids = [e["event"]["id"] for e in events]
        catalogue = []
        for i in range(0, len(event_ids), 5):
            catalogue += rpc(BETTING_URL, "SportsAPING/v1.0/listMarketCatalogue", {
                "filter": {"eventIds": event_ids[i:i + 5]},
                "marketProjection": ["MARKET_DESCRIPTION", "EVENT"],
                "maxResults": 200,
            }, token)

        types, corners = {}, {}
        for m in catalogue:
            mtype = (m.get("description") or {}).get("marketType") or "?"
            types[mtype] = types.get(mtype, 0) + 1
            blob = f"{mtype} {m.get('marketName', '')}".lower()
            if "corner" in blob:
                corners[m.get("marketName") or mtype] = corners.get(m.get("marketName") or mtype, 0) + 1

        corner_total += sum(corners.values())
        for mtype, count in types.items():
            seen_types[mtype] = seen_types.get(mtype, 0) + count
        summary = (", ".join(f"{k} x{v}" for k, v in sorted(corners.items())) if corners
                   else f"NONE ({len(types)} other types)")
        print(f"{league:18}{len(events):>7}{len(catalogue):>9}  {summary}")

    # Every distinct market type across every league, so nothing is hidden by a
    # truncated list - the point of this report is to discover what exists.
    print(f"\nAll {len(seen_types)} market types found, by frequency:")
    for mtype, count in sorted(seen_types.items(), key=lambda kv: -kv[1]):
        print(f"  {count:>5}  {mtype}")

    print()
    if corner_total:
        print(f"{corner_total} corner markets found. The corners plan is viable here.")
    else:
        print("No corner markets on this exchange. Goals and 1x2 are still capturable,")
        print("but corner prices would have to come from an Italian bookmaker instead.")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--create-keys", metavar="NAME",
                       help="create application keys under this name (must be globally unique)")
    group.add_argument("--show-keys", action="store_true",
                       help="list the application keys this account already has")
    group.add_argument("--check-login", action="store_true",
                       help="verify the credentials work and print nothing secret")
    group.add_argument("--competitions", nargs="?", const="", metavar="QUERY",
                       help="list the soccer competitions this exchange exposes")
    group.add_argument("--coverage", action="store_true",
                       help="which of our leagues are tradeable, and do they price corners")
    parser.add_argument("--days", type=int, default=10,
                        help="how far ahead to look for events (default 10)")
    args = parser.parse_args()

    token, domain = login()
    print(f"Logged in to betfair.{domain}.")

    if args.check_login:
        # The login above is the real test. getAccountDetails needs a valid app
        # key, so it is only worth trying once one exists.
        if not os.environ.get("BETFAIR_APP_KEY"):
            print("  Credentials work. No BETFAIR_APP_KEY yet - create one with:")
            print("    python -m backend.odds.betfair --create-keys <unique-name>")
            return
        details = rpc(ACCOUNT_URL, "AccountAPING/v1.0/getAccountDetails", {}, token)
        print(f"  account: {details.get('firstName')} {details.get('lastName')}"
              f"  currency: {details.get('currencyCode')}  region: {details.get('region')}")
        return

    if args.competitions is not None:
        competitions(token, args.competitions or None)
        return

    if args.coverage:
        coverage(token, args.days)
        return

    if args.show_keys:
        _render(rpc(ACCOUNT_URL, "AccountAPING/v1.0/getDeveloperAppKeys", {}, token,
                    app_key=OMIT))
        return

    try:
        _render(rpc(ACCOUNT_URL, "AccountAPING/v1.0/createDeveloperAppKeys",
                    {"appName": args.create_keys}, token, app_key=OMIT))
    except SystemExit as exc:
        # Re-running after a partial success is the common case; show what exists
        # rather than making the name look permanently burned.
        if "DUPLICATE_APP_NAME" in str(exc):
            print(f"'{args.create_keys}' already exists - here are the keys on this account:")
            _render(rpc(ACCOUNT_URL, "AccountAPING/v1.0/getDeveloperAppKeys", {}, token,
                        app_key=OMIT))
            return
        raise


if __name__ == "__main__":
    main()

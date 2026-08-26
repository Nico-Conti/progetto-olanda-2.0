"""Single source of truth for the leagues we scrape.

Adding a league means adding one entry here. Everything else derives from it:
the scraper CLI choices, the fixtures scraper's results/calendar URLs, the
slug -> DB league name mapping used when syncing, the archive URLs for finished
seasons, and the league list the GitHub Actions cron job iterates over.

`season_style` says how a league labels its seasons:
  "split"    - runs Aug->May, labelled "2025/2026"  (diretta slug: `-2025-2026`)
  "calendar" - runs within one year, labelled "2026" (diretta slug: `-2025`)
Only the Brazilian league is "calendar"; everything else is "split".
"""

import datetime

LEAGUES = {
    "eredivisie": {
        "name": "Eredivisie",
        "base_url": "https://www.diretta.it/calcio/olanda/eredivisie/",
        "season_style": "split",
    },
    "laliga": {
        "name": "La Liga",
        "base_url": "https://www.diretta.it/calcio/spagna/laliga/",
        "season_style": "split",
    },
    "serieb": {
        "name": "Serie B",
        "base_url": "https://www.diretta.it/calcio/italia/serie-b/",
        "season_style": "split",
    },
    "seriea": {
        "name": "Serie A",
        "base_url": "https://www.diretta.it/calcio/italia/serie-a/",
        "season_style": "split",
    },
    "bundesliga": {
        "name": "Bundesliga",
        "base_url": "https://www.diretta.it/calcio/germania/bundesliga/",
        "season_style": "split",
    },
    "ligue1": {
        "name": "Ligue 1",
        "base_url": "https://www.diretta.it/calcio/francia/ligue-1/",
        "season_style": "split",
    },
    "premier": {
        "name": "Premier League",
        "base_url": "https://www.diretta.it/calcio/inghilterra/premier-league/",
        "season_style": "split",
    },
    "eerstedivisie": {
        "name": "Eerste Divisie",
        "base_url": "https://www.diretta.it/calcio/olanda/eerste-divisie/",
        "season_style": "split",
    },
    "betano": {
        "name": "Serie A Betano",
        "base_url": "https://www.diretta.it/calcio/brasile/serie-a-betano/",
        "season_style": "calendar",
    },
    "ligaportugal": {
        "name": "Liga Portugal",
        "base_url": "https://www.diretta.it/calcio/portogallo/liga-portugal/",
        "season_style": "split",
    },
    "championship": {
        "name": "Championship",
        "base_url": "https://www.diretta.it/calcio/inghilterra/championship/",
        "season_style": "split",
    },
    "bundesliga2": {
        "name": "2. Bundesliga",
        "base_url": "https://www.diretta.it/calcio/germania/2-bundesliga/",
        "season_style": "split",
    },
    "laliga2": {
        "name": "LaLiga 2",
        "base_url": "https://www.diretta.it/calcio/spagna/laliga2/",
        "season_style": "split",
    },
    "ligue2": {
        "name": "Ligue 2",
        "base_url": "https://www.diretta.it/calcio/francia/ligue-2/",
        "season_style": "split",
    },
    "superlig": {
        "name": "Super Lig",
        "base_url": "https://www.diretta.it/calcio/turchia/super-lig/",
        "season_style": "split",
    },
}

# Ordered list of slugs, used for the scraper CLI choices and the CI loop.
LEAGUE_SLUGS = list(LEAGUES)

# Slug -> display name as stored in the Supabase `league` column.
LEAGUE_NAMES = {slug: cfg["name"] for slug, cfg in LEAGUES.items()}

# Slug -> results ("risultati") page, i.e. played matches with stats.
LEAGUE_URLS = {slug: cfg["base_url"] + "risultati/" for slug, cfg in LEAGUES.items()}

# Slug -> calendar ("calendario") page, i.e. upcoming fixtures.
LEAGUE_CALENDAR_URLS = {slug: cfg["base_url"] + "calendario/" for slug, cfg in LEAGUES.items()}


def resolve_league_name(slug):
    """Slug (any case) -> DB display name, or None if unknown."""
    if not slug:
        return None
    return LEAGUE_NAMES.get(slug.lower())


# --- Seasons -----------------------------------------------------------------
#
# A "split" league (Aug->May) is labelled by the two calendar years it spans,
# e.g. "2025/2026". A "calendar" league (Brazil) plays inside one year and is
# labelled by that year alone, e.g. "2025".
#
# July is the cut-over for split leagues: anything from July onwards belongs to
# the season starting that year.
SEASON_START_MONTH = 7


def season_style(slug):
    return LEAGUES[slug.lower()]["season_style"]


def current_season(slug, today=None):
    """The season label a league is currently playing."""
    today = today or datetime.date.today()
    if season_style(slug) == "calendar":
        return str(today.year)
    start_year = today.year if today.month >= SEASON_START_MONTH else today.year - 1
    return f"{start_year}/{start_year + 1}"


def previous_season(slug, season):
    """The season label immediately before `season`."""
    if season_style(slug) == "calendar":
        return str(int(season) - 1)
    start_year = int(str(season).split("/")[0]) - 1
    return f"{start_year}/{start_year + 1}"


def season_slug(slug, season):
    """League slug for a given season, as diretta spells it in archive URLs.

    "2025/2026" -> "serie-a-2025-2026"; "2025" -> "serie-a-betano-2025".
    """
    base = LEAGUES[slug.lower()]["base_url"].rstrip("/").rsplit("/", 1)[-1]
    return f"{base}-{str(season).replace('/', '-')}"


def season_results_url(slug, season, today=None):
    """Results page for a season."""
    return season_page_url(slug, season, "risultati/", today)


def season_page_url(slug, season, page, today=None):
    """Any per-season page ("risultati/", "calendario/", "classifiche/").

    The season in progress lives at the plain league URL; finished seasons live
    under their archive slug.
    """
    cfg = LEAGUES[slug.lower()]
    if str(season) == current_season(slug, today):
        return cfg["base_url"] + page
    parent = cfg["base_url"].rstrip("/").rsplit("/", 1)[0]
    return f"{parent}/{season_slug(slug, season)}/{page}"


def season_standings_url(slug, season, today=None):
    """Standings page for a season."""
    return season_page_url(slug, season, "classifiche/", today)


def archive_url(slug):
    """The /archivio/ page, which lists every season diretta has for a league."""
    return LEAGUES[slug.lower()]["base_url"] + "archivio/"


def year_for_month_in_season(season, month):
    """Which calendar year a given month falls in, within `season`.

    Diretta prints dates as "24.05." with no year, so the year has to come from
    the season being scraped, never from today: a "±6 months from now" guess
    mis-dates a season's opening fixtures by a year for most of the year.

    The season label alone says which kind it is - "2025/2026" spans two years,
    "2026" is a single calendar year - so no league lookup is needed.
    """
    label = str(season)
    if "/" not in label:
        return int(label)
    start_year = int(label.split("/")[0])
    return start_year if month >= SEASON_START_MONTH else start_year + 1


def season_year_for_month(slug, season, month):
    """As `year_for_month_in_season`, for callers that have a league slug."""
    if season_style(slug) == "calendar":
        return int(season)
    return year_for_month_in_season(season, month)

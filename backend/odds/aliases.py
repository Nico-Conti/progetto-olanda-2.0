"""Resolving team names between our data and an external source.

Our team names come from diretta and are Italian-language: Amburgo, Siviglia,
Lilla, Barcellona. football-data.co.uk uses English-language short forms:
Hamburg, Sevilla, Lille, Barcelona. Only about 71% of names match exactly, and
the remainder differ in ways no normalisation rule can bridge - "Maiorca" and
"Mallorca" are close, but "Monchengladbach" and "M'gladbach" are not, and
"Nottingham" and "Nott'm Forest" share almost nothing.

Hand-maintaining that map across seven seasons of promotions and relegations
would be a few hundred entries and a permanent source of silent errors, so it is
derived instead. Both sources describe the *same fixtures*, so a team's season
record - matches played, goals for, goals against, wins, draws, losses - is a
fingerprint. Two different clubs sharing one is vanishingly unlikely, and where
it happens the collision is detected rather than guessed at.

Nothing here writes anything. `build_alias_map` returns the mapping and the
names it could not resolve, and the caller decides whether that is acceptable.
"""

import unicodedata
from collections import defaultdict


def normalise(name):
    """Lowercase, strip accents and punctuation. Catches only the easy cases."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(name))
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return "".join(c for c in stripped.lower() if c.isalnum())


def season_records(matches):
    """team -> (played, goals_for, goals_against, wins, draws, losses).

    `matches` is a list of dicts with home, away, home_goals, away_goals. Rows
    with a missing score are skipped: a fingerprint built from a partial season
    would not match one built from a complete one.
    """
    acc = defaultdict(lambda: [0, 0, 0, 0, 0, 0])
    for m in matches:
        hg, ag = m.get("home_goals"), m.get("away_goals")
        home, away = m.get("home"), m.get("away")
        if hg is None or ag is None or not home or not away:
            continue
        hg, ag = int(hg), int(ag)
        for team, gf, ga in ((home, hg, ag), (away, ag, hg)):
            r = acc[team]
            r[0] += 1
            r[1] += gf
            r[2] += ga
            r[3 if gf > ga else (4 if gf == ga else 5)] += 1
    return {team: tuple(r) for team, r in acc.items()}


def build_alias_map(ours, theirs):
    """Map their team names onto ours for one league-season.

    Returns (alias_map, unresolved), where unresolved lists their names that
    could not be pinned to exactly one of ours. Resolution runs in three passes,
    each only over what the previous ones left:

      1. exact name match
      2. identical season record, where that record is unique on both sides
      3. normalised name match (accents and punctuation removed)

    Pass 2 is the one that does the real work. Pass 3 only mops up cases where
    two clubs happen to share a record, which the fingerprint cannot separate.
    """
    our_names = {m[k] for m in ours for k in ("home", "away") if m.get(k)}
    their_names = {m[k] for m in theirs for k in ("home", "away") if m.get(k)}

    alias, claimed = {}, set()
    for name in their_names & our_names:
        alias[name] = name
        claimed.add(name)

    our_recs, their_recs = season_records(ours), season_records(theirs)

    # Invert both sides, keeping only records that identify a single team. A
    # record shared by two clubs identifies neither, so it is left for pass 3.
    def unique_by_record(records, skip):
        by_rec = defaultdict(list)
        for team, rec in records.items():
            if team not in skip:
                by_rec[rec].append(team)
        return {rec: teams[0] for rec, teams in by_rec.items() if len(teams) == 1}

    ours_by_rec = unique_by_record(our_recs, claimed)
    for their_name, rec in their_recs.items():
        if their_name in alias:
            continue
        match = ours_by_rec.get(rec)
        if match and match not in claimed:
            alias[their_name] = match
            claimed.add(match)

    our_by_norm = defaultdict(list)
    for name in our_names:
        if name not in claimed:
            our_by_norm[normalise(name)].append(name)
    for their_name in their_names:
        if their_name in alias:
            continue
        candidates = our_by_norm.get(normalise(their_name), [])
        if len(candidates) == 1:
            alias[their_name] = candidates[0]
            claimed.add(candidates[0])

    unresolved = sorted(their_names - set(alias))
    return alias, unresolved


# --- matching upcoming fixtures, where there are no results to fingerprint ----

def _similarity(a, b):
    """Rough name closeness in [0, 1]. Deliberately crude, see match_fixtures."""
    x, y = normalise(a), normalise(b)
    if not x or not y:
        return 0.0
    if x == y:
        return 1.0
    if x in y or y in x:
        return 0.9
    # Longest common prefix, which catches lipsia/rblipsia and napoli/sscnapoli.
    common = 0
    for ca, cb in zip(x, y):
        if ca != cb:
            break
        common += 1
    prefix = common / max(len(x), len(y))
    # Character overlap, which catches reorderings and dropped sponsor words.
    shared = len(set(x) & set(y)) / len(set(x) | set(y))
    return max(prefix, shared * 0.7)


def match_fixtures(theirs, ours, threshold=0.55):
    """Map their (home, away) fixture names onto ours, within one league and day.

    `season_records` cannot help here: these are matches nobody has played, so
    there is no fingerprint to match on. What we do have is that both sources
    list the SAME fixtures for a given league and date - so this is an assignment
    problem, not a naming problem, and the constraint does most of the work.

    Both sides are scored pairwise on name similarity and matched greedily,
    best-first, each fixture used once. That resolves cases no string rule could
    - "lipsia/borussia-mgladbach" against "RB Lipsia vs Borussia M." - because
    the alternatives on that day are Colonia, Magonza and Elversberg.

    Returns {(their_home, their_away): (our_home, our_away)} for pairs that clear
    `threshold`. Anything below is left out rather than guessed at.
    """
    scored = []
    for th, ta in theirs:
        for oh, oa in ours:
            score = (_similarity(th, oh) + _similarity(ta, oa)) / 2
            if score >= threshold:
                scored.append((score, (th, ta), (oh, oa)))

    scored.sort(key=lambda s: -s[0])
    mapping, used_theirs, used_ours = {}, set(), set()
    for score, their, our in scored:
        if their in used_theirs or our in used_ours:
            continue
        mapping[their] = our
        used_theirs.add(their)
        used_ours.add(our)
    return mapping

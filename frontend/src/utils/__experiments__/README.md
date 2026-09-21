# Model experiments

Node-runnable scripts that measure how well the prediction model actually works. They are
**not** bundled into the app — nothing under `src/` imports them, and Vite only pulls in
modules reachable from `main.jsx`.

They exist so the numbers in `docs/prediction-model.md` can be regenerated against fresh
data instead of being frozen prose. Re-run them after a season finishes.

```bash
# 1. dump completed matches (writes data.json next to the scripts).
#    `all` takes every season; a season label takes just that one.
backend/venv/bin/python frontend/src/utils/__experiments__/dumpSeason.py all

# 2. run the measurements
node frontend/src/utils/__experiments__/modelComparison.mjs          # all reports
node frontend/src/utils/__experiments__/modelComparison.mjs blend    # one report
node frontend/src/utils/__experiments__/predictorComparison.mjs
```

`modelComparison.mjs` — how good is the shipped model?

| report | question it answers |
|---|---|
| `blend`  | how much weight should the two-team model get vs the league mean? |
| `holdout`| does that weight hold up out-of-sample (leave-one-league-out)? |
| `rank`   | do the top-ranked "hot" matches actually score higher? |
| `ou`     | does the model call over/under better than the base rate? |
| `margin` | does a confidence margin improve the call? |

`predictorComparison.mjs` — should a statistic be predicted from itself at all?

| report | question it answers |
|---|---|
| `mae`      | which statistic forecasts each target most accurately? |
| `blend`    | does the answer survive once shrinkage is applied? |
| `ou`       | does the better predictor also call over/under better? |
| `objective`| MAE and call accuracy want different weights — which, and how far apart? |

It groups by league **and** season, and rescales a prediction made in the predictor's units
onto the target's by the running ratio of past totals, so sources on very different scales
(box touches ~46 a match vs shots ~26) compete fairly.

`marketComparison.mjs` — does the model beat the market?

Scores the model against real **closing** prices rather than a hardcoded line. Needs
`odds.json` alongside `data.json`:

```bash
python -m backend.odds.footballdata --season 2025/2026 \
    --json frontend/src/utils/__experiments__/odds.json
node frontend/src/utils/__experiments__/marketComparison.mjs
```

Only goals are priced by that source. Corners and cards, the markets this project targets,
are not sold historically by anyone and have to be captured going forward.

`bttsComparison.mjs` — can the shipped goals model answer GG/NG?

```bash
node frontend/src/utils/__experiments__/bttsComparison.mjs
```

P(both score) is NOT a function of the total — 1-1 and 2-0 are both a total of 2 and
opposite outcomes — so `countModel.probOver` cannot answer it. This uses the two
marginals `predictFromModel` already returns, walk-forward and pooled, and scores them
against a leave-one-out base rate, per league-season, and against our two-sided `gg_ng`
closes. Answer (docs section 31): it beats the base rate by 0.08%, holds in 11 of 19
league-seasons, and section 25 measured the gap to a closing line at 500x that. The
market block prints `[unreadable]` whenever backing both sides fails to lose the
overround.

`sidedness.py` — is an aggregate over captured quotes even readable?

```bash
python3 frontend/src/utils/__experiments__/sidedness.py     # needs odds_closing.json + data.json
```

Run this before trusting any figure computed over `odds_closing.json`. The book posts shots
and shots on target as a **one-sided over ladder with a single two-sided main line**, so
"flat-bet every captured side" is an ~80%-overs portfolio rather than a balanced book — it
returns +7.4% where the two-sided rungs return −8.2%. `priceComparison.mjs`'s `(all)` row
still makes that assumption. The script prints the sidedness per market, both flat-bet
numbers, and the main-line over ROI bootstrapped **by fixture**, and asserts that a fully
two-sided ladder loses roughly its overround. See `docs/odds-and-settlement.md`.

Every report walks forward in time and predicts each match using only matches played before
it, so there is no lookahead.

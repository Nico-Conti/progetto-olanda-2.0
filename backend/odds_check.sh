#!/usr/bin/env bash
# Did the odds capture cron actually run, and did the last run succeed?
#
# Captures cannot be backfilled, so silent failure is the expensive case: the
# laptop asleep, WSL not started since the last Windows reboot, or - as on
# 2026-08-24 21:00 - a transient DNS failure inside WSL that killed the run
# after it had already fetched 189 prices.
#
# This reports per RUN, not per line. The log is one file that every run appends
# to, and within a run the ordering is not even chronological: stdout is
# block-buffered into a file while tracebacks go to stderr unbuffered, so a
# crashing run writes its traceback before its own output. Runs are delimited by
# the `=== run <timestamp> <args> ===` marker domusbet.py prints at startup.
#
# Exit status: 0 healthy, 1 the last run failed, 2 no run recently.
cd "$(dirname "$0")/.." || exit 1
LOG=${ODDS_LOG:-logs/odds.log}   # overridable so the parsing can be tested
STALE_MINUTES=200          # cron is every 180

echo "cron entry:"
crontab -l 2>/dev/null | grep -E '^[^#].*domusbet' | sed 's/^/   /'
echo
echo "cron daemon: $(pgrep -x cron >/dev/null && echo running || echo 'NOT RUNNING - captures are being missed')"
echo "wsl uptime : $(uptime -p)"
echo

if [ ! -f "$LOG" ]; then
    echo "no log yet at $LOG - the cron has not run"
    exit 2
fi

AGE=$(( ($(date +%s) - $(date -r "$LOG" +%s)) / 60 ))
echo "log        : $LOG"
echo "last write : $(date -r "$LOG" '+%Y-%m-%d %H:%M:%S') (${AGE} min ago)$( [ "$AGE" -gt "$STALE_MINUTES" ] && echo '  <-- STALE, expected every 180 min' )"
echo

# One summary line per run: when, which mode, outcome, and the line that says so.
SUMMARY=$(awk '
function flush_run() {
    if (!started) return
    if (err != "")            { status = "FAILED";  detail = err }
    else if (mode !~ /--write/) { status = "dry";   detail = (info ? info : "no write requested") }
    else if (wrote != "")     { status = "ok";      detail = wrote }
    else                      { status = "unknown"; detail = "no write line - killed before it finished?" }
    printf "%s\t%s\t%s\t%s\n", stamp, mode, status, detail
}
/^=== run / {
    flush_run()
    started = 1; err = ""; wrote = ""; info = ""
    stamp = $3 " " $4
    mode = ""
    for (i = 5; i < NF; i++) mode = mode (mode ? " " : "") $i
    next
}
started {
    line = $0; sub(/^[[:space:]]+/, "", line)
    # An exception line is definitive: the run died. A `wrote N rows` line is
    # the only proof a capture landed. Everything else is context.
    if (line ~ /^[A-Za-z_.]*(Error|Exception):/ || line ~ /^(ERROR:|Missing SUPABASE|Write failed)/) err = line
    else if (line ~ /wrote [0-9]+ rows to odds_snapshots/) wrote = line
    else if (info == "" && line ~ /prices total|tournaments,/) info = line
}
END { flush_run() }
' "$LOG")

if [ -z "$SUMMARY" ]; then
    echo "no run markers in the log - every run predates them. Raw tail:"
    grep -E 'wrote .* rows|Missing SUPABASE|Error|Traceback|403' "$LOG" | tail -3 | sed 's/^/   /'
    echo
    echo "Re-run once so a marked run exists, then this will report per run."
    exit 0
fi

echo "recent runs (newest first):"
echo "$SUMMARY" | tail -8 | tac | while IFS=$'\t' read -r stamp mode status detail; do
    printf '   %-19s  %-32s  %-7s  %.80s\n' "$stamp" "$mode" "$status" "$detail"
done

UNMARKED=$(awk '/^=== run /{ exit } /wrote [0-9]+ rows|Traceback/ { n++ } END { print n+0 }' "$LOG")
[ "$UNMARKED" -gt 0 ] && echo "   (plus $UNMARKED earlier result line(s) written before run markers existed)"
echo

LAST_STATUS=$(echo "$SUMMARY" | tail -1 | cut -f3)
case "$LAST_STATUS" in
    ok)  echo "last run: ok"
         [ "$AGE" -gt "$STALE_MINUTES" ] && { echo "but nothing has run for ${AGE} min - windows are being missed."; exit 2; }
         exit 0 ;;
    dry) echo "last run: no write - a --coverage or dry run, not a capture"; exit 0 ;;
    *)   echo "last run: $LAST_STATUS - nothing was written, so that window is gone."
         echo "          Prices cannot be backfilled; the next one is on the hour, every 3h."
         exit 1 ;;
esac

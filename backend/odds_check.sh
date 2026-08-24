#!/usr/bin/env bash
# Did the odds capture cron actually run? Quick health check.
#
# Captures cannot be backfilled, so silent failure is the expensive case: the
# laptop asleep, or WSL not started since the last Windows reboot.
cd "$(dirname "$0")/.." || exit 1
LOG=logs/odds.log
echo "cron entry:"
crontab -l 2>/dev/null | grep -A0 'domusbet' | tail -1 | sed 's/^/   /'
echo
echo "cron daemon: $(pgrep -x cron >/dev/null && echo running || echo 'NOT RUNNING - captures are being missed')"
echo "wsl uptime : $(uptime -p)"
echo
if [ -f "$LOG" ]; then
    echo "last capture: $(date -r "$LOG" '+%Y-%m-%d %H:%M:%S')"
    AGE=$(( ($(date +%s) - $(date -r "$LOG" +%s)) / 60 ))
    echo "         age: ${AGE} minutes $( [ "$AGE" -gt 200 ] && echo '  <-- STALE, expected every 180 min' )"
    echo
    echo "last result:"
    grep -E 'wrote .* rows|Missing SUPABASE|Error|Traceback|403' "$LOG" | tail -3 | sed 's/^/   /'
else
    echo "no log yet at $LOG - the cron has not run"
fi

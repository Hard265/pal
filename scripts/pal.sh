#!/data/data/com.termux/files/usr/bin/bash
# pal.sh — Called by Tasker via Termux:Tasker
#
# Tasker setup:
#   Action:  Termux > Termux:Tasker
#   Command: pal.sh
#   Args:    %SMSRF   (sender number — Tasker variable for SMS From)
#            %SMSTXT  (message body — Tasker variable for SMS Text)
#
# Both args are passed positionally: $1 = from, $2 = body

set -euo pipefail

SENDER="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$SENDER" || -z "$MESSAGE" ]]; then
  echo "[pal.sh] Error: sender or message is empty" >&2
  exit 1
fi

# Path to your compiled pal binary
PAL_BIN="${HOME}/.pal/bin/pal"

# Load env (API key etc.) from ~/.pal/.env
ENV_FILE="${HOME}/.pal/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

echo "[pal.sh] Inbound from: $SENDER" >&2
echo "[pal.sh] Message: ${MESSAGE:0:60}" >&2

# Run pal — logs go to stderr, so Tasker won't capture them as output
exec "$PAL_BIN" --from "$SENDER" --body "$MESSAGE"

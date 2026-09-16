#!/usr/bin/env bash
# The dev stack a Superset engineer expects in a cloud workspace: api, web and
# the Electron desktop on the box's display, in tmux so the logs are reachable
# from any terminal (`tmux attach -t superset`). Lived in the internal
# environment's image until it was needed by every environment built from this
# repository, not just that one.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${SUPERSET_LOG_DIR:-/var/log/superset}"

[ -f "$ROOT_DIR/.env" ] || { echo "dev-stack: no .env yet; setup.cloud.sh runs first"; exit 0; }
command -v tmux >/dev/null || { echo "dev-stack: tmux is not installed"; exit 0; }
tmux has-session -t superset 2>/dev/null && { echo "dev-stack: already running"; exit 0; }

mkdir -p "$LOG_DIR"
tmux new-session -d -s superset -n stack -c "$ROOT_DIR" \
  "export NODE_ENV=development; set -a; . '$ROOT_DIR/.env'; set +a; bunx turbo run dev --filter=@superset/api --filter=@superset/web --filter=// 2>&1 | tee '$LOG_DIR/dev-stack.log'"
tmux new-window -t superset -n desktop -c "$ROOT_DIR/apps/desktop" \
  "export DISPLAY=${DISPLAY:-:1} NODE_ENV=development; set -a; . '$ROOT_DIR/.env'; set +a; bun run dev 2>&1 | tee '$LOG_DIR/desktop-dev.log'"
echo "dev-stack: started (tmux attach -t superset)"

#!/usr/bin/env bash
# ============================================================
# engine.sh — manual lifecycle control for the vendored AI engine.
#
#   bash python/ai-engine/scripts/engine.sh status
#   bash python/ai-engine/scripts/engine.sh start     # spawn + wait for health
#   bash python/ai-engine/scripts/engine.sh stop      # SIGTERM the PID file, clean stale files
#   bash python/ai-engine/scripts/engine.sh health    # quick health probe
#
# The Nuxt server plugin (server/plugins/ai-engine.ts) is the normal owner and
# uses the same PID file / log location. This script is for manual/ops use and
# will not start a second instance when a healthy one is already running.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$ENGINE_DIR")")"

VENV_PY="$PROJECT_ROOT/.venv-ai/bin/python"
CONFIG="$PROJECT_ROOT/.data/ai/config.json"
PID_FILE="$PROJECT_ROOT/.data/ai/engine.pid"
LOG_FILE="$PROJECT_ROOT/.data/ai/engine.log"
HOST="127.0.0.1"
PORT="${NANOBOT_PORT:-8900}"
HEALTH_URL="http://$HOST:$PORT/health"

is_healthy() {
  curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null \
    | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'
}

pid_alive() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

status() {
  if is_healthy; then
    local owner="(unknown)"
    if pid_alive; then
      owner="(pid $(cat "$PID_FILE"))"
    fi
    echo "AI engine: RUNNING at $HEALTH_URL $owner"
    return 0
  fi
  if pid_alive; then
    echo "AI engine: STALE pid file $(cat "$PID_FILE") — process not responding"
    return 1
  fi
  echo "AI engine: STOPPED"
  return 1
}

start() {
  if is_healthy; then
    echo "AI engine already healthy at $HEALTH_URL — adopting."
    return 0
  fi
  if pid_alive; then
    echo "Stale PID $(cat "$PID_FILE") — cleaning up stale PID file."
    rm -f "$PID_FILE"
  fi
  if [ ! -x "$VENV_PY" ]; then
    echo "ERROR: $VENV_PY not found. Run: bash $SCRIPT_DIR/setup.sh" >&2
    exit 1
  fi
  if [ ! -f "$CONFIG" ]; then
    echo "ERROR: $CONFIG not found. Run: bash $SCRIPT_DIR/setup.sh" >&2
    exit 1
  fi
  echo "Starting AI engine: $VENV_PY -m nanobot serve --config $CONFIG --host $HOST --port $PORT"
  mkdir -p "$(dirname "$LOG_FILE")"
  nohup "$VENV_PY" -m nanobot serve \
    --config "$CONFIG" --host "$HOST" --port "$PORT" \
    >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  for _ in $(seq 1 60); do
    if is_healthy; then
      echo "AI engine healthy at $HEALTH_URL (pid $(cat "$PID_FILE"))."
      return 0
    fi
    sleep 0.5
  done
  echo "ERROR: AI engine did not become healthy within 30s. Check: tail -n 50 $LOG_FILE" >&2
  return 1
}

stop() {
  if pid_alive; then
    local pid
    pid="$(cat "$PID_FILE")"
    echo "Stopping AI engine (pid $pid)..."
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "$pid" 2>/dev/null || true
  else
    echo "No live engine PID found."
  fi
  rm -f "$PID_FILE"
  if is_healthy; then
    echo "WARNING: $HEALTH_URL still responds after stop — an external instance may be running."
    echo "         Leaving it untouched (it does not belong to this project)."
  else
    echo "AI engine stopped."
  fi
}

health() {
  if is_healthy; then
    echo "OK $HEALTH_URL"
    curl -fsS --max-time 2 "$HEALTH_URL"
    echo ""
  else
    echo "NOT HEALTHY $HEALTH_URL"
    exit 1
  fi
}

case "${1:-status}" in
  status) status ;;
  start) start ;;
  stop) stop ;;
  health) health ;;
  *) echo "usage: $0 {status|start|stop|health}" >&2; exit 2 ;;
esac

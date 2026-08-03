#!/usr/bin/env bash
# ============================================================
# setup.sh — prepare the vendored nanobot AI engine inside the
# mediation workbench (no external nanobot install required).
#
#   - creates .venv-ai at the workbench root
#   - installs the engine dependencies from requirements.txt
#     (generated from the vendored pyproject.toml)
#   - makes the vendored nanobot package importable in the venv
#   - writes .data/ai/config.json from config.example.json,
#     resolving the API key from the environment or .env
#   - runs an import sanity check
#
# Usage:
#   bash python/ai-engine/scripts/setup.sh
#   DEEPSEEK_API_KEY=... bash python/ai-engine/scripts/setup.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"      # python/ai-engine/scripts
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"                           # python/ai-engine
PROJECT_ROOT="$(dirname "$(dirname "$ENGINE_DIR")")"             # workbench root
VENV_DIR="$PROJECT_ROOT/.venv-ai"
DATA_AI="$PROJECT_ROOT/.data/ai"
CONFIG_TARGET="$DATA_AI/config.json"
CONFIG_EXAMPLE="$ENGINE_DIR/config.example.json"
REQUIREMENTS="$ENGINE_DIR/requirements.txt"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "==> mediation-workbench vendored AI engine setup"
echo "    engine : $ENGINE_DIR"
echo "    venv   : $VENV_DIR"
echo "    config : $CONFIG_TARGET"

# --- 1. virtualenv ---------------------------------------------------------
if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "==> creating virtualenv: $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
VENV_PY="$VENV_DIR/bin/python"
"$VENV_PY" -m pip --version >/dev/null 2>&1 || {
  echo "ERROR: pip is missing in $VENV_DIR. Recreate the venv:" >&2
  echo "  rm -rf $VENV_DIR && bash $SCRIPT_DIR/setup.sh" >&2
  exit 1
}
"$VENV_PY" -m pip install --quiet --upgrade pip || true

# --- 2. install dependencies ----------------------------------------------
if [ ! -f "$REQUIREMENTS" ]; then
  echo "ERROR: $REQUIREMENTS not found. Generate it with:" >&2
  echo "  python3 $ENGINE_DIR/scripts/generate-requirements.py --write" >&2
  exit 1
fi
echo "==> installing AI engine dependencies (first run can take a few minutes)..."
"$VENV_PY" -m pip install -r "$REQUIREMENTS"

# --- 3. make the vendored nanobot importable in the venv ------------------
# A .pth file is used instead of `pip install -e .` so no build backend
# (hatchling) is required and no upstream build hook runs.
SITE_DIR="$("$VENV_PY" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
rm -f "$SITE_DIR/_ai_engine.pth"
printf '%s\n' "$ENGINE_DIR" > "$SITE_DIR/_ai_engine.pth"

# --- 4. sanity import ------------------------------------------------------
if ! "$VENV_PY" -c "import nanobot, aiohttp; print('    nanobot', nanobot.__version__, '| aiohttp', aiohttp.__version__)"; then
  echo "ERROR: nanobot failed to import inside .venv-ai." >&2
  echo "       Check the pip output above; missing deps are the usual cause." >&2
  exit 1
fi

# --- 5. config --------------------------------------------------------------
mkdir -p "$DATA_AI"
if [ -f "$CONFIG_TARGET" ]; then
  echo "==> keeping existing config: $CONFIG_TARGET"
else
  echo "==> generating $CONFIG_TARGET from config.example.json"
  if [ ! -f "$CONFIG_EXAMPLE" ]; then
    echo "ERROR: $CONFIG_EXAMPLE not found." >&2
    exit 1
  fi

  # Resolve the API key (never stored in git; .data/ is git-ignored).
  API_KEY="${DEEPSEEK_API_KEY:-${NUXT_OPENAI_API_KEY:-}}"
  if [ -z "$API_KEY" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    API_KEY="$(grep -E '^NUXT_OPENAI_API_KEY=' "$PROJECT_ROOT/.env" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
  fi
  if [ -z "$API_KEY" ]; then
    echo "ERROR: no API key found." >&2
    echo "       Export one of DEEPSEEK_API_KEY / NUXT_OPENAI_API_KEY, or add" >&2
    echo "       NUXT_OPENAI_API_KEY=<key> to $PROJECT_ROOT/.env, then re-run setup." >&2
    exit 1
  fi
  # JSON-escape the value (keys are normally plain, but be safe).
  ESCAPED="$(printf '%s' "$API_KEY" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  sed "s|\${DEEPSEEK_API_KEY}|$ESCAPED|g" "$CONFIG_EXAMPLE" > "$CONFIG_TARGET"
  echo "    API key resolved from environment / .env (written to git-ignored .data/ai/config.json)"
fi

echo ""
echo "==> setup complete."
echo "    manual start : npm run ai:start"
echo "    manual stop  : npm run ai:stop"
echo "    health check : curl http://127.0.0.1:8900/health"
echo "    (the Nuxt server also auto-starts the engine on boot when healthy)"

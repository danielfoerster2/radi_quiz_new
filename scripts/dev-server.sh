#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BINARY="${PYTHON:-python3}"
NPM_BINARY="${NPM:-npm}"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"
REQUIREMENTS_FILE="$ROOT_DIR/requirements.txt"
BACKEND_ENV_FILE="$ROOT_DIR/backend/.env"

log() {
  echo "[dev] $*"
}

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    log "Loading environment variables from ${env_file#$ROOT_DIR/}"
    set -a
    # shellcheck source=/dev/null
    . "$env_file"
    set +a
  fi
}

if ! command -v "$PYTHON_BINARY" >/dev/null 2>&1; then
  echo "Error: python executable '$PYTHON_BINARY' not found." >&2
  exit 1
fi

if ! command -v "$NPM_BINARY" >/dev/null 2>&1; then
  echo "Error: npm executable '$NPM_BINARY' not found." >&2
  exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
  log "Creating Python virtual environment at $VENV_DIR"
  "$PYTHON_BINARY" -m venv "$VENV_DIR"
fi

VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

if [[ ! -x "$VENV_PIP" ]]; then
  echo "Error: pip executable not found in $VENV_DIR. Remove the directory and rerun." >&2
  exit 1
fi

if [[ -f "$REQUIREMENTS_FILE" ]]; then
  log "Installing backend dependencies from requirements.txt"
  "$VENV_PIP" install --upgrade pip
  "$VENV_PIP" install -r "$REQUIREMENTS_FILE"
else
  log "No requirements.txt found; skipping backend dependency installation"
fi

if [[ -d "$ROOT_DIR/frontend" ]]; then
  log "Installing frontend dependencies with npm"
  (cd "$ROOT_DIR/frontend" && "$NPM_BINARY" install)
else
  log "Frontend directory missing; skipping npm install"
fi

export FLASK_APP="${FLASK_APP:-backend}"
export FLASK_ENV="${FLASK_ENV:-development}"

load_env_file "$ROOT_DIR/.env"
load_env_file "$BACKEND_ENV_FILE"

log "Launching backend dev server on http://localhost:5000"
(
  cd "$ROOT_DIR"
  "$VENV_PYTHON" -m flask run --debug --port 5000
) &
BACKEND_PID=$!

log "Launching frontend dev server on http://localhost:5173"
(
  cd "$ROOT_DIR/frontend"
  "$NPM_BINARY" run dev
) &
FRONTEND_PID=$!

CLEANED_UP=0

cleanup() {
  if [[ "${CLEANED_UP}" -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  for pid in "${BACKEND_PID:-}" "${FRONTEND_PID:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

terminate() {
  cleanup
  exit 130
}

trap terminate INT TERM
trap cleanup EXIT

wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_STATUS=$?

cleanup
exit "$EXIT_STATUS"

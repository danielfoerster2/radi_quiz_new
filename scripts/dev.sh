#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ -d "${PROJECT_ROOT}/.venv" ]]; then
  # shellcheck disable=SC1090
  source "${PROJECT_ROOT}/.venv/bin/activate"
fi

export FLASK_APP=backend.app
export FLASK_ENV=${FLASK_ENV:-development}

cd "${PROJECT_ROOT}"

flask run --debug &
BACKEND_PID=$!

cleanup() {
  if ps -p ${BACKEND_PID} >/dev/null 2>&1; then
    kill ${BACKEND_PID}
  fi
}
trap cleanup EXIT

cd "${PROJECT_ROOT}/frontend"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev

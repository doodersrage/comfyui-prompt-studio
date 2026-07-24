#!/usr/bin/env bash
# Start Diffusers engine with the project venv (not system uvicorn).
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "Missing .venv — create it first:" >&2
  echo "  python -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
export COMFYUI_ROOT="${COMFYUI_ROOT:-/opt/comfyui}"
HOST="${DIFFUSERS_LISTEN_HOST:-127.0.0.1}"
PORT="${DIFFUSERS_LISTEN_PORT:-8190}"
# Allow: ./run.sh --port 8191
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done
exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"

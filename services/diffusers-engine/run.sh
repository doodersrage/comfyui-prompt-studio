#!/usr/bin/env bash
# Start Diffusers engine with a project-local or external venv.
#
# Prefer an external venv so Next.js/Turbopack never walks Python symlinks
# under services/diffusers-engine/.venv (those point at /usr/bin and panic NFT).
set -euo pipefail
ENGINE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ENGINE_DIR"

resolve_venv() {
  if [[ -n "${DIFFUSERS_VENV:-}" && -x "${DIFFUSERS_VENV}/bin/uvicorn" ]]; then
    printf '%s\n' "$DIFFUSERS_VENV"
    return 0
  fi
  # XDG cache (outside the Next.js project tree)
  local cache_venv="${XDG_CACHE_HOME:-$HOME/.cache}/comfyui-prompt-studio/diffusers-engine/.venv"
  if [[ -x "${cache_venv}/bin/uvicorn" ]]; then
    printf '%s\n' "$cache_venv"
    return 0
  fi
  # Legacy in-tree venv (works, but can break `next build` / `next dev` with Turbopack)
  if [[ -x "${ENGINE_DIR}/.venv/bin/uvicorn" ]]; then
    printf '%s\n' "${ENGINE_DIR}/.venv"
    return 0
  fi
  return 1
}

if ! VENV="$(resolve_venv)"; then
  CACHE_VENV="${XDG_CACHE_HOME:-$HOME/.cache}/comfyui-prompt-studio/diffusers-engine/.venv"
  echo "Missing Diffusers venv — create it outside the Next.js tree:" >&2
  echo "  python -m venv \"$CACHE_VENV\"" >&2
  echo "  \"$CACHE_VENV/bin/pip\" install -r \"$ENGINE_DIR/requirements.txt\"" >&2
  echo "Or set DIFFUSERS_VENV=/path/to/venv" >&2
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
exec "$VENV/bin/uvicorn" app.main:app --host "$HOST" --port "$PORT"

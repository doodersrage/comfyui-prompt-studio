#!/usr/bin/env bash
# Pre-extract Tauri's linuxdeploy AppImages so CI can bundle without FUSE.
set -euo pipefail

CACHE="${HOME}/.cache/tauri"
ROOT="${TMPDIR:-/tmp}/prompt-studio-linuxdeploy"
mkdir -p "$CACHE" "$ROOT"

extract_appimage() {
  local url="$1"
  local dest_dir="$2"
  local cache_name="$3"
  local archive="${ROOT}/${cache_name}"
  curl -fsSL -o "$archive" "$url"
  local offset
  offset="$(python3 -c "
from pathlib import Path
data = Path('${archive}').read_bytes()
offset = data.find(b'hsqs')
if offset < 0:
    raise SystemExit('squashfs magic not found in ${cache_name}')
print(offset)
")"
  rm -rf "$dest_dir"
  unsquashfs -o "$offset" -d "$dest_dir" "$archive" >/dev/null
  printf '%s\n' '#!/bin/sh' "exec '${dest_dir}/AppRun' \"\$@\"" > "${CACHE}/${cache_name}"
  chmod +x "${CACHE}/${cache_name}" "${dest_dir}/AppRun"
  echo "Staged ${cache_name} -> ${dest_dir}"
}

extract_appimage \
  'https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy/linuxdeploy-x86_64.AppImage' \
  "${ROOT}/linuxdeploy" \
  'linuxdeploy-x86_64.AppImage'

extract_appimage \
  'https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage' \
  "${ROOT}/linuxdeploy-plugin-appimage" \
  'linuxdeploy-plugin-appimage-x86_64.AppImage'

#!/usr/bin/env bash
#
# Install a Prompt Studio Linux .deb without clobbering system /usr/bin/node.
#
# Stock Tauri .deb packages put the Node sidecar at /usr/bin/node, which breaks
# Arch/Fedora hosts that already ship Node. This script relocates the app binary
# and sidecar under /usr/lib/PromptStudio and only symlinks `prompt-studio`.
#
# Usage (as root):
#   sudo ./desktop/scripts/install-from-deb.sh [/path/to/PromptStudio_X.Y.Z_amd64.deb]
#
# Dependencies: webkit2gtk-4.1 / gtk3 (Arch: webkit2gtk-4.1 gtk3), ar, tar.
#
set -euo pipefail

DEB="${1:-}"
if [[ -z "$DEB" ]]; then
  if [[ -f PromptStudio_*_amd64.deb ]]; then
    DEB="$(ls -1t PromptStudio_*_amd64.deb | head -1)"
  elif [[ -f "$HOME/Downloads/PromptStudio_"*_amd64.deb ]]; then
    DEB="$(ls -1t "$HOME"/Downloads/PromptStudio_*_amd64.deb | head -1)"
  else
    echo "Usage: $0 /path/to/PromptStudio_X.Y.Z_amd64.deb" >&2
    exit 1
  fi
fi

if [[ ! -f "$DEB" ]]; then
  echo "Deb not found: $DEB" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo) so files can land under /usr/lib and /usr/bin." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -f "$DEB" "$WORK/pkg.deb"
cd "$WORK"
ar x pkg.deb
tar xf data.tar.*

install -d /usr/lib/PromptStudio
if [[ -d usr/lib/PromptStudio ]]; then
  cp -a usr/lib/PromptStudio/. /usr/lib/PromptStudio/
fi
install -m755 usr/bin/prompt-studio /usr/lib/PromptStudio/prompt-studio
install -m755 usr/bin/node /usr/lib/PromptStudio/node
ln -sfn /usr/lib/PromptStudio/prompt-studio /usr/bin/prompt-studio

if [[ -d usr/share/applications ]]; then
  install -d /usr/share/applications
  cp -a usr/share/applications/. /usr/share/applications/
fi
if [[ -d usr/share/icons ]]; then
  install -d /usr/share/icons
  cp -a usr/share/icons/. /usr/share/icons/
fi

echo "Installed Prompt Studio from $(basename "$DEB")."
echo "  binary: /usr/lib/PromptStudio/prompt-studio"
echo "  node:   /usr/lib/PromptStudio/node (sidecar; system node untouched)"
echo "  link:   /usr/bin/prompt-studio"
echo
echo "Launch: prompt-studio"
echo "Updates: Settings → Overview → Check for updates, then re-run this script with the new .deb."

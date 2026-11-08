#!/usr/bin/env bash
# Build the avatar source files at the size the UI actually uses.
#
# The portraits are authored at 512px, but VoiceAvatar renders them at 48-96px
# (96 * 2 for a Retina display = 192px). Shipping 512px originals meant every
# avatar downloaded ~36 KB instead of ~3.4 KB.
#
# Usage: scripts/build_voice_icons.sh [master_px]
set -euo pipefail
cd "$(dirname "$0")/../public/voice-icons"

MASTER="${1:-128}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for f in *.webp; do
  [ -e "$f" ] || continue
  convert "$f" -resize "${MASTER}x${MASTER}" -strip -quality 86 "$TMP/$f"
  mv "$TMP/$f" "$f"
done

echo "rebuilt $(ls -1 *.webp | wc -l) avatars at ${MASTER}px"
du -sh .

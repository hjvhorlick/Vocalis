#!/usr/bin/env bash
# Downscale generated persona portraits to 512px WebP for the app.
# Originals are large PNGs; the UI only ever shows these at <=256px.
set -euo pipefail
cd "$(dirname "$0")/../public/voice-icons"
for png in *.png; do
  [ -e "$png" ] || continue
  out="${png%.png}.webp"
  convert "$png" -resize 512x512 -strip -quality 88 "$out"
  rm -f "$png"
done
ls -1 *.webp | wc -l
du -sh .

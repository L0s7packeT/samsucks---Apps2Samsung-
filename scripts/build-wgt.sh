#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build/app"
WGT="$ROOT/build/samsucks-tizen6-unsigned.wgt"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$ROOT/app/." "$OUT/"
VERSION="$(sed -n 's/.*<widget.* version="\([^"]*\)".*/\1/p' "$OUT/config.xml")"
[ -n "$VERSION" ] || { echo "Missing widget version" >&2; exit 1; }
sed -i.bak "s/^export const VERSION = .*/export const VERSION = '$VERSION';/" "$OUT/js/config.js"
rm -f "$OUT/js/config.js.bak"

# Chromium 76 on Tizen 6.0 has limited module-loading support.
# Bundle the app into a single classic script compatible with this browser.
"$ROOT/node_modules/.bin/esbuild" "$OUT/js/main.js" \
  --bundle --format=iife --target=chrome76 --platform=browser \
  --outfile="$OUT/js/bundle.js"
# The bundle contains application dependencies; do not ship obsolete modules.
find "$OUT/js" -type f ! -name bundle.js -delete
find "$OUT/js" -depth -type d -empty -delete
rm -f "$WGT"
(cd "$OUT" && zip -q -r "$WGT" .)
echo "Built $WGT"

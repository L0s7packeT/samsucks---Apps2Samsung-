#!/usr/bin/env bash
# Produce an unsigned Tizen web widget for external signing and installation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build/app"
WGT="$ROOT/build/samsucks-tizen6-unsigned.wgt"

rm -rf "$OUT"
mkdir -p "$ROOT/build"
cp -R "$ROOT/app" "$OUT"

# Strip development-only modules and keep the version in sync with the manifest.
rm -rf "$OUT/js/dev"
VERSION="$(sed -n 's/.*<widget.* version="\([^"]*\)".*/\1/p' "$OUT/config.xml")"
[ -n "$VERSION" ] || { echo "Missing widget version" >&2; exit 1; }
sed -i.bak "s/^export const VERSION = .*/export const VERSION = '$VERSION';/" "$OUT/js/config.js"
rm -f "$OUT/js/config.js.bak"

# Preserve the production preload behavior of scripts/deploy.sh.
PRELOADS="$(cd "$OUT" && find js -type f -name '*.js' | sort | sed 's|.*|<link rel="modulepreload" href="&">|' | tr '\n' ' ')"
sed -i.bak "s|</head>|$PRELOADS</head>|" "$OUT/index.html"
rm -f "$OUT/index.html.bak"

# WGT is a ZIP archive containing the application files at its root.
# Signing is deliberately left to the installer; no certificates are included.
rm -f "$WGT"
(cd "$OUT" && zip -q -r "$WGT" .)
echo "Built $WGT"

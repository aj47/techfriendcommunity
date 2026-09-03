#!/usr/bin/env bash
# Regenerates the favicon, app icons and link-preview card in public/ from the
# SVG sources in assets/brand/.
#
# The outputs are committed, so none of this runs during `npm run build` and a
# contributor needs none of these tools. Re-run it only when a source SVG
# changes:
#
#   sudo apt-get install -y librsvg2-bin imagemagick pngquant optipng fonts-inter
#   ./scripts/gen-brand.sh
#
# fonts-inter is not optional: og.svg sets type in Inter and Inter Display, and
# rsvg resolves families through fontconfig, so a box without it renders the
# card in whatever default the system has and the card ships looking wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

for tool in rsvg-convert convert pngquant optipng; do
  command -v "$tool" >/dev/null || { echo "gen-brand: missing $tool — see this script's header" >&2; exit 1; }
done
fc-list : family | tr ',' '\n' | grep -qx 'Inter' \
  || echo "gen-brand: warning — Inter is not installed, og.png will not match the site" >&2

SRC=assets/brand
OUT=public
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# rsvg renders it, pngquant palettes it, optipng squeezes the result. The card
# drops ~60% this way with no banding visible in its gradients at 2x. Every byte
# here is base64-inlined into convex/staticAssets.generated.ts and shipped
# inside the Convex module, so the two extra passes pay for themselves.
#
# optipng writes into the temp dir and the result is moved into place: pointed
# straight at an existing output it leaves a .bak beside it, and those would go
# on to be picked up by gen-static-assets.mjs and served.
png() { # svg size dest
  rsvg-convert -w "$2" -h "$2" "$1" -o "$TMP/raw.png"
  pngquant --quality 85-100 --speed 1 --force --output "$TMP/q.png" "$TMP/raw.png" 2>/dev/null \
    || cp "$TMP/raw.png" "$TMP/q.png"
  optipng -quiet -o2 -out "$TMP/final.png" "$TMP/q.png"
  mv -f "$TMP/final.png" "$3"
}

cp "$SRC/mark.svg" "$OUT/favicon.svg"

# Modern browsers take the SVG; .ico is for the ones that never ask for it
# (older Safari, feed readers, Windows pinned sites) and is the only icon some
# link scrapers look for. Three sizes in the one file.
for s in 16 32 48; do rsvg-convert -w "$s" -h "$s" "$SRC/mark.svg" -o "$TMP/ico-$s.png"; done
convert "$TMP/ico-16.png" "$TMP/ico-32.png" "$TMP/ico-48.png" "$OUT/favicon.ico"

png "$SRC/tile.svg"          180 "$OUT/apple-touch-icon.png"
png "$SRC/tile.svg"          192 "$OUT/icon-192.png"
png "$SRC/tile.svg"          512 "$OUT/icon-512.png"
png "$SRC/tile-maskable.svg" 512 "$OUT/icon-maskable-512.png"

# The card is the one non-square output.
rsvg-convert -w 1200 -h 630 "$SRC/og.svg" -o "$TMP/og-raw.png"
pngquant --quality 85-100 --speed 1 --force --output "$TMP/og-q.png" "$TMP/og-raw.png" 2>/dev/null \
  || cp "$TMP/og-raw.png" "$TMP/og-q.png"
optipng -quiet -o2 -out "$TMP/og-final.png" "$TMP/og-q.png"
mv -f "$TMP/og-final.png" "$OUT/og.png"

ls -l "$OUT/favicon.svg" "$OUT/favicon.ico" "$OUT/apple-touch-icon.png" \
      "$OUT/icon-192.png" "$OUT/icon-512.png" "$OUT/icon-maskable-512.png" "$OUT/og.png"

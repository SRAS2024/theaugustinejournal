#!/bin/sh
# scripts/favicon/build.sh
#
# Rebuilds every site icon in public/icons from the two drawings of the book
# (book.py, book_small.py) on the site's own background (tile.swift: the
# charcoal, public/img/grain.png and the faint purple glow). macOS only: it
# needs python3 and swiftc (Xcode command line tools).
#
#   16, 32, 48 px   favicon-*.png, favicon.ico, favicon.svg   the small book, rounded square
#   96, 192, 512    favicon-96.png, icon-192.png, icon-512.png the detailed book, rounded square
#   180             apple-touch-icon.png                       square: iOS rounds it
#   512 maskable    icon-maskable-512.png                      square, book inside Android's safe zone
#   1200            og-image.jpg                               link previews (Open Graph, X, iMessage, WhatsApp)
#
# After a rebuild, raise ICON_VERSION in views/partials/icons.ejs and the ?v=
# in public/site.webmanifest so browsers fetch the new files (and rename
# og-image.jpg if it changes: link previews cache it by its address).
set -eu
cd "$(dirname "$0")"
OUT=../../public/icons
GRAIN=../../public/img/grain.png
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 book.py "$TMP/book.svg"
python3 book_small.py "$TMP/book-small.svg"
swiftc -O -o "$TMP/tile" tile.swift

for px in 16 32 48; do
  "$TMP/tile" "$TMP/book-small.svg" "$OUT/favicon-$px.png" $px 0 0.19 "$GRAIN"
done
"$TMP/tile" "$TMP/book.svg" "$OUT/favicon-96.png" 96 0.075 0.19 "$GRAIN" 1
"$TMP/tile" "$TMP/book.svg" "$OUT/icon-192.png" 192 0.075 0.18 "$GRAIN" 1
"$TMP/tile" "$TMP/book.svg" "$OUT/icon-512.png" 512 0.075 0.18 "$GRAIN" 1
"$TMP/tile" "$TMP/book.svg" "$OUT/apple-touch-icon.png" 180 0.075 0 "$GRAIN" 1
"$TMP/tile" "$TMP/book.svg" "$OUT/icon-maskable-512.png" 512 0.14 0 "$GRAIN" 1
# JPEG: the grain makes a PNG about 1.4 MB, and WhatsApp drops preview images over about 300 KB
"$TMP/tile" "$TMP/book.svg" "$TMP/og-image.png" 1200 0.1 0 "$GRAIN" 1
sips -s format jpeg -s formatOptions 78 "$TMP/og-image.png" --out "$OUT/og-image.jpg" >/dev/null

python3 assemble.py svg "$TMP/book-small.svg" "$OUT/favicon.svg"
python3 assemble.py ico "$OUT/favicon.ico" "$OUT/favicon-16.png" "$OUT/favicon-32.png" "$OUT/favicon-48.png"
echo "Icons written to public/icons."

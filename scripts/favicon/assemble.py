#!/usr/bin/env python3
"""Two finishing steps for build.sh:

  assemble.py svg <book-small.svg> <favicon.svg>
      the browser-tab SVG: the small book on the site's charcoal in a rounded
      square, with the faint purple glow at the top (the grain is left out: it
      is invisible at tab size)
  assemble.py ico <favicon.ico> <16.png> <32.png> <48.png>
      a .ico holding the PNGs as they are (every current browser reads these)
"""
import re, struct, sys

CORNER = 0.19 * 512                     # matches tile.swift's corner for 16-48 px


def svg(book_path, out_path):
    book = open(book_path).read()
    defs = re.search(r"<defs>(.*?)</defs>", book, re.S).group(1)
    body = re.search(r'(<g transform="scale\(32\)">.*</g>)\s*</svg>', book, re.S).group(1)
    out = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>The Augustine Journal</title>
<defs>
<clipPath id="tile"><rect width="512" height="512" rx="{CORNER:.2f}"/></clipPath>
<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="512" gradientTransform="translate(256 0) scale(0.7 0.5)">
  <stop offset="0" stop-color="#5b2d8e" stop-opacity="0.075"/><stop offset="0.7" stop-color="#5b2d8e" stop-opacity="0"/>
</radialGradient>{defs}</defs>
<g clip-path="url(#tile)">
<rect width="512" height="512" fill="#131211"/>
<rect width="512" height="512" fill="url(#glow)"/>
{body}
</g>
</svg>
'''
    open(out_path, "w").write(out)


def ico(out_path, pngs):
    images = [open(p, "rb").read() for p in pngs]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries = b""
    for data in images:
        w, h = struct.unpack(">II", data[16:24])            # from the PNG's IHDR
        entries += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    open(out_path, "wb").write(header + entries + b"".join(images))


if __name__ == "__main__":
    if sys.argv[1] == "svg":
        svg(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "ico":
        ico(sys.argv[2], sys.argv[3:])
    else:
        sys.exit(__doc__)

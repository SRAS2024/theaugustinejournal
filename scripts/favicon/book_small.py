#!/usr/bin/env python3
"""The same book as book.py, simplified for 16, 32 and 48 px: drawn on a
16-unit grid (1 unit = 32 in the 512 viewBox) so the upright edges land on
whole pixels. The book is drawn spine-right and mirrored so it faces right;
the quill is not mirrored and keeps its lower-left to upper-right slant."""
import math, os, sys
QUILL = os.environ.get("QUILL", "ivory")

OUT = sys.argv[1] if len(sys.argv) > 1 else "book-small.svg"
A = dict(
    XF=5.0, XS=13.0,         # cover: fore-side (left) and spine-side (right) edges
    YT=5.25, HC=9.75,         # cover top-left y, cover height at the fore side
    TOP_DROP=2.25,           # cover top rises this much from fore side to spine side
    BOT_DROP=2.5,           # cover bottom rises this much
    DX=3.0, DY=2.0,          # depth: cover -> outer face of the far board (up-left)
    PG=2.0,                  # pages' share of DX (rest is the far board)
    HUMP=0.25,               # rounded spine cap bulge
    RIM_S=0.75, RIM_S_COL="#5e5750",   # spine-side rim width/colour
    RIM_B=0.6, RIM_B_COL="#57504a",    # tail rim
    BB_LIT="#6f665d", BB_DARK="#24201d",
    Q_NIB=(4.4, 14.4), Q_TIP=(9.2, 6.2),   # on the right-facing book (it is mirrored below)
    Q_V0=0.3, Q_WL=1.4, Q_WR=0.8, Q_SH=0.5, Q_NIBLEN=0.13,
    BOW=0.3, RACHIS=0.25, RACHIS_COL="#b3a78f" if QUILL == "ivory" else "#a59c91",
    NOTCH=True, TOPHL=0.3, TOPHL_COL="#4f4842",
)
for kv in sys.argv[2:]:
    k, v = kv.split("=")
    A[k] = type(A[k])(eval(v)) if not isinstance(A[k], str) else v

def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
def f(p):
    return f"{p[0]:.3f},{p[1]:.3f}"
def add(p, d, k=1.0):
    return (p[0] + d[0] * k, p[1] + d[1] * k)

XF, XS, YT, HC = A["XF"], A["XS"], A["YT"], A["HC"]
F_TL = (XF, YT); F_TR = (XS, YT - A["TOP_DROP"])
F_BL = (XF, YT + HC); F_BR = (XS, YT + HC - A["BOT_DROP"])
D = (-A["DX"], -A["DY"])
kp = A["PG"] / A["DX"]                 # depth fraction occupied by the pages
B_TL = add(F_TL, D); B_TR = add(F_TR, D); B_BL = add(F_BL, D)
P_TL = add(F_TL, D, kp); P_TR = add(F_TR, D, kp); P_BL = add(F_BL, D, kp)

parts = []
# 1. silhouette of the whole book (dark leather), rounded spine cap at top-right
mid = lerp(F_TR, B_TR, 0.5)
ctl = (mid[0] + A["HUMP"] * 1.25, mid[1] - A["HUMP"])
parts.append(f'<path d="M{f(F_BL)} L{f(B_BL)} L{f(B_TL)} L{f(B_TR)} Q{f(ctl)} {f(F_TR)} L{f(F_BR)} Z" fill="#1a1715"/>')
# 2. far board: lit top edge + lit fore-side edge (outer half lit, inner half dark)
parts.append(f'<path d="M{f(B_TL)} L{f(B_TR)} Q{f(ctl)} {f(F_TR)} L{f(P_TR)} L{f(P_TL)} Z" fill="#5a534c"/>')
parts.append(f'<path d="M{f(B_TL)} L{f(P_TL)} L{f(P_BL)} L{f(B_BL)} Z" fill="{A["BB_DARK"]}"/>')
parts.append(f'<path d="M{f(B_TL)} L{f(lerp(B_TL, P_TL, 0.5))} L{f(lerp(B_BL, P_BL, 0.5))} L{f(B_BL)} Z" fill="url(#bb)"/>')
# 3. head of the pages (ivory)
parts.append(f'<path d="M{f(F_TL)} L{f(F_TR)} L{f(P_TR)} L{f(P_TL)} Z" fill="#f2ecdf"/>')
# 4. fore-edge (ivory, shaded toward the tail)
parts.append(f'<path d="M{f(F_TL)} L{f(P_TL)} L{f(P_BL)} L{f(F_BL)} Z" fill="url(#fore)"/>')
# 5. cover face + board edges
parts.append(f'<path d="M{f(F_BL)} L{f(F_TL)} L{f(F_TR)} L{f(F_BR)} Z" fill="url(#leather)"/>')
if A["TOPHL"] > 0:
    parts.append(f'<path d="M{f(F_TL)} L{f(F_TR)} L{f(add(F_TR, (0, A["TOPHL"])))} L{f(add(F_TL, (0, A["TOPHL"])))} Z" fill="{A["TOPHL_COL"]}"/>')
rs = A["RIM_S"]
parts.append(f'<path d="M{f((XS - rs, F_TR[1] + 0.2))} L{f(F_TR)} L{f(F_BR)} L{f((XS - rs, F_BR[1] + A["BOT_DROP"] * rs / (XS - XF)))} Z" fill="{A["RIM_S_COL"]}"/>')
rb = A["RIM_B"]
parts.append(f'<path d="M{f(F_BL)} L{f(F_BR)} L{f(add(F_BR, (0, -rb)))} L{f(add(F_BL, (0, -rb)))} Z" fill="{A["RIM_B_COL"]}"/>')

QS = {
  "ivory": dict(v0="#f7f3ea", v1="#eee8d8", v2="#d6ccb4", shaft="#e4d9c2"),
  "charcoal": dict(v0="#6b645d", v1="#56504a", v2="#433e39", shaft="#6e675f"),
}[QUILL]
# 6. quill (not mirrored: it keeps its lower-left -> upper-right direction)
BOOK_N = len(parts)
N, Tp = A["Q_NIB"], A["Q_TIP"]
dx, dy = Tp[0] - N[0], Tp[1] - N[1]
L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
nx, ny = uy, -ux                    # left (upper-left) normal
def at(t, w=0.0):
    b = A["BOW"] * math.sin(math.pi * t) * (1 - 0.35 * t)
    return (N[0] + dx * t + nx * (w - b), N[1] + dy * t + ny * (w - b))
V0 = A["Q_V0"]
def prof(t, wmax, notch=None):
    s = (t - V0) / (1 - V0)
    if s <= 0 or s >= 1: return 0.0
    rise = math.sin(min(1.0, s / 0.18) * math.pi / 2)
    fall = 1.0 if s < 0.55 else max(0.0, 1 - ((s - 0.55) / 0.45) ** 2) ** 0.7
    w = wmax * rise * fall
    if notch and abs(s - notch[0]) < notch[2]:
        w *= 1 - notch[1] * (1 - abs(s - notch[0]) / notch[2])
    return w
ts = [V0 + (1 - V0) * i / 40 for i in range(41)]
nL = (0.42, 0.55, 0.07) if A["NOTCH"] else None
vane = [at(t, prof(t, A["Q_WL"], nL)) for t in ts] + [at(t, -prof(t, A["Q_WR"])) for t in reversed(ts)]
parts.append('<path d="M' + " L".join(f(p) for p in vane) + 'Z" fill="url(#vane)"/>')
sh = A["Q_SH"] / 2
t0, t1 = A["Q_NIBLEN"], V0 + 0.06
parts.append(f'<path d="M{f(at(t0, sh))} L{f(at(t1, sh * 1.25))} L{f(at(t1, -sh * 1.25))} L{f(at(t0, -sh))} Z" fill="{QS["shaft"]}"/>')
parts.append(f'<path d="M{f(at(t0 + 0.01, sh * 1.05))} L{f(at(0.0))} L{f(at(t0 + 0.01, -sh * 1.05))} Z" fill="#1a1714"/>')

if A["RACHIS"] > 0:
    rl = [at(V0 + 0.04 + (0.93 - V0) * i / 20) for i in range(21)]
    parts.append('<path d="M' + " L".join(f(p) for p in rl) + f'" fill="none" stroke="{A["RACHIS_COL"]}" stroke-width="{A["RACHIS"]}" stroke-linecap="round"/>')
qa, qb = at(0.65, A["Q_WL"]), at(0.65, -A["Q_WR"])
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
<linearGradient id="leather" gradientUnits="userSpaceOnUse" x1="{XF}" y1="{YT}" x2="{XS}" y2="{YT + HC}">
  <stop offset="0" stop-color="#2b2723"/><stop offset="1" stop-color="#110f0e"/>
</linearGradient>
<linearGradient id="fore" gradientUnits="userSpaceOnUse" x1="0" y1="{YT}" x2="0" y2="{YT + HC}">
  <stop offset="0" stop-color="#ebe3d1"/><stop offset="1" stop-color="#c8bda3"/>
</linearGradient>
<linearGradient id="bb" gradientUnits="userSpaceOnUse" x1="0" y1="{B_TL[1]}" x2="0" y2="{B_BL[1]}">
  <stop offset="0" stop-color="{A["BB_LIT"]}"/><stop offset="1" stop-color="#3d3833"/>
</linearGradient>
<linearGradient id="vane" gradientUnits="userSpaceOnUse" x1="{qa[0]:.3f}" y1="{qa[1]:.3f}" x2="{qb[0]:.3f}" y2="{qb[1]:.3f}">
  <stop offset="0" stop-color="{QS["v0"]}"/><stop offset="0.6" stop-color="{QS["v1"]}"/><stop offset="1" stop-color="{QS["v2"]}"/>
</linearGradient>
</defs>
<g transform="scale(32)">
<g transform="translate(16 0) scale(-1 1)">
{chr(10).join(parts[:BOOK_N])}
</g>
{chr(10).join(parts[BOOK_N:])}
</g>
</svg>
'''
open(OUT, "w").write(svg)

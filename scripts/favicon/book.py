#!/usr/bin/env python3
"""The site icon's book, detailed (used from 96 px up; see build.sh): a closed,
plain black leather book standing at a three-quarter angle, facing right
(spine on the left), with the ivory head (top pages) and fore-edge showing,
the far board's lit edge behind the pages, and an ivory goose quill leaning
against the cover, nib down at the foot. Writes a transparent 512 x 512 SVG;
QUILL=charcoal draws the quill in charcoal instead of ivory."""
import math, os, random, sys
QUILL = os.environ.get("QUILL", "ivory")

OUT = sys.argv[1] if len(sys.argv) > 1 else "book.svg"

# ---- 3D model (x: spine->fore-edge, y: tail->head, z: facing board->far board)
W, H, T = 300.0, 392.0, 150.0      # board width, height, total thickness
B = 11.0                           # board thickness
S = 9.0                            # squares (board overhang beyond pages)
CONC = 9.0                         # concave fore-edge depth
SPR = 13.0                         # spine bulge beyond x=0
CR = 12.0                          # board corner radius

YAW, PITCH, DIST = math.radians(32), math.radians(33), 2400.0
MIRROR = 1.0                       # spine on the left: the book faces right

def proj(x, y, z):
    x -= W / 2; y -= H / 2; z -= T / 2
    x1 = x * math.cos(YAW) + z * math.sin(YAW)
    z1 = -x * math.sin(YAW) + z * math.cos(YAW)
    y2 = y * math.cos(PITCH) + z1 * math.sin(PITCH)
    z2 = -y * math.sin(PITCH) + z1 * math.cos(PITCH)
    k = DIST / (DIST + z2)
    return (MIRROR * x1 * k, -y2 * k)

def board_outline(n=6):
    pts = [(0.0, 0.0)]
    for i in range(n + 1):
        a = -math.pi / 2 + (math.pi / 2) * i / n
        pts.append((W - CR + CR * math.cos(a), CR + CR * math.sin(a)))
    for i in range(n + 1):
        a = (math.pi / 2) * i / n
        pts.append((W - CR + CR * math.cos(a), H - CR + CR * math.sin(a)))
    pts.append((0.0, H))
    return pts

def spine_x(z):
    return -SPR * math.sin(math.pi * min(max(z / T, 0), 1))

def fore_x(z):
    t = (z - B) / (T - 2 * B)
    return W - S - CONC * math.sin(math.pi * min(max(t, 0), 1))

def hull(points):
    pts = sorted(set(points))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]

shapes = []   # (kind, pts2d_unfitted, attrs)
def poly(pts3, attrs):
    shapes.append(("poly", [proj(*p) for p in pts3], attrs))
def polyline(pts3, attrs):
    shapes.append(("line", [proj(*p) for p in pts3], attrs))
def hullpoly(pts3, attrs):
    shapes.append(("poly", hull([proj(*p) for p in pts3]), attrs))
def raw(kind, payload):
    shapes.append((kind, payload, None))

bo = board_outline()
NZ = 24
zs_all = [T * i / NZ for i in range(NZ + 1)]
zs = [B + (T - 2 * B) * i / NZ for i in range(NZ + 1)]

# 1. far board: silhouette, lit top, inner face (rim beside/above the pages)
hullpoly([(x, y, z) for (x, y) in bo for z in (T - B, T)], {"fill": "url(#backEdge)"})
poly([(x, H, T - B) for x in (0, W - CR)] + [(x, H, T) for x in (W - CR, 0)], {"fill": "url(#edgeTop)"})
poly([(x, y, T - B) for (x, y) in bo], {"fill": "#16130f"})
# lit rim along the far board's fore-side edge (catches the upper-left light)
polyline([(W - 0.5, H - CR, T - B * 0.5), (W - 0.5, CR, T - B * 0.5)],
         {"stroke": "#6f665d", "stroke-width": "2.2", "stroke-opacity": "0.85", "fill": "none", "stroke-linecap": "round"})

# 2. spine body (silhouette at the far right)
hullpoly([(spine_x(z), y, z) for z in zs_all for y in (0, H)] + [(0, 0, 0), (0, H, 0), (0, 0, T), (0, H, T)],
         {"fill": "#0f0e0d"})

# 3. page block: fore-edge (lit from the left), then head
fore = [(fore_x(z), H - S, z) for z in zs] + [(fore_x(z), S, z) for z in reversed(zs)]
poly(fore, {"fill": "url(#foreG)"})
random.seed(7)
for i in range(1, 26):
    z = B + (T - 2 * B) * (i + random.uniform(-0.3, 0.3)) / 26
    op = random.choice([0.16, 0.24, 0.32])
    polyline([(fore_x(z), H - S - 1, z), (fore_x(z), S + 1, z)],
             {"stroke": "#8f8470", "stroke-width": "0.85", "stroke-opacity": str(op), "fill": "none"})
# shade near the far board and near the facing board
poly([(fore_x(z), H - S, z) for z in zs[-4:]] + [(fore_x(z), S, z) for z in reversed(zs[-4:])],
     {"fill": "#6b5f4a", "fill-opacity": "0.20"})
poly([(fore_x(z), H - S, z) for z in zs[:3]] + [(fore_x(z), S, z) for z in reversed(zs[:3])],
     {"fill": "#6b5f4a", "fill-opacity": "0.14"})
# tail shading: the fore-edge darkens toward the foot
def head_left(z):
    return spine_x(z) * 0.55 + 4
head = [(head_left(z), H - S, z) for z in zs] + [(fore_x(z), H - S, z) for z in reversed(zs)]
poly(head, {"fill": "url(#headG)"})
for i in range(1, 24):
    z = B + (T - 2 * B) * (i + random.uniform(-0.3, 0.3)) / 24
    op = random.choice([0.14, 0.2, 0.27])
    polyline([(head_left(z) + 6, H - S, z), (fore_x(z) - 1.5, H - S, z)],
             {"stroke": "#9a8e76", "stroke-width": "0.8", "stroke-opacity": str(op), "fill": "none"})
poly([(head_left(z), H - S, z) for z in zs[-5:]] + [(fore_x(z), H - S, z) for z in reversed(zs[-5:])],
     {"fill": "#6b5f4a", "fill-opacity": "0.18"})

# 4. spine head-cap
cap_out = [(spine_x(z), H, z) for z in zs_all]
cap_in = [(spine_x(z) * 0.4 + 9, H, z) for z in reversed(zs_all)]
poly(cap_out + cap_in, {"fill": "url(#capG)"})

# 5. facing board: edges, top strip, face
hullpoly([(x, y, z) for (x, y) in bo for z in (0, B)], {"fill": "url(#frontEdge)"})
poly([(x, H, 0) for x in (0, W - CR)] + [(x, H, B) for x in (W - CR, 0)], {"fill": "url(#edgeTop)"})
face = [(x, y, 0) for (x, y) in bo]
FACE_IDX = len(shapes)
poly(face, {"fill": "url(#leather)"})
poly(face, {"fill": "url(#pebble)"})
poly(face, {"fill": "url(#pebble2)"})
poly(face, {"fill": "url(#sheen)"})
# joint groove beside the spine
GX = 20
polyline([(GX, 6, 0), (GX, H - 6, 0)], {"stroke": "#050404", "stroke-width": "3.2", "stroke-opacity": "0.75", "fill": "none", "stroke-linecap": "round"})
polyline([(GX - 3.2, 6, 0), (GX - 3.2, H - 6, 0)], {"stroke": "#6b635a", "stroke-width": "1.3", "stroke-opacity": "0.30", "fill": "none", "stroke-linecap": "round"})
# rounded board edges catching light: head edge, fore edge (lit), spine edge, tail edge
polyline([(4, H - 1.5, 0), (W - CR, H - 1.5, 0)], {"stroke": "#8a8077", "stroke-width": "2", "stroke-opacity": "0.6", "fill": "none", "stroke-linecap": "round"})
polyline([(W - 1.5, H - CR, 0), (W - 1.5, CR, 0)], {"stroke": "#7a7066", "stroke-width": "2.2", "stroke-opacity": "0.6", "fill": "none", "stroke-linecap": "round"})
polyline([(1.5, H - 4, 0), (1.5, 4, 0)], {"stroke": "#5e5750", "stroke-width": "2.4", "stroke-opacity": "0.55", "fill": "none", "stroke-linecap": "round"})
polyline([(4, 1.5, 0), (W - CR, 1.5, 0)], {"stroke": "#4f4842", "stroke-width": "2.2", "stroke-opacity": "0.6", "fill": "none", "stroke-linecap": "round"})

# ---- fit (book + quill) ----------------------------------------------------
# quill placement in facing-board coordinates (u: fore side 0 -> spine 1, v: tail 0 -> head 1)
def cover_pt(u, v, z=0.0):
    return proj(W * (1 - u), H * v, z)
NIB = cover_pt(1 - 0.17, -0.075, -30)
TIP = cover_pt(1 - 0.76, 0.86, -2)
allp = [p for k, pts, _ in shapes if k in ("poly", "line") for p in pts] + [NIB, TIP]
minx = min(p[0] for p in allp); maxx = max(p[0] for p in allp)
miny = min(p[1] for p in allp); maxy = max(p[1] for p in allp)
M = 22
sc = min((512 - 2 * M) / (maxx - minx), (512 - 2 * M) / (maxy - miny))
ox = (512 - (maxx - minx) * sc) / 2 - minx * sc
oy = (512 - (maxy - miny) * sc) / 2 - miny * sc
def F(p):
    return (round(p[0] * sc + ox, 2), round(p[1] * sc + oy, 2))
def P(p3):
    return F(proj(*p3))
def pstr(pts):
    return " ".join(f"{x},{y}" for x, y in (F(p) for p in pts))
def sstr(pts):
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)


QC = {
  "ivory": dict(v0="#f7f3ea", v1="#ece5d4", v2="#d3c8af", s0="#f3ecdc", s1="#e2d6bb", s2="#b9aa8a",
                nib="#1a1714", nibhi="#8a8077", ink="#3a332c", wisp="#ece5d4", barb="#a39780",
                vout="#8f846e", sout="#7d725d", rflank="#b3a78e", rach="#fbf8f1"),
  "charcoal": dict(v0="#5d5751", v1="#47423d", v2="#34302c", s0="#6a635c", s1="#4e4842", s2="#36322e",
                nib="#0e0d0c", nibhi="#9a9088", ink="#1a1714", wisp="#47423d", barb="#968c81",
                vout="#8c8379", sout="#7a7169", rflank="#2a2623", rach="#bdb4a8"),
}[QUILL]
# ---- quill (drawn in fitted screen space) ----------------------------------
N = F(NIB); Tq = F(TIP)
dx, dy = Tq[0] - N[0], Tq[1] - N[1]
L = math.hypot(dx, dy)
ux, uy = dx / L, dy / L            # along the quill, nib -> tip
nx, ny = uy, -ux                   # normal (points to the upper-left side)
BOW = 0.045 * L                    # gentle curve, tip curling right
def rach(t):
    b = BOW * math.sin(math.pi * t) * (1 - 0.35 * t)
    return (N[0] + dx * t - nx * b, N[1] + dy * t - ny * b)
def tang(t, e=1e-3):
    a, b = rach(max(t - e, 0)), rach(min(t + e, 1))
    l = math.hypot(b[0] - a[0], b[1] - a[1])
    return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
def off(t, w):                     # point at t, offset w along the left normal
    p = rach(t); tx, ty = tang(t)
    return (p[0] + ty * w, p[1] - tx * w)

V0, VMAX = 0.24, 1.0
WL, WR = 0.074 * L, 0.041 * L      # half widths of the wide (left) and narrow (right) vanes
def prof(t, wmax, notch=None):
    s = (t - V0) / (VMAX - V0)
    if s <= 0 or s >= 1: return 0.0
    rise = math.sin(min(1.0, s / 0.15) * math.pi / 2)
    belly = 1.0 + 0.07 * math.sin(s * math.pi)
    fall = 1.0 if s < 0.6 else max(0.0, 1 - ((s - 0.6) / 0.4) ** 2) ** 0.62
    w = wmax * rise * belly * fall
    if notch:
        c, d, wd = notch
        if abs(s - c) < wd:
            w *= 1 - d * (1 - abs(s - c) / wd) ** 1.4
    return w
TS = [V0 + (VMAX - V0) * i / 90 for i in range(91)]
notchL = (0.44, 0.45, 0.04)
notchR = (0.70, 0.42, 0.035)
left_edge = [off(t, prof(t, WL, notchL)) for t in TS]
right_edge = [off(t, -prof(t, WR, notchR)) for t in TS]
vane = left_edge + list(reversed(right_edge))
# shaft (calamus): from nib end to the vane
SH0, SH1 = 0.055, V0 + 0.03
def shaft_w(t):
    return 0.0112 * L * (0.72 + 0.28 * (t - SH0) / (SH1 - SH0))
shaft_ts = [SH0 + (SH1 - SH0) * i / 12 for i in range(13)]
shaft = [off(t, shaft_w(t)) for t in shaft_ts] + [off(t, -shaft_w(t)) for t in reversed(shaft_ts)]
nib = [off(SH0 + 0.012, shaft_w(SH0) * 1.02), rach(0.0), off(SH0 + 0.012, -shaft_w(SH0) * 1.02)]
nib_hi = [off(SH0 + 0.01, shaft_w(SH0) * 0.95), rach(0.004), off(SH0 + 0.01, shaft_w(SH0) * 0.35)]
# barbs: fine curved lines sweeping from the rachis toward the tip
barbs = []
random.seed(5)
t = V0 + 0.012
while t < 0.975:
    for side, wmax, notch in ((1, WL, notchL), (-1, WR, notchR)):
        w = prof(t + 0.05, wmax, notch) * 1.1
        if w < 1.2: continue
        sweep = 1.35 * w / L
        a = rach(t); b = off(min(t + sweep, 0.999), side * w)
        c = off(min(t + sweep * 0.3, 0.999), side * w * 0.62)
        op = random.choice([0.16, 0.22, 0.28, 0.34])
        barbs.append((a, c, b, op))
    t += 0.0105 + random.uniform(-0.002, 0.003)
# a few down wisps curling away at the base of the vane
down = []
for i in range(0):
    t0 = V0 + 0.004 + i * 0.009
    side = 1 if i % 2 == 0 else -1
    a = rach(t0)
    b = off(t0 - 0.03 + 0.004 * i, side * (0.030 + 0.006 * (i % 3)) * L)
    c = off(t0 + 0.004, side * 0.022 * L)
    down.append((a, c, b))
rach_line = [rach(SH1 - 0.02 + (0.985 - SH1 + 0.02) * i / 40) for i in range(41)]

# shadow: quill silhouette offset down-right, clipped to the facing board
SHX, SHY = -0.020 * L, 0.012 * L      # light now comes from the upper right

# ---- leather pebble grain (periodic Voronoi cells, inset and smoothed) -----
def voronoi_tile(Lt, n, seed):
    random.seed(seed)
    pts = []
    tries = 0
    rmin = Lt / math.sqrt(n) * 0.5
    while len(pts) < n and tries < 20000:
        tries += 1
        p = (random.uniform(0, Lt), random.uniform(0, Lt))
        ok = True
        for q in pts:
            ddx = min(abs(p[0] - q[0]), Lt - abs(p[0] - q[0]))
            ddy = min(abs(p[1] - q[1]), Lt - abs(p[1] - q[1]))
            if ddx * ddx + ddy * ddy < rmin * rmin: ok = False; break
        if ok: pts.append(p)
    allseeds = [(p[0] + i * Lt, p[1] + j * Lt) for p in pts for i in (-1, 0, 1) for j in (-1, 0, 1)]
    cells = []
    for p in pts:
        poly_ = [(p[0] - Lt, p[1] - Lt), (p[0] + Lt, p[1] - Lt), (p[0] + Lt, p[1] + Lt), (p[0] - Lt, p[1] + Lt)]
        for q in allseeds:
            if q == p: continue
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            nx_, ny_ = q[0] - p[0], q[1] - p[1]
            out = []
            for i in range(len(poly_)):
                a, b = poly_[i], poly_[(i + 1) % len(poly_)]
                da = (a[0] - mx) * nx_ + (a[1] - my) * ny_
                db = (b[0] - mx) * nx_ + (b[1] - my) * ny_
                if da <= 0: out.append(a)
                if (da < 0) != (db < 0):
                    tt = da / (da - db)
                    out.append((a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt))
            poly_ = out
        cells.append((p, poly_))
    return cells

def smooth(poly_, it=2):
    for _ in range(it):
        out = []
        for i in range(len(poly_)):
            a, b = poly_[i], poly_[(i + 1) % len(poly_)]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        poly_ = out
    return poly_

def pebble_pattern(pid, Lt, n, seed, inset, col, op_lo, op_hi, hl):
    cells = voronoi_tile(Lt, n, seed)
    out = []
    for (p, c) in cells:
        cx = sum(q[0] for q in c) / len(c); cy = sum(q[1] for q in c) / len(c)
        ins = inset if inset >= 1 else random.uniform(inset - 0.06, inset + 0.08)
        c2 = [(cx + (q[0] - cx) * ins, cy + (q[1] - cy) * ins) for q in c]
        c2 = smooth(c2)
        d = "M" + " L".join(f"{q[0]:.2f},{q[1]:.2f}" for q in c2) + "Z"
        out.append(f'<path d="{d}" fill="{col}" fill-opacity="{random.uniform(op_lo, op_hi):.3f}"/>')
        if hl:
            out.append(f'<circle cx="{cx - 0.9:.2f}" cy="{cy - 0.9:.2f}" r="0.9" fill="#d8cbb6" fill-opacity="{random.uniform(0.015, 0.035):.3f}"/>')
    return out

# pattern transform: model units on the facing board -> fitted screen
O = P((0, 0, 0))
pa, pb = P((0, H / 2, 0)), P((W, H / 2, 0))
pc, pd = P((W / 2, H, 0)), P((W / 2, 0, 0))
Ux, Uy = (pb[0] - pa[0]) / W, (pb[1] - pa[1]) / W
Vx, Vy = (pd[0] - pc[0]) / H, (pd[1] - pc[1]) / H       # pattern +y = model -y
ptf = f"matrix({Ux:.4f} {Uy:.4f} {Vx:.4f} {Vy:.4f} {O[0]:.2f} {O[1]:.2f})"

PT1, PT2 = 47.0, 61.0
peb1 = pebble_pattern("pebble", PT1, 64, 3, 0.80, "#9a8d7c", 0.02, 0.05, True)
peb2 = pebble_pattern("pebble2", PT2, 8, 9, 1.0, "#c8bba6", 0.0, 0.035, False)

# gradient anchors
fa, fb = P((W, H, 0)), P((0, 0, 0))            # lit fore-head corner -> dark spine-tail
sa, sb = P((W, H, 0)), P((W * 0.3, H * 0.4, 0))
ha, hb = P((W / 2, H - S, B)), P((W / 2, H - S, T - B))
fta, ftb = P((W, H - S, B)), P((W, S, B))
ca, cb = P((spine_x(T / 2), H, T / 2)), P((10, H, T / 2))
bea, beb = P((W, H, T)), P((W, 0, T))
fea, feb = P((W, H, 0)), P((W, 0, 0))
qa, qb = off(0.6, WL), off(0.6, -WR)

defs = f'''
<linearGradient id="leather" gradientUnits="userSpaceOnUse" x1="{fa[0]}" y1="{fa[1]}" x2="{fb[0]}" y2="{fb[1]}">
  <stop offset="0" stop-color="#2a2622"/><stop offset="0.45" stop-color="#181614"/><stop offset="1" stop-color="#0c0b0a"/>
</linearGradient>
<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="{sa[0]}" y1="{sa[1]}" x2="{sb[0]}" y2="{sb[1]}">
  <stop offset="0" stop-color="#d8cbb6" stop-opacity="0.11"/><stop offset="0.4" stop-color="#d8cbb6" stop-opacity="0.03"/><stop offset="1" stop-color="#d8cbb6" stop-opacity="0"/>
</linearGradient>
<linearGradient id="backEdge" gradientUnits="userSpaceOnUse" x1="{bea[0]}" y1="{bea[1]}" x2="{beb[0]}" y2="{beb[1]}">
  <stop offset="0" stop-color="#5a534c"/><stop offset="0.55" stop-color="#433d38"/><stop offset="1" stop-color="#2c2824"/>
</linearGradient>
<linearGradient id="frontEdge" gradientUnits="userSpaceOnUse" x1="{fea[0]}" y1="{fea[1]}" x2="{feb[0]}" y2="{feb[1]}">
  <stop offset="0" stop-color="#4f4842"/><stop offset="1" stop-color="#26221f"/>
</linearGradient>
<linearGradient id="edgeTop" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#5e5750"/><stop offset="1" stop-color="#4b453f"/>
</linearGradient>
<linearGradient id="capG" gradientUnits="userSpaceOnUse" x1="{ca[0]}" y1="{ca[1]}" x2="{cb[0]}" y2="{cb[1]}">
  <stop offset="0" stop-color="#2a2622"/><stop offset="1" stop-color="#4b453f"/>
</linearGradient>
<linearGradient id="headG" gradientUnits="userSpaceOnUse" x1="{ha[0]}" y1="{ha[1]}" x2="{hb[0]}" y2="{hb[1]}">
  <stop offset="0" stop-color="#f5f0e5"/><stop offset="0.7" stop-color="#ece4d2"/><stop offset="1" stop-color="#dbd1ba"/>
</linearGradient>
<linearGradient id="foreG" gradientUnits="userSpaceOnUse" x1="{fta[0]}" y1="{fta[1]}" x2="{ftb[0]}" y2="{ftb[1]}">
  <stop offset="0" stop-color="#e9e1cf"/><stop offset="0.6" stop-color="#d9cfb8"/><stop offset="1" stop-color="#c4b99e"/>
</linearGradient>
<linearGradient id="vaneG" gradientUnits="userSpaceOnUse" x1="{qa[0]:.2f}" y1="{qa[1]:.2f}" x2="{qb[0]:.2f}" y2="{qb[1]:.2f}">
  <stop offset="0" stop-color="{QC["v0"]}"/><stop offset="0.62" stop-color="{QC["v1"]}"/><stop offset="1" stop-color="{QC["v2"]}"/>
</linearGradient>
<linearGradient id="shaftG" gradientUnits="userSpaceOnUse" x1="{off(0.15, shaft_w(0.15))[0]:.2f}" y1="{off(0.15, shaft_w(0.15))[1]:.2f}" x2="{off(0.15, -shaft_w(0.15))[0]:.2f}" y2="{off(0.15, -shaft_w(0.15))[1]:.2f}">
  <stop offset="0" stop-color="{QC["s0"]}"/><stop offset="0.5" stop-color="{QC["s1"]}"/><stop offset="1" stop-color="{QC["s2"]}"/>
</linearGradient>
<pattern id="pebble" width="{PT1}" height="{PT1}" patternUnits="userSpaceOnUse" patternTransform="{ptf}">{"".join(peb1)}</pattern>
<pattern id="pebble2" width="{PT2}" height="{PT2}" patternUnits="userSpaceOnUse" patternTransform="{ptf} rotate(17)">{"".join(peb2)}</pattern>
<clipPath id="faceClip"><polygon points="{pstr([proj(*p) for p in face])}"/></clipPath>
'''

body = []
for kind, pts, attrs in shapes:
    a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    if kind == "poly":
        body.append(f'<polygon points="{pstr(pts)}" {a}/>')
    else:
        body.append(f'<polyline points="{pstr(pts)}" {a}/>')

# the second pebble pass only darkens crevices slightly; use stroked cells

q = []
sil = vane  # shadow silhouette = vane + shaft
for k, (ddx, ddy, op) in enumerate(((SHX, SHY, 0.30), (SHX * 0.6, SHY * 0.6, 0.30), (SHX * 1.35, SHY * 1.35, 0.16))):
    q.append(f'<g clip-path="url(#faceClip)" fill="#000" fill-opacity="{op}">'
             f'<polygon points="{sstr([(x + ddx, y + ddy) for x, y in vane])}"/>'
             f'<polygon points="{sstr([(x + ddx, y + ddy) for x, y in shaft])}"/></g>')
q.append(f'<polygon points="{sstr(shaft)}" fill="url(#shaftG)"/>')
q.append(f'<polygon points="{sstr(nib)}" fill="{QC["nib"]}"/>')
q.append(f'<polygon points="{sstr(nib_hi)}" fill="{QC["nibhi"]}" fill-opacity="0.75"/>')
# ink stain fading up the shaft just above the nib
st = [off(SH0, shaft_w(SH0)), off(SH0 + 0.035, shaft_w(SH0 + 0.035)), off(SH0 + 0.035, -shaft_w(SH0 + 0.035)), off(SH0, -shaft_w(SH0))]
q.append(f'<polygon points="{sstr(st)}" fill="{QC["ink"]}" fill-opacity="0.55"/>')
for a, c, b in down:
    q.append(f'<path d="M{a[0]:.2f},{a[1]:.2f} Q{c[0]:.2f},{c[1]:.2f} {b[0]:.2f},{b[1]:.2f}" fill="none" stroke="{QC["wisp"]}" stroke-width="1.3" stroke-opacity="0.75" stroke-linecap="round"/>')
q.append(f'<polygon points="{sstr(vane)}" fill="url(#vaneG)"/>')
q.append('<g clip-path="url(#vaneClip)">')
for a, c, b, op in barbs:
    q.append(f'<path d="M{a[0]:.2f},{a[1]:.2f} Q{c[0]:.2f},{c[1]:.2f} {b[0]:.2f},{b[1]:.2f}" fill="none" stroke="{QC["barb"]}" stroke-width="0.8" stroke-opacity="{op}"/>')
q.append('</g>')
# outline of the vane, faint, for light backgrounds at 180
q.append(f'<polygon points="{sstr(vane)}" fill="none" stroke="{QC["vout"]}" stroke-width="1.1" stroke-opacity="0.55" stroke-linejoin="round"/>')
q.append(f'<polygon points="{sstr(shaft)}" fill="none" stroke="{QC["sout"]}" stroke-width="1.0" stroke-opacity="0.55" stroke-linejoin="round"/>')
# rachis: bright line with a shaded flank
q.append(f'<polyline points="{sstr([(x - nx * 1.1, y - ny * 1.1) for x, y in rach_line])}" fill="none" stroke="{QC["rflank"]}" stroke-width="1.3" stroke-opacity="0.8" stroke-linecap="round"/>')
q.append(f'<polyline points="{sstr(rach_line)}" fill="none" stroke="{QC["rach"]}" stroke-width="2.4" stroke-linecap="round"/>')

defs += f'<clipPath id="vaneClip"><polygon points="{sstr(vane)}"/></clipPath>\n'

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>{defs}</defs>
{chr(10).join(body)}
{chr(10).join(q)}
</svg>
'''
open(OUT, "w").write(svg)

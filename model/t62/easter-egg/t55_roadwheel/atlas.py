#!/usr/bin/env python3
"""
atlas.py — pixel-art diffuse atlas pro pojezdové kolo T-62 (vertical-slice spike).

Deterministický (žádný náhodný AI vibe — CLAUDE.md §1 Replikovatelnost): pevný seed,
ruční pixel kresba T-62 road-wheel face dle ref/walkaround/t-62_059.jpg + _060.jpg.

Styl (STYLE_PROMPT / CLAUDE.md §1 B): low-res, hard color blocks, flat painted shadows,
4BO olive paleta, NEAREST filtering (řeší materiál v Blenderu), NO PBR / NO gradienty.

Kreslí face kola z boku: rubber tire band (tmavá) → litý disk (olive) se dvěma kruhy
odlehčovacích otvorů + radiální žebra → centrální náboj s kruhem šroubů.

Výstup: wheel_atlas.png (čtverec). Sample velikost malá → pixel look.

Usage:  python3 atlas.py [out_path]
"""
import sys
import math
from PIL import Image, ImageDraw

# ── paleta 4BO (sovětská olivová) — hard blocks ────────────────────────────────
RUBBER      = (30, 30, 27)
RUBBER_HI   = (52, 52, 47)
OLIVE       = (78, 84, 50)      # disk base 4BO
OLIVE_LO    = (54, 60, 34)      # flat stín
OLIVE_HI    = (104, 110, 70)    # flat highlight (žebra)
HOLE        = (22, 24, 17)      # odlehčovací otvory (skrz)
HUB         = (92, 96, 72)      # náboj kov
HUB_HI      = (118, 122, 92)
HUB_LO      = (60, 64, 44)
BOLT        = (28, 30, 22)
WEAR        = (120, 86, 50)     # rez/odřená barva (sparse)
DUST        = (112, 104, 78)    # prach

PX = 128                         # kreslicí rozlišení (low-res → pixel look)
CX = CY = PX / 2.0
R  = PX * 0.485                  # poloměr kola v px (mírná rezerva k okraji)


def _ring_holes(draw, n, rr, hole_r, col=HOLE):
    """n otvorů na poloměru rr (frakce R), poloměr otvoru hole_r (frakce R)."""
    for i in range(n):
        a = (i / n) * math.tau + 0.0
        x = CX + math.cos(a) * rr * R
        y = CY + math.sin(a) * rr * R
        hr = hole_r * R
        draw.ellipse([x - hr, y - hr, x + hr, y + hr], fill=col)


def _radial_ribs(draw, n, r0, r1, col, w):
    """n radiálních žeber (světlé olivové paprsky) mezi poloměry r0..r1."""
    for i in range(n):
        a = (i / n) * math.tau + (math.tau / n) * 0.5
        x0 = CX + math.cos(a) * r0 * R
        y0 = CY + math.sin(a) * r0 * R
        x1 = CX + math.cos(a) * r1 * R
        y1 = CY + math.sin(a) * r1 * R
        draw.line([x0, y0, x1, y1], fill=col, width=w)


def build(out_path):
    img = Image.new("RGB", (PX, PX), OLIVE)
    d = ImageDraw.Draw(img)

    # 0) celé pozadí mimo kolo = rubber tmavá (čtverec rohy → tire smear na válci)
    d.rectangle([0, 0, PX, PX], fill=RUBBER)

    # 1) rubber tire band (vnější prstenec)
    d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=RUBBER_HI)
    rt = R * 0.985
    d.ellipse([CX - rt, CY - rt, CX + rt, CY + rt], fill=RUBBER)
    # tread ticks (svislé) po obvodu — chunky
    for i in range(36):
        a = (i / 36) * math.tau
        x0 = CX + math.cos(a) * R * 0.99
        y0 = CY + math.sin(a) * R * 0.99
        x1 = CX + math.cos(a) * R * 0.90
        y1 = CY + math.sin(a) * R * 0.90
        d.line([x0, y0, x1, y1], fill=RUBBER_HI, width=1)

    # 2) litý disk (olive) — uvnitř tire
    rd = R * 0.86
    d.ellipse([CX - rd, CY - rd, CX + rd, CY + rd], fill=OLIVE)
    # flat painted shadow: spodní polovina mírně tmavší (NE gradient — 1 blok)
    d.pieslice([CX - rd, CY - rd, CX + rd, CY + rd], 20, 160, fill=OLIVE_LO)

    # 3) radiální žebra (světlá) — 12 paprsků
    _radial_ribs(d, 12, 0.20, 0.82, OLIVE_HI, w=4)

    # 4) dva kruhy odlehčovacích otvorů (skrz = tmavé)
    _ring_holes(d, 12, 0.62, 0.075)   # vnější velké
    _ring_holes(d, 12, 0.40, 0.045)   # vnitřní malé

    # 5) centrální náboj (dome) — flat tóny, ne gradient
    rh = R * 0.27
    d.ellipse([CX - rh, CY - rh, CX + rh, CY + rh], fill=HUB_LO)
    rh2 = R * 0.24
    d.ellipse([CX - rh2, CY - rh2, CX + rh2, CY + rh2], fill=HUB)
    rh3 = R * 0.12
    d.ellipse([CX - rh3, CY - rh3, CX + rh3, CY + rh3], fill=HUB_HI)  # vrchol dome
    # kruh šroubů na přírubě náboje
    for i in range(8):
        a = (i / 8) * math.tau
        x = CX + math.cos(a) * R * 0.19
        y = CY + math.sin(a) * R * 0.19
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=BOLT)

    # 6) wear / rez — sparse deterministické tečky (pevné pozice, ne random)
    wear_pts = [(0.55, 0.3), (0.7, 1.9), (0.35, 3.6), (0.78, 4.4), (0.5, 5.6)]
    for rr, a in wear_pts:
        x = CX + math.cos(a) * rr * R
        y = CY + math.sin(a) * rr * R
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=WEAR)
    # prach na spodním okraji
    for i in range(10):
        a = math.pi * (0.15 + 0.7 * i / 10)
        x = CX + math.cos(a) * R * 0.9
        y = CY + math.sin(a) * R * 0.9
        d.point([x, y], fill=DUST)

    img.save(out_path)
    print(f"wrote {out_path} ({PX}x{PX})")
    return out_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "wheel_atlas.png"
    build(out)

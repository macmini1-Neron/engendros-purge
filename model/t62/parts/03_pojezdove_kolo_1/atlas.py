#!/usr/bin/env python3
"""
atlas.py — PŮVODNÍ koncentrický pixel-atlas pro pojezdové kolo T-62 (wheel_atlas.png).

Vráceno na původní verzi (Tomáš: ta byla dobrá), pak jen mini-fixy.
Koncentrické zóny (od vnějšku dovnitř): černá guma → ocelový lem → olivový web → zelený náboj.
Nearest filtering řeší materiál. 128 px. Žádné dezénové „světlé čáry" (jediný mini-fix).

Usage: python3 atlas.py [out_path]
"""
import sys, math
from PIL import Image, ImageDraw

RUBBER    = (24, 24, 22)
RUBBER_HI = (40, 40, 36)
STEEL     = (80, 86, 52)
WEB       = (72, 78, 47)
HUB_GRN   = (62, 84, 56)
HUB_HI    = (86, 108, 78)
RUST      = (120, 86, 50)
DUST      = (104, 98, 72)

PX = 128
CX = CY = PX / 2.0
R  = PX * 0.485
ATLAS_FILL = 0.485


def build(out_path):
    img = Image.new("RGB", (PX, PX), RUBBER)
    d = ImageDraw.Draw(img)
    # koncentrické zóny
    d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=RUBBER_HI)
    rr = 0.985 * R; d.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=RUBBER)        # guma
    rr = 0.84 * R;  d.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=WEB)           # olivový kov (disk+lem); guma 0.84..1.0 (R_OUT zpět na 0.405 → původní hranice správná)
    rr = 0.43 * R;  d.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=HUB_GRN)       # náboj
    rr = 0.16 * R;  d.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=HUB_HI)        # vrchol dome
    # konzervativní variace KOVU (jen do r<0.82 = NIKDY na gumu): jemné olivové skvrny
    WEB_HI = (82, 88, 54); WEB_LO = (64, 70, 42)
    patches = [(0.58, 0.6, WEB_HI), (0.50, 2.3, WEB_LO), (0.68, 3.9, WEB_HI),
               (0.45, 5.1, WEB_LO), (0.72, 1.5, WEB_LO), (0.55, 4.4, WEB_HI)]
    for rf, a, col in patches:
        x = CX + math.cos(a) * rf * R; y = CY + math.sin(a) * rf * R
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=col)
    # rez/wear tečky — POUZE na kov (rf <= 0.75 < gumová zóna 0.86)
    for rf, a in [(0.55, 0.4), (0.7, 2.1), (0.4, 3.7), (0.72, 4.6), (0.5, 5.7), (0.25, 1.2),
                  (0.62, 3.0), (0.35, 5.0)]:
        x = CX + math.cos(a) * rf * R; y = CY + math.sin(a) * rf * R
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=RUST)
    # jemný prach na kovu (rf < 0.78, nikdy guma)
    for i in range(14):
        a = 0.2 + i * 0.45
        rf = 0.32 + 0.16 * (i % 3)
        x = CX + math.cos(a) * rf * R; y = CY + math.sin(a) * rf * R
        d.point([x, y], fill=DUST)
    # GUMA: jemné NAZNAČENÍ že je to guma — decentní tmavé tread proužky (NE světlé) v zóně 0.86..1.0
    RUB_DK = (16, 16, 15); RUB_MD = (30, 30, 27)
    for k in range(7):                              # tenké soustředné dezénové prstence
        rr = (0.88 + 0.017 * k) * R
        d.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], outline=(RUB_DK if k % 2 else RUB_MD))
    for i in range(40):                             # jemný šum (žádný kov)
        a = i * (math.tau / 40) + 0.1
        rf = 0.90 + 0.06 * (i % 2)
        x = CX + math.cos(a) * rf * R; y = CY + math.sin(a) * rf * R
        d.point([x, y], fill=RUB_MD)
    img.save(out_path)
    print("wrote", out_path)
    return out_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "wheel_atlas.png"
    build(out)

"""
build.py — 03 pojezdové kolo #1 (WheelL1) — REÁLNÝ T-62, v6 (potvrzené zadání od Tomáše)

Schéma (od kraje do středu), 5-četná symetrie:
  - 2× guma (černá, mezera pro pás)
  - ocelový lem = SAMOSTATNÝ olivový prstenec (zřetelný)
  - litý disk (dished) s DVĚMA sadami reálných děr:
      (a) 5× VELKÁ KLÍČOVÁ DÍRKA mezi žebry = kolečko + pod ním spojený šikmý klínový výřez (špička k náboji)
      (b) 5× MALÁ kulatá díra v žebrech; horní okraj malé díry = stejný poloměr jako horní okraj velké díry
  - 5× ŽEBRO rozšiřující se od středu k okraji (klín)
  - náboj: nízká KUPOLE + plochý VĚNEC pod ní + 8 ŠROUBŮ NA VĚNCI (ne na kupoli)

Logické skupiny = samostatné uzly (kvůli barvení/ukazování): tire_/rim_/disc_/ribs_/hub_ × out/in,
pod rodičem WheelL1 (točí se jako celek). Textura = jeden atlas (nearest).
Konvence: forward +Z, up +Y, right +X. Osa kola = X. Ø0.81→R0.405 (CLAUDE §6, conf H).
"""
import bpy, math

SHARED = "/Users/Shared/t62"
ATLAS  = SHARED + "/wheel_atlas.png"
OUT    = SHARED + "/wheel.glb"

R_OUT   = 0.405        # Ø0.81 (WT 1:1 — eyeball zvětšení Ø vráceno); guma 0.351..0.405
R_RUB_I = 0.358        # vnitřní okraj gumy (uvolněno místo pro vysoký lem)
DISC_W  = 0.185        # šířka 1 pneu; celková šířka kola = 2*(GAP_H+DISC_W) = 0.438 (WT 1:1)
GAP_H   = 0.034          # poloviční středová mezera pro vodící zuby; celková šířka 0.438
SEG     = 28
N       = 5            # 5 žeber / 5 klíčových dírek

RIM_O   = 0.358        # lem vnější = vnitřek gumy; VYSOKÁ stěna
RIM_I   = 0.340        # lem vnitřní; pás 0.340..0.358 (za tenkým prstencem, před gumou)
R_DISC  = 0.335        # litý disk — zvětšen, ať dosáhne k prstenci (žádná mezera; Tomáš)
DISH    = 0.040

R_TOP   = 0.297        # horní okraj (poloměr) velké i malé díry — STEJNÝ
BIG_R   = 0.052; BIG_C = R_TOP - BIG_R          # velké kolečko
SML_R   = 0.032; SML_C = R_TOP - SML_R          # malá díra v žebru
SLOT_R0 = 0.150; SLOT_W0 = 0.050                # špička klínu u náboje
SLOT_R1 = BIG_C; SLOT_W1 = 0.100                # u kolečka
RIB_R0  = 0.150; RIB_W0 = 0.055                  # žebro úzké u středu
RIB_R1  = 0.330; RIB_W1 = 0.120                  # žebro široké u kraje


def dish_mesh(obj, out, amount):
    me = obj.data
    for v in me.vertices:
        r = math.hypot(v.co.y, v.co.z)
        v.co.x += -out * amount * max(0.0, 1.0 - r / R_DISC)
    me.update()


def make_disc(side):
    out = side
    suf = "out" if side > 0 else "in"
    xc  = side * (GAP_H + DISC_W * 0.5)
    shelf = out * 0.028   # JEN náboj proud k líci pneu; disk/žebra ZAPUŠTĚNÉ (ať lem vyčnívá jako stěna)
    face = xc + out * 0.030
    groups = []

    # guma
    groups.append(tube("tire_%s" % suf, r_out=R_OUT, r_in=R_RUB_I, depth=DISC_W,
                       segments=SEG, axis='X', center=(xc, 0, 0)))
    # prstenec/lem — VÍC PROUD (nejvyšší bod kola, výš než kopule); guma líc = xc+out*0.0575
    # lem hl. 0.05, střed xc+out*0.045 → čelo na xc+out*0.070 (nad gumou i nad kopulí)
    # VYSOKÝ kovový LEM = stěna od disku až NAD líc pneu (vrchol ~xc+0.100 > guma xc+0.0925)
    groups.append(tube("rim_%s" % suf, r_out=RIM_O, r_in=RIM_I, depth=0.075,
                       segments=SEG, axis='X', center=(xc + out * 0.0625, 0, 0)))
    # TENKÝ NÍZKÝ PRSTENEC na koncích žeber (mírně nad žebry) — napojený dovnitř na lem
    groups.append(tube("rim_ring_%s" % suf, r_out=0.340, r_in=0.325, depth=0.035,
                       segments=SEG, axis='X', center=(xc + out * 0.040, 0, 0)))

    # litý disk — ZAPUŠTĚNÝ (žebra/disk níž, ať lem vyčnívá jako vysoká stěna)
    disc = cyl("disc_%s" % suf, radius=R_DISC, depth=0.045, segments=SEG, axis='X',
               center=(xc, 0, 0))
    # KLOKOVÁNÍ disků: vnitřní disk otočen o PŮL segmentu (36°) → kde má vnější disk velkou díru,
    # tam má vnitřní disk žebro (díry prostřídané kvůli pevnosti) — Tomáš.
    base = math.radians(90) + (math.radians(360.0 / N / 2.0) if side < 0 else 0.0)
    # POZOR: cuttery booleovat JEDNOTLIVĚ (joinem překrývajících se cutterů vznikne nemanifold
    # → EXACT solver smaže celý disk). Sekvenční difference překrývajících se cutterů je OK.
    for i in range(N):
        a_rib = base + i * (math.tau / N)
        a_key = a_rib + (math.tau / N) * 0.5
        cy, cz = math.cos(a_key), math.sin(a_key)
        # velká klíčová dírka = kolečko + šikmý klín pod ním (každý zvlášť)
        boolean_diff(disc, cyl("kb_%d_%d" % (side, i), radius=BIG_R, depth=0.6, segments=16,
                               axis='X', center=(0, cy * BIG_C, cz * BIG_C)))
        boolean_diff(disc, taper_bar("ks_%d_%d" % (side, i), a_key, SLOT_R0, SLOT_R1,
                                     SLOT_W0, SLOT_W1, x0=0.0, thick=0.6))
        # malá díra (do disku) v ose žebra
        ry, rz = math.cos(a_rib), math.sin(a_rib)
        boolean_diff(disc, cyl("md_%d_%d" % (side, i), radius=SML_R, depth=0.6, segments=12,
                               axis='X', center=(0, ry * SML_C, rz * SML_C)))
    dish_mesh(disc, out, DISH)
    groups.append(disc)

    # žebra — postav JEDNO funkční žebro (taper_bar + díra), pak ho DUPLIKUJ + otoč kolem osy X
    # pro všech N pozic → všechna žebra GARANTOVANĚ identická (kopie jednoho funkčního).
    # Tím odpadá per-žebro boolean odchylka EXACT solveru = žádný rogue „zub" na jednom žebru.
    # NÁBĚH (DROP) ODSTRANĚN — dělal zub na KAŽDÉM žebru (Tomáš: „víc jich je, vrať spátky").
    RIB_TH = 0.045
    a0 = base
    ry0, rz0 = math.cos(a0), math.sin(a0)
    master = taper_bar("rb_%d_0" % side, a0, RIB_R0, RIB_R1, RIB_W0, RIB_W1,
                       x0=face, thick=RIB_TH)
    boolean_diff(master, cyl("rc_%d_0" % side, radius=SML_R, depth=0.6, segments=12,
                             axis='X', center=(0, ry0 * SML_C, rz0 * SML_C)))
    ribs = [master]
    for i in range(1, N):
        dup = master.copy(); dup.data = master.data.copy()
        dup.name = "rb_%d_%d" % (side, i)
        bpy.context.collection.objects.link(dup)
        ang = i * (math.tau / N)
        ca, sa = math.cos(ang), math.sin(ang)
        for v in dup.data.vertices:        # rotace vrcholů kolem osy X (a0 → a0 + i*krok)
            y, z = v.co.y, v.co.z
            v.co.y = ca * y - sa * z
            v.co.z = sa * y + ca * z
        dup.data.update()
        ribs.append(dup)
    ribsg = join("ribs_%s" % suf, ribs)
    dish_mesh(ribsg, out, DISH)
    groups.append(ribsg)

    # náboj: plochý věnec + NÍZKÁ kupole (NESMÍ přečuhovat přes lem) + 6 šroubů na věnci
    hub = []
    flange = cyl("hf_%d" % side, radius=0.165, depth=0.04, segments=SEG, axis='X',
                 center=(xc + shelf + out * 0.012, 0, 0))
    hub.append(flange)
    # KULATÁ kupole — STEJNÁ na obou stranách; u vnějšího líce pneu (přes shelf)
    dome_h = 0.052
    dh = dome("hd_%d" % side, radius=0.095, height=dome_h, segments=SEG, rings=4,
              axis='X', center=(0, 0, 0))
    mh = dh.data
    if side < 0:                       # kupole směřuje VEN na OBOU stranách (symetrie náboje)
        for v in mh.vertices: v.co.x = -v.co.x
        mh.update(); recalc_normals(dh)
    for v in mh.vertices: v.co.x += xc + shelf + out * 0.012
    mh.update()
    hub.append(dh)
    for i in range(6):
        a = (i / 6) * math.tau
        hub.append(cyl("bl_%d_%d" % (side, i), radius=0.0125, depth=0.025, segments=6, axis='X',
                       center=(xc + shelf + out * 0.025, math.cos(a) * 0.135, math.sin(a) * 0.135)))  # zasunuté ~50%
    groups.append(join("hub_%s" % suf, hub))
    return groups


clear_scene()
groups = make_disc(+1) + make_disc(-1)

# SPOJOVACÍ náboj-barel mezi oběma disky → spojí 2 kola v jeden celek (přes středovou mezeru)
xc_abs = (GAP_H + DISC_W * 0.5)
barrel = cyl("barrel", radius=0.13, depth=2 * xc_abs + 0.04, segments=SEG, axis='X', center=(0, 0, 0))
groups.append(barrel)

# Koncentrický atlas na VŠECH dílech = normální kovová textura i uvnitř (žádné šedé plochy).
# rim + barrel zmáčknuté v UV, ať vzorkují OLIVOVÝ kov (web), ne černou gumu / zelený náboj.
mat = pixel_material("t62_atlas", ATLAS)
F = 0.485
for gobj in groups:
    nm = gobj.name
    me = gobj.data
    if not me.uv_layers: me.uv_layers.new(name="UVMap")
    uvd = me.uv_layers[0].data
    rscale = 0.80 if (nm.startswith("rim_") or nm == "barrel") else 1.0
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvd[li].uv = (0.5 + (co.y / R_OUT) * F * rscale, 0.5 + (co.z / R_OUT) * F * rscale)
    assign_mat(gobj, mat)
    flat_shade(gobj)

empty = bpy.data.objects.new("WheelL1", None)
bpy.context.collection.objects.link(empty); empty.location = (0, 0, 0)
for gobj in groups:
    gobj.parent = empty

import os
if os.path.exists(OUT): os.remove(OUT)
export_glb(OUT, only_selected=False)
result = {"parent": "WheelL1", "nodes": [g.name for g in groups],
          "total_verts": sum(len(g.data.vertices) for g in groups),
          "glb_bytes": os.path.getsize(OUT) if os.path.exists(OUT) else 0}

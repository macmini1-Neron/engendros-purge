"""
build.py — 02 NAPÍNACÍ KOLO / IDLER (uzel IdlerL) — reálný T-62 «направляющее колесо», v3

OPRAVENO dle PROFI referencí `ref/running_gear_pro/idler_*` (Tomáš: „zlato"):
reálný idler = SILNÝ „KVĚT", NE tenký větrák:
  - DVOJITÉ miskovité disky + středová mezera (vodící zuby pásu) + spojovací barel
  - SCALLOPED (zvlněný) vnější OKRAJ — lalok (peak) u žebra, výkroj (dip) u okna
  - N=10 SILNÝCH ROVNÝCH ŽEBER (radiální, NE swept) rozšiřujících se k okraji
  - mezi žebry velká OVÁLNÁ OKNA (průchozí)
  - výrazný kulový NÁBOJ (dome) + věnec ~10 šroubů
  - KOVOVÝ, bez gumy (1968 katalog: „Литые, с металлическими ободами")
  - Ø ≈ 0.52 m (WT 1:1), menší než pojezdové kolo

Rig (CLAUDE §5): origin = osa náboje (0,0,0); spin lokální X. Uzel = IdlerL.
Scéna IDLER_BUILD (schválené WheelL1 ve WHEEL_BUILD přežije).
Osa kola = X, forward +Z, up +Y. Materiál = sdílený wheel_atlas (olive kov).
"""
import bpy, bmesh, math, os

SHARED = "/Users/Shared/t62"
ATLAS  = SHARED + "/wheel_atlas.png"
OUT    = SHARED + "/idler.glb"

N         = 10          # žebra / okna / laloky (scallops) — pro-ref
R_PEAK    = 0.260       # lalok (špička obruče) = běhoun pásu; Ø0.52 (WT 1:1)
R_DIP     = 0.236       # údolí mezi laloky (mírnější/zaoblenější scallop)
R_BAND_IN = 0.205       # vnitřní okraj obručového pásu
DISC_W    = 0.100       # axiální šířka jednoho disku
GAP_H     = 0.021       # poloviční středová mezera (vodící zuby pásu)
SEG_LOBE  = 9           # kroků na 1 lalok (víc = zaoblenější laloky)
SEG_R     = 24          # segmenty kulatých dílů (dome/flange/bolty/barel)
DISH      = 0.028       # miskovitost (hub vpřed)

RIB_R0 = 0.085          # žebro vnitřní poloměr (vetkne se do flange/barelu)
RIB_R1 = 0.207          # žebro vnější (dosáhne k pásu R_BAND_IN)
RIB_W0 = 0.044          # žebro šířka u náboje (užší → větší oválná okna)
RIB_W1 = 0.052          # žebro šířka u okraje (mírně rozšířené → podpírá lalok)
RIB_TH = 0.058          # žebro tloušťka v X (proud)

HUB_FL_R    = 0.105     # náboj: plochý věnec
DOME_R      = 0.088     # kulový náboj (výrazný)
DOME_H      = 0.055
BOLT_RING_R = 0.094     # věnec šroubů (mezi dome 0.088 a flange 0.105)
N_BOLT      = 10
BOLT_R      = 0.0085

BARREL_R = 0.085

PHASE = math.radians(90)   # lalok/žebro nahoře; OBA disky zarovnané (lobes line up)


def scalloped_ring(name, xc):
    """Obručový pás se ZVLNĚNÝM vnějším okrajem (N laloků). Osa X, v rovině YZ."""
    M = N * SEG_LOBE
    me = bpy.data.meshes.new(name); bm = bmesh.new(); hz = DISC_W * 0.5
    rings = {}
    for s, xz in (("f", xc + hz), ("b", xc - hz)):
        outer = []; inner = []
        for i in range(M):
            th = (i / M) * math.tau
            ro = (R_PEAK + R_DIP) * 0.5 + (R_PEAK - R_DIP) * 0.5 * math.cos(N * (th - PHASE))
            outer.append(bm.verts.new((xz, math.cos(th) * ro, math.sin(th) * ro)))
            inner.append(bm.verts.new((xz, math.cos(th) * R_BAND_IN, math.sin(th) * R_BAND_IN)))
        rings[s] = (outer, inner)
    bm.verts.ensure_lookup_table()
    fo, fi = rings["f"]; bo, bi = rings["b"]
    for i in range(M):
        j = (i + 1) % M
        bm.faces.new((fo[i], fo[j], bo[j], bo[i]))   # vnější (scalloped) stěna
        bm.faces.new((bi[i], bi[j], fi[j], fi[i]))   # vnitřní stěna
        bm.faces.new((fi[i], fi[j], fo[j], fo[i]))   # přední mezikruží
        bm.faces.new((bo[i], bo[j], bi[j], bi[i]))   # zadní mezikruží
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    flat_shade(o); return o


def dish_mesh(obj, out, amount):
    me = obj.data
    for v in me.vertices:
        r = math.hypot(v.co.y, v.co.z)
        v.co.x += -out * amount * max(0.0, 1.0 - r / R_PEAK)
    me.update()


def hub_dome(side, xc, out):
    """Kulový náboj — STEJNÝ na obou stranách, vždy ven (mimo mezeru)."""
    d = dome("hd_%d" % side, radius=DOME_R, height=DOME_H, segments=SEG_R, rings=4,
             axis='X', center=(0, 0, 0))
    me = d.data
    if side < 0:
        for v in me.vertices:
            v.co.x = -v.co.x
        me.update(); recalc_normals(d)
    cx = xc + out * 0.008
    for v in me.vertices:
        v.co.x += cx
    me.update()
    return d


def make_disc(side):
    out = side
    suf = "out" if side > 0 else "in"
    xc  = side * (GAP_H + DISC_W * 0.5)
    groups = []

    # ZVLNĚNÝ obručový pás
    band = scalloped_ring("band_%s" % suf, xc)
    dish_mesh(band, out, DISH * 0.4)
    groups.append(band)

    # SILNÁ ROVNÁ ŽEBRA (radiální) — zarovnaná s laloky
    ribs = []
    for i in range(N):
        a = PHASE + i * (math.tau / N)
        ribs.append(taper_bar("rb_%d_%d" % (side, i), a, RIB_R0, RIB_R1, RIB_W0, RIB_W1,
                              x0=xc + out * 0.012, thick=RIB_TH))
    ribsg = join("ribs_%s" % suf, ribs)
    dish_mesh(ribsg, out, DISH)
    groups.append(ribsg)

    # NÁBOJ: flange + kulový dome + věnec šroubů
    hub = [cyl("hf_%d" % side, radius=HUB_FL_R, depth=0.045, segments=SEG_R, axis='X',
               center=(xc + out * 0.010, 0, 0)),
           hub_dome(side, xc, out)]
    for i in range(N_BOLT):
        a = PHASE + (i / N_BOLT) * math.tau
        hub.append(cyl("hb_%d_%d" % (side, i), radius=BOLT_R, depth=0.020, segments=6,
                       axis='X', center=(xc + out * 0.030,
                                         math.cos(a) * BOLT_RING_R, math.sin(a) * BOLT_RING_R)))
    groups.append(join("hub_%s" % suf, hub))
    return groups


# ── fresh scene ─────────────────────────────────────────────────────────────
scn = bpy.data.scenes.get("IDLER_BUILD") or bpy.data.scenes.new("IDLER_BUILD")
for w in bpy.context.window_manager.windows:
    w.scene = scn

clear_scene()
groups = make_disc(+1) + make_disc(-1)

xc_abs = GAP_H + DISC_W * 0.5
groups.append(cyl("barrel", radius=BARREL_R, depth=2 * xc_abs + 0.02, segments=SEG_R,
                  axis='X', center=(0, 0, 0)))

# materiál: sdílený wheel atlas; planar-X UV (náboj green, žebra/pás olive)
mat = pixel_material("t62_atlas", ATLAS)
F = 0.34
for g in groups:
    me = g.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvd = me.uv_layers[0].data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvd[li].uv = (0.5 + (co.y / R_PEAK) * F, 0.5 + (co.z / R_PEAK) * F)
    assign_mat(g, mat); flat_shade(g)

empty = bpy.data.objects.new("IdlerL", None)
bpy.context.collection.objects.link(empty); empty.location = (0, 0, 0)
for g in groups:
    g.parent = empty

if os.path.exists(OUT):
    os.remove(OUT)
export_glb(OUT, only_selected=False)
result = {"parent": "IdlerL", "nodes": [g.name for g in groups],
          "total_verts": sum(len(g.data.vertices) for g in groups),
          "glb_bytes": os.path.getsize(OUT) if os.path.exists(OUT) else 0}

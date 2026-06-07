"""
build.py — 02 NAPÍNACÍ KOLO / IDLER (uzel IdlerL) — reálný T-62 «направляющее колесо», v1

Anatomie (manuály + MiniArt 37060 + blueprint — viz notes.md SE ZDROJI):
  - LITÉ, s KOVOVÝM OBRUČEM (BEZ gumy) — na rozdíl od pojezdového kola
    (1968 katalog: „Литые, с металлическими ободами").
  - СДВОЕННОЕ = dvojité: 2 spider-disky + úzká středová mezera pro vodící zuby pásu.
  - každý disk = „pinwheel" spider: středový KULOVÝ NÁBOJ (dome) + věnec šroubů,
    kolem něj N ZAKŘIVENÝCH (swept) PAPRSKŮ k obruči, mezi nimi OKNA (průchozí).
  - vnější OBRUČ = kovový běhoun pásu + řada šroubů (blueprint).
  - sedí na KRIVOŠIPU (mechanismus napínání) + броневой колпак → to je díl HULL, ne kola.
  - MENŠÍ než pojezdové kolo: Ø ≈ 0.65× (blueprint side) → ~0.54 m.

Rig (CLAUDE §5): origin = osa náboje (0,0,0); spin lokální X. Uzel = IdlerL.
Staví do SAMOSTATNÉ scény IDLER_BUILD → schválené WheelL1 ve WHEEL_BUILD přežije.
Konvence: osa kola = X, forward +Z, up +Y. Materiál = sdílený wheel_atlas (olive kov).
"""
import bpy, bmesh, math, os

SHARED = "/Users/Shared/t62"
ATLAS  = SHARED + "/wheel_atlas.png"
OUT    = SHARED + "/idler.glb"

# ── kóty (notes.md má zdroj každé) ──────────────────────────────────────────
R_OUT   = 0.27          # obruč vnější (běhoun pásu); Ø0.54 ≈ 0.65× kolo (blueprint)
RIM_T   = 0.045         # obruč radiální tloušťka
RIM_I   = R_OUT - RIM_T # 0.225 vnitřní okraj obruče
DISC_W  = 0.105         # axiální šířka jednoho disku
GAP_H   = 0.022         # poloviční středová mezera (vodící zuby pásu)
SEG     = 28
N       = 12            # PAPRSKY/OKNA — MiniArt ~10-12; potvrdit head-on
SWEEP   = math.radians(16)   # tangenciální zakřivení paprsku (pinwheel)

HUB_FL_R   = 0.092      # náboj: plochý věnec (flange)
DOME_R     = 0.072      # kulový náboj
DOME_H     = 0.052
BOLT_RING_R= 0.081      # věnec šroubů kolem dome (mezi dome 0.072 a flange 0.092)
N_BOLT     = 12

SP_R0  = 0.085          # paprsek vnitřní poloměr (vetkne se do flange/barelu)
SP_R1  = 0.229          # paprsek vnější (přesah do obruče RIM_I 0.225)
SP_W0  = 0.052          # paprsek šířka u náboje
SP_W1  = 0.034          # paprsek šířka u obruče (užší → okna se rozšiřují ven)
SP_TH  = 0.050          # paprsek tloušťka v X (proud)

RIMBOLT_R = 0.247       # šrouby na čele obruče (zarovnané s paprsky)


def swept_spoke(name, a0, sweep, r0, r1, w0, w1, x0, thick):
    """Zakřivený paprsek: vnitřní konec v úhlu a0, vnější v a0+sweep (tangenciální posun
    = pinwheel). Plochý slab tloušťky `thick` v X, střed x0. 8 vrcholů jako taper_bar."""
    def fr(a):
        c, s = math.cos(a), math.sin(a)
        return (c, s), (-s, c)               # (radiální), (tangenciální)
    (u0y, u0z), (t0y, t0z) = fr(a0)
    (u1y, u1z), (t1y, t1z) = fr(a0 + sweep)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    V = []
    for xs in (x0 - thick * 0.5, x0 + thick * 0.5):
        pts = [(u0y * r0 - t0y * w0 * 0.5, u0z * r0 - t0z * w0 * 0.5),
               (u0y * r0 + t0y * w0 * 0.5, u0z * r0 + t0z * w0 * 0.5),
               (u1y * r1 + t1y * w1 * 0.5, u1z * r1 + t1z * w1 * 0.5),
               (u1y * r1 - t1y * w1 * 0.5, u1z * r1 - t1z * w1 * 0.5)]
        V.append([bm.verts.new((xs, py, pz)) for (py, pz) in pts])
    bm.verts.ensure_lookup_table()
    A, B = V[0], V[1]
    bm.faces.new(A); bm.faces.new(list(reversed(B)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    flat_shade(o); return o


def hub_dome(side, xc, out):
    """Kulový náboj — STEJNÝ na obou stranách, vždy směřuje VEN (mimo mezeru).
    dome() staví apex +X; pro vnitřní disk (side<0) zrcadlím v X → apex -X."""
    d = dome("hd_%d" % side, radius=DOME_R, height=DOME_H, segments=SEG, rings=4,
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

    # OBRUČ (kovový běhoun pásu) — tube
    groups.append(tube("rim_%s" % suf, r_out=R_OUT, r_in=RIM_I, depth=DISC_W,
                       segments=SEG, axis='X', center=(xc, 0, 0)))

    # PAPRSKY (pinwheel) — N swept spokes; vnitřní disk klokovaný o půl rozteče
    base = math.radians(90) + (math.radians(360.0 / N / 2.0) if side < 0 else 0.0)
    spokes = []
    for i in range(N):
        a = base + i * (math.tau / N)
        spokes.append(swept_spoke("sp_%d_%d" % (side, i), a, SWEEP, SP_R0, SP_R1,
                                  SP_W0, SP_W1, x0=xc + out * 0.010, thick=SP_TH))
    groups.append(join("spokes_%s" % suf, spokes))

    # NÁBOJ: flange + kulový dome + věnec šroubů
    hub = [cyl("hf_%d" % side, radius=HUB_FL_R, depth=0.045, segments=SEG, axis='X',
               center=(xc + out * 0.010, 0, 0)),
           hub_dome(side, xc, out)]
    for i in range(N_BOLT):
        a = (i / N_BOLT) * math.tau
        hub.append(cyl("hb_%d_%d" % (side, i), radius=0.0075, depth=0.020, segments=6,
                       axis='X', center=(xc + out * 0.030,
                                         math.cos(a) * BOLT_RING_R, math.sin(a) * BOLT_RING_R)))
    groups.append(join("hub_%s" % suf, hub))

    # ŠROUBY NA OBRUČI (na čele, zarovnané s paprsky)
    rb = []
    for i in range(N):
        a = base + i * (math.tau / N)
        rb.append(cyl("rb_%d_%d" % (side, i), radius=0.008, depth=0.020, segments=6,
                      axis='X', center=(xc + out * (DISC_W * 0.5 + 0.001),
                                        math.cos(a) * RIMBOLT_R, math.sin(a) * RIMBOLT_R)))
    groups.append(join("rimbolts_%s" % suf, rb))
    return groups


# ── fresh scene (nemaž schválené WheelL1) ───────────────────────────────────
scn = bpy.data.scenes.get("IDLER_BUILD") or bpy.data.scenes.new("IDLER_BUILD")
for w in bpy.context.window_manager.windows:
    w.scene = scn

clear_scene()
groups = make_disc(+1) + make_disc(-1)

# SPOJOVACÍ barel mezi disky (jeden celek přes mezeru)
xc_abs = GAP_H + DISC_W * 0.5
groups.append(cyl("barrel", radius=0.085, depth=2 * xc_abs + 0.02, segments=SEG,
                  axis='X', center=(0, 0, 0)))

# MATERIÁL: sdílený wheel atlas; planar-X UV, F tak, aby náboj=green zóna, obruč/paprsky=olive
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
            uvd[li].uv = (0.5 + (co.y / R_OUT) * F, 0.5 + (co.z / R_OUT) * F)
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

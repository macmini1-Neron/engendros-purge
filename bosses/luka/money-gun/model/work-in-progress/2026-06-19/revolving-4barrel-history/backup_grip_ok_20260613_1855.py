# -*- coding: utf-8 -*-
"""
Revolving 4-barrel flintlock pistol, France 18th C. (Denix-style) — GOLD & IVORY
================================================================================
Owner brief: 4-barrel REVOLVING flintlock pistol (Denix "Revolving 4 barrel
flintlock pistol, France 18th. C."). The barrel cluster ROTATES about the bore
axis after each shot (built as its own object, origin on the bore axis). It
"fires" COPPER COINS (Luka boss money items). ALL metal = GOLD (no steel at all),
grip = IVORY, coins = COPPER. Flint = grey stone, bores = dark.

Reuses the proven helper + material library from ornate_money_grip_v2.py.

Coordinate frame (metres):  +X = muzzle (forward), -X = breech/grip, +Z = up,
+Y = lock side.  Bore axis at Y=0, Z=0.

Output:  C:\\Modely\\revolving_4barrel_pistol.blend  (+ .glb)
"""

import bpy, bmesh
from math import sin, cos, pi, radians, tan, sqrt, atan2
from mathutils import Vector

# =====================================================================
# CONSTANTS  (metres)
# =====================================================================
L_TOTAL      = 0.305          # overall (denix#4barrel_overall ~30.5cm)

# --- barrels ---------------------------------------------------------
BARREL_L     = 0.165          # cluster length (derivation#barrel_len)
BARREL_R     = 0.0066         # barrel outer radius (db=13mm)
BORE_R       = 0.0050         # bore radius (~10mm)
RC           = 0.0092         # barrel center offset from axis (touching diamond)
OCTA_FRAC    = 0.42           # rear fraction that is octagonal/faceted
MUZZLE_X     = BARREL_L * 0.5 # muzzle face X (cluster centred on X=0)
BREECH_X     = -BARREL_L * 0.5

# --- rear layout: receiver/breech block -> grip ----------------------
# The whole rear is reworked to read as an elegant Denix replica: a real
# breech block the barrels seat into, a side lockplate, a grip that GROWS from
# the receiver bottom-rear (backstrap + ferrule, no gap), and a flatter butt.
RECV_X0   = -0.142            # rear face of the receiver
RECV_X1   = -0.082           # front (meets the barrel breech)
RECV_TOP  =  0.019
RECV_BOT  = -0.022
RECV_HY   =  RC + BARREL_R - 0.0005   # receiver half-width (Y), ~barrel cluster
LOCK_Y    =  RC + BARREL_R - 0.001    # lockplate / sideplate inner face

# grip emerges from the receiver bottom-rear; graceful S, flat oval section,
# strongly RAKED BACK (~50deg from horizontal) like the Denix reference
GRIP_NECK_X = -0.108
GRIP_NECK_Z = -0.012
GRIP_LEN    =  0.080
# --- output ----------------------------------------------------------
OUT_DIR = r"C:\Modely"
BLEND   = OUT_DIR + r"\revolving_4barrel_pistol.blend"
GLB     = OUT_DIR + r"\revolving_4barrel_pistol.glb"

# diamond barrel centres (Y,Z)
BARRELS = [(0.0, RC), (0.0, -RC), (RC, 0.0), (-RC, 0.0)]

# =====================================================================
# LOW-LEVEL HELPERS  (from ornate_money_grip_v2)
# =====================================================================
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgba(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)

def clean_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                 bpy.data.objects, bpy.data.lights, bpy.data.cameras):
        for blk in list(coll):
            if blk.users == 0:
                coll.remove(blk)
    bpy.context.scene.cursor.location = (0, 0, 0)

def obj_from_bmesh(name, bm, smooth=True):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob

def _active(name=None):
    ob = bpy.context.active_object
    if name: ob.name = name
    return ob

def add_cylinder(name, r, depth, loc, verts=48, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc,
                                         vertices=verts, rotation=rot)
    return _active(name)

def add_cone(name, r1, r2, depth, loc, verts=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                     location=loc, vertices=verts, rotation=rot)
    return _active(name)

def add_sphere(name, r, loc, segs=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc,
                                          segments=segs, ring_count=rings)
    return _active(name)

def add_cube(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc, rotation=rot)
    return _active(name)

def add_torus(name, major, minor, loc, rot=(0, 0, 0), mseg=48, miseg=14):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                      location=loc, rotation=rot,
                                      major_segments=mseg, minor_segments=miseg)
    return _active(name)

def to_mesh(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object

def parent_to(child, parent, keep_world=True):
    child.parent = parent
    if keep_world:
        child.matrix_parent_inverse = parent.matrix_world.inverted()

def join_objects(name, objs):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    if not objs: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = name
    return res

def add_bevel(ob, width=0.0006, segments=2, angle_deg=30):
    m = ob.modifiers.new("Bevel", 'BEVEL')
    m.width = width; m.segments = segments
    m.limit_method = 'ANGLE'; m.angle_limit = radians(angle_deg)
    m.harden_normals = True
    return m

def add_subsurf(ob, vp=2, rnd=3):
    m = ob.modifiers.new("Subdivision", 'SUBSURF')
    m.levels = vp; m.render_levels = rnd
    return m

def add_solidify(ob, th=0.0015, offset=0.0):
    m = ob.modifiers.new("Solidify", 'SOLIDIFY')
    m.thickness = th; m.offset = offset
    return m

def add_mirror(ob, x=False, y=True, z=False):
    m = ob.modifiers.new("Mirror", 'MIRROR')
    m.use_axis = (x, y, z); m.use_clip = True
    m.merge_threshold = 0.0005
    return m

def build_ribbon_xz(name, pts, y, thick):
    """Connected solid strip following a centreline in the X-Z plane, given
    per-point half-width, extruded by `thick` in Y at offset `y`. pts = list of
    (x, z, halfwidth). Produces ONE watertight piece (flintlock cock/frizzen)."""
    bm = bmesh.new()
    n = len(pts); L = []; R = []
    for k in range(n):
        x, z, hw = pts[k]
        if k == 0: tx, tz = pts[1][0]-x, pts[1][1]-z
        elif k == n-1: tx, tz = x-pts[k-1][0], z-pts[k-1][1]
        else: tx, tz = pts[k+1][0]-pts[k-1][0], pts[k+1][1]-pts[k-1][1]
        tl = sqrt(tx*tx+tz*tz) or 1.0; tx, tz = tx/tl, tz/tl
        nx, nz = -tz, tx
        L.append((x+nx*hw, z+nz*hw)); R.append((x-nx*hw, z-nz*hw))
    yf, yb = y+thick/2, y-thick/2
    vLf=[bm.verts.new((p[0],yf,p[1])) for p in L]
    vRf=[bm.verts.new((p[0],yf,p[1])) for p in R]
    vLb=[bm.verts.new((p[0],yb,p[1])) for p in L]
    vRb=[bm.verts.new((p[0],yb,p[1])) for p in R]
    for k in range(n-1):
        bm.faces.new((vLf[k],vRf[k],vRf[k+1],vLf[k+1]))
        bm.faces.new((vLb[k],vLb[k+1],vRb[k+1],vRb[k]))
        bm.faces.new((vLf[k],vLf[k+1],vLb[k+1],vLb[k]))
        bm.faces.new((vRf[k],vRb[k],vRb[k+1],vRf[k+1]))
    bm.faces.new((vLf[0],vLb[0],vRb[0],vRf[0]))
    bm.faces.new((vLf[-1],vRf[-1],vRb[-1],vLb[-1]))
    ob = obj_from_bmesh(name, bm)
    return ob

def build_curve_tube(name, pts, bevel=0.003, taper=None, caps=True):
    """Smooth round-profile swept solid through pts=[(x,y,z),...] (bezier, AUTO
    handles). Optional taper=[(u,v),...] (u along -1..1, v=radius factor) for a
    varying thickness (goose-neck cock, tapering trigger guard)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = bevel; cu.bevel_resolution = 4; cu.resolution_u = 14
    cu.use_fill_caps = caps
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts)-1)
    for bp, co in zip(sp.bezier_points, pts):
        bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    tob = None
    if taper:
        tcu = bpy.data.curves.new(name+"_t", 'CURVE'); tcu.dimensions = '2D'
        tsp = tcu.splines.new('BEZIER'); tsp.bezier_points.add(len(taper)-1)
        for bp, (u, v) in zip(tsp.bezier_points, taper):
            bp.co = (u, v, 0); bp.handle_left_type = bp.handle_right_type = 'AUTO'
        tob = bpy.data.objects.new(name+"_t", tcu); bpy.context.collection.objects.link(tob)
        cu.bevel_object = tob
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    ob = to_mesh(ob)
    if tob and tob.name in bpy.data.objects:
        bpy.data.objects.remove(tob, do_unlink=True)
    return ob

# =====================================================================
# MATERIALS  (gold / copper / ivory + flint + bore)
# =====================================================================
def _set(b, n, v):
    if n in b.inputs: b.inputs[n].default_value = v
def _new_mat(name):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m
def _bsdf(m): return m.node_tree.nodes.get("Principled BSDF")

def _micro_bump(mat, b, scale=450.0, depth=0.15):
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = depth
    bump.inputs["Distance"].default_value = 0.00002
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])

def _rough_breakup(mat, b, base=0.30, amp=0.10, scale=70.0):
    nt = mat.node_tree
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = max(0.0, base - amp)
    mr.inputs["To Max"].default_value = min(1.0, base + amp)
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])

def mat_gold():
    m = _new_mat("MAT_Gold"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#C9962E"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.26)
    _rough_breakup(m, b, base=0.26, amp=0.10, scale=70)
    _micro_bump(m, b, scale=450, depth=0.15)
    return m

def mat_barrel():
    """Gold barrels with fine engraved ring/line detail (ref barrels are engraved)."""
    m = _new_mat("MAT_Barrel"); b = _bsdf(m); nt = m.node_tree
    _set(b, "Base Color", hex_rgba("#C9962E"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.27)
    _rough_breakup(m, b, base=0.27, amp=0.10, scale=70)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = 'BANDS'
    try: wave.bands_direction = 'X'
    except Exception: pass
    wave.inputs["Scale"].default_value = 90.0
    wave.inputs["Distortion"].default_value = 1.5
    wave.inputs["Detail"].default_value = 2.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.00003
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def mat_copper():
    # Luka boss coin copper (coin.js variant 'copper'): metal 0xCB5A1E
    m = _new_mat("MAT_Copper"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#CB5A1E"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.36)
    _rough_breakup(m, b, base=0.36, amp=0.10, scale=120)
    _micro_bump(m, b, scale=450, depth=0.15)
    return m

def mat_copper_eng():
    # Luka coin $ engraving 0x4E2A0C (darker copper)
    m = _new_mat("MAT_CopperEng"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#4E2A0C"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.5)
    return m

def mat_ivory():
    m = _new_mat("MAT_Ivory"); b = _bsdf(m); nt = m.node_tree
    _set(b, "Base Color", hex_rgba("#E8DCC0"))
    _set(b, "Roughness", 0.30)
    _set(b, "Subsurface Weight", 0.08)
    if "Subsurface Radius" in b.inputs: _set(b, "Subsurface Radius", (0.003, 0.002, 0.001))
    if "Subsurface Scale" in b.inputs: b.inputs["Subsurface Scale"].default_value = 0.003
    _set(b, "Coat Weight", 0.4); _set(b, "Coat Roughness", 0.10)
    vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs["Scale"].default_value = 35.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].position = 0.04
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MIX'
    mix.inputs["Color1"].default_value = hex_rgba("#6B5B3A")
    mix.inputs["Color2"].default_value = hex_rgba("#E8DCC0")
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.00005
    nt.links.new(ramp.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def mat_flint():
    m = _new_mat("MAT_Flint"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#5A5750"))
    _set(b, "Roughness", 0.6); _set(b, "Metallic", 0.0)
    return m

def mat_bore():
    m = _new_mat("MAT_Bore"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#0A0A0A"))
    _set(b, "Roughness", 0.7)
    return m

def mat_steel():
    """Aged bright steel like the reference barrels."""
    m = _new_mat("MAT_Steel"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#B7BBC0"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.34)
    _rough_breakup(m, b, base=0.34, amp=0.12, scale=90)
    _micro_bump(m, b, scale=450, depth=0.18)
    # faint engraving lines (like mat_barrel)
    nt = m.node_tree
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.wave_type='BANDS'
    try: wave.bands_direction='X'
    except Exception: pass
    wave.inputs["Scale"].default_value = 95.0; wave.inputs["Distortion"].default_value = 1.5
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.00003
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def mat_steel_dark():
    """Dark engraved/blued steel like the reference lock + cock."""
    m = _new_mat("MAT_SteelDark"); b = _bsdf(m)
    _set(b, "Base Color", hex_rgba("#34373C"))
    _set(b, "Metallic", 1.0); _set(b, "Roughness", 0.38)
    _rough_breakup(m, b, base=0.38, amp=0.10, scale=120)
    _micro_bump(m, b, scale=500, depth=0.15)
    return m

def assign(ob, mat):
    if ob is None: return ob
    ob.data.materials.clear(); ob.data.materials.append(mat)
    return ob

# =====================================================================
# BARREL CLUSTER  (own object, origin on bore axis -> revolves about X)
# =====================================================================
def octa_round_radius(angle, f, r):
    """Blend octagon (f=0, breech) -> circle (f=1, muzzle). angle in rad."""
    # octagon apothem = r ; vertex radius = r/cos(theta_in_facet)
    seg = pi / 4.0
    th = ((angle + pi/8) % seg) - seg/2.0
    r_oct = r / cos(th)
    return r_oct * (1.0 - f) + r * f

def build_one_barrel(idx, cy, cz):
    bm = bmesh.new()
    nseg = 24
    nx = 26
    taper = 0.93     # muzzle radius factor
    rings = []
    for i in range(nx + 1):
        t = i / nx                      # 0 breech -> 1 muzzle
        x = BREECH_X + t * BARREL_L
        # octagon for rear OCTA_FRAC, blend to round
        if t < OCTA_FRAC:
            f = 0.0
        elif t < OCTA_FRAC + 0.12:
            f = (t - OCTA_FRAC) / 0.12
        else:
            f = 1.0
        rr = BARREL_R * (1.0 - (1.0 - taper) * t)
        ring = []
        for j in range(nseg):
            a = 2*pi*j/nseg
            r = octa_round_radius(a, f, rr)
            y = cy + r * cos(a)
            z = cz + r * sin(a)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(nx):
        for j in range(nseg):
            j2 = (j+1) % nseg
            bm.faces.new((rings[i][j], rings[i][j2], rings[i+1][j2], rings[i+1][j]))
    # breech cap (closed)
    bm.faces.new(list(reversed(rings[0])))
    # muzzle face = ring with recessed bore: build a flat annulus face cap leaving a hole,
    # then a recessed dark disc is added separately. Here just cap outer ring to a center
    # ring at bore radius (annulus).
    muzzle_ring = rings[-1]
    cxv = bm.verts.new((MUZZLE_X, cy, cz))
    # annulus: outer ring to an inner bore ring
    inner = []
    for j in range(nseg):
        a = 2*pi*j/nseg
        inner.append(bm.verts.new((MUZZLE_X, cy + BORE_R*cos(a), cz + BORE_R*sin(a))))
    for j in range(nseg):
        j2 = (j+1) % nseg
        bm.faces.new((muzzle_ring[j], muzzle_ring[j2], inner[j2], inner[j]))
    # bore wall going inward a little
    inner2 = []
    for j in range(nseg):
        a = 2*pi*j/nseg
        inner2.append(bm.verts.new((MUZZLE_X-0.012, cy + BORE_R*0.92*cos(a), cz + BORE_R*0.92*sin(a))))
    for j in range(nseg):
        j2 = (j+1) % nseg
        bm.faces.new((inner[j], inner[j2], inner2[j2], inner2[j]))
    bm.faces.new(list(reversed(inner2)))   # bore back (dark)
    ob = obj_from_bmesh(f"BARREL_{idx}", bm)
    add_bevel(ob, width=0.0004, segments=1)
    return ob

def build_barrel_cluster():
    parts = []
    for idx, (cy, cz) in enumerate(BARRELS):
        parts.append(build_one_barrel(idx, cy, cz))
    cluster = join_objects("CLUSTER_Barrels_Gold", parts)

    extras = []
    # turned ring grooves at the octa/round transition (two raised gold bands)
    for cy, cz in BARRELS:
        for bx in (BREECH_X + BARREL_L*OCTA_FRAC, BREECH_X + BARREL_L*(OCTA_FRAC+0.02)):
            ring = add_torus(f"grv_{cy}_{cz}_{bx:.3f}", major=BARREL_R*0.96, minor=0.0008,
                             loc=(bx, cy, cz), rot=(0, radians(90), 0), mseg=20, miseg=8)
            extras.append(ring)
    # gold collar band wrapping whole cluster near breech (image 3)
    collar = add_cylinder("collar", r=RC+BARREL_R+0.0012, depth=0.012,
                          loc=(BREECH_X+0.022, 0, 0), verts=8, rot=(0, radians(90), 0))
    add_bevel(collar, width=0.0010, segments=2)
    extras.append(collar)
    # gold collar band near the muzzle end (the "objímka" the real gun has)
    muzcol = add_cylinder("muz_collar", r=RC+BARREL_R+0.0013, depth=0.010,
                          loc=(MUZZLE_X-0.018, 0, 0), verts=8, rot=(0, radians(90), 0))
    add_bevel(muzcol, width=0.0010, segments=2)
    extras.append(muzcol)
    # bulbous gold breech form at the rear
    breech = add_sphere("breech_bulb", r=RC+BARREL_R+0.0010, loc=(BREECH_X-0.004, 0, 0))
    breech.scale = (0.45, 1.0, 1.0)
    extras.append(breech)
    breech_ring = add_torus("breech_ring", major=RC+BARREL_R+0.0014, minor=0.0016,
                            loc=(BREECH_X+0.004, 0, 0), rot=(0, radians(90), 0), mseg=10, miseg=10)
    extras.append(breech_ring)

    # --- gold muzzle clover cap + 4 index pins (image 6) ---
    cap_parts = []
    capx = MUZZLE_X
    for cy, cz in BARRELS:
        rim = add_torus(f"muzrim_{cy}_{cz}", major=BARREL_R+0.0008, minor=0.0010,
                        loc=(capx, cy, cz), rot=(0, radians(90), 0), mseg=20, miseg=8)
        cap_parts.append(rim)
    centerboss = add_sphere("muz_center", r=0.0045, loc=(capx, 0, 0))
    centerboss.scale = (0.4, 1.0, 1.0)
    cap_parts.append(centerboss)
    # 4 index pins at the diamond tips (outer extremes)
    pin_off = RC + BARREL_R + 0.0006
    for (py, pz) in [(0, pin_off), (0, -pin_off), (pin_off, 0), (-pin_off, 0)]:
        pin = add_cylinder(f"pin_{py}_{pz}", r=0.0011, depth=0.006,
                           loc=(capx-0.001, py, pz), verts=8, rot=(0, radians(90), 0))
        cap_parts.append(pin)
    cap = join_objects("CLUSTER_MuzzleCap_Gold", cap_parts)
    add_bevel(cap, width=0.0004, segments=1)
    extras.append(cap)

    cluster_all = join_objects("CLUSTER_Barrels_Gold", [cluster] + extras)
    # dark bore discs (separate material) at each muzzle
    bores = []
    for cy, cz in BARRELS:
        d = add_cylinder(f"bore_{cy}_{cz}", r=BORE_R*0.95, depth=0.002,
                         loc=(MUZZLE_X-0.013, cy, cz), verts=20, rot=(0, radians(90), 0))
        bores.append(d)
    bore_obj = join_objects("CLUSTER_Bores", bores)
    return cluster_all, bore_obj

# =====================================================================
# small shape helpers for the rear rework
# =====================================================================
def extrude_xz(name, poly, y0, thick):
    """Extrude a closed 2D polygon (list of (x,z)) in Y from y0 by thick."""
    bm = bmesh.new(); yf, yb = y0+thick, y0
    vf = [bm.verts.new((x, yf, z)) for (x, z) in poly]
    vb = [bm.verts.new((x, yb, z)) for (x, z) in poly]
    n = len(poly)
    for i in range(n):
        i2 = (i+1) % n
        bm.faces.new((vb[i], vb[i2], vf[i2], vf[i]))
    bm.faces.new(list(reversed(vf))); bm.faces.new(vb)
    return obj_from_bmesh(name, bm, smooth=False)

def teardrop_poly(cx, cz, R, tail_x):
    """Teardrop outline (XZ): round head at (cx,cz) R, pointed tail toward tail_x (rear)."""
    pts = []; n = 26
    a0, a1 = radians(200), radians(520)        # arc avoiding the rear (180deg)
    for i in range(n+1):
        a = a0 + (a1-a0)*(i/n)
        pts.append((cx + R*cos(a), cz + R*0.82*sin(a)))
    pts.append((tail_x, cz))
    return pts

def oval_band(name, cx, z0, hd, hw, out, height):
    """A short oval drum/band (collar/ferrule) around a grip cross-section."""
    bm = bmesh.new(); ns = 30; top, bot = [], []
    for j in range(ns):
        a = 2*pi*j/ns
        x = cx + (hd+out)*cos(a); y = (hw+out)*sin(a)
        top.append(bm.verts.new((x, y, z0+height/2)))
        bot.append(bm.verts.new((x, y, z0-height/2)))
    for j in range(ns):
        j2 = (j+1) % ns
        bm.faces.new((bot[j], bot[j2], top[j2], top[j]))
    bm.faces.new(list(reversed(top))); bm.faces.new(bot)
    return obj_from_bmesh(name, bm)

# =====================================================================
# BREECH BLOCK / RECEIVER  (gold) — barrels seat into it; the grip grows
# from its bottom-rear. A real body, not a thin frame.
# =====================================================================
# Solid breech/wrist silhouette (XZ): barrels seat into the front, the grip
# grows from the bottom-rear — fills the waist between barrels and grip (no gap).
# Lower, rounded breech — top roughly level with the barrel cluster (not a tall
# block); fills the waist and flows into the grip so it reads as one piece.
# The METAL breech/lock body that FILLS the space between the barrels and the
# grip (ref image 1): top roughly level with the barrel cluster (NOT above), back
# to where the grip wrist starts, down to the trigger. The grip wrist overlaps
# its rear so there is no gap and no overlap with the barrels themselves.
BREECH_PROFILE = [
    (-0.078, -0.010), (-0.080, 0.013), (-0.100, 0.014), (-0.122, 0.012),
    (-0.137, 0.004), (-0.142, -0.014), (-0.136, -0.030), (-0.118, -0.036),
    (-0.098, -0.034), (-0.082, -0.026),
]

def build_breech_receiver():
    """Solid gold breech/lock body filling the waist between the barrels and the
    grip; the grip wrist overlaps its rear. Top at barrel level (not a tall block)."""
    parts = []
    bhy = RECV_HY*0.82                                # slimmer breech body (Y) per owner
    body = extrude_xz("BreechBlock", BREECH_PROFILE, -bhy, 2*bhy)
    add_bevel(body, width=0.0034, segments=3); add_subsurf(body, vp=1, rnd=2)
    parts.append(body)
    # standing breech cup the 4 barrels plug into (front)
    cup = add_cylinder("recv_cup", r=RC+BARREL_R+0.0014, depth=0.012,
                       loc=(-0.083, 0, 0), verts=8, rot=(0, radians(90), 0))
    add_bevel(cup, width=0.0012, segments=2); parts.append(cup)
    # thin barrel tang + screw on top
    tang = add_cube("recv_tang", 1.0, loc=(-0.112, 0, 0.014), rot=(0, radians(-5), 0))
    tang.scale = (0.020, 0.0072, 0.0030); add_bevel(tang, width=0.0008, segments=2)
    parts.append(tang)
    parts.append(add_cylinder("recv_tang_screw", r=0.0016, depth=0.005,
                              loc=(-0.126, 0, 0.010), verts=10))
    return join_objects("BreechBlock", parts)

# =====================================================================
# LOCK  (gold cock + frizzen + lockplate + pan)  — on +Y side
# =====================================================================
# large ornamental side plate outline (XZ) — spans the breech and the upper
# grip, widest at the rear, tapering forward, hugging the grip contour (ref img 2)
SP_POLY = [
    (-0.080, -0.015),   # FRONT point (toward trigger) — narrow
    (-0.083,  0.009),   # front-top (breech)
    (-0.103,  0.015),
    (-0.126,  0.014),
    (-0.141,  0.004),   # rear-top
    (-0.143, -0.014),   # REAR (wide, rounded over the grip neck)
    (-0.134, -0.027),
    (-0.114, -0.028),   # bottom along the receiver/grip-neck
    (-0.096, -0.023),
    (-0.084, -0.016),
]

def inset_poly(poly, f):
    cx = sum(p[0] for p in poly)/len(poly); cz = sum(p[1] for p in poly)/len(poly)
    return [(cx+(x-cx)*f, cz+(z-cz)*f) for (x, z) in poly]

def build_sideplate(name, y0, thick, outer_y, vol_sign):
    """Big elongated engraved side/lock plate following the grip outline, with a
    raised relief border, central boss, mounting screws and scroll engraving."""
    parts = [extrude_xz(name, SP_POLY, y0, thick)]
    add_bevel(parts[0], width=0.0010, segments=2)
    # raised relief border (inset outline, sitting proud of the plate face)
    rb = outer_y if outer_y > y0 else outer_y - 0.0012
    parts.append(extrude_xz(name+"_ridge", inset_poly(SP_POLY, 0.80), rb, 0.0012))
    yb = (rb + 0.0012) if outer_y > y0 else rb
    # central boss
    parts.append(add_cylinder(name+"_boss", r=0.0036, depth=0.0030, loc=(-0.121, yb, -0.008),
                              verts=18, rot=(radians(90), 0, 0)))
    # mounting screws around the plate
    for k, (sx, sz) in enumerate([(-0.086, 0.002), (-0.138, -0.002), (-0.130, -0.020), (-0.098, -0.018)]):
        parts.append(add_cylinder(name+f"_s{k}", r=0.0015, depth=0.0026, loc=(sx, yb, sz),
                                  verts=8, rot=(radians(90), 0, 0)))
    # scroll engraving (a couple of volutes proud of the plate)
    for k, (sx, sz, sc) in enumerate([(-0.110, 0.004, 0.0085), (-0.096, -0.014, 0.0066)]):
        parts.append(build_scroll_volute(name+f"_v{k}", scale=sc, loc=(sx, yb, sz),
                                         rot=(radians(90)*vol_sign, 0, 0)))
    return join_objects(name, parts)

def build_lock():
    LSIDE = -1.0                     # flintlock on the -Y side (owner: other side)
    LY = LSIDE * LOCK_Y
    parts = []
    # NO big side plates. Small bolster around the cock pivot + pan + screw +
    # subtle engraving directly on the breech side.
    bolster = add_sphere("lock_bolster", 1.0, loc=(-0.114, LY, -0.001))
    bolster.scale = (0.015, 0.004, 0.011); add_bevel(bolster, width=0.0010, segments=2)
    parts.append(bolster)
    pan = add_sphere("pan", r=0.0052, loc=(-0.086, LY+LSIDE*0.004, 0.003))
    pan.scale = (1.1, 0.7, 0.5); parts.append(pan)
    parts.append(add_cylinder("lock_screw", r=0.0017, depth=0.004,
                              loc=(-0.120, LY+LSIDE*0.003, -0.004), verts=10, rot=(radians(90),0,0)))
    # engraved lockplate pattern on the breech side (FLUSH scrollwork + screws,
    # not a proud applied plate) so the lock area reads like the reference
    ey = LY + LSIDE*0.0035
    for k, (ex, ez, es) in enumerate([(-0.122, 0.003, 0.0080), (-0.108, -0.006, 0.0070),
                                       (-0.118, -0.018, 0.0060), (-0.099, -0.018, 0.0055)]):
        parts.append(build_scroll_volute(f"lock_eng{k}", scale=es, loc=(ex, ey, ez),
                                         rot=(radians(90), 0, radians(15*k))))
    for k, (ex, ez) in enumerate([(-0.132, -0.004), (-0.094, -0.008), (-0.112, -0.028)]):
        parts.append(add_cylinder(f"lock_scr{k}", r=0.0014, depth=0.0024,
                                  loc=(ex, ey, ez), verts=8, rot=(radians(90), 0, 0)))
    lock = join_objects("LockPlate", parts)

    cy = LY + LSIDE*0.007           # cock/frizzen proud of the breech side
    # --- COCK: graceful goose-neck swept tube + jaws + flint + spur ---
    cock_pts = [(-0.122, cy, 0.003), (-0.121, cy, 0.016), (-0.117, cy, 0.030),
                (-0.109, cy, 0.042), (-0.101, cy, 0.052), (-0.095, cy, 0.060)]
    cock_taper = [(-1, 1.05), (-0.45, 1.22), (0.2, 0.72), (1, 0.5)]
    cock = build_curve_tube("Cock", cock_pts, bevel=0.0048, taper=cock_taper)
    cparts = [cock]
    jx, jz = -0.094, 0.061
    lj = add_cube("cock_jawL", 1.0, loc=(jx, cy, jz-0.003), rot=(0, radians(28), 0)); lj.scale=(0.0055,0.0040,0.0028); cparts.append(lj)
    uj = add_cube("cock_jawU", 1.0, loc=(jx-0.001, cy, jz+0.006), rot=(0, radians(28), 0)); uj.scale=(0.0055,0.0040,0.0028); cparts.append(uj)
    jscrew = add_cylinder("cock_jscrew", r=0.0019, depth=0.011, loc=(jx, cy, jz+0.002), verts=12, rot=(0,0,0)); cparts.append(jscrew)
    jfin = add_sphere("cock_jfin", r=0.0028, loc=(jx, cy, jz+0.008)); jfin.scale=(1,1,0.8); cparts.append(jfin)
    spur = add_cube("cock_spur", 1.0, loc=(-0.122, cy, 0.012), rot=(0, radians(-32), 0)); spur.scale=(0.0035,0.0035,0.0060); cparts.append(spur)
    comb = build_scroll_volute("cock_comb", scale=0.0078, loc=(-0.124, cy, 0.020), rot=(radians(90), 0, radians(-18)))
    cparts.append(comb)
    jring = add_torus("cock_jring", major=0.0026, minor=0.0009, loc=(jx, cy, jz+0.010), rot=(radians(90),0,0), mseg=16, miseg=6)
    cparts.append(jring)
    cock = join_objects("Cock", cparts); add_bevel(cock, width=0.0008, segments=2)

    # flint stone clamped in the jaws (grey), tipped toward the frizzen
    flint = add_cube("Flint", 1.0, loc=(jx+0.006, cy, jz+0.002), rot=(0, radians(42), 0))
    flint.scale = (0.0055, 0.0032, 0.0036); add_bevel(flint, width=0.0006, segments=1)

    # --- FRIZZEN: battery with a curled top, on a foot pivot, + spring ---
    fy = cy + 0.001
    friz_pts = [(-0.073, fy, 0.002), (-0.080, fy, 0.006), (-0.082, fy, 0.018),
                (-0.082, fy, 0.030), (-0.086, fy, 0.037)]
    friz_taper = [(-1, 1.0), (0.0, 1.05), (1, 0.75)]
    frizzen = build_curve_tube("Frizzen", friz_pts, bevel=0.0034, taper=friz_taper)
    face = add_cube("friz_face", 1.0, loc=(-0.080, cy-0.003, 0.022), rot=(0, radians(4), 0))
    face.scale = (0.0022, 0.0035, 0.013); add_bevel(face, width=0.0008, segments=2)
    frizzen = join_objects("Frizzen", [frizzen, face]); add_bevel(frizzen, width=0.0007, segments=1)
    spring_pts = [(-0.062, fy, -0.004), (-0.070, fy, 0.000), (-0.074, fy, 0.006)]
    spring = build_curve_tube("FrizzenSpring", spring_pts, bevel=0.0022)

    return lock, cock, flint, frizzen, spring

# =====================================================================
# GRIP  (ivory) + gold scroll + gold pommel
# =====================================================================
# Closed side silhouette (x,z) TRACED off Denix ref image 1 (scale 0.000375 m/px,
# bore axis z=0, breech x=-0.0825). Grip rakes back ~42deg, belly toe curls
# forward, fuller butt, pommel hooking back. Order: belly top->bottom, pommel,
# spine bottom->top, then close at the neck.
# The IVORY stock rises to a SLENDER WRIST at barrel level (behind the breech),
# then widens into the massive grip — one continuous piece (research: flintlock
# stocks have a slender wrist). No thick metal block between barrels and grip.
# grip wrist OVERLAPS the breech rear (no gap, no overlap with the barrels);
# slimmer per owner. Banana S-curve, toe forward, pommel hooked back.
# more UPRIGHT rake (~58deg from horizontal) to match the reference (pommel
# brought forward); wrist still overlaps the breech rear.
# MORE HORIZONTAL rake (~47deg), wrist EXTENDED UP to the barrel line so the
# ivory runs continuously from the barrels to the gold pommel (owner)
# RE-TRACED 2026-06-13 from owner's red outline on ref image 1 (auto-detected red
# pixels -> filled silhouette -> boundary -> model coords via barrel anchors:
# bore axis py=266=z0, barrels px 400..883 = model x -0.083..+0.084).
# Result: slimmer wrist seated just behind the breech (neck x=-0.09), a longer,
# more laid-back banana raking down to a pommel at x=-0.22/z=-0.08, with the toe
# curling forward — a true bird's-head S, and the belly drops away from the
# barrels so the grip no longer crowds the barrel/trigger area (owner OPEN items).
GRIP_PROFILE = [
    (-0.091, -0.010), (-0.110, -0.024), (-0.135, -0.030), (-0.158, -0.045), (-0.175, -0.070),
    (-0.200, -0.078),
    (-0.221, -0.052), (-0.198, -0.028), (-0.166, -0.006), (-0.132, 0.010), (-0.100, 0.022),
]
GRIP_HW = 0.0150                      # grip half-thickness (Y) -> rounder/fuller cross-section
GRIP_BELLY = GRIP_PROFILE[0:5]        # neck -> toe (front edge)
GRIP_SPINE = GRIP_PROFILE[6:11][::-1] # neck -> pommel (back edge, top->bottom)

def grip_neck():
    a, b = GRIP_PROFILE[0], GRIP_PROFILE[-1]
    return ((a[0]+b[0])/2, (a[1]+b[1])/2)

def grip_pommel():
    p = [GRIP_PROFILE[4], GRIP_PROFILE[5], GRIP_PROFILE[6]]
    return (sum(q[0] for q in p)/3, sum(q[1] for q in p)/3)

def grip_axis():
    nx, nz = grip_neck(); px, pz = grip_pommel()
    return Vector((px-nx, 0.0, pz-nz)).normalized()

def build_grip():
    """Extrude the traced side silhouette in Y, heavily rounded to a full, round
    cross-section (owner: 'zakulatit')."""
    grip = extrude_xz("Grip", GRIP_PROFILE, -GRIP_HW, 2*GRIP_HW)
    add_bevel(grip, width=0.0055, segments=4)        # round the silhouette edges
    add_subsurf(grip, vp=3, rnd=3)                   # smooth, rounded surface
    return grip

def build_scroll_volute(name, scale, loc, rot):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = 0.0016 * (scale/0.02); cu.bevel_resolution = 3; cu.resolution_u = 8
    sp = cu.splines.new('BEZIER'); turns, n = 1.4, 9
    sp.bezier_points.add(n-1)
    for i in range(n):
        f = i/(n-1); ang = turns*2*pi*f; rad = scale*(1.0-0.75*f)
        sp.bezier_points[i].co = (rad*cos(ang), rad*sin(ang), 0)
        sp.bezier_points[i].handle_left_type = sp.bezier_points[i].handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = rot
    return to_mesh(ob)

def build_leaf(name, length, width, loc, rot):
    bm = bmesh.new(); n = 6; top, bot = [], []
    for i in range(n+1):
        f = i/n; x = length*f; w = width*sin(pi*f)*0.5; zb = 0.0008*sin(pi*f)
        top.append(bm.verts.new((x,  w, zb))); bot.append(bm.verts.new((x, -w, zb)))
    for i in range(n):
        bm.faces.new((top[i], top[i+1], bot[i+1], bot[i]))
    ob = obj_from_bmesh(name, bm); ob.location = loc; ob.rotation_euler = rot
    add_solidify(ob, th=0.0006)
    return ob

def _profile_normal(pts2d, i, outward=+1):
    """Outward 2D normal at point i of a polyline (for placing edge trim)."""
    a = pts2d[max(0, i-1)]; b = pts2d[min(len(pts2d)-1, i+1)]
    tx, tz = b[0]-a[0], b[1]-a[1]; tl = sqrt(tx*tx+tz*tz) or 1.0
    return (outward*(-tz/tl), outward*(tx/tl))

def build_grip_scroll():
    """Fine gold filigree on the ivory: subtle S-vines + rosette dots down the
    side panel, plus a thin border line along the belly + spine edges."""
    parts = []
    # thin border piping along belly + spine (single, on the silhouette edge)
    for nm, line in (("trim_belly", GRIP_BELLY), ("trim_spine", GRIP_SPINE)):
        cu = bpy.data.curves.new(nm, 'CURVE'); cu.dimensions='3D'
        cu.bevel_depth=0.0006; cu.bevel_resolution=2; cu.resolution_u=8
        sp = cu.splines.new('NURBS'); sp.points.add(len(line)-1)
        for i,(x,z) in enumerate(line): sp.points[i].co=(x, 0.0, z, 1.0)
        sp.use_endpoint_u = True
        ob = bpy.data.objects.new(nm, cu); bpy.context.collection.objects.link(ob)
        parts.append(to_mesh(ob))
    # DENSE scrollwork on the broad side FACE (centreline of the grip), proud,
    # mirrored to both sides — matches the ref's rich engraving
    sb, ss = GRIP_BELLY, GRIP_SPINE          # both top->bottom, 5 pts each
    centers = [((sb[i][0]+ss[i][0])/2, (sb[i][1]+ss[i][1])/2) for i in range(5)]
    yy = GRIP_HW + 0.0006                    # just proud of the broad face
    side = []
    # a column of alternating scroll volutes down the grip face
    for i, (cx, cz) in enumerate(centers):
        side.append(build_scroll_volute(f"grip_sc{i}", scale=0.0085+0.0012*i,
                    loc=(cx, yy, cz), rot=(radians(90), 0, radians(18 if i%2 else -18))))
    # fine S-vines weaving between them
    for i in range(4):
        cx = (centers[i][0]+centers[i+1][0])/2; cz = (centers[i][1]+centers[i+1][1])/2
        cu = bpy.data.curves.new(f"grip_vine_{i}", 'CURVE'); cu.dimensions='3D'
        cu.bevel_depth=0.00045; cu.bevel_resolution=2; cu.resolution_u=8
        sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
        pts = [(cx-0.009, yy, cz+0.006),(cx-0.002, yy, cz+0.010),
               (cx+0.004, yy, cz-0.004),(cx+0.011, yy, cz+0.005)]
        for bp,co in zip(sp.bezier_points, pts):
            bp.co=co; bp.handle_left_type=bp.handle_right_type='AUTO'
        ob = bpy.data.objects.new(f"grip_vine_{i}", cu); bpy.context.collection.objects.link(ob)
        side.append(to_mesh(ob))
    # rosette dots scattered along both edges
    for (dx, dz) in (GRIP_SPINE[1], GRIP_SPINE[3], GRIP_BELLY[1], GRIP_BELLY[3]):
        side.append(add_sphere(f"grip_dot_{dx:.3f}_{dz:.3f}", r=0.0014, loc=(dx, GRIP_HW*0.55, dz)))
    sg = join_objects("grip_side_orn", side); add_mirror(sg, y=True)
    g = join_objects("DecorativeParts", parts + [sg])
    return g

def build_backstrap():
    """Gold backstrap rib running down the grip spine from the receiver to the
    butt — gives the grip a logical metal skeleton (no 'glued-on' look)."""
    bm = bmesh.new(); n = len(GRIP_SPINE); L, R = [], []
    for i,(x,z) in enumerate(GRIP_SPINE):
        nx, nz = _profile_normal(GRIP_SPINE, i, outward=+1)   # outward along spine
        w = 0.0032 + 0.0024*sin(pi*(i/(n-1)))
        px, pz = x + nx*0.0008, z + nz*0.0008
        L.append((px, -w, pz)); R.append((px, w, pz))
    vL=[bm.verts.new(p) for p in L]; vR=[bm.verts.new(p) for p in R]
    for i in range(n-1):
        bm.faces.new((vL[i], vR[i], vR[i+1], vL[i+1]))
    ob = obj_from_bmesh("Backstrap", bm)
    add_solidify(ob, th=0.0022, offset=0.0); add_bevel(ob, width=0.0005, segments=2)
    return ob

def build_ferrule():
    """Gold ferrule band where the grip emerges from the receiver bottom."""
    nx, nz = grip_neck()
    ob = oval_band("Ferrule", nx, nz-0.002, 0.013, GRIP_HW, 0.0012, 0.0075)
    add_bevel(ob, width=0.0007, segments=2)
    return ob

def build_buttcap():
    """One continuous smooth flared butt cap (lathed profile, flat oval section)
    + radial acanthus petals — a single rounded decorative end, not a spool.
    Oriented along the grip axis. Returns (object, bottom_z)."""
    px, pz = grip_pommel(); d = grip_axis(); Pc = Vector((px, 0.0, pz))
    # lathe profile (radius, along-axis z): grip width -> flare -> round under -> tip
    prof = [(0.0130, 0.000), (0.0190, 0.004), (0.0250, 0.009), (0.0268, 0.014),
            (0.0245, 0.019), (0.0180, 0.024), (0.0090, 0.0285), (0.0, 0.0305)]
    OVAL = 0.64                       # flatten side-to-side -> flat oval
    bm = bmesh.new(); ns = 34; rings = []; apex = None
    for (r, zz) in prof:
        if r <= 0.0:
            apex = bm.verts.new((0, 0, zz)); continue
        rings.append([bm.verts.new((r*cos(2*pi*j/ns), r*OVAL*sin(2*pi*j/ns), zz)) for j in range(ns)])
    for i in range(len(rings)-1):
        for j in range(ns):
            j2 = (j+1) % ns
            bm.faces.new((rings[i][j], rings[i][j2], rings[i+1][j2], rings[i+1][j]))
    if apex:
        for j in range(ns):
            bm.faces.new((rings[-1][j], rings[-1][(j+1)%ns], apex))
    bm.faces.new(list(reversed(rings[0])))                  # top opening (inside grip)
    cap = obj_from_bmesh("ButtCap", bm)
    add_bevel(cap, width=0.0006, segments=2); add_subsurf(cap, vp=2, rnd=2)
    pet = []
    for i in range(8):
        a = 2*pi*i/8
        pet.append(build_leaf(f"bc_pet_{i}", length=0.0095, width=0.0048,
                   loc=(0.023*cos(a), 0.023*OVAL*sin(a), 0.013),
                   rot=(radians(132), 0, a + radians(90))))
    # ornate acanthus scroll volutes between the petals (ref pommel images 4/5)
    for i in range(8):
        a = 2*pi*(i+0.5)/8
        pet.append(build_scroll_volute(f"bc_sc_{i}", scale=0.0055,
                   loc=(0.021*cos(a), 0.021*OVAL*sin(a), 0.010),
                   rot=(radians(118), 0, a + radians(90))))
    bc = join_objects("ButtCap", [cap, join_objects("bc_petals", pet)])
    bc.rotation_euler = Vector((0,0,1)).rotation_difference(d).to_euler()
    bc.location = Pc - d*0.004
    bottom_z = (Pc - d*0.004).z + d.z*0.030
    return bc, bottom_z

# =====================================================================
# TRIGGER GUARD + TRIGGER  (gold)
# =====================================================================
def build_triggerguard():
    """Elegant continuous guard bow: front finial fixed under the receiver,
    sweeps round the trigger, rear finial onto the grip belly. Round profile."""
    g_pts = [(-0.076, 0.0, -0.016),   # front finial (under receiver)
             (-0.079, 0.0, -0.032),
             (-0.087, 0.0, -0.050),
             (-0.099, 0.0, -0.056),   # bow bottom (deeper, more open)
             (-0.112, 0.0, -0.051),
             (-0.124, 0.0, -0.038),
             (-0.130, 0.0, -0.026)]   # rear finial (onto grip belly)
    g_taper = [(-1, 0.9), (-0.5, 1.15), (0.5, 1.15), (1, 0.95)]
    guard = build_curve_tube("TriggerGuard", g_pts, bevel=0.0024, taper=g_taper)
    f1 = add_sphere("tg_fin1", r=0.0034, loc=(-0.075, 0, -0.014)); f1.scale=(1,1,0.8)
    f2 = add_sphere("tg_fin2", r=0.0036, loc=(-0.131, 0, -0.025)); f2.scale=(1,1,0.85)
    guard = join_objects("TriggerGuard", [guard, f1, f2]); add_bevel(guard, width=0.0005, segments=1)
    return guard

def build_trigger():
    """Small curved trigger blade inside the bow, hung from the receiver."""
    t_pts = [(-0.090, 0.0, -0.023), (-0.091, 0.0, -0.032), (-0.089, 0.0, -0.041)]
    trig = build_curve_tube("Trigger", t_pts, bevel=0.0016)
    add_bevel(trig, width=0.0004, segments=1)
    return trig

# =====================================================================
# COPPER COINS  — faithful port of Luka boss coin.js (variant 'copper'):
#   5 Kc-style rounded beveled rim + 48 tiny bumps, $ stamped both faces.
#   Built flat in local XY (faces along local Z), then laid down & placed.
# =====================================================================
COIN_R = 0.0135                       # ~27mm money-gun ammo coin
COIN_T = COIN_R * (0.05/0.17)         # keep coin.js radius:thickness ratio

def build_coin_body(name):
    """Bumpy disc with rounded rim. Faces along +/-Z (local)."""
    bm = bmesh.new()
    N, K = 48, 48*4
    R = COIN_R * 0.97
    top, bot = [], []
    for i in range(K):
        a = 2*pi*i/K
        bump = 1 + 0.030 * max(0.0, cos(N*a))**2     # coin.js bump profile
        r = R * bump
        top.append(bm.verts.new((r*cos(a), r*sin(a),  COIN_T/2)))
        bot.append(bm.verts.new((r*cos(a), r*sin(a), -COIN_T/2)))
    for i in range(K):
        i2 = (i+1) % K
        bm.faces.new((bot[i], bot[i2], top[i2], top[i]))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    ob = obj_from_bmesh(name, bm)
    add_bevel(ob, width=COIN_T*0.30, segments=3, angle_deg=40)   # rounded 5Kc edge
    return ob

def build_coin_glyph(name):
    """$ on both faces (font, dark copper), recessed flush. Local Z faces."""
    q = COIN_R / 0.17
    glyphs = []
    for zc in (+COIN_T/2 + 0.0006, -COIN_T/2 - 0.0006):
        cu = bpy.data.curves.new(name, 'FONT'); cu.body = "$"
        cu.size = 0.26*q; cu.extrude = 0.0010
        cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
        ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
        ob.location = (0, 0, zc)
        if zc < 0: ob.rotation_euler = (radians(180), 0, 0)   # mirror to back face
        bpy.context.view_layer.update()
        glyphs.append(to_mesh(ob))
    return join_objects(name, glyphs)

def make_coin(idx, loc, rot):
    body = build_coin_body(f"COIN_body_{idx}")
    glyph = build_coin_glyph(f"COIN_glyph_{idx}")
    for o in (body, glyph):
        o.location = loc; o.rotation_euler = rot
    return body, glyph

def build_coins(ground_z):
    bodies, glyphs = [], []
    # leaning stack of coins lying flat (faces up), beside the grip
    sx, sy = 0.060, 0.075
    for i in range(5):
        loc = (sx + 0.003*i, sy - 0.0015*i, ground_z + COIN_T*0.55 + COIN_T*1.02*i)
        b, g = make_coin(f"stk{i}", loc, (radians(3*i), radians(2*i), radians(20*i)))
        bodies.append(b); glyphs.append(g)
    # a few flat scattered around
    scatter = [(0.045, 0.105, 8), (0.122, 0.066, -20), (0.103, 0.120, 40), (0.060, 0.140, -10)]
    for i,(px,py,rz) in enumerate(scatter):
        b, g = make_coin(f"flt{i}", (px, py, ground_z + COIN_T*0.55), (0,0,radians(rz)))
        bodies.append(b); glyphs.append(g)
    cb = join_objects("COINS_Copper", bodies)
    cg = join_objects("COINS_Dollar", glyphs)
    return cb, cg

# =====================================================================
# REVOLVE ANIMATION — cluster snaps 90deg per shot about the bore axis
# =====================================================================
def build_revolve_animation(pivot):
    scene = bpy.context.scene
    scene.frame_start = 1; scene.frame_end = 96
    scene.render.fps = 24
    # 4 shots: rest -> snap 90 -> hold, repeating (revolver indexing)
    keys = [(1,0),(12,0),(18,90),(30,90),(36,180),(48,180),
            (54,270),(66,270),(72,360),(96,360)]
    pivot.rotation_euler = (0,0,0)
    for f, deg in keys:
        pivot.rotation_euler = (radians(deg), 0, 0)
        pivot.keyframe_insert("rotation_euler", index=0, frame=f)
    # collect fcurves across Blender versions (5.x slotted actions vs legacy)
    act = pivot.animation_data.action if pivot.animation_data else None
    fcurves = []
    if act:
        if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
            fcurves = list(act.fcurves)
        else:
            for lay in getattr(act, "layers", []):
                for st in getattr(lay, "strips", []):
                    for cb in getattr(st, "channelbags", []):
                        fcurves += list(getattr(cb, "fcurves", []))
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BACK'; kp.easing = 'EASE_OUT'        # mechanical snap
    scene.frame_set(1)
    pivot.rotation_euler = (0, 0, 0)

# =====================================================================
# SCENE / CAMERA / LIGHTS / EXPORT
# =====================================================================
def setup_scene(ground_z):
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    try: scene.render.engine = 'CYCLES'
    except Exception: scene.render.engine = 'BLENDER_EEVEE_NEXT'
    try: scene.cycles.samples = 96
    except Exception: pass
    scene.render.film_transparent = False
    try: scene.view_settings.view_transform = 'AgX'
    except Exception: scene.view_settings.view_transform = 'Filmic'
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.02, 0.02, 0.025, 1); bg.inputs[1].default_value = 0.35

    # ground plane (dark) so coins/weapon have a surface
    bpy.ops.mesh.primitive_plane_add(size=1.2, location=(0.03, 0.02, ground_z-0.0005))
    plane = bpy.context.active_object; plane.name = "Ground"
    pm = _new_mat("MAT_Ground"); pb = _bsdf(pm)
    _set(pb, "Base Color", hex_rgba("#15130f")); _set(pb, "Roughness", 0.6)
    assign(plane, pm)

    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.18, 0.42, 0.13)
    look = Vector((0.0, 0.0, -0.03)) - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = 55
    scene.camera = cam

    def light(name, energy, loc, size=0.4):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size
        lo = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(lo)
        lo.location = loc
        d = Vector((0,0,-0.02)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
        return lo
    light("Key", 80, (0.20, 0.35, 0.45), size=0.5)
    light("Fill", 25, (-0.35, 0.25, 0.20), size=0.6)
    light("Rim", 60, (-0.10, -0.40, 0.40), size=0.4)

    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100

def export_all():
    bpy.ops.object.select_all(action='DESELECT')
    try:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND); print("Saved .blend ->", BLEND)
    except Exception as e: print("blend save failed:", e)
    try:
        bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB',
                                  use_selection=False, export_apply=True, export_yup=True)
        print("Exported .glb ->", GLB)
    except Exception as e: print("glb export failed:", e)

# =====================================================================
# MAIN
# =====================================================================
def main():
    clean_scene()
    FINISH = globals().get("FINISH", "gold")     # "gold" (owner spec) | "photo" (steel+gold+ivory like ref)
    M_GOLD = mat_gold(); M_COP = mat_copper(); M_COPE = mat_copper_eng()
    M_IV = mat_ivory(); M_FL = mat_flint(); M_BORE = mat_bore()
    if FINISH == "photo":
        M_BARREL = mat_steel(); M_LOCK = mat_steel_dark()   # ref look: steel barrels + dark lock
    else:
        M_BARREL = mat_barrel(); M_LOCK = M_GOLD            # all gold (owner spec)

    root = bpy.data.objects.new("ROOT_Pistol", None); root.empty_display_size=0.05
    bpy.context.collection.objects.link(root)

    built = []
    # --- barrel cluster (own pivot empty on the bore axis) ---
    cluster, bores = build_barrel_cluster()
    assign(cluster, M_BARREL); assign(bores, M_BORE)
    pivot = bpy.data.objects.new("BARREL_PIVOT", None); pivot.empty_display_size=0.02
    bpy.context.collection.objects.link(pivot)
    pivot.location = (0,0,0)        # bore axis = origin (X axis)
    pivot.parent = root
    parent_to(cluster, pivot); parent_to(bores, pivot)
    built += [cluster, bores]

    recv = build_breech_receiver(); assign(recv, M_GOLD); built.append(recv)
    lock, cock, flint, frizzen, spring = build_lock()
    for o in (lock, cock, frizzen, spring): assign(o, M_LOCK)
    assign(flint, M_FL)
    built += [lock, cock, flint, frizzen, spring]

    grip = build_grip(); assign(grip, M_IV); built.append(grip)
    gscroll = build_grip_scroll(); assign(gscroll, M_GOLD); built.append(gscroll)
    bstrap = build_backstrap(); assign(bstrap, M_GOLD); built.append(bstrap)
    butt, pommel_bottom = build_buttcap(); assign(butt, M_GOLD); built.append(butt)
    guard = build_triggerguard(); assign(guard, M_GOLD); built.append(guard)
    trig = build_trigger(); assign(trig, M_LOCK); built.append(trig)

    ground_z = pommel_bottom - 0.001
    coins_b, coins_g = build_coins(ground_z)
    assign(coins_b, M_COP); assign(coins_g, M_COPE)

    for o in built:
        if o and o.name in bpy.data.objects and o.parent is None:
            parent_to(o, root)

    build_revolve_animation(pivot)
    setup_scene(ground_z)
    export_all()
    print("DONE — pistol built. Parts:", len(built)+2)

main()
print("SCRIPT COMPLETE")

# -*- coding: utf-8 -*-
"""
Ornate "Money Gun" GRIP  —  v2 (manufacturing-grade hero asset)  —  Blender 4.x
================================================================================
Generates ONLY the ornate pistol grip + decorative triangular head
(Eye of Providence + COPPER $ medallion + baroque acanthus scrollwork +
flared butt cap). NO functional firearm parts (see STRICT EXCLUSIONS).

v2 = "výrobní" verze. All proportions are MEASURED ratios from the reference
imagery, expressed as multiples of two anchors (§1):
    Wh = head base width   = 86 mm
    Lg = grip functional   = 130 mm
Control equation that MUST hold simultaneously (§2D):
    grip_thickness_X = 0.46*Wh = 0.30*Lg  ->  ~40 mm

Corrections applied vs v1 (§0):
  1. Head is NOT smaller than the grip (true ratio HEAD_H = 0.96*Wh).
  2. Side "$" is wrapped in a vertical, top-open LAUREL WREATH (not a sprig).
  3. Central panel = real FIGURED WOOD (growth rings) — NO diamond checkering.
  4. Butt cap = 2 rounded bands + 1 thin top ring (not 3 full rings).
  5. Medallion is COPPER / rose-gold, visually distinct from yellow gold.

Hardest baroque elements (SCROLL_Cluster, eye lids) are a parametric base
with explicit `# TODO sculpt` hooks (§11). Output = high-poly base for
retopo/bake and a design-intent master for manufacturing review (§12).

Run:  Blender 4.x -> Scripting -> open -> Run Script
      or:  blender --background --python ornate_money_grip_v2.py

Output:  C:\\Modely\\ornate_money_grip_v2.blend  +  .glb  (+ .fbx if available)
"""

import bpy
import bmesh
from math import sin, cos, pi, radians, tan
from mathutils import Vector

# =====================================================================
# 1. CONSTANTS  —  two anchors + measured ratios (§1/§2). Units: meters.
#    Z = up, +Y = decorated FRONT, -Y = back, +-X = sides (sym axis = X).
# =====================================================================

# --- the two anchors (§1) --------------------------------------------
WH = 0.086          # head base width            (frontal snímek, +-3 %)
LG = 0.130          # grip functional length     (boční profil,  +-5 %)

# --- HEAD ratios -> Wh  (§2A) ----------------------------------------
HEAD_BASE_W   = WH                 # 1.00
HEAD_H        = 0.96  * WH         # apex -> base           = 82.6 mm
HEAD_PLATE_X  = 0.37  * WH         # plate thickness (X)    = 31.8 mm
APEX_HALF     = radians(27)        # half of ~54 deg apex angle
BAND_W        = 0.07  * WH         # outer gold frame band  =  6.0 mm
BEAD_D        = 0.012 * WH         # beaded dot diameter    =  1.0 mm
BEAD_SP       = 0.030 * WH         # beaded dot spacing     =  2.6 mm

EYE_L         = 0.30  * WH         # almond length          = 25.8 mm
EYE_H         = 0.15  * WH         # almond height          = 12.9 mm
PUPIL_D       = 0.03  * WH         # pupil diameter         =  2.6 mm
EYE_P         = 0.50               # vertical pos apex->base (mid)

SLOT_P0       = 0.78               # recessed slot band (apex->base)
SLOT_P1       = 0.88
MED_D         = 0.40  * WH         # copper medallion dia    = 34.4 mm
MED_P         = 0.80               # medallion centre apex->base
MED_RELIEF    = 0.06  * WH         # medallion relief        =  5.2 mm
MED_DOLLAR_D  = 0.30  * WH         # copper $ field dia      = 25.8 mm

# --- GRIP ratios -> Lg  (§2B) ----------------------------------------
HC            = LG                 # grip column height
GRIP_X_TOP    = 0.30  * LG         # thickness X, top        = 39 mm
GRIP_X_BOT    = 0.34  * LG         # thickness X, bottom     = 44 mm
GRIP_Y_MAX    = 0.46  * LG         # max depth (front-back)  = 60 mm
GRIP_Y_TOP    = 0.40  * LG         # depth near top

SIDE_DOLLAR_H = 0.28  * LG         # side gold $ height      = 36 mm
SIDE_DOLLAR_P = 0.55               # $ centre, down the grip
SIDE_LAUREL_H = 0.50  * LG         # vertical wreath height  = 65 mm

BUTT_H        = 0.12  * LG         # butt cap height         = 16 mm
BUTT_DEPTH    = 0.50  * LG         # butt flare depth        = 65 mm
BUTT_FRONT_W  = 0.57  * WH         # butt width (frontal)    = 49 mm

SCROLL_V      = 0.70  * LG         # scroll cluster bound V  = 91 mm
SCROLL_W      = 0.60  * LG         # scroll cluster bound W  = 78 mm
SCROLL_BOSS_D = 0.10  * LG         # central rosette boss    = 13 mm

# --- ornament / trim --------------------------------------------------
TRIM_H        = 0.0010             # gold trim ring height
VINE_R        = 0.0005             # filigree vine tube radius
NECK_OVERLAP  = 0.012              # head <-> grip neck overlap

# --- derived Z anchors ------------------------------------------------
GRIP_Z0 = BUTT_H                   # bottom of grip column (top of butt)
GRIP_Z1 = BUTT_H + HC              # top of grip column
HEAD_Z0 = GRIP_Z1 - NECK_OVERLAP   # head base
HEAD_Z1 = HEAD_Z0 + HEAD_H         # head apex
TOTAL_H = HEAD_Z1

# --- tessellation -----------------------------------------------------
GRIP_RINGS = 30
GRIP_SEG   = 30

# --- export paths -----------------------------------------------------
OUT_DIR = r"C:\Modely"
BLEND   = OUT_DIR + r"\ornate_money_grip_v2.blend"
GLB     = OUT_DIR + r"\ornate_money_grip_v2.glb"
FBX     = OUT_DIR + r"\ornate_money_grip_v2.fbx"


def head_z(p):
    """Vertical world Z of a head feature at fraction p (0=apex, 1=base)."""
    return HEAD_Z1 - p * HEAD_H


# =====================================================================
# QC: assert the control equation (§2D) holds before we build anything.
# =====================================================================
def _qc_control_equation():
    a = 0.46 * WH          # 0.03956
    b = 0.30 * LG          # 0.039
    assert abs(a - b) < 0.0015, "control eq broken: 0.46*Wh != 0.30*Lg"
    assert abs(GRIP_X_TOP - b) < 1e-9
    print("[QC] grip_X = 0.46*Wh=%.4f ~ 0.30*Lg=%.4f m  OK" % (a, b))
    print("[QC] HEAD_H = 0.96*Wh = %.4f m ; apex full angle = %.0f deg"
          % (HEAD_H, 2 * 27))


# =====================================================================
# 2. LOW-LEVEL HELPERS
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
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def _active(name=None):
    ob = bpy.context.active_object
    if name:
        ob.name = name
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
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = name
    return res


# --- modifier stack helpers (§6: Mirror -> Bevel -> Subsurf -> Solidify)
def add_mirror(ob, x=True, y=False, z=False):
    m = ob.modifiers.new("Mirror", 'MIRROR')
    m.use_axis = (x, y, z)
    m.use_clip = True
    m.merge_threshold = 0.0005
    return m

def add_bevel(ob, width=0.0006, segments=2, angle_deg=30):
    m = ob.modifiers.new("Bevel", 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = radians(angle_deg)
    m.harden_normals = True
    return m

def add_subsurf(ob, vp=2, rnd=3):
    m = ob.modifiers.new("Subdivision", 'SUBSURF')
    m.levels = vp
    m.render_levels = rnd
    return m

def add_solidify(ob, th=0.0015, offset=0.0):
    m = ob.modifiers.new("Solidify", 'SOLIDIFY')
    m.thickness = th
    m.offset = offset
    return m


# =====================================================================
# 3. MATERIALS  (§8 — Principled BSDF, Blender 4.x naming)
# =====================================================================
def _set(bsdf, name, val):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = val

def _new_mat(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat

def _bsdf(mat):
    return mat.node_tree.nodes.get("Principled BSDF")

def _micro_bump(mat, bsdf, scale=450.0, depth=0.15):
    """Subtle micro-surface bump so metals don't read as plastic (§9)."""
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = depth
    bump.inputs["Distance"].default_value = 0.00002
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return tex, bump

def _rough_breakup(mat, bsdf, base=0.30, amp=0.10, scale=70.0):
    """Roughness variation = aged reflectivity (§9)."""
    nt = mat.node_tree
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = max(0.0, base - amp)
    mr.inputs["To Max"].default_value = min(1.0, base + amp)
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], bsdf.inputs["Roughness"])


def mat_gold():
    mat = _new_mat("MAT_Gold")
    b = _bsdf(mat)
    _set(b, "Base Color", hex_rgba("#C9962E"))
    _set(b, "Metallic", 1.0)
    _set(b, "Roughness", 0.30)
    _rough_breakup(mat, b, base=0.30, amp=0.10, scale=70)
    _micro_bump(mat, b, scale=450, depth=0.15)
    return mat

def mat_copper():
    """JEN medaile — rose-gold, deliberately distinct from yellow gold (§8.2)."""
    mat = _new_mat("MAT_Copper")
    b = _bsdf(mat)
    _set(b, "Base Color", hex_rgba("#B06A3A"))
    _set(b, "Metallic", 1.0)
    _set(b, "Roughness", 0.34)
    _micro_bump(mat, b, scale=450, depth=0.15)
    return mat

def mat_ivory():
    mat = _new_mat("MAT_Ivory")
    b = _bsdf(mat)
    nt = mat.node_tree
    _set(b, "Base Color", hex_rgba("#E8DCC0"))
    _set(b, "Roughness", 0.30)
    _set(b, "Subsurface Weight", 0.08)
    _set(b, "Subsurface Radius", (0.003, 0.002, 0.001))
    if "Subsurface Scale" in b.inputs:
        b.inputs["Subsurface Scale"].default_value = 0.003
    if "Subsurface Color" in b.inputs:
        _set(b, "Subsurface Color", hex_rgba("#D8C49A"))
    _set(b, "Coat Weight", 0.4)
    _set(b, "Coat Roughness", 0.10)
    # craquelure: Voronoi (Distance to Edge) -> dark cracks into base + bump
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs["Scale"].default_value = 35.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].position = 0.04
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = 'MIX'
    mix.inputs["Color1"].default_value = hex_rgba("#6B5B3A")  # crack color
    mix.inputs["Color2"].default_value = hex_rgba("#E8DCC0")  # ivory
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.00005
    nt.links.new(ramp.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return mat

def mat_wood():
    """Dark FIGURED wood with real growth rings (Wave+Noise).
    v2 FIX: NO diamond checkering (was a v1 error, §0.3)."""
    mat = _new_mat("MAT_Wood")
    b = _bsdf(mat)
    nt = mat.node_tree
    _set(b, "Base Color", hex_rgba("#2A1608"))
    _set(b, "Roughness", 0.22)
    _set(b, "Coat Weight", 0.7)
    _set(b, "Coat Roughness", 0.06)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    # concentric growth rings via Wave (rings band type) distorted by Noise
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.0
    nz.inputs["Detail"].default_value = 4.0
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = 'RINGS'
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 2.0
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = hex_rgba("#160B04")
    cr.color_ramp.elements[1].color = hex_rgba("#2A1608")
    nt.links.new(wave.outputs["Fac"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    # gentle bump from the grain only (no engine-turn pattern)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.00006
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return mat

def mat_recess():
    mat = _new_mat("MAT_Recess")
    b = _bsdf(mat)
    _set(b, "Base Color", hex_rgba("#1A140C"))
    _set(b, "Metallic", 0.0)
    _set(b, "Roughness", 0.55)
    return mat

def mat_pupil():
    mat = _new_mat("MAT_Pupil")
    b = _bsdf(mat)
    _set(b, "Base Color", hex_rgba("#0A0A0A"))
    _set(b, "Roughness", 0.08)
    return mat

def mat_iris():
    mat = _new_mat("MAT_Iris")
    b = _bsdf(mat)
    _set(b, "Base Color", hex_rgba("#3A2410"))
    _set(b, "Roughness", 0.20)
    return mat


def assign(ob, mat):
    if ob is None:
        return ob
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# =====================================================================
# 4. GRIP SILHOUETTE  (§3 — plow-handle profile in Y-Z)
# =====================================================================
def grip_profile(t):
    """t in [0,1] top->bottom. Returns (z, y_center, half_x, half_y).
    Back edge (-Y) convex, max bulge ~0.75 down; front edge (+Y) concave
    'belly' that flares toward the top frame ~0.15; bottom flares to butt."""
    z = GRIP_Z1 + (GRIP_Z0 - GRIP_Z1) * t
    half_x = 0.5 * (GRIP_X_TOP + (GRIP_X_BOT - GRIP_X_TOP) * t)
    # depth bulges through the mid/lower grip toward GRIP_Y_MAX
    half_y = 0.5 * (GRIP_Y_TOP + (GRIP_Y_MAX - GRIP_Y_TOP) * sin(pi * t * 0.85))
    # plow-handle backward sweep + front belly
    y_center = -0.024 * t + 0.006 * sin(pi * t)
    if t < 0.18:                       # front flare toward the top/trigger area
        y_center += 0.004 * (0.18 - t) / 0.18
    if t > 0.85:                       # flare the very bottom into the butt
        f = (t - 0.85) / 0.15
        half_x += 0.004 * f
        half_y += 0.004 * f
    return z, y_center, half_x, half_y


def grip_surface(t, side_x):
    """Approx outer point on the +X (side_x=+1) side at param t, used to
    place side inlays/ornaments hugging the curved grip surface."""
    z, yc, hx, hy = grip_profile(t)
    return Vector((side_x * hx, yc, z))


def build_grip_body():
    bm = bmesh.new()
    rings = []
    for i in range(GRIP_RINGS + 1):
        t = i / GRIP_RINGS
        z, yc, hx, hy = grip_profile(t)
        ring = []
        for j in range(GRIP_SEG):
            a = 2 * pi * j / GRIP_SEG
            x = hx * cos(a)
            y = yc + hy * sin(a)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(GRIP_RINGS):
        for j in range(GRIP_SEG):
            j2 = (j + 1) % GRIP_SEG
            bm.faces.new((rings[i][j], rings[i][j2],
                          rings[i + 1][j2], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))     # top cap
    bm.faces.new(rings[-1])                     # bottom cap
    ob = obj_from_bmesh("GRIP_Body_Wood", bm)
    add_bevel(ob, width=0.0008)
    add_subsurf(ob, vp=2, rnd=3)
    return ob


# =====================================================================
# 5. SHARED ORNAMENT PRIMITIVES
# =====================================================================
def build_leaf(name, length=0.006, width=0.003, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A single low-poly almond leaf, base for laurel/acanthus arrays."""
    bm = bmesh.new()
    n = 6
    top, bot = [], []
    for i in range(n + 1):
        f = i / n
        x = length * f
        w = width * sin(pi * f) * 0.5
        zb = 0.0008 * sin(pi * f)
        top.append(bm.verts.new((x,  w, zb)))
        bot.append(bm.verts.new((x, -w, zb)))
    for i in range(n):
        bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
    ob = obj_from_bmesh(name, bm)
    ob.location = loc
    ob.rotation_euler = rot
    add_solidify(ob, th=0.0006)
    return ob


def build_dollar(name, size, extrude, loc, rot=(0, 0, 0)):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = "$"
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = 0.0004
    cu.bevel_resolution = 2
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.view_layer.update()
    return to_mesh(ob)


def build_scroll_volute(name, scale=0.02, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Single C/S volute: beveled bezier spiral with taper. Reusable base."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0028 * (scale / 0.02)
    cu.bevel_resolution = 3
    cu.resolution_u = 10
    sp = cu.splines.new('BEZIER')
    turns, n = 1.4, 10
    sp.bezier_points.add(n - 1)
    for i in range(n):
        f = i / (n - 1)
        ang = turns * 2 * pi * f
        rad = scale * (1.0 - 0.75 * f)
        sp.bezier_points[i].co = (rad * cos(ang), rad * sin(ang), 0)
        sp.bezier_points[i].handle_left_type = 'AUTO'
        sp.bezier_points[i].handle_right_type = 'AUTO'
    # taper toward the inner curl
    tcu = bpy.data.curves.new(name + "_taper", 'CURVE')
    tsp = tcu.splines.new('BEZIER')
    tsp.bezier_points.add(1)
    tsp.bezier_points[0].co = (-1, 1, 0)
    tsp.bezier_points[1].co = (1, 0.15, 0)
    for bp in tsp.bezier_points:
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    tob = bpy.data.objects.new(name + "_taper", tcu)
    bpy.context.collection.objects.link(tob)
    cu.bevel_object = tob
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    ob = to_mesh(ob)
    if tob.name in bpy.data.objects:
        bpy.data.objects.remove(tob, do_unlink=True)
    return ob


# =====================================================================
# 6. GRIP DECORATION  (§5 B-F, §2C)
# =====================================================================
def build_ivory_side():
    """Side ivory panel hugging the grip curve (+X), mirrored to -X."""
    t_lo, t_hi = 0.18, 0.92
    bm = bmesh.new()
    cols, rows = 10, 7
    grid = []
    for r in range(rows + 1):
        tt = t_lo + (t_hi - t_lo) * (r / rows)
        z, yc, hx, hy = grip_profile(tt)
        line = []
        for c in range(cols + 1):
            a = radians(-55 + 110 * (c / cols))     # wrap around the side arc
            x = (hx + 0.0015) * cos(a)
            y = yc + (hy + 0.0015) * sin(a)
            line.append(bm.verts.new((x, y, z)))
        grid.append(line)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1],
                          grid[r + 1][c + 1], grid[r + 1][c]))
    ob = obj_from_bmesh("GRIP_Inlay_Ivory_Side", bm)
    add_solidify(ob, th=0.0025, offset=1.0)
    add_bevel(ob, width=0.0005)
    add_mirror(ob, x=True)
    return ob


def build_ivory_front():
    """Tall ivory center panel on the +Y face."""
    t_lo, t_hi = 0.12, 0.95
    bm = bmesh.new()
    rows = 9
    grid = []
    for r in range(rows + 1):
        tt = t_lo + (t_hi - t_lo) * (r / rows)
        z, yc, hx, hy = grip_profile(tt)
        w = 0.010
        front_y = yc + hy
        grid.append([bm.verts.new((-w, front_y, z)),
                     bm.verts.new((0.0, front_y + 0.0015, z)),
                     bm.verts.new((w, front_y, z))])
    for r in range(rows):
        for c in range(2):
            bm.faces.new((grid[r][c], grid[r][c + 1],
                          grid[r + 1][c + 1], grid[r + 1][c]))
    ob = obj_from_bmesh("GRIP_Inlay_Ivory_Front", bm)
    add_solidify(ob, th=0.0025, offset=1.0)
    add_bevel(ob, width=0.0005)
    return ob


def build_wood_center_panel():
    """Central figured-wood panel band running down the side (carries the
    side $). Real growth-ring grain comes from MAT_Wood — NO checkering."""
    t_lo, t_hi = 0.30, 0.85
    bm = bmesh.new()
    cols, rows = 6, 7
    grid = []
    for r in range(rows + 1):
        tt = t_lo + (t_hi - t_lo) * (r / rows)
        z, yc, hx, hy = grip_profile(tt)
        line = []
        for c in range(cols + 1):
            a = radians(-26 + 52 * (c / cols))      # narrow central band
            x = (hx + 0.0008) * cos(a)
            y = yc + (hy + 0.0008) * sin(a)
            line.append(bm.verts.new((x, y, z)))
        grid.append(line)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1],
                          grid[r + 1][c + 1], grid[r + 1][c]))
    ob = obj_from_bmesh("GRIP_WoodPanel_Center", bm)
    add_solidify(ob, th=0.0015, offset=1.0)
    add_mirror(ob, x=True)
    return ob


def build_trim_gold():
    """Thin raised gold border peeking around the side inlay + lower
    corner C-volutes (§2C)."""
    parts = []
    for t_edge, label in ((0.16, "top"), (0.94, "bot")):
        z, yc, hx, hy = grip_profile(t_edge)
        ring = add_torus(f"trim_{label}", major=hy + 0.0016, minor=TRIM_H,
                         loc=(0, yc, z), rot=(radians(90), 0, 0),
                         mseg=40, miseg=8)
        ring.scale = (hx / hy, 1.0, 1.0)
        parts.append(ring)
    for sx in (-1, 1):                                  # lower-corner C-volutes
        p = grip_surface(0.90, sx)
        sc = build_scroll_volute(f"trim_corner_{sx}", scale=0.010,
                                 loc=(p.x, p.y + 0.002, p.z),
                                 rot=(radians(90), 0, radians(20 * sx)))
        parts.append(sc)
    return join_objects("GRIP_Trim_Gold", parts)


def build_side_dollar():
    """Boční zlaté $ on the wood panel, height 0.28*Lg, centre @ 0.55 down."""
    p = grip_surface(SIDE_DOLLAR_P, 1.0)
    d = build_dollar("GRIP_DollarSign_Side_Gold", size=SIDE_DOLLAR_H,
                     extrude=0.0025,
                     loc=(p.x + 0.0010, p.y, p.z),
                     rot=(radians(90), 0, radians(90)))
    add_mirror(d, x=True)
    return d


def build_side_laurel_wreath():
    """v2: vertical OVAL laurel wreath enclosing the side $, OPEN at the top,
    converging to a volute at the bottom (§0.2 / §5 D). Two mirrored leaf
    rows on bezier-like arcs; built on +X, mirrored to -X."""
    p = grip_surface(SIDE_DOLLAR_P, 1.0)
    cx = p.x + 0.0012
    cz = p.z
    half_h = SIDE_LAUREL_H / 2.0
    arc_w = 0.011                          # how far the oval bows out in Y
    leaves = []
    n = 9
    # one side arc (front, +Y bow); the X-mirror gives the back arc symmetry,
    # but the oval's two long sides are front/back -> build both here in Y.
    for sign in (+1, -1):                  # +Y front bow and -Y back bow
        for i in range(n):
            f = i / (n - 1)
            # vertical span from bottom (volute) up to near the open top
            zz = cz - half_h * 0.85 + (1.65 * half_h) * f
            # oval bow in Y, widest at mid, pinched top & bottom; open top
            bow = arc_w * sin(pi * min(f, 0.92))
            yy = p.y + sign * bow
            # leaves tilt to follow the arc tangent, fanning outward/up
            tilt = radians((90 if sign > 0 else -90)) + radians(35 * (f - 0.5))
            lf = build_leaf(f"side_laurel_{sign}_{i}",
                            length=0.0075, width=0.0034,
                            loc=(cx, yy, zz),
                            rot=(radians(90), 0, tilt))
            leaves.append(lf)
    # bottom convergence volute
    vol = build_scroll_volute("side_laurel_volute", scale=0.008,
                              loc=(cx, p.y, cz - half_h * 0.92),
                              rot=(radians(90), 0, 0))
    leaves.append(vol)
    ob = join_objects("GRIP_LaurelWreath_Side_Gold", leaves)
    add_mirror(ob, x=True)
    return ob


def build_front_palmette():
    """Slim vertical acanthus/palmette sprig on the front ivory panel (§2C)."""
    p = grip_surface(0.30, 0.0)
    front_y = p.y + grip_profile(0.30)[3]
    leaves = []
    n = 7
    for i in range(n):
        f = i / (n - 1)
        zz = p.z - 0.010 + 0.055 * f
        spread = 0.006 * sin(pi * f) * (1 - 0.3 * f)
        for sx in (-1, 1):
            lf = build_leaf(f"palm_{i}_{sx}", length=0.009 * (1 - 0.4 * f),
                            width=0.004,
                            loc=(sx * spread, front_y + 0.0015, zz),
                            rot=(radians(90), 0, radians(90 + sx * (35 + 30 * f))))
            leaves.append(lf)
    # central stem leaf
    leaves.append(build_leaf("palm_stem", length=0.05, width=0.003,
                             loc=(0, front_y + 0.0015, p.z - 0.010),
                             rot=(0, 0, radians(90))))
    return join_objects("GRIP_Palmette_Front_Gold", leaves)


def build_strap_tab():
    """Raised rounded tab top-center of the front face with a fleuron dot."""
    z, yc, hx, hy = grip_profile(0.06)
    tab = add_cube("GRIP_StrapTab_Gold", 1.0, loc=(0, yc + hy + 0.001, z))
    tab.scale = (0.012, 0.004, 0.010)
    add_bevel(tab, width=0.0010, segments=3)
    add_subsurf(tab, vp=2)
    return tab


def build_filigree_vines():
    """Fine dotted S-vines as beveled bezier curves on the side panel.
    # TODO sculpt: replace with a denser hand-routed filigree network with
    bead tips, then Shrinkwrap onto the panel surface (offset ~0.3 mm)."""
    cu = bpy.data.curves.new("GRIP_Filigree_Vines", 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = VINE_R
    cu.bevel_resolution = 2
    cu.resolution_u = 6
    p = grip_surface(0.45, 1.0)
    for s in range(3):
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(3)
        base_z = p.z + (s - 1) * 0.012
        pts = [(p.x + 0.0015, p.y - 0.012, base_z),
               (p.x + 0.0015, p.y - 0.004, base_z + 0.006),
               (p.x + 0.0015, p.y + 0.004, base_z - 0.004),
               (p.x + 0.0015, p.y + 0.012, base_z + 0.004)]
        for bp, co in zip(sp.bezier_points, pts):
            bp.co = co
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new("GRIP_Filigree_Vines", cu)
    bpy.context.collection.objects.link(ob)
    ob = to_mesh(ob)
    add_mirror(ob, x=True)
    return ob


def build_scroll_cluster():
    """Dense acanthus cluster from the top-back edge curling up/back; bounding
    ~SCROLL_V x SCROLL_W, central rosette boss Ø = SCROLL_BOSS_D (§2B).
    # TODO sculpt: this is the hero element — sculpt acanthus leaves over this
    volute skeleton (Multires + draw/clay), keep the volutes as flow lines."""
    z, yc, hx, hy = grip_profile(0.02)
    base = Vector((0, yc - hy + 0.004, GRIP_Z1 - 0.004))
    parts = []
    for i, (sc, dy, dz, rz) in enumerate(
            [(0.026, 0.000, 0.018, 25), (0.018, -0.010, 0.030, -10),
             (0.014, 0.006, 0.044, 50)]):
        v = build_scroll_volute(f"scroll_v{i}", scale=sc,
                                loc=(base.x + 0.006, base.y - dy, base.z + dz),
                                rot=(radians(80), 0, radians(rz)))
        parts.append(v)
    boss = add_cylinder("scroll_boss", r=SCROLL_BOSS_D / 2, depth=0.004,
                        loc=(0, base.y - 0.002, base.z + 0.022),
                        rot=(radians(90), 0, 0), verts=20)
    add_bevel(boss, width=0.0008, segments=3)
    parts.append(boss)
    cluster = join_objects("SCROLL_Cluster_Gold", parts)
    add_mirror(cluster, x=True)
    add_subsurf(cluster, vp=2)
    return cluster


# =====================================================================
# 7. HEAD  (§5 G-J, §2A)  — authored facing +X, rotated to +Y in main()
# =====================================================================
def rounded_triangle(scale, round_r=0.005, n_per_corner=4):
    """(x,y) outline of an up-pointing rounded triangle, base width=scale,
    apex full angle = 2*APEX_HALF (~54 deg)."""
    w = scale
    h = (w / 2.0) / tan(APEX_HALF)          # height from the apex half-angle
    apex = Vector((0, h * 0.62))
    bl = Vector((-w / 2, h * 0.62 - h))
    br = Vector((w / 2, h * 0.62 - h))
    corners = [apex, br, bl]
    pts = []
    for i in range(3):
        c = corners[i]
        nxt = corners[(i + 1) % 3]
        prv = corners[(i - 1) % 3]
        p_in = c + (prv - c).normalized() * round_r
        p_out = c + (nxt - c).normalized() * round_r
        for k in range(n_per_corner + 1):
            f = k / n_per_corner
            a = p_in.lerp(c, f)
            b = c.lerp(p_out, f)
            pts.append(a.lerp(b, f))
    return [(p.x, p.y) for p in pts]


def build_head_plate():
    """Triangular plate + 3 nested raised frames + beaded outer rim (§5 G).
    HEAD_H = 0.96*Wh ensures the head reads as large as the grip (§0.1)."""
    parts = []
    frames = [(HEAD_BASE_W,        HEAD_PLATE_X * 0.50, 0.000),
              (HEAD_BASE_W * 0.86, HEAD_PLATE_X * 0.60, 0.003),
              (HEAD_BASE_W * 0.72, HEAD_PLATE_X * 0.70, 0.006)]
    cy = HEAD_Z0 + HEAD_H * 0.40
    for fi, (scale, depth, zoff) in enumerate(frames):
        ring = rounded_triangle(scale)
        bm = bmesh.new()
        vf, vb = [], []
        for (x, y) in ring:
            vf.append(bm.verts.new(( depth, x, cy + y)))   # front +X
            vb.append(bm.verts.new((-0.004, x, cy + y)))   # back
        nf = len(ring)
        for i in range(nf):
            i2 = (i + 1) % nf
            bm.faces.new((vb[i], vb[i2], vf[i2], vf[i]))
        bm.faces.new(list(reversed(vf)))
        bm.faces.new(vb)
        ob = obj_from_bmesh(f"head_frame_{fi}", bm)
        ob.location.x += zoff
        add_bevel(ob, width=0.0008, segments=2)
        parts.append(ob)
    plate = join_objects("HEAD_Plate_Gold", parts)
    add_subsurf(plate, vp=2)
    beads = build_bead_rim_triangle("HEAD_Plate_Beads",
                                    scale=HEAD_BASE_W * 0.94,
                                    depth=HEAD_PLATE_X * 0.50 + 0.001)
    parent_to(beads, plate)
    return plate, beads


def build_bead_rim_triangle(name, scale, depth):
    """Beaded dots (Ø=BEAD_D, spacing=BEAD_SP) along the triangle outline."""
    ring = rounded_triangle(scale)
    cy = HEAD_Z0 + HEAD_H * 0.40
    placed = [Vector(ring[0])]
    acc, prev = 0.0, Vector(ring[0])
    for p in ring[1:] + [ring[0]]:
        p = Vector(p)
        seg = (p - prev).length
        while acc + BEAD_SP < seg:
            acc += BEAD_SP
            placed.append(prev.lerp(p, acc / seg))
        acc = max(0.0, acc - seg)
        prev = p
    spheres = []
    for i, pp in enumerate(placed):
        s = add_sphere(f"{name}_{i}", r=BEAD_D / 2,
                       loc=(depth, pp.x, cy + pp.y), segs=10, rings=6)
        spheres.append(s)
    return join_objects(name, spheres)


def build_eye():
    """Eye of Providence: almond (pupil @ p=0.50), iris disk, raised pupil.
    # TODO sculpt: replace the flattened ellipsoid with two crossing eyelid
    bezier arcs for a true almond shape."""
    cy = head_z(EYE_P)
    xface = HEAD_PLATE_X * 0.70 + 0.003
    white = add_sphere("eye_white", r=1.0, loc=(xface, 0, cy), segs=24, rings=12)
    white.scale = (0.004, EYE_L / 2, EYE_H / 2)
    eye = join_objects("HEAD_EyeOfProvidence", [white])
    add_subsurf(eye, vp=2)
    iris = add_cylinder("eye_iris", r=PUPIL_D * 1.7, depth=0.003,
                        loc=(xface + 0.002, 0, cy), rot=(0, radians(90), 0),
                        verts=24)
    pupil = add_sphere("eye_pupil", r=PUPIL_D / 2, loc=(xface + 0.004, 0, cy))
    return eye, iris, pupil


def build_sun_rays():
    """Radial halo of tapered wedges filling the upper field above the eye
    (40-50 rays target; symmetric fan, relief on the +X authoring face)."""
    cy = head_z(EYE_P)
    xface = HEAD_PLATE_X * 0.70 + 0.001
    rays = []
    n = 23
    A = radians(78)                       # symmetric upward fan around +Z
    R0 = EYE_H / 2 + 0.004
    for i in range(n):
        ang = -A + 2 * A * (i / (n - 1))
        rlen = 0.016 if i % 2 == 0 else 0.010
        r_mid = R0 + rlen / 2
        cone = add_cone(f"ray_{i}", r1=0.0011, r2=0.0001, depth=rlen,
                        loc=(xface, r_mid * sin(ang), cy + r_mid * cos(ang)),
                        rot=(-ang, 0, 0), verts=6)
        rays.append(cone)
    return join_objects("HEAD_SunRays_Gold", rays)


def build_slot_recess():
    """Horizontal recessed slot @ p=0.78-0.88 with two hex bolts; partly
    overlapped by the medallion."""
    cy = head_z((SLOT_P0 + SLOT_P1) / 2)
    xface = HEAD_PLATE_X * 0.55
    slot = add_cube("HEAD_Slot_Recess", 1.0, loc=(xface, 0, cy))
    slot.scale = (0.004, 0.022, head_z(SLOT_P0) - head_z(SLOT_P1) + 0.001)
    add_bevel(slot, width=0.0004)
    bolts = []
    for sx in (-1, 1):
        hb = add_cylinder(f"hex_bolt_{sx}", r=0.0022, depth=0.004,
                          loc=(xface + 0.003, sx * 0.018, cy),
                          rot=(0, radians(90), 0), verts=6)   # hex prism
        bolts.append(hb)
    return slot, join_objects("HEAD_Slot_Bolts", bolts)


def build_medallion():
    """COPPER medallion @ p=0.80, Ø=MED_D, relief=MED_RELIEF, on X axis (§5 J).
    Raised copper $ field (Ø=MED_DOLLAR_D) + laurel wreath rim + 2 flourishes.
    Sits proud of the front frame so it overlaps the slot behind it."""
    cy = head_z(MED_P)
    xbase = HEAD_PLATE_X * 0.55 + 0.009
    disk = add_cylinder("HEAD_Medallion_Copper", r=MED_D / 2, depth=MED_RELIEF,
                        loc=(xbase + MED_RELIEF / 2, 0, cy),
                        rot=(0, radians(90), 0), verts=48)
    add_bevel(disk, width=0.0010, segments=3)
    dollar = build_dollar("HEAD_Medallion_Dollar", size=MED_DOLLAR_D * 0.85,
                          extrude=0.0020,
                          loc=(xbase + MED_RELIEF + 0.0015, 0, cy),
                          rot=(radians(90), 0, radians(90)))
    # laurel wreath around the rim
    leaves = []
    nL = 20
    rr = MED_D / 2 - 0.003
    for i in range(nL):
        ang = 2 * pi * i / nL
        lf = build_leaf(f"med_leaf_{i}", length=0.005, width=0.0024,
                        loc=(xbase + MED_RELIEF, rr * sin(ang), cy + rr * cos(ang)),
                        rot=(radians(90), 0, ang + radians(90)))
        leaves.append(lf)
    wreath = join_objects("HEAD_Medallion_Laurel", leaves)
    # 2 side flourishes above the shoulders of the medallion
    flour = []
    for sx in (-1, 1):
        fl = build_leaf(f"med_flour_{sx}", length=0.008, width=0.004,
                        loc=(xbase + MED_RELIEF, sx * (MED_D / 2 - 0.002),
                             cy + MED_D / 2 - 0.003),
                        rot=(radians(90), 0, radians(40 * sx)))
        flour.append(fl)
    flourish = join_objects("HEAD_SideFlourish_Gold", flour)
    return disk, dollar, wreath, flourish


# =====================================================================
# 8. NECK + BUTT  (§5 K)
# =====================================================================
def build_neck_collar():
    z, yc, hx, hy = grip_profile(0.0)
    col = add_torus("NECK_Collar_Gold", major=hy * 0.95, minor=0.004,
                    loc=(0, yc, GRIP_Z1 - 0.002), rot=(radians(90), 0, 0),
                    mseg=48, miseg=12)
    col.scale = (hx / hy, 1.0, 0.8)
    return col


def build_buttcap():
    """v2: 2 rounded bands + 1 thin top ring, flared to BUTT_DEPTH (§0.4).
    Total height = BUTT_H = 0.12*Lg; bottom band rounds under."""
    yc = grip_profile(1.0)[1]
    parts = []
    # widths (X) and depths (Y) flare toward the bottom band
    half_x = BUTT_FRONT_W / 2
    half_y = BUTT_DEPTH / 2
    # thin top ring
    top_r = add_torus("butt_top_ring", major=half_y * 0.86, minor=0.0016,
                      loc=(0, yc, GRIP_Z0 - 0.0016), rot=(radians(90), 0, 0),
                      mseg=48, miseg=10)
    top_r.scale = (half_x * 0.86 / (half_y * 0.86), 1.0, 1.0)
    parts.append(top_r)
    # two rounded bands (squashed tori) stacked under the ring
    band_specs = [(0.92, 0.006, BUTT_H * 0.42),   # upper band
                  (1.00, 0.0065, BUTT_H * 0.80)]   # lower (widest) band
    for i, (wf, minor, drop) in enumerate(band_specs):
        zc = GRIP_Z0 - drop
        band = add_torus(f"butt_band_{i}", major=half_y * wf, minor=minor,
                         loc=(0, yc, zc), rot=(radians(90), 0, 0),
                         mseg=48, miseg=14)
        band.scale = (half_x * wf / (half_y * wf), 1.0, 1.3)
        add_bevel(band, width=0.0012, segments=3)
        parts.append(band)
    # rounded under-cap closing the bottom
    cap = add_sphere("butt_under", r=half_x * 0.55,
                     loc=(0, yc, GRIP_Z0 - BUTT_H + 0.002))
    cap.scale = (1.0, half_y / half_x, 0.5)
    parts.append(cap)
    ob = join_objects("BUTTCAP_Rings_Gold", parts)
    add_subsurf(ob, vp=2)
    return ob


# =====================================================================
# 9. SCENE / CAMERA / LIGHTS (§10)  +  EXPORT (§13)
# =====================================================================
def setup_scene():
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    try:
        scene.render.engine = 'CYCLES'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.film_transparent = True
    try:
        scene.view_settings.view_transform = 'AgX'
    except Exception:
        scene.view_settings.view_transform = 'Filmic'
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.012, 1)
        bg.inputs[1].default_value = 0.3

    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.26, 0.50, 0.17)          # +Y/+X hero 3/4: front AND side $
    look = Vector((0, 0, TOTAL_H * 0.52)) - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = 60
    scene.camera = cam

    def light(name, kind, energy, loc, size=0.3):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        if kind == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = loc
        d = Vector((0, 0, TOTAL_H * 0.5)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return lo
    light("Key",  'AREA', 60, (0.25, 0.40, 0.42), size=0.4)   # front-top
    light("Fill", 'AREA', 18, (-0.40, 0.20, 0.20), size=0.5)  # side fill
    light("Rim",  'AREA', 45, (0.0, -0.40, 0.40), size=0.3)   # back rim for gold edges

    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1500


def export_all():
    bpy.ops.object.select_all(action='DESELECT')
    try:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
        print("Saved .blend ->", BLEND)
    except Exception as e:
        print("blend save failed:", e)
    try:
        bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB',
                                  use_selection=False, export_apply=True,
                                  export_yup=True)
        print("Exported .glb ->", GLB)
    except Exception as e:
        print("glb export failed:", e)
    try:
        bpy.ops.export_scene.fbx(filepath=FBX, use_selection=False,
                                 apply_unit_scale=True, mesh_smooth_type='FACE')
        print("Exported .fbx ->", FBX)
    except Exception as e:
        print("fbx export skipped:", e)


# =====================================================================
# 10. MAIN — assemble per §4 hierarchy
# =====================================================================
def main():
    _qc_control_equation()
    clean_scene()

    M_GOLD   = mat_gold()
    M_COPPER = mat_copper()
    M_IVORY  = mat_ivory()
    M_WOOD   = mat_wood()
    M_RECESS = mat_recess()
    M_PUPIL  = mat_pupil()
    M_IRIS   = mat_iris()

    root = bpy.data.objects.new("ROOT_OrnateGrip", None)
    root.empty_display_size = 0.05
    bpy.context.collection.objects.link(root)

    built = []

    # --- GRIP ---------------------------------------------------------
    grip = build_grip_body();              assign(grip, M_WOOD);   built.append(grip)
    iv_s = build_ivory_side();             assign(iv_s, M_IVORY);  built.append(iv_s)
    iv_f = build_ivory_front();            assign(iv_f, M_IVORY);  built.append(iv_f)
    wpan = build_wood_center_panel();      assign(wpan, M_WOOD);   built.append(wpan)
    trim = build_trim_gold();              assign(trim, M_GOLD);   built.append(trim)
    dol  = build_side_dollar();            assign(dol, M_GOLD);    built.append(dol)
    swr  = build_side_laurel_wreath();     assign(swr, M_GOLD);    built.append(swr)
    palm = build_front_palmette();         assign(palm, M_GOLD);   built.append(palm)
    tab  = build_strap_tab();              assign(tab, M_GOLD);    built.append(tab)
    vine = build_filigree_vines();         assign(vine, M_GOLD);   built.append(vine)
    scroll = build_scroll_cluster();       assign(scroll, M_GOLD); built.append(scroll)

    # --- HEAD ---------------------------------------------------------
    plate, beads = build_head_plate()
    assign(plate, M_GOLD); assign(beads, M_GOLD); built += [plate, beads]
    eye, iris, pupil = build_eye()
    assign(eye, M_IVORY); assign(iris, M_IRIS); assign(pupil, M_PUPIL)
    built += [eye, iris, pupil]
    rays = build_sun_rays();               assign(rays, M_GOLD);   built.append(rays)
    slot, bolts = build_slot_recess()
    assign(slot, M_RECESS); assign(bolts, M_GOLD); built += [slot, bolts]
    disk, mdol, wreath, flour = build_medallion()
    assign(disk, M_COPPER); assign(mdol, M_COPPER)      # COPPER, not gold (§0.5)
    assign(wreath, M_GOLD); assign(flour, M_GOLD)
    built += [disk, mdol, wreath, flour]

    head_parts = [plate, beads, eye, iris, pupil, rays, slot, bolts,
                  disk, mdol, wreath, flour]

    # --- NECK + BUTT --------------------------------------------------
    collar = build_neck_collar();          assign(collar, M_GOLD); built.append(collar)
    butt   = build_buttcap();              assign(butt, M_GOLD);   built.append(butt)

    # Head decorations are authored facing +X; rotate the HEAD group +90 deg
    # about Z so triangle/eye/rays/slot/copper medallion all face front (+Y).
    head_root = bpy.data.objects.new("HEAD_root", None)
    head_root.empty_display_size = 0.03
    bpy.context.collection.objects.link(head_root)
    head_root.parent = root
    for o in head_parts:
        if o and o.name in bpy.data.objects:
            parent_to(o, head_root)
    head_root.rotation_euler = (0, 0, radians(90))

    head_set = set(head_parts)
    for o in built:
        if o and o.name in bpy.data.objects and o not in head_set:
            parent_to(o, root)

    setup_scene()

    # apply rotation/scale (location kept so the rig stays centered on origin)
    bpy.ops.object.select_all(action='DESELECT')
    for o in built:
        if o and o.type == 'MESH':
            o.select_set(True)
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    export_all()
    print("DONE (v2) — %d objects built. TOTAL_H = %.3f m" % (len(built), TOTAL_H))


if __name__ == "__main__":
    main()

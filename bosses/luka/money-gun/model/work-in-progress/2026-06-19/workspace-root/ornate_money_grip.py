# -*- coding: utf-8 -*-
"""
Ornate "Money Gun" GRIP — hero asset generator for Blender 4.x
================================================================
Generates ONLY the ornate pistol grip + decorative triangular head
(Eye of Providence + copper $ medallion + baroque acanthus scrollwork
+ stacked gold butt cap). NO functional firearm parts.

Run:  Blender 4.x  ->  Scripting tab  ->  open this file  ->  Run Script
      or:  blender --background --python ornate_money_grip.py

Everything is parameter-driven from the CONSTANTS block. Hardest baroque
elements (SCROLL_Cluster, eye leaves) are built as a parametric base with
explicit SCULPT-HOOK comments where hand sculpting should be added (§11).

Output:  C:\\Modely\\ornate_money_grip.blend  +  .glb  (+ .fbx if available)
"""

import bpy
import bmesh
import math
from math import sin, cos, pi, radians
from mathutils import Vector, Matrix

# =====================================================================
# 1. CONSTANTS  (all proportions parametrized — §2/§3)
#    Units: meters.  Z = up, +Y = front of grip, -Y = back, ±X = sides.
# =====================================================================

# --- master proportions (§2) -----------------------------------------
HC            = 0.130        # grip column height            (1.00)
HEAD_H        = 0.092        # triangular head height        (0.71)
BUTT_H        = 0.023        # butt cap height (3 rings)      (0.18)
NECK_OVERLAP  = 0.015        # head<->grip neck overlap       (0.12)

GRIP_X_TOP    = 0.034        # grip thickness X at top
GRIP_X_BOT    = 0.046        # grip thickness X at bottom
GRIP_Y_MAX    = 0.056        # grip front-back depth (max)
HEAD_BASE_W   = 0.086        # triangle base width
HEAD_PLATE_X  = 0.032        # head plate thickness (X)

EYE_L         = 0.032        # almond eye length
EYE_H         = 0.016        # almond eye height
MED_D         = 0.034        # copper $ medallion diameter
MED_RELIEF    = 0.005        # medallion raised relief
SIDE_DOLLAR_H = 0.030        # side gold "$" height

BEAD_D        = 0.0015       # beaded dot diameter (1.2-1.8 mm)
TRIM_W        = 0.0025       # gold trim ring width
TRIM_H        = 0.0010       # gold trim ring height
VINE_R        = 0.0005       # filigree vine tube radius (0.8-1.2mm dia)

# butt cap ring diameters (top -> bottom)
BUTT_D = (0.048, 0.056, 0.052)

# --- derived Z anchors ------------------------------------------------
GRIP_Z0 = BUTT_H                       # bottom of grip column
GRIP_Z1 = BUTT_H + HC                  # top of grip column
HEAD_Z0 = GRIP_Z1 - NECK_OVERLAP       # head base
HEAD_Z1 = HEAD_Z0 + HEAD_H             # head apex
TOTAL_H = HEAD_Z1                       # ~0.23

# --- tessellation -----------------------------------------------------
GRIP_RINGS = 28
GRIP_SEG   = 28

# --- export paths -----------------------------------------------------
OUT_DIR  = r"C:\Modely"
BLEND    = OUT_DIR + r"\ornate_money_grip.blend"
GLB      = OUT_DIR + r"\ornate_money_grip.glb"
FBX      = OUT_DIR + r"\ornate_money_grip.fbx"


# =====================================================================
# 2. LOW-LEVEL HELPERS
# =====================================================================

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgba(hexstr, a=1.0):
    hexstr = hexstr.lstrip("#")
    r = int(hexstr[0:2], 16) / 255.0
    g = int(hexstr[2:4], 16) / 255.0
    b = int(hexstr[4:6], 16) / 255.0
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

def full_stack(ob, bevel=0.0006, subsurf=True, vp=2):
    add_bevel(ob, width=bevel)
    if subsurf:
        add_subsurf(ob, vp=vp)


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

def _micro_bump(mat, bsdf, scale=400.0, depth=0.18):
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

def _rough_breakup(mat, bsdf, base=0.30, amp=0.10, scale=60.0):
    """Roughness variation = aged reflectivity (§8.1)."""
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
    _set(b, "Coat Weight", 0.0)
    _rough_breakup(mat, b, base=0.30, amp=0.10, scale=70)
    _micro_bump(mat, b, scale=450, depth=0.15)
    return mat

def mat_copper():
    mat = _new_mat("MAT_Copper")          # JEN medaile — distinct rose-gold
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
    mat = _new_mat("MAT_Wood")
    b = _bsdf(mat)
    nt = mat.node_tree
    _set(b, "Base Color", hex_rgba("#2A1608"))
    _set(b, "Roughness", 0.22)
    _set(b, "Coat Weight", 0.7)
    _set(b, "Coat Roughness", 0.06)
    # grain (wave+noise) -> base color variation toward #160B04
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 6.0
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = hex_rgba("#160B04")
    cr.color_ramp.elements[1].color = hex_rgba("#2A1608")
    nt.links.new(wave.outputs["Fac"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    # diamond checkering (engine-turn) as fine bump  (§8.4)
    checA = nt.nodes.new("ShaderNodeTexChecker")
    checA.inputs["Scale"].default_value = 60.0
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Rotation"].default_value = (0, 0, radians(45))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Object"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], checA.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.00008
    nt.links.new(checA.outputs["Fac"], bump.inputs["Height"])
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
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# =====================================================================
# 4. GEOMETRY BUILDERS  (§5 — per part)
# =====================================================================

# ---- profile functions for the plow-handle silhouette (§3) ----------
def grip_profile(t):
    """t in [0,1] top->bottom. Returns (z, y_center, half_x, half_y)."""
    z = GRIP_Z1 + (GRIP_Z0 - GRIP_Z1) * t
    half_x = 0.5 * (GRIP_X_TOP + (GRIP_X_BOT - GRIP_X_TOP) * t)
    # depth bulges mid-grip then eases (§2 "depth max, klesa")
    half_y = 0.5 * (0.040 + (GRIP_Y_MAX - 0.040) * sin(pi * t * 0.85))
    # plow-handle backward sweep: convex back, concave front belly
    y_center = -0.022 * t + 0.006 * sin(pi * t)
    # flare the very bottom into the butt
    if t > 0.85:
        f = (t - 0.85) / 0.15
        half_x += 0.004 * f
        half_y += 0.003 * f
    return z, y_center, half_x, half_y


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


def grip_surface_y(t, side_x):
    """Helper: approx outer point on the +X side at param t, used to
    place side inlays/ornaments hugging the curved grip surface."""
    z, yc, hx, hy = grip_profile(t)
    return Vector((side_x * hx, yc, z))


# ---- B) Ivory inlays -------------------------------------------------
def build_ivory_side():
    # side panel hugging the grip curve (+X), mirrored to -X via modifier
    t_lo, t_hi = 0.18, 0.92
    bm = bmesh.new()
    cols = 10
    rows = 6
    grid = []
    for r in range(rows + 1):
        ttop = t_lo + (t_hi - t_lo) * (r / rows)
        z, yc, hx, hy = grip_profile(ttop)
        line = []
        for c in range(cols + 1):
            frac = c / cols
            a = radians(-55 + 110 * frac)          # wrap around side arc
            x = (hx + 0.0015) * cos(a)
            y = yc + (hy + 0.0015) * sin(a)
            line.append(bm.verts.new((x, y, z)))
        grid.append(line)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1],
                          grid[r + 1][c + 1], grid[r + 1][c]))
    ob = obj_from_bmesh("GRIP_Inlay_Ivory_Side", bm)
    add_solidify(ob, th=0.0025, offset=1.0)     # slight raised thickness
    add_bevel(ob, width=0.0005)
    add_mirror(ob, x=True)
    return ob


def build_ivory_front():
    # tall front panel centered on +Y face
    t_lo, t_hi = 0.12, 0.95
    bm = bmesh.new()
    rows = 8
    grid = []
    for r in range(rows + 1):
        tt = t_lo + (t_hi - t_lo) * (r / rows)
        z, yc, hx, hy = grip_profile(tt)
        w = 0.010                                  # half width of front panel
        front_y = yc + hy
        line = [bm.verts.new((-w, front_y, z)),
                bm.verts.new((0.0, front_y + 0.0015, z)),
                bm.verts.new((w, front_y, z))]
        grid.append(line)
    for r in range(rows):
        for c in range(2):
            bm.faces.new((grid[r][c], grid[r][c + 1],
                          grid[r + 1][c + 1], grid[r + 1][c]))
    ob = obj_from_bmesh("GRIP_Inlay_Ivory_Front", bm)
    add_solidify(ob, th=0.0025, offset=1.0)
    add_bevel(ob, width=0.0005)
    return ob


# ---- C) Gold trim around inlays -------------------------------------
def build_trim_gold():
    # thin raised border that peeks around the side inlay (one merged obj)
    parts = []
    t_lo, t_hi = 0.16, 0.94
    for t_edge, label in ((t_lo, "top"), (t_hi, "bot")):
        z, yc, hx, hy = grip_profile(t_edge)
        ring = add_torus(f"trim_{label}", major=hy + 0.0016, minor=TRIM_H,
                         loc=(0, yc, z), rot=(radians(90), 0, 0),
                         mseg=40, miseg=8)
        ring.scale = (hx / hy, 1.0, 1.0)
        parts.append(ring)
    # corner scroll volutes (lower corners) — small beveled spirals
    for sx in (-1, 1):
        p = grip_surface_y(0.90, sx)
        sc = build_scroll_volute(f"trim_corner_{sx}", scale=0.010,
                                 loc=(p.x, p.y + 0.002, p.z),
                                 rot=(radians(90), 0, radians(20 * sx)))
        parts.append(sc)
    ob = join_objects("GRIP_Trim_Gold", parts)
    return ob


# ---- D) Side gold "$" + laurel --------------------------------------
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


def build_side_dollar():
    parts = []
    p = grip_surface_y(0.68, 1.0)                  # lower half of grip, +X side
    d = build_dollar("GRIP_DollarSign_Gold", size=SIDE_DOLLAR_H,
                     extrude=0.0025,
                     loc=(p.x + 0.001, p.y, p.z),
                     rot=(radians(90), 0, radians(90)))
    add_mirror(d, x=True)
    return d


def build_leaf(name, length=0.006, width=0.003, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A single low-poly almond leaf, base for laurel/acanthus arrays."""
    bm = bmesh.new()
    n = 6
    top = []
    bot = []
    for i in range(n + 1):
        f = i / n
        x = length * f
        w = width * sin(pi * f) * 0.5
        top.append(bm.verts.new((x,  w, 0.0008 * sin(pi * f))))
        bot.append(bm.verts.new((x, -w, 0.0008 * sin(pi * f))))
    spine0 = bm.verts.new((0, 0, 0))
    for i in range(n):
        bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
    ob = obj_from_bmesh(name, bm)
    ob.location = loc
    ob.rotation_euler = rot
    add_solidify(ob, th=0.0006)
    return ob


def build_laurel_spray(name, center, arc_r=0.012, n=7, scale=1.0, mirror=True):
    """Two mirrored rows of small leaves on an arc, converging to a volute."""
    leaves = []
    for i in range(n):
        f = i / (n - 1)
        ang = radians(-70 + 50 * f)
        lx = center[0]
        ly = center[1] + arc_r * sin(ang) * scale
        lz = center[2] - arc_r * (1 - cos(ang)) * scale
        lf = build_leaf(f"{name}_L{i}", length=0.007 * scale, width=0.0035 * scale,
                        loc=(lx, ly, lz),
                        rot=(radians(90), 0, ang + radians(90)))
        leaves.append(lf)
    ob = join_objects(name, leaves)
    if mirror:
        add_mirror(ob, x=True)
    return ob


# ---- E) Front palmette + strap tab ----------------------------------
def build_front_palmette():
    p = grip_surface_y(0.30, 0.0)
    front_y = p.y + grip_profile(0.30)[3]
    palm = build_laurel_spray("GRIP_LaurelSpray_Gold",
                              center=(0.0, front_y + 0.0015, p.z),
                              arc_r=0.014, n=6, scale=1.1, mirror=True)
    return palm

def build_strap_tab():
    z, yc, hx, hy = grip_profile(0.06)
    tab = add_cube("GRIP_StrapTab_Gold", 1.0,
                   loc=(0, yc + hy + 0.001, z))
    tab.scale = (0.012, 0.004, 0.010)
    add_bevel(tab, width=0.0010, segments=3)
    add_subsurf(tab, vp=2)
    return tab


# ---- F) Filigree vines (raised geometry, §7) ------------------------
def build_filigree_vines():
    """Fine dotted S-vines as beveled bezier curves on the side panel.
    SCULPT-HOOK: replace with denser hand-routed filigree network + bead
    tips, then Shrinkwrap onto the panel surface (offset ~0.3 mm)."""
    cu = bpy.data.curves.new("GRIP_Filigree_Vines", 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = VINE_R
    cu.bevel_resolution = 2
    cu.resolution_u = 6
    p = grip_surface_y(0.45, 1.0)
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


# ---- G) Baroque scroll cluster (hardest, §11) -----------------------
def build_scroll_volute(name, scale=0.02, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Single C/S volute: beveled bezier spiral with taper. Reusable base."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0028 * (scale / 0.02)   # chunkier acanthus base
    cu.bevel_resolution = 3
    cu.resolution_u = 10
    sp = cu.splines.new('BEZIER')
    turns = 1.4
    n = 10
    sp.bezier_points.add(n - 1)
    for i in range(n):
        f = i / (n - 1)
        ang = turns * 2 * pi * f
        rad = scale * (1.0 - 0.75 * f)
        x = rad * cos(ang)
        y = rad * sin(ang)
        sp.bezier_points[i].co = (x, y, 0)
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


def build_scroll_cluster():
    """Dense acanthus cluster rising from the top-back edge, curling up/back.
    Parametric base: mirrored beveled volutes + central rosette boss.
    SCULPT-HOOK: this is the hero element — add sculpted acanthus leaves over
    this base (Multires + draw/clay brushes), keep the volute skeleton as flow."""
    z, yc, hx, hy = grip_profile(0.02)
    back_y = yc - hy
    base = Vector((0, back_y + 0.004, GRIP_Z1 - 0.004))
    parts = []
    # primary up-curling S on +X (mirror later)
    for i, (sc, dy, dz, rz) in enumerate(
            [(0.026, 0.0, 0.018, 25), (0.018, -0.010, 0.030, -10),
             (0.014, 0.006, 0.040, 50)]):
        v = build_scroll_volute(f"scroll_v{i}", scale=sc,
                                 loc=(base.x + 0.006, base.y - dy, base.z + dz),
                                 rot=(radians(80), 0, radians(rz)))
        parts.append(v)
    # central rosette boss
    boss = add_cylinder("scroll_boss", r=0.006, depth=0.004,
                        loc=(0, base.y - 0.002, base.z + 0.020),
                        rot=(radians(90), 0, 0), verts=16)
    add_bevel(boss, width=0.0008, segments=3)
    parts.append(boss)
    cluster = join_objects("SCROLL_Cluster_Gold", parts)
    add_mirror(cluster, x=True)
    add_subsurf(cluster, vp=2)
    return cluster


# ---- G2) HEAD plate + nested frames (§5 G) --------------------------
def rounded_triangle(scale, z, round_r=0.006, n_per_corner=4):
    """Return list of (x,y) for an up-pointing rounded triangle at width=scale."""
    w = scale
    h = scale * (HEAD_H / HEAD_BASE_W)
    apex = Vector((0, h * 0.62))
    bl = Vector((-w / 2, -h * 0.38))
    br = Vector((w / 2, -h * 0.38))
    corners = [apex, br, bl]
    pts = []
    for i in range(3):
        c = corners[i]
        nxt = corners[(i + 1) % 3]
        prv = corners[(i - 1) % 3]
        din = (prv - c).normalized()
        dout = (nxt - c).normalized()
        p_in = c + din * round_r
        p_out = c + dout * round_r
        for k in range(n_per_corner + 1):
            f = k / n_per_corner
            # quadratic bezier round
            a = p_in.lerp(c, f)
            b = c.lerp(p_out, f)
            pts.append(a.lerp(b, f))
    return [(p.x, p.y) for p in pts]


def build_head_plate():
    """Triangular plate with 3 nested raised frames + beaded outer rim."""
    parts = []
    frames = [(HEAD_BASE_W,        HEAD_PLATE_X * 0.50, 0.000),
              (HEAD_BASE_W * 0.86, HEAD_PLATE_X * 0.60, 0.003),
              (HEAD_BASE_W * 0.72, HEAD_PLATE_X * 0.70, 0.006)]
    for fi, (scale, depth, zoff) in enumerate(frames):
        ring = rounded_triangle(scale, 0)
        bm = bmesh.new()
        cy = HEAD_Z0 + HEAD_H * 0.40
        verts_f = []
        verts_b = []
        for (x, y) in ring:
            verts_f.append(bm.verts.new(( depth, x, cy + y)))   # front +X
            verts_b.append(bm.verts.new((-0.004, x, cy + y)))   # back
        nf = len(ring)
        for i in range(nf):
            i2 = (i + 1) % nf
            bm.faces.new((verts_b[i], verts_b[i2], verts_f[i2], verts_f[i]))
        bm.faces.new(list(reversed(verts_f)))
        bm.faces.new(verts_b)
        ob = obj_from_bmesh(f"head_frame_{fi}", bm)
        ob.location.x += zoff
        add_bevel(ob, width=0.0008, segments=2)
        parts.append(ob)
    plate = join_objects("HEAD_Plate_Gold", parts)
    add_subsurf(plate, vp=2)
    # beaded rim on outer frame
    beads = build_bead_rim_triangle("HEAD_Plate_Beads",
                                    scale=HEAD_BASE_W * 0.94,
                                    depth=HEAD_PLATE_X * 0.50 + 0.001)
    parent_to(beads, plate)
    return plate, beads


def build_bead_rim_triangle(name, scale, depth):
    """Beaded dots following the triangle outline (instanced spheres)."""
    ring = rounded_triangle(scale, 0)
    cy = HEAD_Z0 + HEAD_H * 0.40
    spheres = []
    step = max(1, len(ring) // 1)
    # resample outline at constant spacing
    pts = ring
    spacing = 0.004
    acc = 0.0
    prev = Vector(pts[0])
    placed = [Vector(pts[0])]
    for p in pts[1:] + [pts[0]]:
        p = Vector(p)
        seg = (p - prev).length
        while acc + spacing < seg:
            acc += spacing
            placed.append(prev.lerp(p, acc / seg))
        acc -= seg
        if acc < 0:
            acc = 0
        prev = p
    for i, pp in enumerate(placed):
        s = add_sphere(f"{name}_{i}", r=BEAD_D, loc=(depth, pp.x, cy + pp.y),
                       segs=10, rings=6)
        spheres.append(s)
    return join_objects(name, spheres)


# ---- H) Eye of Providence + sun rays --------------------------------
def build_eye():
    cy = HEAD_Z0 + HEAD_H * 0.60
    xface = HEAD_PLATE_X * 0.70 + 0.003
    parts = []
    # almond white (flattened ellipsoid)
    white = add_sphere("eye_white", r=1.0, loc=(xface, 0, cy), segs=24, rings=12)
    white.scale = (0.004, EYE_L / 2, EYE_H / 2)
    parts.append(white)
    eye = join_objects("HEAD_EyeOfProvidence", parts)
    add_subsurf(eye, vp=2)
    # iris + pupil as separate materials/objects
    iris = add_cylinder("eye_iris", r=0.005, depth=0.003,
                        loc=(xface + 0.002, 0, cy), rot=(0, radians(90), 0),
                        verts=24)
    pupil = add_sphere("eye_pupil", r=0.0028, loc=(xface + 0.004, 0, cy))
    # SCULPT-HOOK: replace flattened ellipsoid lids with sculpted upper/lower
    # eyelid arcs (two crossing bezier surfaces) for a true almond eye.
    return eye, iris, pupil


def build_sun_rays():
    """Symmetric radial halo of tapered wedges in the upper triangle field,
    radiating from behind the eye (relief on the +X authoring face)."""
    cy = HEAD_Z0 + HEAD_H * 0.60
    xface = HEAD_PLATE_X * 0.70 + 0.001
    rays = []
    n = 11
    A = radians(80)                       # symmetric upward fan around +Z
    R0 = EYE_H / 2 + 0.004
    for i in range(n):
        ang = -A + 2 * A * (i / (n - 1))
        rlen = 0.014 if i % 2 == 0 else 0.009    # alternating long/short rays
        r_mid = R0 + rlen / 2
        ry = r_mid * sin(ang)
        rz = cy + r_mid * cos(ang)
        cone = add_cone(f"ray_{i}", r1=0.0013, r2=0.0001, depth=rlen,
                        loc=(xface, ry, rz),
                        rot=(-ang, 0, 0), verts=8)   # radial, lies in Y-Z plane
        rays.append(cone)
    ob = join_objects("HEAD_SunRays_Gold", rays)
    return ob


# ---- I) Slot recess + hex bolts -------------------------------------
def build_slot_recess():
    cy = HEAD_Z0 + HEAD_H * 0.34
    xface = HEAD_PLATE_X * 0.55
    parts_dark = []
    slot = add_cube("HEAD_Slot_Recess", 1.0, loc=(xface, 0, cy))
    slot.scale = (0.004, 0.022, 0.006)
    add_bevel(slot, width=0.0004)
    bolts = []
    for sx in (-1, 1):
        hb = add_cylinder(f"hex_bolt_{sx}", r=0.0022, depth=0.004,
                          loc=(xface + 0.003, sx * 0.018, cy),
                          rot=(0, radians(90), 0), verts=6)
        bolts.append(hb)
    bolts_ob = join_objects("HEAD_Slot_Bolts", bolts)
    return slot, bolts_ob


# ---- J) Copper medallion ($ + laurel wreath) ------------------------
def build_medallion():
    cy = HEAD_Z0 + HEAD_H * 0.30
    # sit proud of the frontmost nested frame (~0.028) so the copper coin
    # reads as the centerpiece and overlaps the dark slot behind it.
    xbase = HEAD_PLATE_X * 0.55 + 0.009
    parts_copper = []
    disk = add_cylinder("HEAD_Medallion_Copper", r=MED_D / 2, depth=MED_RELIEF,
                        loc=(xbase + MED_RELIEF / 2, 0, cy),
                        rot=(0, radians(90), 0), verts=48)
    add_bevel(disk, width=0.0010, segments=3)
    # central $
    dollar = build_dollar("HEAD_Medallion_Dollar", size=0.016, extrude=0.0020,
                          loc=(xbase + MED_RELIEF + 0.0015, 0, cy),
                          rot=(radians(90), 0, radians(90)))
    # laurel wreath around rim
    leaves = []
    nL = 18
    for i in range(nL):
        ang = 2 * pi * i / nL
        ly = (MED_D / 2 - 0.003) * sin(ang)
        lz = cy + (MED_D / 2 - 0.003) * cos(ang)
        lf = build_leaf(f"med_leaf_{i}", length=0.005, width=0.0024,
                        loc=(xbase + MED_RELIEF, ly, lz),
                        rot=(radians(90), 0, ang + radians(90)))
        leaves.append(lf)
    wreath = join_objects("HEAD_Medallion_Laurel", leaves)
    # 2 side flourishes top of medallion
    flour = []
    for sx in (-1, 1):
        fl = build_leaf(f"med_flour_{sx}", length=0.008, width=0.004,
                        loc=(xbase + MED_RELIEF, sx * (MED_D / 2 - 0.002),
                             cy + MED_D / 2 - 0.003),
                        rot=(radians(90), 0, radians(40 * sx)))
        flour.append(fl)
    flourish = join_objects("HEAD_SideFlourish_Gold", flour)
    return disk, dollar, wreath, flourish


# ---- K) Neck collar + butt cap --------------------------------------
def build_neck_collar():
    z, yc, hx, hy = grip_profile(0.0)
    col = add_torus("NECK_Collar_Gold", major=hy * 0.95, minor=0.004,
                    loc=(0, yc, GRIP_Z1 - 0.002), rot=(radians(90), 0, 0),
                    mseg=48, miseg=12)
    col.scale = (hx / hy, 1.0, 0.8)
    return col


def build_buttcap():
    parts = []
    zc = BUTT_H
    heights = [0.008, 0.009, 0.006]
    for i, (d, h) in enumerate(zip(BUTT_D, heights)):
        zc -= h
        ring = add_cylinder(f"butt_ring_{i}", r=d / 2, depth=h,
                            loc=(0, grip_profile(1.0)[1], zc + h / 2), verts=48)
        add_bevel(ring, width=0.0014, segments=3)
        parts.append(ring)
    # bottom end bead
    bead = add_sphere("butt_bead", r=BUTT_D[2] / 2 * 0.5,
                      loc=(0, grip_profile(1.0)[1], zc - 0.001))
    parts.append(bead)
    ob = join_objects("BUTTCAP_Rings_Gold", parts)
    add_subsurf(ob, vp=2)
    return ob


# =====================================================================
# 5. UTIL: join a list of objects into one
# =====================================================================
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


# =====================================================================
# 6. SCENE / CAMERA / LIGHTS  (§10)  +  EXPORT (§12)
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
    # dark world
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.012, 1)
        bg.inputs[1].default_value = 0.3

    # camera — front 3/4
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    # +Y is the decorated front (eye + medallion face this way); place the
    # hero 3/4 camera on the +Y / +X side so it sees the front AND the side $.
    cam.location = (0.26, 0.50, 0.17)
    look = Vector((0, 0, TOTAL_H * 0.52)) - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = 60
    scene.camera = cam

    # 3-point lights
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
    light("Rim",  'AREA', 45, (0.0, -0.40, 0.40), size=0.3)   # back rim

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
# 7. MAIN — assemble per §4 hierarchy
# =====================================================================
def main():
    clean_scene()

    # materials
    M_GOLD   = mat_gold()
    M_COPPER = mat_copper()
    M_IVORY  = mat_ivory()
    M_WOOD   = mat_wood()
    M_RECESS = mat_recess()
    M_PUPIL  = mat_pupil()
    M_IRIS   = mat_iris()

    # ROOT empty
    root = bpy.data.objects.new("ROOT_OrnateGrip", None)
    root.empty_display_size = 0.05
    bpy.context.collection.objects.link(root)

    built = []

    # --- GRIP ---------------------------------------------------------
    grip = build_grip_body();                 assign(grip, M_WOOD);   built.append(grip)
    iv_s = build_ivory_side();                assign(iv_s, M_IVORY);  built.append(iv_s)
    iv_f = build_ivory_front();               assign(iv_f, M_IVORY);  built.append(iv_f)
    trim = build_trim_gold();                 assign(trim, M_GOLD);   built.append(trim)
    dol  = build_side_dollar();               assign(dol, M_GOLD);    built.append(dol)
    laur = build_front_palmette();            assign(laur, M_GOLD);   built.append(laur)
    tab  = build_strap_tab();                 assign(tab, M_GOLD);    built.append(tab)
    vine = build_filigree_vines();            assign(vine, M_GOLD);   built.append(vine)

    # --- SCROLL CLUSTER ----------------------------------------------
    scroll = build_scroll_cluster();          assign(scroll, M_GOLD); built.append(scroll)

    # --- HEAD ---------------------------------------------------------
    plate, beads = build_head_plate()
    assign(plate, M_GOLD);  assign(beads, M_GOLD);  built += [plate, beads]
    eye, iris, pupil = build_eye()
    assign(eye, M_IVORY);  assign(iris, M_IRIS);  assign(pupil, M_PUPIL)
    built += [eye, iris, pupil]
    rays = build_sun_rays();                  assign(rays, M_GOLD);   built.append(rays)
    slot, bolts = build_slot_recess()
    assign(slot, M_RECESS);  assign(bolts, M_GOLD);  built += [slot, bolts]
    disk, mdol, wreath, flour = build_medallion()
    assign(disk, M_COPPER);  assign(mdol, M_COPPER)
    assign(wreath, M_GOLD);  assign(flour, M_GOLD)
    built += [disk, mdol, wreath, flour]

    head_parts = [plate, beads, eye, iris, pupil, rays, slot, bolts,
                  disk, mdol, wreath, flour]

    # --- NECK + BUTT --------------------------------------------------
    collar = build_neck_collar();             assign(collar, M_GOLD); built.append(collar)
    butt   = build_buttcap();                 assign(butt, M_GOLD);   built.append(butt)

    # The head decorations are authored facing +X; the front reference
    # (11_30_27) shows them facing +Y (same way as the grip front). Group
    # them under HEAD_root and rotate +90 deg about Z so the triangular
    # face, eye, sun-rays, slot and copper medallion all face front (+Y).
    head_root = bpy.data.objects.new("HEAD_root", None)
    head_root.empty_display_size = 0.03
    bpy.context.collection.objects.link(head_root)
    head_root.parent = root
    for o in head_parts:
        if o and o.name in bpy.data.objects:
            parent_to(o, head_root)
    head_root.rotation_euler = (0, 0, radians(90))   # +X -> +Y

    # parent the remaining (grip/scroll/neck/butt) parts straight to root
    head_set = set(head_parts)
    for o in built:
        if o and o.name in bpy.data.objects and o not in head_set:
            parent_to(o, root)

    # center on origin in X/Y, butt bottom at Z=0 (already by construction)
    setup_scene()

    # apply transforms on a duplicate-safe pass (scale=1). Keep modifiers
    # parametric on the working file; export_apply bakes them for glb.
    bpy.ops.object.select_all(action='DESELECT')
    for o in built:
        if o and o.type == 'MESH':
            o.select_set(True)
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    export_all()
    print("DONE — %d objects built." % len(built))


if __name__ == "__main__":
    main()

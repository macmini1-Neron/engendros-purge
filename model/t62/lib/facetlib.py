"""
facetlib.py — sdílené faceted-mesh helpery pro T-62 (Blender / bpy).

Volá se z parts/NN/build.py. Spouští se UVNITŘ běžícího Blenderu přes Blender-MCP
(execute_blender_code posílá zdroj jako string → Blender nepotřebuje číst z mého repa).

Konvence (CLAUDE.md §5): forward +Z, up +Y, right +X, 1 unit = 1 m.
Styl: low-poly, FLAT shading, nízké segment-county (CLAUDE.md §1 A).

⚠️ KRITICKÉ (lib/README poznámka, minulý bug): bpy `transform_apply` defaultně bere
   i location+scale → VŽDY `location=False, scale=False`, jinak se origin zapeče do
   (0,0,0) a rig pivot je v háji.
"""
import bpy
import bmesh
import math
from mathutils import Vector


# ──────────────────────────────────────────────────────────────────────────────
# scene utils
# ──────────────────────────────────────────────────────────────────────────────
def clear_scene():
    """Smaž všechny objekty (čistý start build.py — replikovatelnost)."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def _link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def _new_obj(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    return _link(obj)


def flat_shade(obj):
    """Flat shading na celý objekt (peak styl = facety, ne smooth)."""
    me = obj.data
    for p in me.polygons:
        p.use_smooth = False
    me.update()
    return obj


def set_origin(obj, location):
    """
    Nastav ORIGIN objektu na world-souřadnici `location` BEZ posunu geometrie.
    = rig pivot (osa náboje kola, čepy děla, střed prstence věže).
    Implementace: posuň 3D kurzor → origin_set k kurzoru.
    """
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    prev = tuple(bpy.context.scene.cursor.location)
    bpy.context.scene.cursor.location = Vector(location)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = Vector(prev)
    return obj


def apply_rot(obj):
    """Zapeč JEN rotaci (ne location/scale — viz ⚠️ nahoře)."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


# ──────────────────────────────────────────────────────────────────────────────
# primitiva — vždy 1 plochá face/strana, flat shaded
# ──────────────────────────────────────────────────────────────────────────────
def box(name, size, center=(0, 0, 0), mat=None):
    """Box (w,h,d) = (x,y,z). 6 plochých faces, flat."""
    sx, sy, sz = size
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def cyl(name, radius, depth, segments=16, axis='Z', center=(0, 0, 0),
        cap=True, mat=None):
    """
    Low-seg válec, flat shaded. axis = orientace osy ('X'/'Y'/'Z').
    segments nízké (12–20) kvůli faceted looku (CLAUDE.md §1: ne hladké).
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False,
        segments=segments, radius1=radius, radius2=radius, depth=depth,
    )
    # create_cone je default kolem +Z → otoč dle axis
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts,
                         matrix=_rotmat('Y', math.radians(90)))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts,
                         matrix=_rotmat('X', math.radians(90)))
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def cone(name, r1, r2, depth, segments=16, axis='Z', center=(0, 0, 0),
         cap=True, mat=None):
    """Komolý kužel (r1 spodní, r2 horní) — pro dished/tapered díly."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False,
        segments=segments, radius1=r1, radius2=r2, depth=depth,
    )
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('Y', math.radians(90)))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('X', math.radians(90)))
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def dome(name, radius, height, segments=16, rings=3, axis='Z', center=(0, 0, 0),
         mat=None):
    """
    Faceted kupole (NE UV-sphere): icosphere-ish přes nízké rings.
    Použití: hub cap kola, velitelská kopule.
    Implementace: UV-sphere s málo segmenty/rings, ořež spodní polokouli (bisect).
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings * 2,
                              radius=radius)
    # ořez: nech jen z >= 0 (horní kupole)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                           plane_co=(0, 0, 0), plane_no=(0, 0, 1),
                           clear_inner=True, clear_outer=False)
    # naškáluj výšku na height (radius je v Z momentálně = radius)
    if radius > 0:
        bmesh.ops.scale(bm, vec=(1, 1, height / radius), verts=bm.verts)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('Y', math.radians(90)))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('X', math.radians(-90)))
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def tube(name, r_out, r_in, depth, segments=20, axis='Z', center=(0, 0, 0), mat=None):
    """
    Low-seg prstenec/tube (rubber tire, ball-race). r_out vnější, r_in vnitřní poloměr.
    Postaveno z bmesh: 2 kruhy verts × 2 strany, bridge → uzavřený prstenec.
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    hz = depth * 0.5
    rings = {}
    for side, z in (("f", hz), ("b", -hz)):
        for ro, r in (("o", r_out), ("i", r_in)):
            vs = []
            for i in range(segments):
                a = (i / segments) * math.tau
                vs.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
            rings[side + ro] = vs
    bm.verts.ensure_lookup_table()

    def quad(a, b, c, d):
        bm.faces.new((a, b, c, d))
    for i in range(segments):
        j = (i + 1) % segments
        # vnější stěna
        quad(rings["fo"][i], rings["fo"][j], rings["bo"][j], rings["bo"][i])
        # vnitřní stěna
        quad(rings["bi"][i], rings["bi"][j], rings["fi"][j], rings["fi"][i])
        # přední čelo (mezikruží)
        quad(rings["fi"][i], rings["fi"][j], rings["fo"][j], rings["fo"][i])
        # zadní čelo
        quad(rings["bo"][i], rings["bo"][j], rings["bi"][j], rings["bi"][i])
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('Y', math.radians(90)))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=_rotmat('X', math.radians(90)))
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def taper_bar(name, angle, r0, r1, w0, w1, x0, thick, mat=None):
    """Radiální KLÍN/pruh v rovině YZ (osa = X), od poloměru r0 (tangenc. šířka w0) k r1 (šířka w1).
    Pro rozšiřující se žebra i pro šikmý klínový výřez (cutter). x0 = střed v X, thick = tloušťka v X."""
    ca, sa = math.cos(angle), math.sin(angle)
    uy, uz = ca, sa            # radiální směr
    ty, tz = -sa, ca           # tangenciální směr
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = []
    for xs in (x0 - thick * 0.5, x0 + thick * 0.5):
        for (r, w, s) in ((r0, w0, -1), (r0, w0, 1), (r1, w1, 1), (r1, w1, -1)):
            verts.append(bm.verts.new((xs,
                                       uy * r + ty * (w * 0.5 * s),
                                       uz * r + tz * (w * 0.5 * s))))
    bm.verts.ensure_lookup_table()
    A, B = verts[0:4], verts[4:8]            # zadní / přední čtyřúhelník
    bm.faces.new(A); bm.faces.new(list(reversed(B)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.to_mesh(me); bm.free()
    obj = _new_obj(name, me)
    flat_shade(obj)
    if mat: assign_mat(obj, mat)
    return obj


def radial(make_fn, n, radius, axis='X', phase=0.0):
    """
    Rozmísti n objektů po kruhu o poloměru `radius` v rovině kolmé na `axis`.
    make_fn(i, angle, (cy, cz)) musí vrátit objekt umístěný v daném bodě.
    Vrací list objektů. Pro paprsky/šrouby (kolo má osu X → kruh v rovině YZ).
    """
    objs = []
    for i in range(n):
        a = phase + (i / n) * math.tau
        if axis == 'X':
            pos = (math.cos(a) * radius, math.sin(a) * radius)   # (y, z)
        elif axis == 'Y':
            pos = (math.cos(a) * radius, math.sin(a) * radius)   # (x, z)
        else:
            pos = (math.cos(a) * radius, math.sin(a) * radius)   # (x, y)
        o = make_fn(i, a, pos)
        if o:
            objs.append(o)
    return objs


def _rotmat(axis, ang):
    from mathutils import Matrix
    return Matrix.Rotation(ang, 4, axis)


# ──────────────────────────────────────────────────────────────────────────────
# join / material
# ──────────────────────────────────────────────────────────────────────────────
def join(name, objs, origin=None):
    """Spoj víc meshů do jednoho objektu (JEN v rámci jednoho rig-uzlu!
    NIKDY nemerguj animované díly dohromady — CLAUDE.md §5)."""
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = name
    merged.data.name = name + "_mesh"
    if origin is not None:
        set_origin(merged, origin)
    return merged


def recalc_normals(obj):
    """Sjednoť normály ven (boolean EXACT jinak invertuje → smaže celý mesh)."""
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.update()
    return obj


def boolean_diff(target, cutter, solver='EXACT'):
    """Odečti `cutter` od `target` (reálné PROŘÍZNUTÍ skrz geometrii, ne textura).
    Cutter se po aplikaci smaže. Pro keyhole otvory v disku kola.
    NUTNÉ: sjednotit normály obou (jinak EXACT solver mesh smaže — viz v_after=0 bug)."""
    recalc_normals(target)
    recalc_normals(cutter)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    m = target.modifiers.new("bool", 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = solver
    m.object = cutter
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def solid_material(name, rgb):
    """Plochý jednobarevný materiál (no PBR, matný) — guma černá / ocel olivová.
    rgb = (r,g,b) 0..1."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.85
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.1
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def pixel_material(name, image_path):
    """
    Materiál s pixel-art diffuse atlasem, NEAREST filtering, NO PBR
    (CLAUDE.md §1 B / STYLE_PROMPT). Emission-ish flat: nízká roughness off,
    metallic 0, použij base color z textury, žádné gradienty.
    """
    img = bpy.data.images.load(image_path, check_existing=True)
    img.colorspace_settings.name = 'sRGB'
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.85   # matný, ne lesklý
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.1
    elif 'Specular' in bsdf.inputs:
        bsdf.inputs['Specular'].default_value = 0.1
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Closest'   # ← NEAREST-NEIGHBOR (pixel look)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


# ──────────────────────────────────────────────────────────────────────────────
# UV
# ──────────────────────────────────────────────────────────────────────────────
def smart_uv(obj, angle=66.0, island_margin=0.02):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle),
                             island_margin=island_margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


# ──────────────────────────────────────────────────────────────────────────────
# export (rig kontrakt — CLAUDE.md §5)
# ──────────────────────────────────────────────────────────────────────────────
def export_glb(filepath, only_selected=False):
    """
    GLB export. Zachovej názvy uzlů + pivoty + osy (Blender Z-up → glTF Y-up
    řeší exportér: +Y up, +Z forward). Textury embed do GLB.
    """
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=only_selected,
        use_active_scene=True,        # JEN aktivní scéna (ne všechny → nezatáhne WT model)
        export_yup=True,
        export_apply=False,          # NEpečeme modifikátory/transformy (drž pivoty)
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
    )
    return filepath

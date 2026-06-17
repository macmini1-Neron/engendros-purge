"""
render_blender.py — postav parts.json jako skutečné meshe v Blenderu a vyrenderuj.
Spouštět: Blender --background --python render_blender.py -- <parts.json> <out_prefix>
Renderuje: <prefix>_hero.png (3/4 perspektiva) + <prefix>_side.png (ortho bok).
Styl: jednolitý 4BO olive, flat shading, depth ze světla (cílový faceted look).
"""
import bpy, json, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--")+1:]
PARTS, PREFIX = argv[0], argv[1]
data = json.load(open(PARTS))
boxes = data["boxes"]

# 6 faces dle pořadí rohů v parseru: 0(0,0,0)1(1,0,0)2(1,1,0)3(0,1,0)4(0,0,1)5(1,0,1)6(1,1,1)7(0,1,1)
FACES = [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(0,3,7,4)]

# čistá scéna
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# slož jeden mesh ze všech boxů; map mých souřadnic (x=délka,y=nahoru,z=šířka)->Blender Z-up (x, z, y)
verts, faces = [], []
for b in boxes:
    base = len(verts)
    for v in b["verts"]:
        verts.append((v[0], v[2], v[1]))   # (x, z, y)
    for f in FACES:
        faces.append(tuple(base+i for i in f))

mesh = bpy.data.meshes.new("tank"); mesh.from_pydata(verts, [], faces); mesh.update()
for poly in mesh.polygons: poly.use_smooth = False     # flat shading
obj = bpy.data.objects.new("tank", mesh); scene.collection.objects.link(obj)

# materiál: matná 4BO olive
mat = bpy.data.materials.new("olive"); mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.30, 0.34, 0.20, 1.0)
bsdf.inputs["Roughness"].default_value = 0.85
if "Specular IOR Level" in bsdf.inputs: bsdf.inputs["Specular IOR Level"].default_value = 0.2
obj.data.materials.append(mat)

# export GLB (interaktivní prohlížení v Quick Look / jakémkoli vieweru)
try:
    bpy.ops.export_scene.gltf(filepath=f"{PREFIX}.glb", export_format='GLB', use_selection=False)
    print("GLB OK")
except Exception as e:
    print("GLB FAIL", e)

# bounds
xs=[v[0] for v in verts]; ys=[v[1] for v in verts]; zs=[v[2] for v in verts]
ctr = Vector(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,(min(zs)+max(zs))/2))
dim = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))

# světlo: slunce + výplň
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun","SUN")); scene.collection.objects.link(sun)
sun.data.energy = 5.5; sun.rotation_euler = (math.radians(48), math.radians(20), math.radians(35))
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill","SUN")); scene.collection.objects.link(fill)
fill.data.energy = 0.6; fill.rotation_euler = (math.radians(72), 0, math.radians(225))

# world tmavší šedé pozadí (víc kontrastu)
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55,0.57,0.55,1.0)
# punčové podání místo plochého AgX
try: scene.view_settings.view_transform = 'Standard'
except: pass

# render engine Eevee
try: scene.render.engine = 'BLENDER_EEVEE_NEXT'
except: scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1400; scene.render.resolution_y = 800
scene.render.film_transparent = False

def add_cam(name, loc, ortho=False, ortho_scale=None):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); scene.collection.objects.link(cam)
    cam.location = loc
    if ortho:
        cam.data.type='ORTHO'; cam.data.ortho_scale = ortho_scale
    # look-at center
    d = (ctr - Vector(loc));
    cam.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
    return cam

def shoot(cam, path):
    scene.camera = cam; scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

# 3/4 hero (perspektiva)
hero = add_cam("hero", (ctr.x+dim*0.9, ctr.y-dim*1.1, ctr.z+dim*0.65))
hero.data.lens = 60
shoot(hero, f"{PREFIX}_hero.png")

# čistý bok (ortho): díváme se podél -Y (šířka), délka X horizontálně, výška Z svisle
side = add_cam("side", (ctr.x, ctr.y-dim*3, ctr.z), ortho=True, ortho_scale=dim*1.15)
shoot(side, f"{PREFIX}_side.png")

print("RENDER OK")

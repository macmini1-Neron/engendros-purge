"""
build.py — 03 pojezdové kolo #1  (rig uzel: WheelL1)
Vertical-slice spike: geometrie + UV + pixel atlas + nearest materiál + rig pivot + GLB.

Spouští se UVNITŘ Blenderu přes Blender-MCP. facetlib.py se pošle jako string PŘED tímto
skriptem (do globals), takže `box/cyl/dome/...` jsou k dispozici. Atlas leží v /Users/Shared/t62
(cross-account čitelné Blenderem běžícím pod účtem tomas).

Konvence: forward +Z, up +Y, right +X, 1u=1m. Kolo se točí kolem LOKÁLNÍ X (CLAUDE.md §5).
Origin = OSA NÁBOJE = (0,0,0). Face kola = rovina YZ, normála ±X.

Rozměry (notes.md má zdroje):
  Ø 0.81 m  → R 0.405  (CLAUDE.md §6, conf H)
  šířka (depth podél X) 0.16 m  (ODHAD, conf L — ověřit v katalogu)
"""
import bpy, math

SHARED = "/Users/Shared/t62"
ATLAS  = SHARED + "/wheel_atlas.png"
OUT    = SHARED + "/wheel.glb"

R_WHEEL = 0.405          # Ø0.81
W_TIRE  = 0.16           # šířka kola podél X (ODHAD)
SEG     = 20             # nízké → faceted (CLAUDE.md §1)
HUB_R   = 0.11
HUB_H   = 0.055
ATLAS_FILL = 0.485       # poloměr kola v atlase jako frakce (musí ladit s atlas.py R)

clear_scene()

# 1) tělo kola = nízko-segmentový válec (tire+disk volume), osa X
body = cyl("wheel_body", radius=R_WHEEL, depth=W_TIRE, segments=SEG, axis='X',
           center=(0, 0, 0), cap=True)

# 2) náboj dome na vnější straně (+X = vnějšek; WheelL1 je vlevo, ale pro slice OK)
hub = dome("wheel_hub", radius=HUB_R, height=HUB_H, segments=SEG, rings=3,
           axis='X', center=(W_TIRE * 0.5, 0, 0))

# 3) spoj do JEDNOHO rig-uzlu (kolo je jedna animovaná jednotka)
wheel = join("WheelL1", [body, hub])

# 4) planar UV podél X → atlas-kruh přesně na face kola.
#    u,v jen z (y,z): rim (r=R_WHEEL) padne na tire-band atlasu, face na disk.
me = wheel.data
uv = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
uvd = me.uv_layers[0].data
for poly in me.polygons:
    for li in poly.loop_indices:
        vi = me.loops[li].vertex_index
        co = me.vertices[vi].co
        u = 0.5 + (co.y / R_WHEEL) * ATLAS_FILL
        v = 0.5 + (co.z / R_WHEEL) * ATLAS_FILL
        uvd[li].uv = (u, v)

# 5) pixel materiál (nearest, no PBR)
mat = pixel_material("t62_atlas", ATLAS)
assign_mat(wheel, mat)
flat_shade(wheel)

# 6) origin = osa náboje = (0,0,0) (rig pivot)
set_origin(wheel, (0, 0, 0))

# 7) export GLB
import os
if os.path.exists(OUT):
    os.remove(OUT)
export_glb(OUT, only_selected=False)

result = {
    "object": wheel.name,
    "verts": len(me.vertices),
    "polys": len(me.polygons),
    "origin": tuple(round(c, 4) for c in wheel.location),
    "dims": tuple(round(d, 3) for d in wheel.dimensions),
    "glb": OUT,
    "glb_exists": os.path.exists(OUT),
    "glb_bytes": os.path.getsize(OUT) if os.path.exists(OUT) else 0,
}

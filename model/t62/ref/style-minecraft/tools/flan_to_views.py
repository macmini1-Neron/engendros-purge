#!/usr/bin/env python3
"""
flan_to_views.py — Flan's Mod (ModelRendererTurbo) .java -> JSON + ortho náhled.

Vstup: dekompilovaná Model*.java (CFR) z Flan content packu.
Výstup:
  - <out>/<name>.parts.json  — díly + boxy s 8 world-space rohy (most do Blenderu)
  - <out>/<name>_side|front|top.png — ortho náhledy (PIL)

Formát ModelRendererTurbo:
  func_78793_a(x,y,z)  = rotationPoint (pozice dílu)
  field_78795_f/_g/_h  = rotateAngle X / Y / Z (rad)
  addShapeBox(x,y,z, w,h,d, scale, +24 offsetů rohů) = box, 8 rohů posunutých
  addBox(x,y,z, w,h,d[, scale]) = prostý box
  addShape3D(x,y,z, Shape2D, depth, ...) = extruze polygonu -> aprox. bbox
Souřadnice (po flipAll): X=délka, Y=výška(nahoru +), Z=šířka.
"""
import re, sys, json, math, os
from PIL import Image, ImageDraw

# ---- 8 rohů boxu: pořadí rohů Techne (x,y,z)+(±w,±h,±d), offset přičten ----
# corner sign table (sx,sy,sz) v pořadí jak Flan ukládá 8 vertexů
CORNER = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]

def parse_floats(s):
    return [float(x) for x in re.findall(r'-?\d+\.?\d*(?:[eE]-?\d+)?f?', s.replace('f',''))]

def parse(java_path):
    txt = open(java_path, encoding='utf-8', errors='replace').read()
    # part objektů: this.<group>[<i>]  -> akumuluj atributy
    parts = {}   # key "group[i]" -> dict
    def P(key):
        return parts.setdefault(key, {'pos':[0,0,0],'rot':[0,0,0],'shapes':[]})

    # rotationPoint
    for m in re.finditer(r'this\.(\w+\[\d+\])\.func_78793_a\(([^)]*)\)', txt):
        f = parse_floats(m.group(2))
        if len(f) >= 3: P(m.group(1))['pos'] = f[:3]
    # rotace
    axis = {'field_78795_f':0,'field_78796_g':1,'field_78808_h':2}
    for m in re.finditer(r'this\.(\w+\[\d+\])\.(field_78795_f|field_78796_g|field_78808_h)\s*=\s*([^;]+);', txt):
        val = m.group(3)
        v = math.pi if 'Math.PI' in val else (parse_floats(val)[0] if parse_floats(val) else 0.0)
        if 'Math.PI' in val and '-' in val.split('Math.PI')[0][-2:]: v = -math.pi
        P(m.group(1))['rot'][axis[m.group(2)]] = v
    # addShapeBox
    for m in re.finditer(r'this\.(\w+\[\d+\])\.addShapeBox\(([^;]*)\);', txt, re.S):
        f = parse_floats(m.group(2))
        if len(f) < 7: continue
        x,y,z,w,h,d,scale = f[0],f[1],f[2],f[3],f[4],f[5],f[6]
        off = f[7:7+24] + [0.0]*max(0,24-(len(f)-7))
        P(m.group(1))['shapes'].append(('box',x,y,z,w,h,d,scale,off))
    # addBox (prostý)
    for m in re.finditer(r'this\.(\w+\[\d+\])\.addBox\(([^;]*)\);', txt, re.S):
        f = parse_floats(m.group(2))
        if len(f) < 6: continue
        x,y,z,w,h,d = f[:6]; scale = f[6] if len(f)>6 else 0.0
        P(m.group(1))['shapes'].append(('box',x,y,z,w,h,d,scale,[0.0]*24))
    # addShape3D -> aprox bbox: addShape3D(x,y,z, new Shape2D({Coord2D(u,v,..)..}), depth, ...)
    for m in re.finditer(r'this\.(\w+\[\d+\])\.addShape3D\(([^,]*),([^,]*),([^,]*),.*?Coord2D\[\]\{(.*?)\}\),\s*([0-9.\-f]+)', txt, re.S):
        x = parse_floats(m.group(2))[0] if parse_floats(m.group(2)) else 0
        y = parse_floats(m.group(3))[0] if parse_floats(m.group(3)) else 0
        z = parse_floats(m.group(4))[0] if parse_floats(m.group(4)) else 0
        coords = parse_floats(m.group(5))
        us = coords[0::4] if coords else [0,1]; vs = coords[1::4] if coords else [0,1]
        depth = parse_floats(m.group(6))[0] if parse_floats(m.group(6)) else 1
        if not us: us=[0,1]
        if not vs: vs=[0,1]
        w = max(us)-min(us) or 1; h = max(vs)-min(vs) or 1
        P(m.group(1))['shapes'].append(('box', x+min(us), y+min(vs), z, w, h, depth, 0.0, [0.0]*24))
    return parts

def rotZ(p,a):
    if not a: return p
    c,s = math.cos(a),math.sin(a); x,y,z = p
    return [x*c-y*s, x*s+y*c, z]
def rotY(p,a):
    if not a: return p
    c,s = math.cos(a),math.sin(a); x,y,z = p
    return [x*c+z*s, y, -x*s+z*c]
def rotX(p,a):
    if not a: return p
    c,s = math.cos(a),math.sin(a); x,y,z = p
    return [x, y*c-z*s, y*s+z*c]

def corners(shape):
    _,x,y,z,w,h,d,sc,off = shape
    pts=[]
    for i,(sx,sy,sz) in enumerate(CORNER):
        cx = x + sx*w + (off[i*3+0])
        cy = y + sy*h + (off[i*3+1])
        cz = z + sz*d + (off[i*3+2])
        # scale expansion ven
        cx += (-sc if sx==0 else sc); cy += (-sc if sy==0 else sc); cz += (-sc if sz==0 else sc)
        pts.append([cx,cy,cz])
    return pts

def world_boxes(parts):
    out=[]
    for key,pp in parts.items():
        px,py,pz = pp['pos']; rx,ry,rz = pp['rot']
        group = key.split('[')[0]
        for sh in pp['shapes']:
            verts=[]
            for c in corners(sh):
                c = rotZ(c,rz); c = rotY(c,ry); c = rotX(c,rx)
                c = [c[0]+px, c[1]+py, c[2]+pz]
                c = [c[0], -c[1], c[2]]   # flipAll: Y nahoru +
                verts.append(c)
            out.append({'group':group,'verts':verts})
    return out

FACES = [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(0,3,7,4)]
GROUP_COL = {  # 4BO olive odstíny dle skupiny
 'bodyModel':(96,104,72),'bodyDoorCloseModel':(86,94,64),'turretModel':(112,120,86),
 'barrelModel':(70,74,58),'leftTrackWheelModels':(54,54,50),'rightTrackWheelModels':(54,54,50),
 'leftTrackModel':(40,40,38),'rightTrackModel':(40,40,38)}

def render(boxes, view, W=1100,H=620,pad=40):
    # axis pick: side=(X,Y), front=(Z,Y), top=(X,Z); light depth pro shading
    if view=='side': hi,vi,di,vflip = 0,1,2,False
    elif view=='front': hi,vi,di,vflip = 2,1,0,False
    else: hi,vi,di,vflip = 0,2,1,True   # top
    allh=[v[hi] for b in boxes for v in b['verts']]
    allv=[v[vi] for b in boxes for v in b['verts']]
    mnh,mxh,mnv,mxv = min(allh),max(allh),min(allv),max(allv)
    sc = min((W-2*pad)/(mxh-mnh or 1),(H-2*pad)/(mxv-mnv or 1))
    def proj(v):
        hh=(v[hi]-mnh)*sc+pad
        vv=(v[vi]-mnv)*sc+pad
        if not vflip: vv = H-vv
        return (hh,vv)
    img=Image.new('RGB',(W,H),(228,230,224)); dr=ImageDraw.Draw(img,'RGBA')
    # painter: seřaď faces dle hloubky
    polys=[]
    for b in boxes:
        base=GROUP_COL.get(b['group'],(100,100,90))
        for f in FACES:
            vs=[b['verts'][i] for i in f]
            depth=sum(v[di] for v in vs)/4
            # normála pro shading (hrubě)
            ax=(vs[1][0]-vs[0][0],vs[1][1]-vs[0][1],vs[1][2]-vs[0][2])
            bx=(vs[2][0]-vs[0][0],vs[2][1]-vs[0][1],vs[2][2]-vs[0][2])
            nz=ax[0]*bx[1]-ax[1]*bx[0]
            ny=ax[2]*bx[0]-ax[0]*bx[2]
            nx=ax[1]*bx[2]-ax[2]*bx[1]
            nl=math.sqrt(nx*nx+ny*ny+nz*nz) or 1
            sh=0.55+0.45*abs((nx*0.3+ny*0.8+nz*0.5)/nl)
            col=tuple(min(255,int(c*sh)) for c in base)
            polys.append((depth,[proj(v) for v in vs],col))
    polys.sort(key=lambda p:p[0])   # zadní první
    for _,pts,col in polys:
        dr.polygon(pts, fill=col+(255,), outline=(30,32,28,160))
    return img

if __name__=='__main__':
    java=sys.argv[1]; out=sys.argv[2]; name=os.path.splitext(os.path.basename(java))[0]
    os.makedirs(out,exist_ok=True)
    parts=parse(java); boxes=world_boxes(parts)
    json.dump({'name':name,'boxes':boxes}, open(f'{out}/{name}.parts.json','w'))
    nb=sum(len(p['shapes']) for p in parts.values())
    print(f'{name}: {len(parts)} dílů, {nb} boxů, {len(boxes)} world-boxů')
    for view in ('side','front','top'):
        render(boxes,view).save(f'{out}/{name}_{view}.png')
        print(f'  -> {name}_{view}.png')

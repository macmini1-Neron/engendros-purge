# ref/style-minecraft — Flan's Mod tanky jako stylová předloha

Faceted box-modely tanků z **Flan's Mod WW2 Content Pack 1.12.2-5.7.2** —
stylová předloha pro faceted low-poly look (NE proporční předloha; T-62 stavíme 1:1 dle manuálů).

> ⚠️ WW2 pack → **žádný T-62** (je studenoválečný). Sovětské tanky tu: **T-34/85, IS-2, KV-1, SU-1-12**.
> Pro Minecraft T-62 by byl potřeba modern/cold-war pack.

## Co tu je
- `skins/*.png` — textury (UV atlas) tanků.
- `models-class/*.class` — zkompilované Techne modely (T3485, IS2, KV1, T34).
- `decompiled/cfr.jar` — CFR decompiler; `decompiled/src/...` — dekompilované `.java`.
- `tools/flan_to_views.py` — **parser + náhled** (viz níže).
- `views/*.png` + `*.parts.json` — ortho náhledy + parsovaná geometrie.

## Workflow: otevřít / zobrazit jakýkoli Flan model
```bash
JAVA=/opt/homebrew/opt/openjdk/bin/java
WS="model/t62/ref/style-minecraft"
# 1) vytáhni .class z packu JARu (unzip)
# 2) dekompiluj:
$JAVA -jar "$WS/decompiled/cfr.jar" "$WS/models-class/ModelXXX.class" --outputdir "$WS/decompiled/src"
# 3) parser -> JSON + ortho náhled (bok/čelo/shora):
python3 "$WS/tools/flan_to_views.py" "$WS/decompiled/src/.../ModelXXX.java" "$WS/views"
```

## Formát (ModelRendererTurbo) — co parser čte
- `func_78793_a(x,y,z)` = pozice dílu; `field_78795_f/_g/_h` = rotace X/Y/Z (rad).
- `addShapeBox(x,y,z, š,v,h, scale, +24 offsetů)` = box s 8 posunutými rohy (šikminy).
- `addBox` = prostý box; `addShape3D` = extruze polygonu (válce/kola) → aprox. bbox (proto kola
  vyjdou jako plné bloky v náhledu — kosmetika náhledu, ne chyba dat).
- Souřadnice po `flipAll()`: **X=délka, Y=výška(nahoru +), Z=šířka**.

## Most do Blenderu
`*.parts.json` = `{name, boxes:[{group, verts:[8×[x,y,z]]}]}` — 8 world-space rohů na box.
Až bude Blender-MCP živý, tenhle JSON se přímo převede na meshe (1 box = 1 faceta) jako
import-&-improve základ NEBO čistě jako 3D referenci vedle reálných manuálů.

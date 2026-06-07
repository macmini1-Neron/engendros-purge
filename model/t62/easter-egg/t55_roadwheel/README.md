# EASTER EGG — kolo z T-55 (omylem na muzejním T-62)

**Co to je:** první postavené pojezdové kolo (vertical-slice spike, 2026-06-07). Postaveno
podle fotek `ref/walkaround/t-62_058/059/060.jpg` — JENŽE ty fotky ukazují **kolo z T-55**,
které muzejní T-62 (náš reálný základ) dostalo při opravě místo originálního T-62 kola.

Takže geometricky je to **správné T-55 kolo, ale ŠPATNÉ pro T-62**:
- T-55 typ = plochý disk, **dva kruhy mnoha malých otvorů**, 12 tenkých žeber.
- T-62 typ (správný, viz `ref/walkaround/CORRECT_roadwheel/`) = **vyhloubený (dished) disk,
  6 velkých ledvinových otvorů, 6 širokých vystouplých paprsků, velký vystouplý kulový náboj**.

**Status:** uloženo stranou jako **easter-egg model** (Tomášovo přání). Nedál se nevyvíjí.
Pipeline (Blender-MCP + facetlib + pixel-atlas + nearest + rig + GLB + three.js) tímto kolem
prošla a je PROKÁZANÁ — jen subjekt byl špatný.

Soubory: `build.py` `atlas.py` `out.glb` `wheel_atlas.png` (+ preview).

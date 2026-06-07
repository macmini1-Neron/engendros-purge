# lib/ — sdílené Blender helpery

Pomocné moduly volané z `parts/NN/build.py` přes Blender-MCP. Zatím prázdné —
napíšou se až u prvního dílu, ať jsou ušité na reálnou potřebu (ne dopředu naslepo).

Plánované:
- **facetlib.py** — faceted primitiva: `box()` (1 plochá face/strana), low-seg `cyl()`/`cone()`,
  faceted `dome()` (bisect-cut, ne UV-sphere), `star()`, `flat_shade()`, GLB export.
  ⚠️ `transform_apply(rotation=True)` v bpy defaultně bere i location+scale → vždy
  `location=False, scale=False` (jinak se origin zapeče do (0,0,0) — minulý bug).
- **overlay.py** — normalizace blueprintu/fotky do mého framu + red/blue/purple diff overlay.
  Verify z **úrovně očí**, ne z 3/4 nadhledu (CLAUDE.md §6 lekce).
- **export.py** — GLB export s rig kontraktem (názvy uzlů, pivoty, osy; CLAUDE.md §5).

# BUILD — electronika-clock («Электроника 6.15М» digital desk clock)

Digital counterpart to the parallel Fable session's analog **wall** clock. Shared time
SOURCE (`worldClock` + `formatHHMM`, src/worldclock.js), independent rendering.
Branch `feat/desk-clock-electronika`, worktree `/Users/macmini1/engendros-clock`, based on
`feat/world-clock` (so the world clock + demo house + modelgen harness are all present).

## Status
- [x] Phase 1 research → dossier (model = «Электроника 6.15М», red variant; ИВЛ1-7/5 green VFD;
      case ≈195×75×100 mm; digit 21×13.67 mm; HH:MM + fixed colon). 12 sources, 9 needs[].
- [x] Phase 2 spec.json — 12 parts (red shell, light bezel, smoked panel, top button,
      6 side buttons С/Я/К/Б/Ч/М, rear cable). lint CLEAN (fills 100/108/102%).
- [x] Phase 3a body verify — headless render OK (form/proportion/red+bezel+panel read right).
- [x] Live VFD — `src/clockface.js`: custom 7-seg CanvasTexture, emissive (MeshBasic, toneMapped
      off), NEAREST pixel, ghost segments, blinking colon, «электроника» logo. Harness
      `tools/modelgen/clockface-test.html`. Headless render = ultra-legible, matches the photo.
- [ ] Phase 3b — capture canonical body view set (front/side/ghost) via a headless view hook.
- [x] Phase 4 — INTEGRATED into demo house: clock placed on the FIRST window sill
      (`DemoBuilding._sillSpot` + lazy `_placeClock` once the async spec registers), clockface
      mounted on the panel front, ticked each frame from `game._worldClock.minuteOfDay()`.
      registered in game.js `_registerModels`.
- [x] LIVE verification (functional, via an instrumented `?clockcap=HH:MM` dev hook run in the
      real game headless): `[clockcap] READY at -27.67,-2.86` = clock placed at the demo
      building with NO `[modelgen]`/`[demobuilding]` errors; HUD showed `08:05 · DAY` proving the
      world clock drove it. Integration-harness render `_ingame-0805.png` is the faithful visual
      (model + live VFD + proven `parseHHMM→formatHHMM` pipeline).
- [~] LIVE beauty screenshot in-situ — NOT obtained. Headless WebGL capture of the heavy game
      boot is unreliable (rAF throttling × `--virtual-time-budget` × `--screenshot` early-exit
      all conflict; the self-POST hook reaches phase 4 but delivery is torn down). The shared
      Playwright browser is held by the parallel Fable session and must NOT be killed. → get this
      via MCP once Fable's session is closed, or just play `?map=demo` and look at a window sill.
- [ ] Pre-commit: REMOVE the `?clockcap` dev hook from game.js; admin viewer entry (optional);
      cache-bust (`?v=` + GAME_BUILD) when finalizing the PR.

## Capture path (IMPORTANT)
The Playwright MCP browser is **shared with the parallel Fable session** — both drive one page,
so MCP navigation collides ("Target page closed", lost output files). Use an **isolated headless
Chrome** instead (own `--user-data-dir`, swiftshader), which never touches the shared browser:
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --no-sandbox \
  --window-size=W,H --virtual-time-budget=5000 --user-data-dir=/tmp/<uniq> \
  --screenshot=/tmp/out.png "http://localhost:8771/tools/modelgen/<page>?..."
# launch backgrounded, sleep ~7s, kill the pid (it doesn't always self-exit), then Read the PNG.
```
Do NOT `kill` mcp-chrome profiles — `27060ef` may be Fable's live browser.

## Defects / refinements log
- v1 body: good. Bezel a touch bright on the bottom edge — acceptable; revisit if it reads chrome.
- VFD v1: excellent. Possible polish — slightly brighter digit core; smoked-green filter tint.

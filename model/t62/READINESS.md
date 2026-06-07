# READINESS — ultra-kritické, upřímné zhodnocení (2026-06-07)

Bez příkras. Co je hotové, co je NEOVĚŘENÉ, co může selhat, co zlepšit. Updatovat jak se posouváme.

## VERDIKT
- **Příprava / reference / plán: ~90 % hotovo.** Reference jsou reálně kompletní a kvalitní, styl
  je zamčený, pravidla (subjekt/silueta/komplexnost/asymetrie/animace) jsou napsaná.
- **Vlastní VÝROBA: NEOVĚŘENO.** Dvě věci, na kterých celý projekt stojí, jsme **ještě nezkusili**:
  (1) že Blender-MCP funguje z Claude **Code** (ne jen Desktop), (2) že umím vyrobit **pixel-texturu**
  v kvalitě peak obrázku. Dokud tyhle dvě nejsou zelené, „ready" je jen teoreticky.

## LIMITACE (dle závažnosti)

### A. Nástroje / neověřeno — NEJVYŠŠÍ riziko
1. **Blender-MCP z Claude Code nikdy nepřipojen.** Funguje u tebe přes Desktop-Clauda → addon je OK,
   ale náš klient (config v `~/.claude.json`) je netestovaný. Nutný restart + smoke-test.
2. **`get_viewport_screenshot` má známý bug** v tomhle MCP → fallback render-do-souboru. Neověřeno tady.
3. **Token/context náklady:** každý verify = screenshot do kontextu. Stovky dílů × víc úhlů = těžké na
   context i rozpočet. Potřebuju screenshot-ekonomiku (min. záběrů na díl).

### B. Texturová půlka NEOVĚŘENA — NEJVYŠŠÍ riziko na kvalitu
4. Peak look = mesh **+** pixel-textura. Mesh umím (Flan render to dokázal). **Pixel-art atlas v kvalitě
   peaku jsem NIKDY nedělal.** Peak textura je AI-generovaná „polish"; můj PIL-malovaný atlas může vyjít
   placatě/amatérsky. **Tohle je největší riziko kvality a je to půlka kterou jsme se ještě nedotkli.**
5. **Replikovatelnost vs hezkost:** skriptovaný atlas = replikovatelný ale možná ošklivý; ručně malovaný
   = hezký ale ne-skriptovaný. Nevyřešené napětí.

### C. Můj percepční limit (původní důvod selhání, jen ČÁSTEČNĚ vyřešen)
6. **3D posuzuju z 2D screenshotů.** MCP dá živý viewport (lepší než headless silueta), ale můj
   prostorový odhad je pořád nedokonalý — a litá „pánev" věž je přesně tam, kde jsem minule selhal.
   Záchrana = overlay vs blueprint **+ tvůj approval gate**. Upřímně: **moje oko je slabý článek, tvůj
   gate je nosný** → záleží na kadenci kontrol.

### D. Reference — mezery (střední)
7. **Žádné fotky střechy** — a střecha (kopule, poklopy, ventilátory, periskopy, základna DShK) je
   nejhustší detailní zóna. Půdorys blueprintu + deck-drawing to kryjí jen částečně; **3D tvary na
   střeše jsou pod-referencované.**
8. Fotky jsou **muzeální** kusy (drift sub-variant, koroze, polní úpravy), ne čistý tovární obr.1972.
9. **Hledání správného Рис. plate per díl** = vizuální prohledávání 524 skenovaných ruských stran
   (katalog není OCR-prohledávatelný na díly). Tření u každého dílu.

### E. Proces / rozsah (střední)
10. **Stovky dílů × build→verify→approve = DLOUHÝ, vícesession projekt.** Kontinuita mezi sessions je
    riziko (jednu jsme už ztratili). Mitigace = workspace docs + memory + TRACKER, ALE stav rozestavěného
    `.blend` se musí ukládat + vědět KDE a na kterém ÚČTU (cross-account TCC: když Blender běží na `tomas`
    a `.blend` se uloží tam, já jako `macmini1` ho nepřečtu). **Nedefinováno.**
11. **Replikovatelnost je křehká:** když budu ladit ručně v Blenderu přes MCP místo úpravou `build.py`,
    `.blend` se rozejde se skripty. Vyžaduje tvrdou disciplínu pod tlakem iterací.

### F. Rozsah / nevyřešeno
12. **Cíl nasazení nevyřešen:** tanky byly z hry ODEBRÁNY (chore/remove-tanks merged). Re-add do hry =
    navíc práce (rig kontrakt + obnova smazaného vehicle kódu). Standalone = jednodušší. Mění to nároky na rig.
13. **Nejtěžší díly neověřené:** custom-mesh litá věž (organická, asymetrická) + animace pásu. Asymetrie
    ruší „mirror zdarma" → víc práce.

## CO ZLEPŠIT / DE-RISK (priorita)
1. **#1 HNED: smoke-test Blender-MCP** (restart → triviální `execute_blender_code` + screenshot +
   ověřit fallback). Dokud není zelený, vše ostatní je teorie. ~5 min.
2. **VERTICAL-SLICE spike PŘED masovou geometrií:** vezmi JEDEN díl (pojezdové kolo) celý naskrz —
   low-poly mesh + UV + pixel atlas + nearest materiál + rig-empty + export GLB + prohlídka v three.js.
   **De-riskne neověřenou půlku (textura+rig+export) na JEDNOM levném dílu** než se zaváže ke stovkám.
   Když kolo vypadá jako peak styl a točí se → pipeline je dokázaná. **Tohle je nejdůležitější zlepšení.**
3. **Definovat master `.blend`:** kde leží, jak často se ukládá, na kterém účtu Blender běží (čitelnost
   cross-account). Ideálně `.blend` do `/Users/Shared/` nebo do repa.
4. **Screenshot-ekonomika:** např. 1 overlay + 1 hero na verify, ne 6.
5. **Rozhodnout cíl nasazení** (hra vs standalone) — mění nároky na rig.
6. **Index katalogu** (díl → strana Рис.) jednorázově, ať per-díl tření klesne.
7. **Disciplíny (už v docs):** všechny změny přes `build.py`; nikdy nemergovat animované díly.

## SILNÉ STRÁNKY (pro fér)
Reference reálně kompletní + kvalitní · styl zamčen s verbatim promptem · deterministický přístup je
správná volba na replikovatelnost · animační hierarchie zabudovaná od začátku · subjekt/silueta/
komplexnost/asymetrie/custom-mesh pravidla explicitní · workspace přežije ztrátu session.

## DOPORUČENÝ DALŠÍ KROK
Ne „díl 01 ostře", ale: **smoke-test MCP → vertical-slice spike na jednom kole (geometrie+textura+rig+
export+three.js)**. Když projde, teprve pak spustit sériovou výrobu dílů. Ušetří to dny práce ve špatném
směru.

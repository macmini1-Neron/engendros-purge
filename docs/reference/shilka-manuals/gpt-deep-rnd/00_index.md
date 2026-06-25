# Shilka deep RnD index

Tento balík navazuje na `output/navrhy_mechanik_shilka.md` a jde víc do implementační hloubky.

Zdrojová vrstva:

- OCR po stránkách: `refs/ocr_pages/`
- Kombinované OCR manuály: `refs/ocr_combined/`
- Tematický index: `refs/01_tematic_index.md`
- Klíčové pasáže: `refs/02_klicove_pasaze.md`
- Vizuální kontroly: `refs/visual_checks/`

Výstupní vrstva:

- `01_evidence_matrix.md` - stránkové důkazy, herní význam, modelové prvky.
- `02_system_architecture.md` - návrh subsystémů a datových stavů.
- `03_interlock_state_machine.md` - blokace, oprávnění palby, fyzické příčiny.
- `04_rpk_rls_deep_dive.md` - RPK/RLS režimy, radarový obraz, rušení, operátoři.
- `05_azp_ammo_cooling_deep_dive.md` - AZP-23M, munice, pásy, chlazení, dávky.
- `06_hydraulic_electric_gm575_deep_dive.md` - pohony, SЭП, GM-575, PАЗ/PPO.
- `07_crew_workflows.md` - čtyřčlenná posádka, procedury, spolupráce.
- `08_model_and_implementation_backlog.md` - model, Blender, kód, priority.

Čtení doporučuji v tomhle pořadí:

1. `01_evidence_matrix.md`
2. `03_interlock_state_machine.md`
3. `04_rpk_rls_deep_dive.md`
4. `05_azp_ammo_cooling_deep_dive.md`
5. `06_hydraulic_electric_gm575_deep_dive.md`
6. `07_crew_workflows.md`
7. `02_system_architecture.md`
8. `08_model_and_implementation_backlog.md`

Poznámka k přesnosti:

OCR je auditovatelný po stránkách, ale část scanů je nekvalitní. U mechanik, které se opírají o výkres nebo panel, jsem používal i uložené vizuální kontroly. U čísel a nápisů panelů preferuj vizuálně ověřené stránky před samotným OCR.


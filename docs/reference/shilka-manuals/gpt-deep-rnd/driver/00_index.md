# Driver deep RnD index

Tento balík je samostatná hluboká vrstva pro roli mechanika-řidiče Shilky / GM-575. Navazuje na:

- `output/navrhy_mechanik_shilka.md`
- `output/deep_rnd/06_hydraulic_electric_gm575_deep_dive.md`
- `output/deep_rnd/07_crew_workflows.md`
- `output/deep_rnd/08_model_and_implementation_backlog.md`

## Soubory

- `01_driver_evidence_matrix.md` - stránkové důkazy a jejich herní/modelový význam.
- `02_driver_role_and_systems.md` - role řidiče jako operátora vozidla, energie a bezpečnosti.
- `03_driver_panel_controls.md` - rozbor řidičova přístrojového štítku a návrh aktivních ovladačů.
- `04_driver_gameplay_workflows.md` - procedury: příprava, start, pohyb, boj, PАЗ, PПO, nouze.
- `05_driver_model_implementation_backlog.md` - modelářský, simulační, UI, audio a QA backlog.

## Nové vizuální reference

Nové obrázky jsou v:

- `refs/visual_checks/driver/`

Nejdůležitější:

- `gm_album_driver_panel-130.png` - velký přístrojový štít mechanika-řidiče.
- `gm_album_hatch_block-159.png` - instalace spínače blokace poklopu mechanika-řidiče.
- `gm_album_driver_vision-163.png` a `gm_album_driver_vision-164.png` - boční a periskopický pozorovací přístroj.
- `gm_album_fuel_control-023.png` a `gm_album_fuel_control-024.png` - pedál/ruční přívod paliva.
- `gm_album_oil_system-030.png` - systém mazání.
- `gm_album_cooling_system-036.png` - systém chlazení.
- `gm_catalog_levers-115.png` - skupina řízení stroje, páky, PМP/brzdy.
- `gm_catalog_clutch_gear-122.png` až `gm_catalog_clutch_gear-125.png` - hlavní frikcion, pedály, řazení.
- `gm_catalog_gear_lever-137.png` - páka řazení převodovky.

## Jak číst

Nejprve `01_driver_evidence_matrix.md`, potom `02_driver_role_and_systems.md`. Pokud se řeší konkrétní 3D model interiéru, začít rovnou `03_driver_panel_controls.md` a `05_driver_model_implementation_backlog.md`.

## Poznámka k přesnosti

Řidič je v dokumentech rozptýlený: část je v provozní instrukci, část v albu GM-575, část v katalogu uzlů a část v protipožárních/PАЗ postupech. Proto je tenhle balík schválně psaný přes vazby mezi systémy, ne jen jako seznam panelových prvků.

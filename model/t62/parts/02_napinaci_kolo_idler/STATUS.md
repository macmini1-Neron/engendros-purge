# STATUS — 02 napínací kolo / IDLER (IdlerL) — 👀 REVIEW (čeká na Tomáše)

- **Stav:** 👀 review (v1 postaveno, čeká approval gate)
- **Rig pivot:** osa náboje = origin (0,0,0); spin kolem lokální X
- **Uzel:** `IdlerL` (+ 9 child-meshů: rim/spokes/hub/rimbolts × out/in + barrel)
- **Schválil Tomáš:** ne (zatím)
- **Výstup:** `out.glb` · viewer `http://localhost:8123/model/t62/viewer.html?glb=idler.glb`
- **Build:** `build.py` (deterministický) · 1442 v · GLB 165 KB

## Checklist (CLAUDE.md §3)
- [x] reference dohledaná + rozměry v `notes.md` (se zdrojem)
- [x] build.py postaven v Blenderu přes MCP
- [x] verify: render face / 3-4 / profil
- [ ] verify: overlay vs blueprint (silueta) — průměr doladit s Tomášem
- [x] ukázáno Tomášovi
- [ ] **OK od Tomáše**
- [ ] export out.glb (hotovo provizorně, finalizovat po OK)
- [ ] TRACKER.md → approved

## v1 — co je postaveno
- DVOJITÉ litá kolo (2 spider-disky + středová mezera na vodící zuby pásu + spojovací barel)
- každý disk = OBRUČ (kov, bez gumy) + **N=12 zakřivených paprsků** (pinwheel, sweep 16°) +
  kulový NÁBOJ (dome + 12 šroubů) + 12 šroubů na obruči; OKNA mezi paprsky průchozí
- klokování vnitřního disku o půl rozteče · materiál = sdílený wheel_atlas (náboj green, obruč/paprsky olive)
- Ø ~0.54 m (0.65× pojezdové kolo, blueprint)

## Otevřené k potvrzení (srovnání s MiniArt 37060)
1. **Počet paprsků** — mám 12 (tenčí, „fan"); MiniArt vypadá na ~10 BOLD paprsků + VĚTŠÍ okna → zvážit
2. **Vroubkovaný (castellated) okraj obruče** — MiniArt má zubatý okraj (konce paprsků); mám hladký + šrouby
3. **Míra/směr sweepu** paprsků
4. **Přesný průměr** (0.54 doladit)

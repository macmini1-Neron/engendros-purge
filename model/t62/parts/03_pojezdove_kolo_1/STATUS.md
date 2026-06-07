# STATUS — 03 pojezdové kolo #1 (WheelL1) — ✅ APPROVED

- **Stav:** ✅ approved (Tomáš, 2026-06-07)
- **Rig pivot:** osa náboje = origin (0,0,0); spin kolem lokální X
- **Schválil Tomáš:** ANO
- **Výstup:** `out.glb` (parent `WheelL1` + 11 uzlů), viewer `model/t62/viewer.html`

## Finální podoba (reálný T-62, dvojité kolo)
- 2× guma (černá, **lem:guma ≈ 1:2.5**, jemný dezén — naznačení gumy), úzká středová mezera na pás
- ocelový **lem** = samostatný olivový prstenec mezi žebry a gumou, **vytažený proud (nejvyšší bod)**
- litý disk: **5 klíčových dírek** (kolečko + spojený šikmý klín k náboji, reálně prořezané) +
  **5 malých kulatých dírek v žebrech** (horní okraj ve stejném poloměru jako velké díry)
- **5 žeber** rozšiřujících se od středu k okraji, s vystouplým žebrem
- **klokované disky** (díra ↔ žebro za sebou)
- náboj: **kulatá kupole pod úrovní lemu** + plochý věnec + **6 šroubů** (zasunuté ~50%)
- **spojovací barel** ve středu (oba disky = jeden celek)
- náboj/kupole = **stejná na obou stranách** (obě kola stejně tlustá)
- materiál: jeden koncentrický pixel-atlas 128px (nearest), rim+barrel UV-zmáčknuté na olivový kov,
  guma černá s jemným dezénem, žádné kovové specky na gumě, vnitřek = normální kov (ne šedý)

## Pipeline DOKÁZÁNA na tomto dílu (reuse na dalších)
geometrie (facetlib: box/cyl/cone/dome/tube/taper_bar + boolean_diff) → boolean keyhole díry
(EXACT, na PLOCHÉM disku; cuttery JEDNOTLIVĚ ne joinem) → planar-X UV + koncentrický atlas →
logické uzly per skupina (kvůli barvení/úpravám) → parent WheelL1 → GLB → three.js viewer (free-cam,
C=barvy dílů). **Iterativní live loop s Tomášem = klíč ke kvalitě.**

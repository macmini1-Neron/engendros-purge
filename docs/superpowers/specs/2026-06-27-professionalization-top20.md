# Profesionalizace ENGENDROS PURGE — Top 20 + Zelda level-design verdikt

**Date:** 2026-06-27 · **Author:** Claude (senior game-design audit, 3 paralelní experti: pro-vibes audit reálného kódu · moderní game-design smart-fixes · Zelda/adventure level design)
**Zadání (owner):** "Jak to celé zprofesionalizovat, aby to dávalo promyšlené a profi vibes i s touhle voxelovou grafikou? Top 20 fíčur. A co ze Zeldy se dá použít?"

## Rámec — profesionalizace ≠ zkrášlení
Pro-feel **NEvzniká z fidelity** (voxel look je záměr a je dobrý). Vzniká ze **(1) FEEDBACKU kolem zásahu/killu, (2) DYNAMICKÉHO ROZSAHU (velká věc bouchne, malá zachvěje — RESTRAINT je ten pro-tah), (3) ČITELNOSTI v chaosu, (4) PACINGU (build→peak→release→exhale), (5) SKOŘÁPKY (menu/onboarding/loading reaguje na input).** Skoro nic dole nejsou pixely — je to **feedback a pacing**.

## Co už JE pro (nepřidávat znovu — grounding)
Engine, audio-syntéza i vizuální design-systém jsou **už na pro úrovni**: vrstvený procedurální zvuk zbraní (M2HB .50cal 6 vrstev, brass-bounce pitch, Mosin bolt foley) · reálný recoil model (recoilKick/Pitch/YawKick + streak + bloom + ADS-FOV) + viewmodel bob/sway/reload-dip · enemy hit-react (`e.squash` pulse + stuffing-puff + plyšový "oof") · hitmarkery 3-stavy + headshot audio + killfeed · FX light-pool (žádné runtime recompile) · low-HP/burn/fall vignety + diegetické optiky · POLYMER design-systém (brass/petrol-teal, CRT grain, card-in anim) · perzistované Settings · death-screen rekordy "NEW BEST" · **adaptivní hudba** `setIntensity/setStress` s vertical-layering + duck bus. **Mezera NENÍ úsilí ani fidelita — je to dynamický rozsah kolem killu + ticho v menu/onboardingu + nevyužitý hudební director.**

---

## TOP 20 (seřazeno dle páky ÷ úsilí · S=odpoledne, M=pár dní, L=týden+/co-op)

### TIER A — "skok o generaci" (5 malých změn, všechno S, jedna větev)
1. **Hit-stop / freeze-frames** `[S]` — *NEJVYŠŠÍ ROI v celém kódu.* Váš vlastní `design-principles.md:29` ho specifikuje jako #1 a NENÍ implementovaný (grep = 0). Na meaty zásah (headshot/kill/boss-effective/breach) zmraz sim na ~0.04 s (`_hitStopT`; ve `_frame` posílej `dt*0.05` do `_updatePlaying`, render plný). Spraví "papírové" voxel zásahy okamžitě. (Vlambeer)
2. **Trauma-model screen shake** `[S]` — nahraď lineární `engine._shake` za `trauma` (0–1), shake = `maxAngle·trauma²` přes noise, decay/s. Velká věc BOUCHNE, malá ZACHVĚJE z jednoho knobu. (Eiserloh, GDC 2016)
3. **Střelba třese + KILL je událost** `[S]` — `_fire` nikdy nevolá shake; 175dmg Mosin a Luger se liší jen z-kickem; kill vypadá jako chip-hit. Přidej malý shake jen pro **těžké třídy** (sniper/shotgun/LMG/launcher) + kill-only mikro-punch (nebo hit-stop z #1). Zachovej rozsah.
4. **Floating damage numbers + kill juice** `[S]` — číslo u zásahu (headshot/crit větší+barevné, pop+arc), "+N" u mrtvoly, lehký multikill chime. Slot-machine boje = kvantifikovaná dopamина. Toggle. (Borderlands)
5. **Tiché menu → ozvučit** `[S]` — `uiClick/uiHover` existují, ale generický `click()` v `_wireUI` (`game.js:249`) váže DEPLOY/PURGE/pauza/TRY-AGAIN **bez zvuku a bez hoveru** = mute UI u vstupních dveří. Prožeň `click()` přes `audio.uiClick()` + `mouseenter→uiHover` na `.btn`. ~15 řádků, obří perceived-polish.
> **Tyto čtyři-pět = "udělej první" — pět malých změn, hra najednou vypadá o generaci dál, nula přidané grafiky.**

### TIER B — vysoká hodnota
6. **Rozjeď adaptivní hudbu, co už máte (AI-Director)** `[M]` — `setIntensity/setStress` existují a jsou **téměř nevyužité** = váš největší latentní asset. Řiď je živou hrozbou (počet/blízkost nepřátel, vaše HP) + **EXHALE pockety** (po vlně intenzita na podlahu). Build-peak-relax = srdce horor-pacingu. (L4D Director)
7. **Last-kill-of-wave slow-mo ("Zed Time")** `[M]` — na kill co dočistí vlnu ramp `timeScale→0.25` na ~1 s + whoosh + desat pulse. *Doslova signatura wave-shooteru.* Host-auth, broadcast. (Killing Floor)
8. **Směrový indikátor zásahu** `[S]` — *"vždycky víš, odkud nebezpečí"* — v 360° hordě máš teď jen full-screen červenou; nevíš ODKUD = "umřel jsem na něco co jsem neviděl" (`design:81` anti-pattern). Červený oblouk na okraji ve směru útočníka (`atan2` bearing). (CoD/Halo)
9. **Run-summary / "ještě jednu" obrazovka** `[S–M]` — `meta` už drží bestWave/score/kills/runs; teď je nejvyšší-emoce moment loopu jen bankovní vklad. Ukaž vlny/killy/headshot%/streak/"NEW BEST" → PAK vklad. Hlavní retention hook. (Hades)
10. **Enemy hit-flash + knockback** `[S→M]` — plyšák se na zásah nikdy nerozsvítí ani neodstrčí (jen squash). Přidej 1-frame bílý emissive flash + malý impulz na těžké zásahy NA squash. Nejlevnější "trefil jsem" tell ve voxelu. (Doom)
11. **Aim magnetism + shoot buffering** `[S–M]` — reticle friction (ohni ray pár° k cíli když projde blízko AABB + zpomal turn nad cílem) → malí voxel nepřátelé jsou "lepkaví" v chaosu; shoot-buffer (drž fire ~120ms před ready → vystřel na první legální frame) zabije "zmáčkl jsem a nic". (Halo / Celeste)
12. **Voxel gib/dismember na overkill** `[S–M]` — na explozi/headshot-overkill rozhoď nepřítele na jeho vlastní barevné voxel kostky (máš 800-instance particle pool + voxel palety). *Nejvíc on-brand juice, skoro zdarma.* (Doom, voxel-native)
13. **Co-op ping wheel + revive clarity** `[M]` — zobecni mortar-marks/aim-rings + `{t,d,_r}` envelope na Apex-style ping (enemy/loot/go/danger, world-anchor + audio callout, všem viditelné); + downed-ally off-screen marker + revive progress ring oba vidí + bleed-out prominentně + downed heartbeat audio. Dělá 2-hráče čitelné + dramatické. (Apex / Deep Rock)
14. **Special-enemy silueta + audio sting + ducked mix + wind-up tells** `[M]` — každý nebezpečný typ = unikátní silueta + vyhrazený palette akcent + vlastní zvuk na spawn; trash mobové mají teď **0 tellů** → přidej férový ~300-400ms wind-up na lungery; prožeň combat cues přes `setMusicDuck` (zatím jen diegetic). L4D doktrína: poznáš hrozbu uchem+siluetou dřív než zamíříš. (Left 4 Dead)

### TIER C — skořápka, čitelnost, accessibility, 1 %
15. **Low-ammo telegraph** `[S]` — `#ammonum` nemění barvu jak mizí zásobník; obarvi červeně + slabý click na posledních ~25 %. Scarcity = horor (`design:49`).
16. **Onboarding / controls panel** `[S–M]` — mechanicky hustá hra, ale nikde seznam ovládání (jen tiny `#hint`). `.controls` CSS (`index.html:483`) je definovaný a nepoužitý → kompaktní CONTROLS panel na Deployment screen / first-run karta.
17. **Loading veil** `[S]` — `startGame()` staví těžký svět synchronně → hitch čte jako freeze. Krátký "ГЕНЕРАЦИЯ…" overlay přes `reset()`/world-build.
18. **Sprint cue + footsteps + ambient bed** `[S]` — sprint (7.6 vs 5.2) má identický FOV i bob → lerp FOV +6-10° (hook už máš z ADS) + sprint-to-fire ready ~150ms; footstep = 1 nevariovaný sample → 2-3 pitch-variant dle terénního materiálu (znáš ho u nohou); + nízký wind/industrial drone gated biomem/nocí, ať svět žije i při music=0.
19. **Crosshair reaguje na bloom + solo-pauza = exhale + odlehči #msg** `[S]` — `#cross` je statický, `bloom` se počítá ale nezobrazí (legible depth `design:52`) → řiď gap ramen z bloom+pohybu; solo `pause()` nechá svět jasný+audio plný → dim/blur canvas + duck; obří `#msg` míchá WAVE/BOSS s dev-toggly (MUTED/FIXED-STEP/HITBOXY) → degraduj systémové na `toast()`, rezervuj #msg pro vlny/bosse (`design:33` "když všechno křičí…").
20. **Accessibility table-stakes** `[S–M]` — remap kláves (žádný neexistuje) + colorblind: nikdy threat jen v červené/zelené, párуj tvar/ikonu (8 % mužů red-green) + difficulty/assist toggly (aim-assist síla, extra-revive, pomalejší bleed-out) pro skill-mismatch co-op dvojici. To, co signalizuje "hotová hra 2026". (TLOU2/Celeste/Overwatch)

**Disciplína nad vším (pro-tah = RESTRAINT):** hit-stop a shake musí být **vzácné a škálované**; chroma/slow-mo jen pro vrchol. Hra co se třese pořád je horší než co se netřese nikdy. Postav knoby (trauma/intensity) → pak je stáhni dolů, dokud nepůsobí "zaslouženě".

---

## ZELDA VERDIKT — co sedí, co je OFF

**Klíčová poctivá volba: vaše páteř NENÍ BotW nonlinearita — je to *A Link to the Past* + *Tears of the Kingdom*.** Kopírovat špatnou Zeldu = takhle to pokazíš.
- BotW = jdi kamkoli, lez po všem. Vy = **řízená SW→NE diagonála, tvrdé boss-gaty, srázy >35° = ZDI.** Opak "lez po všem".
- **ALttP = gated overworld** kde nové eventy odemykají dřív-blokované průchody + **stejná mapa čtená s horšími pravidly** (Light→Dark World) = doslova vaše boss-gaty + dva akty.
- **TotK = stejná Hyrule re-kontextualizovaná + Depths** (temný podzemní svět) = přesně Object 704 + Akt 2.
→ **Ukradni BotW makro-čitelnost a "pull", ale ALttP/TotK STRUKTURU. Neimportuj BotW svobodu-ignorovat-všechno — rozpustila by páteř.**

**CO SEDÍ (top tahy):**
1. **Object 704 jako pravá "weenie" (landmark-kompas).** Jedna nezaměnitelná, odevšad viditelná dread-věž = kompas i cíl; viditelná z OBOU tras, unikátní silueta+nemocná záře; **eskaluje jak bossové umírají** (záře/siréna/plyn houstne → kompas se mění v odpočet). Věc, kterou obcházíš → roste touha jít DOVNITŘ → Akt 2 breach splácí touhu, kterou zasela sama geometrie. Beacons (ТЭЦ/věž/anténa) = každý JINÁ silueta+barva.
2. **Ukaž zámek dřív než klíč.** Squad musí *vidět* plyn/voda/sutina-gate (s boss-beaconem zarámovaným za ním) dlouho než ho umí otevřít. Mění vaše boss-gaty z "otevřely se dveře" na autorskou anticipaci. Téměř zdarma. + **boss = diegetický klíč viditelně** (tank boss JE to, co blokuje průsmyk → umře → konkrétní překážka co jsi viděl zmizí, bez tooltipu).
3. **Triangle-rule okluze na každém příjezdu k POI.** Zatoč cestu; schovej arénu za střední hřeben, ať squad **vyjede do reveal**. Váš heightfield engine už dělá trojúhelníky → je to *placement disciplína*, ne nová tech, a slouží to dreadu (schovej, co se spawnuje).
4. **"Tři pully v každém výhledu" + placená zvědavost.** Komponuj výhledy = beacon (orientace) + taktický pull (vysoká zem/hangár) + threat/curiosity (silueta side-POI). Optional POI musí platit něco SYSTÉMOVÉHO (zkratka/bok/heavy ammo), ne loot-šum. Co-op tvar: 90s odbočka co dva odpojí, zatímco ostatní drží = attraction loop + forced-interdependence v jednom.
5. **Stejná-mapa-horší-pravidla re-read.** Akt 2 = váš Dark World/Depths: zrada obrátí zvládnutou geografii v nepřátelskou (army hunter-patroly, řezané zásoby). Maximum obsahu z minima autorství = nejlepší přítel dvou-člověčího zákona.
6. **Shrine-filozofie holdout arén přes modulární kit.** Každé hlavní POI = jedna autorská bojová idea (letiště=otevřený kiting+tank; kolchoz=měkký kryt; továrna=dlouhé sightlines), složená z prověřeného kitu (kite-loop ring + 2 escape + 2-3 fronty + no-spawn bubble). Tak 5 POI působí ZÁMĚRNĚ, ne proceduálně.
7. **Diegeticky-čitelné zdi.** Materiál/silueta řekne pochozí-vs-blokované na první pohled; 0 neviditelných zdí. Poctivý OPAK BotW lez-pravidla → vaše >35° srázy čtou jako DESIGN, ne limit.

**CO JE OFF (přeskoč s rozmyslem):**
- **Lez-po-všem + stamina** → REJECT. Vaše zdi jsou zdi (správně — gunplay potřebuje committed ground engagement, dread potřebuje chokes co nejdou obejít). Vezmi jen *ducha*: traversal legibility, ne lezení. Nelep stamina meter na FPS.
- **Pomalá osamělá kontemplace** → klečí s co-op horor tempem. BotW exhale = šlofík; váš = zadržený dech (krátká ticha co stojí něco při odchodu).
- **Non-combat puzzle-traversal jako core verb** → špatný verb set (vy: shoot/breach/burn/hide/revive/drive/loot). Nelep sokoban do POI. *Výjimka:* co-op fyzický zámek (jeden drží generátor, druhý kryje) = "puzzle" co je vlastně forced-interdependence — to SEDÍ.
- **Totální nonlinearita** → rozpustila by páteř/křivku/zradu. Jste ALttP gated overworld, ne BotW anarchie. Svoboda co dáváte (N vs S trasa, které optional, Akt 2 free-roam) = správné množství.
- **Power-fantasy křivka** → co-op rozbíjí math (1-6 hráčů) + horor potřebuje zůstat zranitelný. Zděď Souls/Remnant "svět zůstává děsivý", ne BotW "stáváš se bohem". (Váš headcount-scaling boss HP = správný anti-Zelda fix.)
- **Hrdinský povznášející tón** → vy jste systémový horor opuštění. Ber Zeldu *strukturu*, ne *náladu*. Vaše weenie je rána, ne hrad k osvobození; vaše re-read mapa se ZHORŠÍ, ne vykoupí.

**AdventureCraft / voxel-Zelda úhel:** blocky engine dodá "promyšlenou Zeldu" čistě **čitelnou ikonografií + modulárními autorskými boxy, nula AAA artu** (= vaše situace). → funkce čte z voxel palety (gas-gate = nemocně zelený opar, breach = popraskané zdivo, fast-travel node = jedna nezaměnitelná silueta); modulární areno-kit; secret-room reward loop (fake zeď, skrytý sklep — co-op secret co potřebuje DVA); **lesní slice + jeho jeskyně = perfektní tutorial-box** = legenda gramatiky celé mapy ("skála = obejdi", "ústí jeskyně = interiér čeká", jeden hazard bezpečně).

---

## Doporučený první sprint
**Tier A (vše S, jedna větev):** #1 hit-stop · #2 trauma shake · #3 střelba/kill punch · #4 damage numbers · #5 ozvučené menu. → Pět malých změn, hra skočí o generaci, nula přidané grafiky. Pak Tier B (#6 hudební director, #8 směrový indikátor, #9 run-summary) jako druhý sprint.
**Zelda = level-design backlog** (ne kód teď): #1 weenie 704, #2 zámek-před-klíčem, #3 triangle-okluze — vepsat do world-map-vision spec až se bude stavět velká mapa.

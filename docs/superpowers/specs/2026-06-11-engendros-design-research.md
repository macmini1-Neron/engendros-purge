# ENGENDROS — Design Research: proč to lidi hrají + zákony game designu

**Status:** Výzkumný podklad k [white paperu](2026-06-11-engendros-white-paper.md). Není to spec — je to **evidence base**, ze které čerpají všechny navazující specy.
**Datum:** 2026-06-11 · **Metoda:** 6 paralelních PhD-level výzkumných subagentů (web: GDC, design literatura, akademické studie, dev postmortemy, Steam-review analýzy), s adversariální verifikací nejnosnějších tvrzení. ~390k tokenů.
**Komparativní hry:** STALKER, Escape from Tarkov, Hunt: Showdown, DayZ, Deep Rock Galactic, Darkwood, Lethal Company, Resident Evil, Alien: Isolation, Left 4 Dead, Hades, Helldivers 2, GTFO, RimWorld, Project Zomboid, Vampire Survivors, FTL.

> **Jak číst:** Část A = *proč to lidi hrají* (odpověď na otázku 1). Část B = *použitelný checklist zákonů* (odpověď na otázku 2). Části C–F = řemeslo po pilířích. **Část G = 🔴 red-flagy naší vize + mitigace** (nejdůležitější, akční). Část H = **doporučené úpravy white paperu** (na rozhodnutí).

---

## 0. Nejdůležitější zjištění: KONVERGENCE

Šest agentů zkoumalo nezávisle. **Nezávisle se shodli na stejných 4 rizicích** — to je nejsilnější signál celého výzkumu, ne náhoda:

1. **Pevná obtížnost / solo-brutál** poručuje *flow* (challenge≈skill) a SDT *competence*. Plně fixní model (Helldivers 2) dělá vyšší tiery solo „genuinely miserable".
2. **Délka běhu vs. permadeath:** roguelite frustrace je kalibrovaná na **20–30 min běhy**. Náš „svět" trvá hodiny/dny → ztratit ho jednou smrtí = **rage-quit** (pozdní-Tarkov nenávist). **Loss aversion je empiricky ~1,9–2×.**
3. **Committed loadout** uspokojí autonomii jen když je volba **informovaná** — jinak „daň za neznalost".
4. **Cute-horor sklouzne do komedie** (zvlášť 4-player), pokud se neaktivuje **chováním** a nedrží sound design.

Dobrá zpráva: **každé z nich má mitigaci, která zachová hardcore duši.** Viz Část G + H.

---

## A. PROČ TO LIDI HRAJÍ / co si nejvíc cení

**1. Řízený strach (benign masochism).** Mozek hlásí hrozbu, kortex ví, že je bezpečno — ta mezera dělá unikátní slast (Rozin). Pojistka (smrt, ztráta) musí *něco znamenat*, aby strach fungoval — proto vysoké sázky **zesilují** požitek, ne ho ničí. [Try Evidence 2025]

**2. Mistrovství (competence, SDT).** Ryan/Rigby/Przybylski (2006): uspokojení *autonomie + competence + relatedness* nezávisle předpovídá požitek i budoucí hraní. V survivalu se competence **vydře** — nedá se koupit ani přeskočit — proto je tak silná.

**3. Emergentní příběh = „MŮJ příběh".** DayZ výzkum (Karlsen 2017): hráči mluví o každém životě jako o *vlastním příběhu*. STALKER A-Life (svět žije bez tebe) to rozšiřuje na celý svět. **Nenaskriptované = zapamatovatelné** („kdyby to byl skript, nezajímalo by mě to" — Klabnik o DayZ).

**4. Smysl pro místo (svět jako postava).** STALKER „Zóna" je opěvovaná jako spoluhrdina, ne kulisa. Svět-jako-*místo* (ne *level*) je prvořadý retenční driver.

**5. Cyklus napětí→úleva** je emoční motor. Adrenalin→dopamin→endorfin. Konstantní maximum = otupění; **kontrast** dělá hrozbu ostrou.

**6. Loot/chamtivost (variable-ratio).** Skinnerův variabilní poměr = nejodolnější vůči vyhasnutí. Klíč: nalezená věc musí být **nekoupitelná** jinak (Diablo III aukční síň zabila dopamin loop). Tarkov greed („ještě jeden kontejner") = nejčastější příčina preventabilní smrti.

**Co hráči sami uvádějí jako NEJLEPŠÍ** (ze Steam reviews / dev surveys):
- STALKER: atmosféra + identita světa, gunplay, „víc STALKERa = dobře".
- Hunt: priority hráčů = **(1) anticipace & plánování, (2) skill expression, (3) potvrzení postupu, (4) interakce se světem, (5) zápas & vítězství** — *příprava* a *vyjádření* jsou ceněnější než samotné překonání.
- DayZ/Zomboid: **emergentní vyprávění** = nenahraditelné („tvůj vlastní zombie film").
- Lethal Company ($5,7M, solo-dev): **sdílený děs + smích v proximity chatu** = obsah, který se sám šíří.

**Co žene CHURN:** cheateři; **zrazená důvěra od vývojáře** (Tarkov $250 edice); strmá bariéra bez onboardingu (Hunt: ~40 % hráčů nikdy nezabije); **grind, co nerespektuje čas**; bugy (imerzivní svět je *křehčí* — rozbitý quest = zrada); otupění z nepřetržitého napětí; „přestane to být zajímavé" po zvládnutí systémů (Tarkov ~50 h → proto wipy).

---

## B. ZÁKONY GAME DESIGNU — použitelný checklist

Odvozeno z MDA, Flow (Csikszentmihalyi/Chen), SDT/PENS, Bartle/Quantic Foundry, Magic Circle, Game Feel (Swink), Schellových „lenses", Pinelle herních heuristik, GMTK fair-difficulty.

### TIER 1 — NEPORUŠITELNÉ (porušení ukončí běh/sezení natrvalo)
- [ ] **L-01 Čitelná smrt.** Každá smrt má čitelnou, přiřaditelnou příčinu. Žádné neodvratné instakill z off-screenu.
- [ ] **L-02 Telegrafovaná hrozba.** Každý útok Engendros má pre-attack tell (animace/zvuk/vizuál) 0,3–0,5 s před zásahem. *(Cute voxel vzhled pracuje PROTI čitelnosti hrozby — musíš to vykompenzovat.)*
- [ ] **L-03 Každá smrt něco DÁ.** Rank XP + střípek příběhu + meta-zdroj + znalost. Nulový zisk = zničená motivace. (Hades.)
- [ ] **L-04 Krátká retry smyčka.** Minimalizuj čas smrt→zpět-do-akce.
- [ ] **L-05 Responzivita ovládání** do 1/10 s (Schell #63, Swink).
- [ ] **L-06 Konzistentní pravidla.** Svět hraje stejně vždy; AI je naučitelná.
- [ ] **L-07 Čitelný stav** (HP, munice, směr hrozby, cíl) bez přerušení akce.

### TIER 2 — KRITICKÉ (porušení nabaluje tření přes sezení)
- [ ] **L-08 Integrita 30s smyčky.** Jádrový boj s Engendros musí bavit *izolovaně*, v prázdné místnosti.
- [ ] **L-09 Viditelný růst competence.** Selhání = zpětná vazba, ne náhoda.
- [ ] **L-10 Zachovaná autonomie.** Každá vynucená akce, kterou hráč nezvolil, je výběr důvěry — musí mít viditelný payoff.
- [ ] **L-11 Relatedness v co-opu.** Každá role je vnímatelně nepostradatelná (DRG).
- [ ] **L-12 Žádná umělá obtížnost.** Obtížnost z naučitelných systémů, ne z RNG/HP-sponge/off-screen/skrytých pravidel.
- [ ] **L-13 První výhra do 10 minut** (onboarding competence).
- [ ] **L-14 Juice na každé akci.** Střelba/smrt/zranění/exploze nesou screen-feedback (zvuk, shake, particles). **Největší dopad za nejmíň práce.**

### TIER 3 — DŮLEŽITÉ
- [ ] **L-15 Progresivní odhalování složitosti** (neuč všechno předem).
- [ ] **L-16 Smysluplné volby loadoutu** (žádná dominantní strategie; Schell #39).
- [ ] **L-17 Skrytá informace je naučitelná** (Hunt no-minimap je OK, když se dá protihrát).
- [ ] **L-18 Pacing: cykly napětí-úleva** (navržené klidové zóny).
- [ ] **L-19 Přístupný vstupní bod** (do 2 min víš, co dělat, bez externího guidu).
- [ ] **L-20 Vyvážené feedback loopy** (meta-progrese vnímatelná, ale netrivializující).

---

## C. SURVIVAL-HOROR — řemeslo (jak udržet horor přes nekonečno)

**Tři módy strachu:** jump-scare (nejméně trvanlivý, rychle vyhasne) < dread/napětí (z *nejistoty*) < psychologický/existenciální (nejtrvanlivější, přežívá zvládnutí mechanik). **Horor přes dlouhou hru přežije jen když se vrství všechny tři.**

**„Back-half problem" (tvůj nejtěžší problém):** brzy = hráč slabý/nevědomý/v nouzi = max děs; pozdě = „loaded for bear", nepřátelé jsou naučené vzorce → designéři pivotují na akci. **Naše nekonečno + fixed difficulty + power creep tohle riziko maximalizuje.** Řešení (z výzkumu):
- **Eskalace NOVOSTÍ, ne čísly.** RE Village factory funguje novými *vzorci chování*, ne větším HP. Yuppie Psycho: v půlce restrukturalizuje model hrozby → známé prostory zase cizí.
- **Prostředí jako trvalý protivník.** STALKER drží horor po zvládnutí mechanik, protože **Zóna sama** (anomálie, radiace, počasí, emergentní AI) je nedeterministická. **Náš ekvivalent: пух / počasí / noc.** Geiger-counter logika: dej hrozbě *zvuk/info*, aby byla hmatatelná, ale ne plně vyhnutelná.
- **Loss-aversion strach pro veterány.** DayZ: i expert se bojí ztráty, protože postava = nasbíraný čas/identita. Náš strict permadeath + rank/banka na stole = správný horor-design pro veterány.

**AI Director (Left 4 Dead / Alien: Isolation):** napětí je *řízený zdroj*. L4D sleduje „stress gauge", žene hráče do diskomfortu, pak uleví — jako hudba. Alien: dvě mozky — makro „menace gauge" cyklí xenomorpha front-stage/backstage; mikro AI loví **jen svými senzory** (ne vševědoucně). „Psychopatická serendipita" bez podvádění (jen 2 teleporty za celou hru). **→ Použij den/noc cyklus jako náš makro-Director:** den = sběr/úleva, soumrak = anticipační vrchol (Mr. X kroky), noc = plná hrozba + odemčené noční chování, úsvit = vydobytá (ne zaručená) úleva.

**Cute-horor aktivace (FNAF / uncanny valley):** horor je v **porušení očekávaného kontextu**, ne ve formě. Plyšák má *vypadat* roztomile a **JEDNAT špatně** — špatné načasování, otočení hlavy moc daleko, kontextově nevhodné zvuky (tiché broukání při lovu), zvuky vycpávky/stehů při pohybu. **Hrát to vážně, ne ironicky** (mrkne-li hra na absurditu, hráč se směje a děs zmizí). Dvě selhání: cute čteno jako *komedie* nebo jako *neškodné*.

**Zvuk = primární nástroj strachu.** Conditioning (zvuk = nebezpečí), dynamická hudba jako proxy hrozby, **ticho** jako vrchol napětí. Každý typ Engendros = vlastní audio-signatura, kterou se hráč naučí číst z dálky (Mr. X kroky). **Máme procedurální audio — tohle je stavitelné.**

---

## D. ROGUELITE / NEKONEČNO

**„Smrt musí vždy něco posunout"** (Hades): příběh, měna, znalost, unlock. Hráči *chtějí* umřít kvůli dialogu. **Meta-progrese ROZŠIŘUJE možnosti, nekompenzuje skill** (+15 % HP za 50 smrtí = grind daň).

**Eskalace jako DRG hazard = více os naráz, ne lineární HP.** Každý tier-přechod MUSÍ přidat nové chování (flanker, crawler, armored vyžadující jinou ráži, koordinovaný breach z více směrů, „commander" mini-boss). **Nikdy bullet-sponge** („vždy snazší naprogramovat víc HP než dobrou AI" = false difficulty).

**Co má přežít wipe (nad rank+banku):** lore-kodex (nasbírané střípky příběhu), osobní rekordy per-POI, **1–2 pasivní perky/tier** (ne gear — playstyle: tichý reload, kratší bleed-out), kosmetické prestiž markery (Hunt model), přednabité map-intel. **NEpřežije:** gear, stav světa, vyčištěné POI, stash, opevnění — to JE reset.

**„Early-game tax" (Vampire Survivors):** veteráni nesmí znovu projíždět zvládnutý obsah. **Rank = rychlý start:** předkoupený loadout se slevou, částečně postavené opevnění na startu, přednabité intel které POI jsou na jakém tieru.

**Délka běhu (zásadní):** roguelite permadeath je kalibrovaný na 20–30 min. **Náš svět trvá hodiny → viz Část G/H (oddělit squad-wipe od world-wipe).**

**Wipe = událost, ne vymazání** (Tarkov): „legacy summary" náhrobek (přežité vlny, bossové, lore, banka), nový svět vždy přinese *něco nového*, banka jako kotva (nový start citelně silnější). Tarkov 2025 řešení nenávisti k wipe: **sezónní postavy vedle permanentních** (opt-in).

---

## E. CO-OP & EMERGENTNÍ PŘÍBĚHY

**Strukturální vzájemná závislost (ne volitelná):** když lze plně uspět solo, co-op je jen aditivní. Navrhni mechaniky, které **vyžadují** víc lidí: suppression+flank, jeden ošetřuje/druhý kryje, dva breach body naráz. **Krvácení, co nezvládneš sám sobě = nejčistší interdependence.** (DRG: každá třída dělá, co jiná neumí.)

**Komunikace jako mechanika** (GTFO: terminál kódy diktuje spoluhráč). **Hloubka systémů × jejich kolize = palivo emergentních příběhů** (RimWorld/DayZ): oheň + kontaminace + AI agrese + omezené léky + bleed-out = příběh se píše sám. **Máme přesně ty ingredience** (destrukce+oheň+kontaminace+AI).

**Intro-masakr je co-op pojivo:** přežili jste *společně náhodou* = nejlepší fikce pro relatedness (sdílené trauma, „jsme všechno, co zbylo").

**Mrtvý→spectate nesmí být nuda** (hlavní zabiják engagementu při dlouhých bězích!):
- **Asymetrické rádio po smrti** — mrtvý MŮŽE mluvit na živé, ale **vysílání přitahuje Engendros** (taktický přínos i závazek, ne pasivita).
- **Širší taktický overlay** pro mrtvého (vidí 4 za západní zdí, živí ne) = unikátní příspěvek.
- **Re-insert** po prodlevě jako čerstvý operátor s omezeným vybavením, za cenu týmu (fikce: další z jednotky slyšel signál).
- **CPR revive = signature divadlo:** celý tým to slyší (frenetické oživování, blížící se Engendros, spoluhráč kryje). Reviver zranitelný (zpomalen, nemůže střílet, grunty lákají). **Náš 30-click CPR má správné kosti** — vyladit: 1. pád ~45–60 s, 2. pád ~25–30 s + delší revive, 3. pád = smrt s **kinematickým momentem** (tým slyšitelně reaguje).

**Fixed vs scaled (důležitá nuance):** DRG NENÍ čistě fixní — uvnitř zvoleného hazardu **mírně škáluje** dle počtu (solo dmg 0,70 vs 1,00) + Bosco kompenzuje. Helldivers 2 = čistě fixní → vyšší tiery solo „brutálně tvrdé až nehratelné". **Doporučení: nech *kategorii* hrozby fixní, ale *intenzitu* (hustota/agrese) lehce track na počet nasazených — i mrtvý spoluhráč sníží count.**

**Anti-griefing:** náš friend-room (5-znak kód) + host-authorita to z velké části řeší. Posílit **sdíleným zdrojovým poolem** (Lethal Company: chamtivost jednotlivce škodí všem) a **squad-fikcí jako sociální smlouvou**. Konkrétně: **lékárny self-use s viditelnou akcí „Sdílet"** (hoarding vyžaduje záměr = sociální accountability); **munice plní nejprve nejchudšího** (DRG); **naše „ground-ammo plní jen drženou zbraň" je náhodou silný anti-hoarding** — rozšířit filozofii na zdraví. Hunt: Showdown úplně zakázal lootit spoluhráče.

**Diegetické pojmenování = referenceovatelné příběhy:** generuj **kódový název běhu** («Операция ОЗИМЫЙ ХЛЕБ») a **pojmenované vlny/události** («Волна 7: ПОСЫЛКА», «КРАСНЫЙ ПРИЛИВ»). „Pamatuješ Озимый хлеб, málem nás to dostalo u 9. vlny?" je příběh; „pamatuješ ten běh?" není. Sovětský rádio/gramofon jako AI-Director signál (intenzita hudby ~ nebezpečí).

**4-player tilt do dark-komedie je nevyhnutelný** (Lethal Company) → **lež do toho** (sovětská alt-historie s plyši = dark-comedy survival horor je správný registr), a horor reklamuj přes **momenty izolace** (recon sólo, oddělení kolapsem), **sound design** (GTFO drží děs i ve 4) a **chytrou AI**.

---

## F. LOOT & EKONOMIKA

**Variable-ratio funguje jen s NEpředvídatelností:** nalezená věc musí být **nekoupitelná** jinak (Diablo III aukce → drop = „zlato v nepohodlnější formě" = mrtvý loop). **Náš „v poli se nenakupuje" tohle chrání — drž to.**

**Loot architektura = tag-matching (DayZ CLE), ne placatý random:** každá věc nese Kategorii (zbraň/léky/palivo/cennost/spec) + Lokaci (military/lab КОЛЫБЕЛЬ/industrial/klinika/depo/kancelář/farma/obytné). Každé POI nese 2–3 lokační tagy. **Prázdný kontejner = záměrná položka tabulky** (scarcity = horor), ne bug.

| Threat tier | Prázdné | Rarita floor | Speciál |
|---|---|---|---|
| 0 step | 60 % | common | — |
| 1 vesnice/farma | 45 % | common–uncommon | — |
| 2 industrial/depo | 35 % | uncommon–rare | palivo/díly |
| 3 military | 20 % | rare–epic | zbraně/pancíř |
| 4 lab КОЛЫБЕЛЬ | 10 % | epic–legendary | unikáty/spec |

**Dvojí napětí scarcity:** *nedostatek* žene DovNITŘ (risk), *nasbíraný loot* žene VEN (konzervatismus) — to je smyčka. **Anti-frustrační podlaha pro léky:** po >50 % HP ztrátě bez nálezu eskaluj med-spawn v dalších 3 kontejnerech (neviditelně). **Threat-tier brání lepší loot** (riziko=odměna, geograficky čitelné).

**Ekonomika — dva pooly:** **Hodnost/XP = TRVALÁ** (odemyká tiery obchodu; Tarkov loyalty × Hunt bloodline) + **Peníze = riskované** (vyděláš v běhu, utratíš na startu dalšího). **Power-matching:** lineární faucet (kill cash) potřebuje **opakovatelné sinky** (spotřební munice/léky/palivo, oprava, kosmetika), jinak saturace → mizí napětí. **Sinky musí být VOLBY, ne daně.** 4 rank-tiery; tier 1 vždy hratelný; **anti-destituční podlaha** (nůž + free základ vždy zabije nižší tier). **Nikdy neznehodnoť banku** (= pojistka proti loss aversion). **Anti-hoarding:** lepší gear musí dávat *citelně* lepší výsledek, ne marginální (jinak lidi nosí nůž a šetří dobrou zbraň „na potom" — early Tarkov hatchet-running).

---

## G. 🔴 RED FLAGY NAŠÍ VIZE + MITIGACE

| # | Riziko (naše rozhodnutí) | Co poručuje | Mitigace (zachová hardcore) |
|---|---|---|---|
| **1** | **Wipe = reset celého světa** po dlouhém běhu | Loss aversion ~2×; kolektivní trest; rage-quit | **Oddělit squad-wipe od world-wipe** (viz H1). „Legacy náhrobek". Banka/rank vždy přežijí + **viditelně**. „Zabankovat 1 předmět" přes waypoint. |
| **2** | **Pevná obtížnost / solo-brutál** | Flow + SDT competence; solo neviditelný strop | **Lehce škálovat intenzitu na počet nasazených** (DRG, i mrtvý sníží count) NEBO **AI druh («срочник»/Bosco)** NEBO solo = „INFILTRACE/EXTREME" + soloitelné rané vlny. Tier 4/5 ladit na squad 2–3, ne 4. |
| **3** | **Committed loadout + bez nákupu v poli** | Autonomie jen když informovaná | **Recon/intel okno před deployem** (typ hrozby, ne jen tier) + **scavenge adaptace** (slabší nalezené zbraně). Garantovaný 1 ammo-box k startovní zbrani do 3 min. |
| **4** | **Strict permadeath → spectate** (dlouhý běh) | Dlouhý spectate = nuda; zabiják engagementu | **Mrtvý = taktický duch** (rádio s cenou, širší overlay) + možnost **re-insert**. CPR = signature moment. |
| **5** | **Cute plyšáci** v co-opu | Sklouzne do komedie / neškodnosti | **Chování špatně** (timing, hlava, zvuky vycpávky) hrané vážně; audio tells; momenty izolace; chytrá AI. Přijmi dark-comedy registr a lež do něj. |
| **6** | **Nekonečno + power creep** | Horor fatigue (back-half) | Eskalace **novostí** (nové chování/tier), ne HP. Prostředí (пух/počasí/noc) jako trvalý protivník. Loss-aversion strach pro veterány. |
| **7** | **„Velmi chytrá AI"** | Vševědoucí AI = frustrace, ne děs | AI loví **jen svými senzory** (zvuk/zrak), férově obejitelná (Alien: Isolation). „Skoro jsem unikl" > „vždy mě najde". |
| **8** | **Scavenge-only + scarcity** | Může sklouznout do tedia / hladovění | Anti-frustrační podlaha (léky); garantovaný minimálně-hratelný kit v 1. čtvrtině běhu; tag-logika (prázdno u military OK, prázdno u jediné kliniky ne). |
| **9** | **Voxel-cute vzhled** | Pracuje proti čitelnosti hrozby (L-02) | Investuj do **odlišných siluet útoku + audio tells**; ne dělat Engendros „škaredější", dělat je *jednající špatně*. |
| **10** | **Rank gate obchodu** bez raných sinků | Stagnace pocitu postupu | Opakovatelný spotřební sink na každém tieru (i rank 1 řeší „2. zásobník vs šetřit na pušku"). |

---

## H. Doporučené úpravy white paperu (NA ROZHODNUTÍ)

Tohle nejsou hotové změny — **doporučení k odsouhlasení**. Každé zachovává tvou vizi a řeší konkrétní red-flag.

**H1 — Oddělit „squad umřel" od „svět skončil" (nejdůležitější).**
Místo „kdokoli z týmu padne 3× → wipe → reset světa" zvážit:
- Squad-wipe běhu → spendne 3-revive životy → **návrat do lobby, přegear, zpět do TÉHOŽ světa** (svět persistuje).
- **Svět se resetuje až při klimaktickém vrcholu** — reinfestace dosáhne maxima napříč všemi POI = **«Красный прилив / Rudý příliv»** (hustota Engendros vrcholí, finální boss dostupný).
- → „Ztratil jsem 10 h blbou smrtí" se mění na „svět nás nakonec pohltil" = **vyvrcholení, ne trest**. Architektonicky = Tarkov (raidy padají pořád, wipe je samostatná makro-událost).

**H2 — Solo mitigace.** Doplnit do §10: buď lehké škálování intenzity na počet nasazených (kategorie hrozby fixní), nebo AI-druh «срочник», nebo explicitní „INFILTRACE" rámec se soloitelnými ranými vlnami. Tier 4/5 ladit na 2–3, ne 4.

**H3 — „Každá smrt něco dá".** Doplnit: rank XP vždy + **lore střípek** + **čitelná příčina smrti** (2 s readout) + **legacy/náhrobek** obrazovka při world-wipe.

**H4 — Informovaný commitment.** Doplnit do §5/§6: **recon/intel okno** před deployem (typ hrozby) + scavenge adaptace + garantovaný startovní ammo-box.

**H5 — Eskalace novostí.** Upřesnit §8 threat-tier: každý tier MUSÍ přidat nové chování/archetyp, ne HP. (Tabulka tier 0–5 v Části D/F.)

**H6 — Co přežije wipe.** Rozšířit §9: + lore-kodex, osobní rekordy, 1–2 pasivní perky/tier, kosmetické prestiž markery, přednabité intel (rank = rychlý start, řeší „early-game tax").

**H7 — AI se senzorickými limity.** Doplnit §6⑤/§7: Engendros loví zvukem/zrakem, férově obejitelní; sound-first tells per typ.

**H8 — Den/noc jako AI-Director.** Upřesnit §6⑥: den=úleva/sběr, soumrak=anticipační vrchol, noc=plná hrozba+noční chování, úsvit=vydobytá úleva. Cute-horor aktivace přes chování+zvuk (§7).

---

## Zdroje (výběr; plné citace v jednotlivých agent-reportech)

**Frameworky/akademie:** Hunicke/LeBlanc/Zubek — MDA (AAAI 2004); Csikszentmihalyi — Flow / Chen — Flow in Games (USC); Ryan/Rigby/Przybylski — SDT/PENS (Motivation & Emotion 2006); Salen/Zimmerman — Magic Circle; Swink — Game Feel; Schell — Art of Game Design (lenses); Pinelle/Wong/Stach — Game Usability Heuristics (CHI 2008); Koster — Theory of Fun; Quantic Foundry — Gamer Motivation Model.
**Horor:** Frictional Games „9 Lessons on Horror"; Thompson — „Perfect Organism" (Alien: Isolation AI); Bycer — „Back Half Problems of Horror"; Booth — L4D AI Director (GDC 2009); DayZ permadeath (Karlsen 2017); STALKER A-Life; uncanny valley (Mori).
**Roguelite/ekonomika:** Kasavin/Supergiant — Hades narrative (Game Developer/GDC); DRG difficulty scaling (wiki); Tarkov wipe/traders; Hunt bloodline; Cook — Value Chains (Lost Garden); Lehdonvirta — sink design (GDC 2014); Madigan — psychology of Diablo loot; Tomé et al. — loss aversion (CHI PLAY 2020); DayZ CLE; Grid Sage — designing for mastery.
**Co-op:** GTFO/Lethal Company/Helldivers 2/DRG design docs; RimWorld/Dwarf Fortress emergent storytelling (Game Developer); ACM 2024 — meaningful distrust; co-op revive/death design (Game Developer).

*Plné URL seznamy jsou v transkriptech 6 výzkumných agentů této session.*

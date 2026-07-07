# ENGENDROS — White Paper (vize celé hry)

**Status:** v0.3 — schválená vize (brainstorming + clarifikace + design-research review hotové). Toto je **severní hvězda**, ne implementační plán. Jednotlivé pilíře se rozepíšou do vlastních speců (viz §14).
**Datum:** 2026-06-11 · **Autoři:** Tomáš (+ bratr), Claude
**Větev:** `feat/playable-demo` (white paper sdílí domov s prvním vertical slice = current demo)
**Předchůdci:** `docs/superpowers/plans/2026-06-11-playable-demo-program.md` (engine demo) · `docs/superpowers/RESULTS-demo.md`
**Výzkumný podklad:** [`2026-06-11-engendros-design-research.md`](2026-06-11-engendros-design-research.md) — proč to lidi hrají + zákony game designu + 🔴 red-flagy naší vize s mitigacemi (6 PhD-level výzkumných agentů). **Část H toho dokumentu navrhuje konkrétní úpravy tohoto white paperu — k rozhodnutí.**

> **Pozn. k jazyku:** dokument je česky (vlastníci jsou Czech-speaking). Klíčové herní/lore termíny nesou azbuku + překlad; viz slovníček §15.
> **v0.2 změny:** škrtnut „extraction" mechanismus (žádný extract-or-lose); upřesněn perzistentní svět + **wipe = kompletní reset světa**; obchod **jen v lobby**; **žádní lidští NPC** (PvP odloženo); boss-instance **bezešvé jen na boss-místech** (jinak detailní interiéry na mapě); doplněn sběr/váha/kontaminace.
> **v0.3 změny (po [design-research](2026-06-11-engendros-design-research.md) review, §H):** intenzita **lehce škáluje dle počtu hráčů** (H2); **„náhрobek" stats-screen + rank XP animace** při smrti (H3); loadout committed, jen **scavenge adaptace** (H4); eskalace tieru **NOVÝM chováním, ne HP** (H5); reset přežijí navíc **lore-kodex + osobní rekordy** (H6); AI **silné smysly, ne vševědoucnost** (H7); **cute = JEN Engendros, svět syrový; ULTRA-těžké i ve dne, noc = snížená viditelnost** (H8). **H1 zamítnut** — binární wipe=reset ponechán.

---

## 0. Co je tento dokument

Doposud byl ENGENDROS PURGE voxel **wave-shooter v aréně** (Zumbi-Blocks / de_dust2) proti plyšovým zombie. Organicky se ale stočil do bohatého **sovětského světa** (jukebox, tanky, letiště, bunkry, gramofon, hrdinské menu) a nově dostal **vážný engine** (terén, destrukce, šíření ohně, fixed-step simulace — viz current demo `?map=demo`).

Tento white paper **natvrdo ukotvuje, kam hra směřuje**: ze hry-arény se stává **sovětský survival-horor v otevřeném světě** s **roguelite kostrou na úrovni celého světa**. Je to vize, na kterou se napojí všechny budoucí specy a implementační plány.

---

## 1. Vize & logline

**Logline:** *Tým speciální jednotky, obětovaný vlastním státem, přežívá v karanténní zóně zamořené plyšovými golemy z utajeného sovětského programu — voxelově roztomilé na povrchu, ultra-hluboké a syrově realistické pod kapotou.*

| Osa | Rozhodnutí |
|---|---|
| **Duše** | Sovětský **atmosférický survival-horor**; jediná surrealita = Engendros |
| **Tón** | **Survival-horor** — nouze, strach, zranitelnost; „těžké, ale zábava" |
| **Žánr** | Open-world survival + boss-komplexy, **roguelite na úrovni světa**, **co-op-first** (3–4), soloitelné (těžké; intenzita lehce škáluje dle počtu) |
| **Realismus** | Uvěřitelně-realný základ, ale **6 pilířů jde do ultra-real simulace** |
| **Éra** | Alternativní **80.–90. léta, funkční SSSR** (žádný rozpad) — problém má *jen tahle oblast* |
| **Délka hraní** | **Nekonečná** (reinfestace + eskalace; wipe → reset světa, rank přežívá) |

---

## 2. Design soul (severní hvězda)

> **Kde nevyhrajeme grafikou (není to Unreal Engine 5), vyhrajeme KÓDEM, mechanikami a simulací.**
> Voxel-cute povrch + ultra-hluboké systémy pod kapotou. Hra je **těžká hrát i uspět**, ale **baví**.
> **Jediná surrealita = Engendros.** Všechno ostatní je uvěřitelný, syrový východní blok.

### Šest pilířů hloubky (vše ultra-real)
1. **Balistika & zbraně** — reálný spad střely, penetrace, čas letu, zahřátí hlavně, pádný recoil a zacházení. *(Zbraně jsou spolehlivé — žádné záseky/údržba, viz §6.)*
2. **Vozidla & technika** — reálná jízda/pancíř/role; **ultra-vzácná**, těžké zprovoznit (palivo, oprava).
3. **Survival & medicína** — krvácení & ošetření, **zranění končetin**, **infekce/radiace/kontaminace** («пух»). *(Vědomě BEZ hladu/žízně/teploty — není to „life-sim", je to survival-horor.)*
4. **Destrukce & prostředí** — per-ráže poškození, breaches, kácení/hoření stromů, šíření ohně (engine už stavíme).
5. **AI nepřátel** — zombie chování, ale **herně velmi chytrá** (pathing, obchvaty, koordinace, využití terénu a destrukce).
6. **Simulace prostředí** — den/noc + **dynamické počasí** (déšť/mlha/sníh/bouře) ovlivňující viditelnost, chování Engendros i survival; **noc nebezpečnější**.

Tyto pilíře jsou to, čím se hra odlišuje — ne textury, ale **chování a funkčnost**.

---

## 3. Svět: éra, místo, tón, art

- **Éra:** alternativní **1980s–90s**, **plně funkční sovětský režim**. Svět venku je normální SSSR; *naše* oblast je utajená katastrofa.
- **Místo:** **fiktivní sovětská oblast** — maximální tvůrčí volnost. Jedna **velká bezešvá mapa (2500×2500 od startu)** s biom-zónami: lesní step → průmysl (kombinát/ТЭЦ) → vesnice/kolchoz → mokřad → kopce. Stavíme na stávající stepi (`?map=steppe`, `src/openworld.js`, `src/grid.js`).
- **Tón:** **survival-horor.** Zdroje docházejí, smrt je blízko, jsi zranitelný. **ULTRA-těžké pořád** — žádná „denní úleva" fáze; **noc = jen snížená viditelnost** (tma), ne samostatný spawn-surge. Úleva je jen jemná (mezi střety / za vlastní fortifikací).
- **Art direction:** **cute = JEN Engendros mobové.** Všechno ostatní (svět, prostředí, hráč, výbava) je **syrové, beznadějné, drsné**. Ta disonance (roztomilí plyšáci vs bezútěšný svět) JE motor hororu. Tíseň dělá světlo, tma, mlha, počasí, zvuk a *to, co ti ti roztomilí tvorové dělají*.
- **Audio:** stávající procedurální Web-Audio základ + sovětská hudba (ФОНОТЕКА/gramofon) — diegetická hudba v kontrastu s hrůzou je silná.

---

## 4. LORE

### 4.1 Materiál: «ПЛЮШТАЛЬ» (Pljuštal — „plyšocel")
Sovětský syntetický **textil-kompozit**: *měkký jako medvídek, pevný jako pancíř* (плюш + сталь). Samoopravný, pohltí tlakovou vlnu. Mírně **radio-reaktivní vlákno** (napojení na atomový program).

### 4.2 Program: «Объект 704 ‹КОЛЫБЕЛЬ›» (Objekt 704 „Kolíbka")
V uzavřeném naukográdu. Cíl: **autonomní ochranné golemy** z ПЛЮШТАЛЬ — „živá měkká broň" pro vojáky a práci v radiačním prostředí (reaktory). Aktivace materiálu = **«нейтронная закалка»** (neutronové zakalení), které vlákno propojí s atomovým programem. *(Název „Kolíbka" je záměrně mrazivý — kolébka zbraně i ozvěna hraček/dětí.)*

### 4.3 Katastrofa
Aktivované vlákno se začalo **samo organizovat** — zamořovat živou tkáň i jiný textil. Výsledek = **Engendros**. Do vzduchu se uvolňují vlákna — **«пух»** (chmýří) — krásně poletující, ale **kontaminační/radiační** (váže se na medicínský pilíř, viz §6).

### 4.4 Stát
Režim oblast **uzavřel karanténou** a **obětoval všechny uvnitř** — utajení zbrojní katastrofy. Stát je vzdálený, chladný; ty jsi odepsaný.

### 4.5 Hráč
**Voják speciální jednotky.** Hra začíná **výsadkem**, při kterém **celá squad padne** — přežiješ jen **ty + spoluhráči** (co-op = zbytek rozprášené jednotky). Jste sami, uvnitř, bez podpory.

### 4.6 Engendros — co jsou
Fikčně **zombie**: neúprosní, infekční, materiál „chce" se šířit. Nejsou ovladatelní (žádný mazlíček) — **čistá hrozba**. Drobní jednají instinktem; **boss-golemy si drží velitelskou inteligenci** programu. Herně viz §6⑤ + §7 — AI je velmi chytrá.

### 4.7 Vyprávění příběhu
**Žádná mluvící NPC** (v zóně nejsou živí lidé, viz §10). Pravda o programu se odhaluje **mixem prostředí + rádia**: nalezené deníky, terminály a počítače КОЛЫБЕЛЬ, nápisy, těla — plus **rádiový hlas velení / záhadná vysílání** (rozkazy, útržky, lži státu).

---

## 5. Jádrová smyčka (roguelite na úrovni světa)

```
┌─────────── LOBBY = VELITELSTVÍ (meta vrstva, jediné místo nákupu) ───────────┐
│  Hodnost (clearance) + Banka  →  rank-gated výzbroj + batoh + loadout         │
│  Tady žije PROGRESE. Tady se NIKDY neumírá. Tady se NAKUPUJE (v poli NE).     │
└───────────────┬──────────────────────────────────────────▲───────────────────┘
                │ VÝSADEK (committed — z pole se do lobby     │ WIPE celého týmu
                │  nevrací, dokud nepadne wipe)               │  → KOMPLETNÍ RESET SVĚTA
                ▼                                             │  (rank + banka přežívá)
┌──────────── PERZISTENTNÍ SVĚT (2500×2500 oblast, žije napříč sezeními) ───────┐
│  Roam: sandbox (sběr, čištění hnízd) + kontrakty (rádio) + objevování pravdy │
│  SBĚR všeho (munice/léky/palivo/díly/cennosti) — v poli se nekupuje          │
│  BOSS-KOMPLEXY = bezešvé instancované interiéry → milníky (bossové + pravda) │
│  REINFESTACE + ESKALACE: vyčištěné POI se časem znovu zamoří, silněji        │
│  KONTAMINAČNÍ zóny «пух» (ochrana/dekontaminace)                             │
│  SMRT: 3× CPR revive → pak mrtvý → spectate                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Roguelite na úrovni světa:** jeden „svět" = běh, který **persistuje napříč sezeními** (zapneš hru, pokračuješ, kde jsi byl; svět mezitím žil reinfestací). Po **deployi jsi committed** — z pole se do lobby nevrátíš, nenakupuješ; loadout volíš naslepo (žádné recon okno), ale v poli ho **změkčíš nalezenými zbraněmi** (scavenge adaptace = loadout není totální zámek). **Wipe celého týmu = kompletní reset světa**; **hodnost + banka přežívá** → utratíš nasbírané při startu **dalšího** světa. Cennosti zpeněžíš v lobby mezi běhy. Tím vzniká klasická roguelite meta-smyčka: *vyděláš v běhu N → utratíš na začátku běhu N+1; hodnost odemyká lepší obchod napříč mnoha běhy.*

**Proč lobby a ne in-world hub:** v poli **nejsou bezpečné zóny** (viz §11). Progrese i nákup se proto dějí v **lobby/velitelství** (diegeticky: brífink/rekvizice před výsadkem) — využívá stávající architekturu „lobby Armory → deploy".

---

## 6. Mechanické pilíře — detail

### ① Balistika & zbraně
Reálné: spad střely, čas letu, penetrace (váže se na destrukční materiálové tiery), zahřátí hlavně, realistický recoil/bloom/zacházení. **Zbraně jsou spolehlivé** — *žádné* záseky ani údržba (soustředíme se na balistiku a boj, ne na čištění). **Arzenál:** východní blok jako základ (Mosin, AK, SVD, PKM, RPG, Makarov…) **+ vzácné kořistěné NATO** kusy jako kontrast/trofej. *(Seznam zbraní = vlastní spec.)*

### ② Vozidla
**Ultra-vzácná.** Najít je je jen půlka — musíš je **zprovoznit** (palivo, oprava, díly). Odměna je mocná (tranzit po velké mapě + palebná síla). UAZ/auta/náklaďáky/motorka pro přesun; vzácně vysloužilá těžká technika. **Do boss-instancí se nedostanou** (proto bezešvé instancování interiérů).

### ③ Survival & medicína
- **Krvácení & ošetření:** typy ran, tourniquety, obvazy, krevní ztráta v čase — aktivní ošetřování.
- **Zranění končetin:** zlomené/raněné nohy & ruce mění pohyb a míření; dlahy, kulhání (Tarkov-style).
- **Infekce / radiace / kontaminace «пух»:** **zamořené zóny a oblaka «пух»** jsou jedovaté → potřebuješ **masku/oblek**, jinak nemoc/radiace; léčíš a **dekontaminuješ** se (STALKER-anomálie feel). **Nákaza → proměna v Engendros** hrozí **jen v extrémních/vzácných případech** (těžká kontaminace), ne běžně.
- **Mimo rozsah:** hlad/žízeň/teplota (ne life-sim); psychika/sanity (jen fyzické přežití).

### ④ Destrukce & prostředí
Engine z current demo (`src/destruct.js`, `src/forest.js`, `src/fire.js`, `src/terrain.js`): per-ráže poškození, materiálové tiery, HE breach, APFSDS, kácení & hoření stromů, šíření ohně (umírá na kameni). Dotáhnout do hloubky + napojit na AI (chytří Engendros to využijí/způsobí).

### ⑤ AI nepřátel
**Zombie chování + herně velmi chytrá AI.** Pathfinding na heightfield terénu, obchvaty, koordinace rojů, reakce na hluk/světlo/oheň, využití průlomů a terénu. **Loví silnými smysly (sluch/zrak), ale NE vševědoucně** — vyladěný střed: těžko úplně unikneš, přesto se dá férově oklamat (hluk/světlo tě prozradí). Vševědoucí AI je frustrující, ne děsivá. Boss-golemy = taktické chování + velitelská inteligence. *(AI design = vlastní spec; je to klíčový „depth via code" pilíř.)*

### ⑥ Simulace prostředí
Den/noc (máme) + **dynamické počasí** (déšť/mlha/sníh/bouře) ovlivňující viditelnost, zvuk, chování Engendros, survival. **Ultra-těžké je to ve dne i v noci** — žádná denní úleva. **Noc = hlavně snížená viditelnost** (tma), ne samostatný spawn-surge. *(Počasí systém = vlastní spec.)*

### Inventář & nošení
**Váhový/kapacitní limit** (kolik uneseš), ale **bez zpomalení pohybu** — limit nutí rozhodovat, co vzít. **Batoh** = kupovatelný v lobby → **extra sloty/kapacita** (upgrade). Sběr je plný: munice, léky, palivo, díly na opravy, cennosti (zpeněžit po wipe v lobby).

---

## 7. Engendros — roster, role, AI

**Materiálová rodina** (jedna „plyšová" estetika ПЛЮШТАЛЬ) škálující velikostí:
- **Roj** (drobní, rychlí, v počtu) — *budou předělaní od základu*
- **Voják** (střední, základní hrozba)
- **Těžký charger** (velký, prorážející)
- **Boss-golem** (obří, velitelská inteligence)

**+ funkční role:** střelec/pliváč (ranged), support, charger…
**+ vzácné varianty** (tematické/experimentální kusy pro pestrost).

**AI:** viz §6⑤ — neúprosní jako zombie, ale chytří v herní logice (silné smysly, ne vševědoucnost). **Cute-horor aktivace:** Engendros (jediná roztomilá věc ve hře) musí *jednat špatně* — špatné načasování pohybu, otáčení hlavy moc daleko, kontextově nevhodné/tlumené zvuky, zvuky vycpávky/stehů; hráno **vážně, ne ironicky** (jinak sklouzne do komedie). Reinfestace přináší v čase **silnější/jiné** složení (eskalace → nekonečno).

---

## 8. Struktura světa & nekonečno

- **Open world:** jedna **velká bezešvá oblast (2500×2500)**, biom-zóny + **síť POI**.
- **Normální budovy:** **ultra-propracované interiéry přímo na mapě** (bezešvé, choditelné) — to je standard.
- **Boss-komplexy = bezešvé instancované interiéry (à la GTA San Andreas), JEN na speciálních boss-místech:** vejdeš do dveří → **skrytý teleport** do mimo-mapové arény (např. podzemní komplex pod letištěm) → probojuješ se k bossovi → ven **jiným východem nebo zpět týmiž dveřmi** (dle level-designu). Hráč přechod nepozná. Důvody: kontrolovaný level-design pro boss fighty a **minihry**; reálné mega-interiéry by jinak byly neúnosné; **vozidlo se do boss fightu nedostane**. *(Instancing + level-design = vlastní spec.)*
- **Náplň výprav (mix):** emergentní sandbox (sběr, čištění hnízd) **+ volitelné kontrakty velení** (rádio: znič X / přines Y / ubraň Z) **+ objevování** POI a pravdy o programu.
- **Cíl jednoho světa = mix:** boss-komplexy a odhalování pravdy КОЛЫБЕЛЬ jako **milníky**, ale svět jede **nekonečně dál** (reinfestace eskaluje). Žádná pevná „výhra" — jen milníky uvnitř nekonečna; konec běhu = wipe.
- **Nekonečno = reinfestace + eskalace:** vyčištěné POI Engendros časem **znovu obsadí**, pokaždé **silnější/jiní**. Zvedá se **threat-tier** zóny → vyšší tier = víc XP/peněz/lepší loot (risk/reward). **Eskalace přidává NOVÉ chování/archetypy** (flanker, crawler, armored vyžadující jinou ráži, koordinovaný breach, commander mini-boss), **ne jen víc HP** (bullet-sponge = false difficulty). *(Detailní ladění tierů + roster = vlastní spec, až později.)*

---

## 9. Progrese & ekonomika *(mini-výzkum osvědčených modelů + doporučení)*

**Co funguje v žánru (Tarkov, Hunt: Showdown, Deep Rock Galactic, Darktide):**
- *Tarkov:* trader **loyalty levels** (hodnost u obchodníka odemyká lepší zboží) + tvrdá ztráta gearu.
- *Hunt: Showdown:* **Bloodline rank** (účtové XP) odemyká výbavu; per-hunter permadeath; **bloodline XP se NIKDY neztrácí**.
- *Deep Rock / roguelite:* per-běh odměny + **promotion/hazard tiery** + meta unlocks přežívající smrt = nekonečná eskalace.

**Doporučený model pro ENGENDROS (sedí na tvé „mob → XP na hodnost + peníze"):**
1. **Dvě koleje.**
   - **XP → Hodnost / Clearance** — *TRVALÁ*, přežívá reset světa. Odemyká **úrovně lobby-obchodu** (vyšší hodnost = lepší dostupná výzbroj) a přístup do těžších zón. (Tarkov loyalty × Hunt bloodline.)
   - **Peníze (banka)** — vyděláš v běhu, **utratíš v lobby na začátku dalšího běhu**; v poli se nenakupuje. Cennosti zpeněžíš mezi běhy. Banka přežívá wipe.
2. **Klíč pro „těžké, ale fér":** **wipe nikdy nebere progresi** (hodnost + banka jsou svaté; **navíc přežije lore-kodex** nasbíraných střípků příběhu a **osobní rekordy** = nejvyšší tier/vlna na POI); resetuje se jen **svět** (POI, nesený loot, postavené krytí, stav zóny). I **neúspěšný běh dá XP** → čas není nikdy zmarněný. *(Nepřežijí: gear, pasivní perky, fast-start — veterán začíná začátek nanovo, vědomě.)*
3. **Nekonečno přes eskalaci:** threat-tier zóny škáluje odměnu (víc XP/peněz/lepší loot na vyšším tieru).
4. **Sinky proti přebytku:** munice + léky + palivo jsou **spotřební** (survival-horor nouze); ceny gearu rostou s hodností; batoh/upgrady = další sink.

### Loot & spawn (kde se co bere)
V poli se nenakupuje → **přežiješ z toho, co najdeš**. Loot se generuje **na lokalitách / POI**, logicky:
- **Logické umístění:** typ lootu odpovídá místu — zbraně/munice u **vojenských pozic** (letiště, opěrný bod, ДЗОТ, zbrojní sklady), léky/zdravotnický materiál v **ošetřovnách / u sanitek / lékárnách**, **palivo** u dep/garáží/vozidel, **cennosti** (na prodej v lobby) v kancelářích/domech/správních budovách, vzácné **„programové" kusy** v laboratořích КОЛЫБЕЛЬ.
- **Randomizovaný drop:** každý spawn-point (skříň, bedna, tělo, polička, otevřené místo) si **hodí z loot-tabulky** vážené typem lokace + threat-tierem + vzácností. **Ne každý kontejner něco má** — nouze je záměr.
- **Per-svět seedované + host-authoritative:** loot je deterministický podle seedu světa (co-op host i klienti se shodnou); rolly běží na hostovi (`hostSim`). Využije stávající `LootManager` / `ITEM_DEFS`.
- **Regenerace s reinfestací:** vyčištěné/vylootěné POI se po reinfestaci **znovu naplní** (vyšší threat-tier → lepší loot) → návrat na místa má smysl (risk/reward).
- **Tři zdroje:** prohledávatelné kontejnery + volně umístěné předměty + **dropy z Engendros** (materiály, kontaminované kusy).

*(Přesné loot-tabulky, hustota spawn-pointů, vzácnostní křivky + co přežívá wipe = vlastní balanc spec.)*

---

## 10. Smrt, co-op, lidé v zóně

- **Smrt (striktní):** stávající **CPR revive** — spoluhráč tě zvedne. **3× a dost** → trvale mrtvý → **spectate** živé spoluhráče.
- **Wipe celého týmu** → **kompletní reset světa**, návrat do lobby. Hodnost + banka (+ lore-kodex + rekordy) zůstává.
- **„Náhrobek" stats-screen** (při smrti/wipe): nasbírané XP, peníze, zabití Engendros, zabití bossové (+ co vymyslíme) **+ animace progresu na XP baru hodnosti**. Smrt = záznam, ne jen vymazání (Hades zákon „každá smrt něco dá").
- **Co-op-first:** navrženo kolem **party 3–4** (intro = přeživší squady), ale **soloitelné** (těžké). **Obtížnost:** kategorie/threat-tier hrozby je fixní, ale **intenzita (hustota/agrese Engendros) lehce škáluje dle počtu nasazených** — i mrtvý spoluhráč sníží count; **nejvyšší tiery laděné na 2–3, ne na 4**. Solo zůstává tvrdé, ale ne nemožné. Stávající **host-authoritative** model (WebRTC / LAN-Hamachi) — nová autoritativní logika za `hostSim = !mp.active || mp.isHost`, `pstate` = pravda o životě.
- **Lidé v zóně:** **žádní živí lidští NPC** — jen ty (+ co-op) a Engendros. **PvP** (vetřelci-hráči, volba teamu pro interakci) = **možnost do budoucna, teď neřešíme**.

---

## 11. Base-building

**Jen dočasné krytí.** Pytle s pískem, improvizovaná obrana, mobilita první. **Žádné trvale bezpečné zóny** — Engendros se dostanou **úplně všude**; bezpečí si vydobudeš jen **tady a teď** vlastní fortifikací (rozšíříme stávající fortification systém `STRUCT_DEFS`, ale lehce — *ne* plný base-sim). Postavené krytí žije v perzistentním světě (do wipe), ale klid je vždycky jen na chvíli.

---

## 12. MVP — první vertical slice

**Cíl:** celá smyčka v malém, postavená **přímo na current demu**, v jednom regionu velké mapy.

**Obsah MVP:**
- **1 biom** — lesní step (už máme terén, les, groundcover).
- **1 boss-komplex** — jeden bezešvý instancovaný interiér + boss-golem.
- **Jádrová smyčka** — lobby gear-up → výsadek → roam + sběr → boj (balistika/medicína/survival) → boss → reinfestace → wipe = reset.
- **Kontaminace** — alespoň jedna zóna «пух» s ochranou/dekontaminací.
- **1 hodnost** — jeden krok progrese (XP+peníze → rank-gated nákup v lobby).

**Co už demo má (základ):** deterministický terén + walkable slopes, les (destruktivní/hořlavé stromy), destrukční core (per-ráže, APFSDS, HE), šíření ohně, nepřátelé/spawny na terénu, fixed-step simclock, co-op-safe destrukce. Viz `RESULTS-demo.md`.

**Co MVP přidává nad demo:** survival/medicína + kontaminace, smart-AI vrstva, bezešvý boss-interiér, lobby meta (hodnost/ekonomika/batoh), reinfestační cyklus + wipe-reset, survival-horor tón/art pass.

---

## 13. Co je vědomě MIMO rozsah (zatím)

Hlad/žízeň/teplota (life-sim) · psychika/sanity · ovládání/zajímání Engendros · degradace/záseky zbraní · hluboký base-building / trvalé pevnosti · pevný in-world hub · in-field nákup · recon/intel okno před deployem (jen scavenge adaptace) · lidští NPC · **PvP (odloženo na budoucnost)** · plné adaptivní DDA skrývající challenge (máme jen *lehké* škálování intenzity dle počtu, §10) · pasivní perky/fast-start přežívající wipe · roční období · realistická mm-RHA tank-vs-tank · ECS rewrite / externí fyzikální engine / navmesh (držíme voxel + stávající architekturu).

---

## 14. Navazující specy (každý vlastní brainstorm → spec → plán)

1. **Layout mapy & POI graf** — rozmístění biomů, ekotony, POI síť, boss-místa, kontaminační zóny *(pravděpodobně s vizuálním companionem)*.
2. **AI design Engendros** — chování, pathing, koordinace, boss-velitelství (klíčový „depth via code" pilíř).
3. **Survival & medicína** — model ran/dlah/krvácení/infekce/radiace, kontaminace «пух», UI.
4. **Arzenál & balistika** — seznam zbraní, balistický model, kořistěné NATO.
5. **Ekonomika & progrese balanc** — XP/cen křivky, drop tabulky, co přežívá wipe, threat-tiery, batoh/sloty.
6. **Boss-instance & minihry** — bezešvé instancování, level-design vzorů.
7. **Počasí & prostředí** — dynamické počasí, noční nebezpečí.
8. **Vozidla** — model jízdy/paliva/oprav, vzácnost.
9. **Engendros roster & modely** — redesign drobných, materiálová rodina, varianty.

---

## 15. Slovníček (lore termíny)

| Termín | Azbuka | Význam |
|---|---|---|
| **Pljuštal** | ПЛЮШТАЛЬ | Materiál „plyšocel" (плюш+сталь) — měkký jak medvídek, pevný jak pancíř |
| **Objekt 704 „Kolíbka"** | Объект 704 «КОЛЫБЕЛЬ» | Utajený program, který ПЛЮШТАЛЬ vytvořil |
| **Neutronové zakalení** | нейтронная закалка | Aktivace materiálu napojená na atomový program |
| **Puch (chmýří)** | пух | Poletující kontaminační/radiační vlákna ПЛЮШТАЛЬ |
| **Engendros** | — | Plyšoví golemi vzniklí z aktivovaného ПЛЮШТАЛЬ (zombie hrozba) |

---

## 16. Otevřené otázky (k pozdějšímu rozhodnutí)

Drobnosti, které ještě nejsou uzamčené a vyřeší se v navazujících specech / balancem:
- **Co přesně tvoří lore-kodex / osobní rekordy** a jak se zobrazují v lobby (rozpracované kontrakty přežijí? znalost mapy?).
- **Délka dne/noci** (jen vizuál/viditelnost — ne relief-rytmus; ultra-těžké pořád).
- **Frekvence bossů** a kolik jich „svět" má, než se stane čistě eskalačním.
- **Sovětské hodnosti** — kolik tierů, názvy, co každý odemyká.
- Konkrétní **efekty počasí** na boj a Engendros.
- Směr **redesignu drobných Engendros** (vzhled/chování).

---

*Tento white paper ukotvuje vizi. Implementace jde přes MVP (§12) a navazující specy (§14). Žádný kód nevzniká na základě tohoto dokumentu přímo — každý pilíř dostane vlastní design → plán → implementaci.*

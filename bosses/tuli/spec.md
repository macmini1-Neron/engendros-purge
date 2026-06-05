# TULI — boss spec (ENGENDROS PURGE)

> Návrh fázového bosse pro hru ENGENDROS PURGE (Three.js r160 FPS).
> Tohle je **spec / brainstorm**, ne kód — podklad pro plán → fázové kódování
> v repozitáři hry (`src/game.js`). Model Tuliho už existuje
> (`bosses/tuli/tuli.js`, `case 'tuli'` v `buildViewmodel`; náhled `nahled.html`).
>
> Stav: **rozpracováno / k odsouhlasení** — mechaniky jsou návrh, ne finál.
> Téma bosse je **voodoo / vnímání**: vše se točí kolem hesla
> *„Si tú no me ves, yo no me veo!"* a kolem knoflíkového oka s hvězdičkou.
>
> **IMPLEMENTACE:** zatím nezačata (model hotový, logika čeká na schválení specu).

---

## 1. Koncept

**TULI** = Engendros **ENEATYP 2, „el amistoso" (přátelský)**. Přátelský, velkorysý
a nadšený — nikdy nejedná ve vlastním zájmu, radši se dělí o pozitivní vibrace.
Jen je tu jeden problém: **nikdo nevěří, že to myslí dobře, protože je nápadně
podobný ďáblíkovi** (červená voodoo panenka s růžky, sešitou pusou a ocáskem).

Hlavní motiv = **vnímání / „kdo koho vidí"**, podle hesla
**„Si tú no me ves, yo no me veo!"** (Když mě nevidíš, já nevidím sám sebe).
Tuli umí **mizet z dohledu** a kletbami trestá hráče, který ho ztratí z očí.

**Slabé místo = knoflíkové oko s červenou hvězdičkou** — Tuli je voodoo panenka,
takže ho zraníš **jen když „otevře oko" a dívá se na tebe** (telegraf). Druhé,
malé černé očko zranitelné není. (Viz sekce 5.)

**Velikost:** boss = cca 2.5–3× běžný Engendros (sjednoceno s Tolem).

---

## 2. Chování / AI (napříč fázemi)

- **Cíl: „spřátelit se" s hráčem na smrt.** Tváří se přátelsky (úsměv, vibrace),
  ale útočí cíleně a chytře — ne hloupý naháněč.
- **Hbitější a kluzčí než Tolo** — Tuli je menší, mrštnější, **uhýbá a kličkuje**,
  nejde čelně. **S každou fází zrychluje** (fáze 1 → fáze 3 +20 % oproti základu).
- **Vnímání oboustranně:** když ho hráč nemá v zorném poli (kouká pryč / Tuli je
  za překážkou / je neviditelný), Tuli toho **zneužívá** — repozicuje se, mizí,
  připravuje kletbu. Když se na sebe dívají, je „upřímný" a otevírá oko (zranitelný).
- **Ničí jen překážky, které mu brání** v cestě/útoku; okraje mapy ne.
  **Po porážce se mapa vrátí do původního stavu** (sjednoceno s Tolem).
- Před kletbou/„pohledem" se **viditelně připraví** (telegraf — viz fáze).

---

## 3. Fáze

### 🟢 Fáze 1 — „Voodoo špendlíky" (100–66 % HP)
- **Pohyb:** kličkuje kolem hráče, drží si odstup, hbitý.
- **Útok:** zabodne si **špendlík do sebe** (sympatetická magie) → vystřelí
  na hráče **salvu 3–4 voodoo špendlíků/jehel** mířených na aktuální pozici.
  Friendly fasáda zůstává (usmívá se přitom).
- **Dostřel:** 50 % mapy (sjednoceno přes fáze).
- **Přesnost (anti-camp):** hráč v pohybu → **35 %** zásah; hráč campí → **60 %**.
  Pohyb se vyplatí, campení trestá (sjednoceno s Tolem).
- **Uhýbání:** úkrokem; jehly mají cestovní čas, dají se vyběhnout.
- **Smrt hráče:** 3 zásahy.
- **Zranitelnost:** dmg jen do **knoflíkového oka**, a jen když „otevře oko"
  před salvou (telegraf, viz sekce 5).

### 🟡 Fáze 2 — „Když mě nevidíš…" (66–33 % HP)
- **Pohyb:** agresivnější repozicování, využívá kryty.
- **Mechanika neviditelnosti:** Tuli **bliká do neviditelna** (zprůhlední/zmizí).
  - **Když ho hráč NEVIDÍ** (je neviditelný / mimo zorné pole / za překážkou),
    **uvaluje kletbu** — pomalý **damage-over-time / „rozpárání"** (HUD: vibrace
    se obrací proti hráči). DoT se zastaví, **jakmile Tuliho zase zaměříš pohledem**.
  - **Hra na pohled:** hráč ho musí **držet v dohledu**, aby kletbu zrušil — což
    je v rozporu s potřebou uhýbat. Záměrné napětí.
- **Útok:** mezi mizením **vyskočí a hodí shluk jehel** zblízka (krátký telegraf).
- **Dostřel:** 50 % mapy. **Smrt hráče:** 2 zásahy.
- **Zranitelnost:** okno = krátký moment, kdy se **zhmotní a otevře oko**, aby
  „viděl" hráče (jinak je neviditelný = nezranitelný). Kratší okno než fáze 1.
- **Ničení:** aktivně rozbíjí kryty, aby hráč neměl kam schovat pohled.

### 🔴 Fáze 3 — „Voodoo rituál" (33–0 % HP)
- **Pohyb:** +20 % rychlost, nejmrštnější, hojně mizí.
- **Útok:** **rituál** — Tuli vyvolá **2–3 voodoo kopie/přízraky** sebe (klamné,
  rychle bliknou), zatímco si **zabodává špendlíky** → **sympatetická vlna**:
  každý zásah do panenky-kopie i jeho vlastní bodnutí = **damage hráči**.
  Spouští se **každé ~3 s.**
- **Kletba pohledu** z fáze 2 zůstává a je **silnější** (rychlejší DoT).
- **Hořící / prokleté zóny:** po jehlách zůstávají na zemi **prokleté kruhy**
  (area denial — hráč do nich nesmí, jinak nabírá kletbu). Obdoba Tolových
  ohnivých zón, tematicky voodoo.
- **Smrt hráče:** 1 zásah = down.

---

## 4. Přechody mezi fázemi

- Při změně fáze **HUD hláška** (např. *„Tuli mizí z dohledu…"* / *„Tuli zahajuje
  rituál"*). **Hláška i na začátku boje** (fáze 1), ať hráč ví, kde je.
- Boss dostane **~3 s nesmrtelnost**: Tuli **stojí**, hraje **animaci** (zaškube
  sebou, vytrhne si pár stehů, paleta ztmavne/zašpiní se — „rozpárání"). Resetuje
  časovače útoků. (Sjednoceno s Tolem.)
- Rychlost +20 % do fáze 3.
- Vizuální HP feedback: s klesajícím HP přibývá **párání stehů, trčící špendlíky,
  decals** na červeném plyši.

---

## 5. Slabé místo (knoflíkové oko) — JEDINÉ zranitelné místo

- **Tuli je imunní všude a vždy** — dmg dostává **POUZE do knoflíkového oka
  s hvězdičkou** a **POUZE když „otevře oko" a dívá se na hráče** (telegraf před
  útokem / okamžik zhmotnění). Mimo to = 0 dmg. Malé černé očko = nikdy zranitelné.
- Hitbox = malá koule na knoflíkovém oku (+X strana hlavy).
- Tématicky: voodoo panenka je zranitelná skrz **oko, kterým tě „vidí"** — proto
  funguje jen vzájemný pohled (váže se na heslo *„když mě nevidíš, já nevidím sebe"*).
- Okno se s fázemi **zkracuje** (rychlejší blikání/mizení) → čím dál těžší trefa.
- (K rozhodnutí: jestli zásah do oka může **přerušit** kletbu/útok, nebo jen ubírá
  HP jako u Tola. Návrh: zásah **zruší probíhající kletbu pohledu**, ale salvu jehel
  ne — viz otevřené otázky.)

---

## 6. Technické napojení (gotchas z poznámek autora hry)

- **Model už existuje:** `case 'tuli'` v `buildViewmodel(def)` (viz `bosses/tuli/tuli.js`).
  Boss = ten samý mesh, scale ↑ + logika/animace.
- **Neviditelnost:** řešit přes `material.opacity` / `transparent` nebo skrytí meshe;
  pozor na merged vertex-colored mesh (jeden materiál → fade celého těla).
  Detekce „hráč vidí Tuliho" = frustum + raycast na zákryt překážkou + zorný kužel kamery.
- **WEAPON_LAYER se NETÝKÁ bosse** — to je jen pro držené viewmodely v ruce.
- **Stav přes `window.GAME`** (Playwright/konzole). `ITEM_DEFS`/`THREE` jsou
  module-scoped, na ně se v `evaluate` nesáhne.
- **Co-op (net.js / PeerJS):** boss řídí host, klient zrcadlí — neviditelnost,
  kletba i kopie musí být **synchronizované per-hráč** (každý vidí Tuliho jinak?
  → k vyřešení, viz otevřené otázky). 
- **Jehly / kopie / kletby:** držet efektivně (instanced / merged mesh).
- **Ověření:** `node --check src/game.js` + naživo v prohlížeči po každé fázi.

---

## 7. Otevřené otázky (ladí se)

1. **Hlavní mechanika k odsouhlasení:** je „vnímání / neviditelnost + kletba pohledu"
   ta správná identita pro Tuliho? (Alternativa: čistě voodoo špendlíky bez
   neviditelnosti, nebo „sympatetická" — co uděláš panence, stane se tobě.)
2. **Co-op a „kdo koho vidí":** v co-opu má každý hráč vlastní zorné pole — vidí
   Tuliho každý zvlášť, nebo stačí, že ho vidí kdokoli z týmu? (Ovlivní kletbu i dmg.)
3. Jak velká je aréna (kvůli % dostřelu jehel a prokletým zónám)?
4. Jak fungují existující nepřátelé/projektily v `game.js` (dědičnost vs. vlastní entita)?
5. HP bosse + damage → doladí se až podle hry (DPS zbraní, HP hráče). **Až potom.**
6. Hudba/zvuky pro fáze (voodoo bubny?).

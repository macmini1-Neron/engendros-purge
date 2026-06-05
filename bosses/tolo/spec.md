# TOLO — boss spec (ENGENDROS PURGE)

> Návrh fázového bosse pro hru ENGENDROS PURGE (Three.js r160 FPS).
> Tohle je **spec / brainstorm**, ne kód — podklad pro plán → fázové kódování
> v repozitáři hry (`src/game.js`). Model Tola už existuje
> (`Tolo/tolo.js`, `case 'tolo'` v `buildViewmodel`).
>
> Stav: rozpracováno, ladí se. Boss je **laserový** — vše se točí kolem terčíku.
>
> **IMPLEMENTACE (větev `feat/tolo-boss-rework` v `engendros-purge/src/game.js`):**
> - ✅ Fáze A: 3 fáze (66/33 %), imunita kromě terčíku při nabíjení, přechod =
>   hláška + 3 s nesmrtelnost, zrychlování, fáze 1 = 5 blaster střel + anti-camp.
>   Fáze 2/3 dočasně střílí 1 paprsek (placeholder).
> - ⬜ Fáze B: pravý sweep ve fázi 2 (45°, 3 s, každé 4 s).
> - ⬜ Fáze C: dvojitý sweep fáze 3 (každé 3 s) + ohnivé zóny + dostřel 65/80/100 %.

---

## 1. Koncept

**TOLO** = největší Engendros. **Vzhled roztomilý (bílý plyšák), jednání kruté.**
Hlavní zbraň = **laser z červeného terčíku na bříšku**. Terčík je zároveň
**jediné zranitelné místo** — Tolo dostává dmg **pouze do terčíku a pouze když se
nabíjí**, jinde/jindy je imunní (viz sekce 5). **Laserový útok nejde zrušit — musíš uhnout.**

Vizuál modelu (knoflíkové oko vlevo, korálkové oko vpravo, červený terčík, smyčka
na temeni) zůstává roztomilý ve všech fázích — kontrast s krutostí je záměrný.

**Velikost:** boss = cca 2.5–3× běžný Engendros.

---

## 2. Chování / AI (napříč fázemi)

- **Cíl: eliminovat hráče za každou cenu.** Chytrý pragmatik — ne hloupý naháněč.
- **Pomalý** (je tlustý plyšák) — ale **ne tak pomalý, aby byl free kill.**
  **S každou fází zrychluje** (fáze 1 nejpomalejší → fáze 3 +20 % oproti základu).
- Chodí za hráčem, **pozicuje se**, vybírá vhodný moment k výstřelu (nestřílí naslepo).
- **Ničí JEN překážky, které mu brání v cestě / blokují mu útok na hráče.**
  Neničí okraje/hranice mapy. **Po porážce Tola se vše vrátí do původního stavu**
  (rozbité překážky se obnoví).
- Před každým laserem se **zastaví** a **terčík se viditelně nabíjí** (telegraf).
- Útok **nejde přerušit/zrušit** — hráč se mu musí vyhnout pohybem.

---

## 3. Fáze

### 🟢 Fáze 1 — „Blaster" (100–66 % HP)
- **Pohyb:** chodí za hráčem, pomalý (zatím).
- **Útok:** po chvíli pronásledování se zastaví → terčík se nabíjí → vypálí
  **krátkou sekvenci 5 tenkých červených laserů** mířených na hráče
  (blaster bolty à la Star Wars).
- **Dostřel:** 50 % mapy (sjednoceno přes všechny fáze).
- **Přesnost (anti-camp):** hráč v pohybu → **35 %** šance na zásah; hráč campí
  (stojí) → **60 %** šance na zásah. Pohyb se vyplatí, campení trestá.
- **Uhýbání:** úkrokem do strany; dá se, ale není easy.
- **Smrt hráče:** 3 zásahy.
- **Zranitelnost:** Tolo dostává dmg **jen do terčíku během nabíjení** (viz sekce 5).

### 🟡 Fáze 2 — „Laserový stream / sweep" (66–33 % HP)
- **Pohyb:** jde po hráči, agresivnější pozicování.
- **Útok:** **NE blaster jako fáze 1** — místo toho **souvislý laserový stream**.
  Tolo se zastaví, **zaměří aktuální pozici hráče**, pak ~**3 s** tře paprskem
  **zleva doprava ve výseku ~45°.** Hráč se musí z výseče **vyběhnout/uhnout**
  (žádná % přesnosti — buď tě sweep přejede, nebo ne). Spouští se **každé 4 s.**
- **Dostřel:** 50 % mapy (sjednoceno).
- **Zranitelnost:** dmg jen do terčíku během nabíjení (viz sekce 5); okno kratší
  než ve fázi 1.
- **Ničení:** aktivně rozbíjí překážky v cestě.
- **Smrt hráče:** 2 zásahy.

### 🔴 Fáze 3 — „Žhavá zkáza" (33–0 % HP)
- **Pohyb:** +20 % rychlost, nejagresivnější.
- **Útok:** stejný princip jako fáze 2, ale **DVA sweepy** (zaměří hráče → dvojitý
  sweep zleva doprava) a spouští se **každé 3 s.** Laser je **rudý, velký, žhavý**,
  dostřel 50 % mapy (sjednoceno).
- **Oheň:** laser **zapaluje a ničí** — nechává po sobě **hořící čáry/zóny na zemi**
  (area denial, hráč do nich nesmí vběhnout).
- **Smrt hráče:** 1 zásah = down.

---

## 4. Přechody mezi fázemi

- Při změně fáze dostane **hráč upozornění** (HUD hláška) — např.
  *„Tolo zuří, nastává fáze 2"* apod. **Hláška se ukáže i na začátku boje**
  (fáze 1), ať hráč ví, v jaké fázi je.
- Boss dostane **~3 s nesmrtelnost**: Tolo **stojí na místě** a hraje
  **animace** (otřese se, upadne kus výplně, paleta ztmavne/zašpiní se).
  3 s je dost dlouho, aby si toho hráč všiml. Resetuje časovače útoků.
- Rychlost se navyšuje s každou fází (viz sekce 2 — fáze 1 nejpomalejší → fáze 3 +20 %).
- Vizuální HP feedback: s klesajícím HP přibývá „párání" (výplň, decals).

---

## 5. Slabé místo (terčík) — JEDINÉ zranitelné místo

- **Tolo je imunní všude a vždy** — dmg dostává **POUZE do terčíku** a **POUZE
  když se nabíjí** (před výstřelem/sweepem). Mimo nabíjení a mimo terčík = 0 dmg.
- Hitbox = malá koule na −Z pólu těla (kde je červený potisk).
- Nabíjení = jediné okno na poškození → hra je o **vystihnutí momentu** a
  trefení terčíku, zatímco se hráč zároveň chystá uhnout útoku.
- Útok **NEJDE** zásahem zrušit — i když terčík během nabíjení trefíš, laser stejně
  vyjde. Zásah jen ubírá HP.
- Okno se s fázemi zkracuje (rychlejší nabíjení) → čím dál těžší trefa.

---

## 6. Technické napojení (gotchas z poznámek autora hry)

- **Model už existuje:** `case 'tolo'` v `buildViewmodel(def)` (viz `Tolo/tolo.js`).
  Boss = ten samý mesh, scale ↑ + logika/animace.
- **WEAPON_LAYER se NETÝKÁ bosse** — to je jen pro držené viewmodely v ruce.
- **Stav přes `window.GAME`** (Playwright/konzole). `ITEM_DEFS`/`THREE` jsou
  module-scoped, na ně se v `evaluate` nesáhne.
- **Co-op (net.js / PeerJS):** boss řídí host, klient zrcadlí — laser/oheň musí
  být synchronizované. (Potvrdit, jak `net.js` syncuje entity.)
- **Laser & oheň particles:** držet efektivně (instanced / merged mesh), ať to neseká.
- **Ověření:** `node --check src/game.js` + naživo v prohlížeči po každé fázi.

---

## 7. Otevřené otázky (ladí se)

1. Jak velká je aréna (kvůli % dostřelu laseru a hořícím zónám)?
2. Jak fungují existující nepřátelé a projektily v `game.js` (dědičnost vs. vlastní entita)?
3. HP bosse + damage → doladí se až podle hry (DPS zbraní, HP hráče). **Až potom.**
4. Hudba/zvuky pro fáze.

---
name: idea
description: Použij, když chce uživatel zachytit/uložit nápad pro hru ENGENDROS PURGE do skladu nápadů `ideas/README.md`. Spouštěj na "/idea", i na "mám nápad", "zapiš nápad", "ulož to do nápadů", "dej to do nápadů". Přidá nápad jako JEDEN bod. DEFAULT = nápad se rovnou zapíše (žádné ptaní), ať se nikdy neztratí. JEN když uživatel dá najevo, že si o nápadu chce povídat/ho probrat ("chci si o tom povídat", "pojďme to probrat", "rozeber to"), nápad nejdřív stejně ulož a teprve pak ho s ním rozeberte a upřesněte.
---

# /idea — sklad nápadů (ENGENDROS PURGE)

Rychle zachytí nápad do `ideas/README.md` (jeden nápad = jeden bod). Soubor je v repu,
takže nápad uvidí oba bratři. **Hlavní pravidlo: nápad se nikdy nesmí ztratit — vždy ho ulož.**

## Postup

### 1. Zjisti text nápadu
- Text nápadu je to, co uživatel napsal za `/idea` (argumenty), nebo cokoliv popsal ve zprávě.
- Pokud žádný text není, krátce se zeptej „Jaký nápad chceš uložit?" a počkej na odpověď.

### 2. DEFAULT — ulož rovnou (neptej se)
Standardně nápad **hned ulož** (krok 3) a jen krátce potvrď. Žádná otázka, žádná debata.
Tohle je výchozí chování pro drtivou většinu případů.

### 3. Ulož nápad
1. Přečti `ideas/README.md`.
2. Přidej **jeden nový bod** ve stejném stylu jako stávající body:
   `- **<krátký výstižný název>.** <1–3 věty rozvedení>.`
   - Zařaď pod nejvhodnější `##` sekci (např. `## Gameplay`); pokud žádná nesedí, vytvoř novou.
   - Česky a stručně. Žádné duplicity — když podobný nápad už existuje, radši ho doplň.
3. Ulož soubor.
4. Krátce potvrď, co a kam jsi přidal (název bodu + sekce).

### 4. JEN když chce uživatel povídat
Pokud uživatel dal najevo, že si o nápadu chce povídat / ho probrat / rozvést
(„chci si o tom povídat", „pojďme to probrat", „promluvme o tom", „rozeber to",
„ještě to dolaďme"):
1. **NEJDŘÍV ho stejně ulož** podle kroku 3 (ať se neztratí) — klidně jako prvotní verzi bodu.
2. Teprve pak si o něm povídejte — cíl, jak by fungoval, na co si dát pozor, varianty.
3. Po debatě ten **bod aktualizuj** na vylepšenou/upřesněnou verzi.

### 5. Nech být
**Necommituj ani nepushuj**, dokud o to uživatel výslovně nepožádá.

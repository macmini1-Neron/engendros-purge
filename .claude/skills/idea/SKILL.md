---
name: idea
description: Použij, když chce uživatel zachytit/uložit nápad pro hru ENGENDROS PURGE do skladu nápadů `ideas/README.md`. Spouštěj na "/idea", i na "mám nápad", "zapiš nápad", "ulož to do nápadů", "dej to do nápadů". Přidá nápad jako JEDEN bod. Nejdřív nabídne, jestli si o nápadu povídat (rozvést/upřesnit) NEBO ho dát rovnou — ALE pokud uživatel dal najevo, že debatu nechce (např. "rovnou", "hned", "bez debaty", "jen zapiš", "prostě tam dej"), ulož ho okamžitě bez ptaní.
---

# /idea — sklad nápadů (ENGENDROS PURGE)

Rychle zachytí nápad do `ideas/README.md` (jeden nápad = jeden bod). Soubor je v repu,
takže nápad uvidí oba bratři.

## Postup

### 1. Zjisti text nápadu
- Text nápadu je to, co uživatel napsal za `/idea` (argumenty), nebo cokoliv popsal ve zprávě.
- Pokud žádný text není, krátce se zeptej „Jaký nápad chceš uložit?" a počkej na odpověď.

### 2. Rozhodni režim — POVÍDAT vs. ROVNOU
Než nápad uložíš, urči, jestli o něm chce uživatel mluvit, nebo ho jen hodit do skladu:

- **REŽIM ROVNOU (neptej se, ulož hned):** když uživatel jakkoliv dal najevo, že nechce
  debatu — zpráva obsahuje třeba „rovnou", „hned", „bez debaty", „jen zapiš", „nechci řešit",
  „prostě tam dej", nebo je to jasná finální instrukce k uložení. → Přeskoč otázku, jdi na krok 3.
- **JINAK SE ZEPTEJ** (použij AskUserQuestion, jedna otázka, dvě možnosti):
  - **„Dej ho tam rovnou"** — uložit hned tak, jak je.
  - **„Pojďme si o něm povídat"** — krátce nápad rozvést/upřesnit (cíl, jak by fungoval, na co
    si dát pozor) a teprve pak uložit vylepšenou verzi.

### 3. Ulož nápad
1. Přečti `ideas/README.md`.
2. Přidej **jeden nový bod** ve stejném stylu jako stávající body:
   `- **<krátký výstižný název>.** <1–3 věty rozvedení>.`
   - Zařaď pod nejvhodnější `##` sekci (např. `## Gameplay`); pokud žádná nesedí, vytvoř novou.
   - Česky a stručně. Žádné duplicity — když podobný nápad už existuje, radši ho doplň.
3. Ulož soubor.

### 4. Potvrď a nech být
- Krátce potvrď, co a kam jsi přidal (název bodu + sekce).
- **Necommituj ani nepushuj**, dokud o to uživatel výslovně nepožádá.

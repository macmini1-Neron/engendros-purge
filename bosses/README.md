# Bosses — ENGENDROS PURGE

Každý boss má vlastní podsložku pojmenovanou podle jména bosse. Uvnitř je
**všechno, co se daného bosse týká** — 3D model, náhled, spec chování a obrázky.

## Struktura jedné boss složky

```
bosses/
   <jmeno-bosse>/
      <jmeno>.js      ← 3D model (Three.js r160), case '<jmeno>' v buildViewmodel
      nahled.html     ← samostatný HTML náhled modelu (otevři v prohlížeči)
      spec.md         ← spec chování: fáze, útoky, mechaniky, HP/damage
      images/         ← reference, plyšák, koncepty, screenshoty
```

> Pozn.: Samotný **boss kód běžící ve hře** žije v `src/game.js`
> (např. `buildTolo()`, `_bossTolo()`). Tahle složka je **assety + design**,
> ne runtime hra.

## Seznam bossů

| Boss | Stav | Popis |
|------|------|-------|
| [tolo](tolo/) | rozpracováno (větev `feat/tolo-boss-rework`) | Laserový fázový boss, červený terčík na bříšku = zbraň i slabina |
| [tuli](tuli/) | research | Nový boss — čeká na obrázky a spec |

## Jak přidat nového bosse

1. Vytvoř složku `bosses/<jmeno>/` a `bosses/<jmeno>/images/`.
2. Hoď do `images/` referenční obrázek(y).
3. Sepiš `spec.md` (fáze, útoky, slabiny).
4. Vymodeluj `<jmeno>.js` + `nahled.html`.
5. Zapiš bosse do tabulky výše.

# 💡 Nápady / Ideas backlog

Sklad nápadů pro ENGENDROS PURGE — věci, co chceme někdy udělat, ale ještě nejsou
rozpracované na vlastní větvi/PR. Jeden nápad = jeden bod. Až se nápad začne dělat,
přesuň ho do `docs/superpowers/specs|plans/` a tady ho můžeš smazat.

## Gameplay

- **Loadout: nosit víc primárek (plochý seznam místo pevných slotů).** Místo dnešních
  pevných typovaných slotů `{primary, secondary, melee, gadget1, gadget2}` mít **plochý
  seznam nesené výbavy** s limitem `SLOT_CAP`, takže hráč může nosit i víc primárních
  zbraní najednou. Obchod (lobby Armory) předělat z typovaných slotů na **ADD / REMOVE**
  proti tomu seznamu (kategorie už jen jako filtr, bez limitu na kategorii).
  _Pozn.: jednou rozpracováno jako `wip(loadout)` (commit `53c2052` na zahozené větvi
  `feat/tolo-boss-rework`), ale psané proti starému monolitickému `game.js` → zahozeno.
  Při realizaci přepsat načisto nad modulární main: `inventory.js`
  (`ARMORY_SLOTS`/`loadout`) + `weapons.js` (deploy loadoutu)._

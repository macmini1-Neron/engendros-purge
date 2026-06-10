# patefon — build log

## v1 (2026-06-10) — APPROVED (legendary decoy gadget «Патефон»)
Type: ПТ-3 suitcase gramophone, 414×288×160 mm (factory manual; 6 museum/dealer
cross-checks). 19 parts, 3 rigs (lid hinge, crank spin, platter spin).

- iter 1: bakelite case + lid, steel-cloth lining + brass rhombus decal, deck,
  steel platter + linoleum felt + spindle, tonearm post/tube/soundbox, 3-part
  crank, leather handleU, nickel latch, dial + needle box + sound window.
  Building it caught a REAL harness bug: rotatedBuilder didn't forward geo()
  (rotated cylinder crashed) and composed rotations additively — fixed with
  matrix compose + euler decompose (now in PR #33).
  Defect from renders: soundbox (axis-z cylinder) poked 5 mm above the closed
  lid top.
- iter 2: soundbox r 0.039→0.035, y 0.126→0.118 (top 7 mm under the lid).
  Canonical set + open (lid −1.78, crank 0.9, platter 0.6 — all rigs verified
  live) + ghost saved; graze clean.

Photo-derived (flagged in dossier needs[]): platter Ø240, soundbox Ø, crank
length, lid angle, body/lid split. Rigs: lid {[0,0.105,−0.144], x},
crank {[0.207,0.045,0.06], x, spin}, platter {[−0.02,0.111,0], y, spin}.
